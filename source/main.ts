import { ExecuteSceneScriptMethodOptions } from "@cocos/creator-types/editor/packages/scene/@types/public";
import { existsSync, unwatchFile as fsUnwatchFile, watchFile as fsWatchFile, readdirSync, Stats, statSync } from "node:fs";
import { extname, join } from "node:path";
// @ts-ignore
import packageJSON from "../package.json";
import { createTemplate } from "./createTemplete";
import { I18NData, parseI18NConfig } from "./misc/parse_i18n";

let conf: I18NData | null = null;
let confKeys: string[] = [];
let defaultLan = "zh";
let watchingConfFile = false;
let watchedFilePath: string | null = null;
let enableWatchFile = false;

let bundleUrlCache: Map<string, string> = new Map();

export interface I18NSpriteInfo {
    bundleName: string;
    relativePath: string;
    isPlist: boolean;
    spriteFrame: string;
    fullUrl: string;
    uuid: string;
}

async function parseI18NSpriteInfo(value: string): Promise<I18NSpriteInfo | null> {
    if (!value) {
        return null;
    }

    const isPlist = value.includes(".plist/");

    let bundleName: string;
    let relativePath: string;
    let spriteFrame = "";

    if (isPlist) {
        const plistIndex = value.indexOf(".plist/");
        const beforePlist = value.substring(0, plistIndex);
        spriteFrame = value.substring(plistIndex + 7);

        const firstSlash = beforePlist.indexOf("/");
        if (firstSlash === -1) {
            return null;
        }

        bundleName = beforePlist.substring(0, firstSlash);
        relativePath = `${beforePlist.substring(firstSlash + 1)}.plist`;
    } else {
        const firstSlash = value.indexOf("/");
        if (firstSlash === -1) {
            return null;
        }

        bundleName = value.substring(0, firstSlash);
        relativePath = value.substring(firstSlash + 1);
    }

    const bundleUrl = getBundleUrl(bundleName);
    if (!bundleUrl) {
        console.warn(`[I18N] Bundle not found: ${bundleName}`);
        return null;
    }

    const fullUrl = isPlist ? `${bundleUrl}/${relativePath}/${spriteFrame}` : `${bundleUrl}/${relativePath}`;

    let uuid = "";
    try {
        const assetInfo = await Editor.Message.request("asset-db", "query-asset-info", fullUrl);
        if (assetInfo?.uuid) {
            uuid = assetInfo.uuid;
        }
    } catch (error) {
        console.warn(`[I18N] Failed to query uuid for ${fullUrl}:`, error);
    }

    return {
        bundleName,
        relativePath,
        isPlist,
        spriteFrame,
        fullUrl,
        uuid,
    };
}

function fsPathToDbUrl(fsPath: string, assetsPath: string): string {
    const relativePath = fsPath.replace(assetsPath, "").replace(/\\/g, "/");
    return `db://assets${relativePath}`;
}

async function scanBundlesInDirectory(dirPath: string, assetsPath: string): Promise<void> {
    try {
        if (!existsSync(dirPath)) {
            return;
        }

        const stat = statSync(dirPath);
        if (!stat.isDirectory()) {
            return;
        }

        const dbUrl = fsPathToDbUrl(dirPath, assetsPath);

        try {
            const assetInfo = await Editor.Message.request("asset-db", "query-asset-info", dbUrl);
            if (assetInfo?.isBundle) {
                bundleUrlCache.set(assetInfo.name, assetInfo.url);
            }
        } catch {
            // Ignore invalid asset-db lookups while scanning folders.
        }

        const children = readdirSync(dirPath);
        for (const child of children) {
            const childPath = join(dirPath, child);
            const childStat = statSync(childPath);
            if (childStat.isDirectory()) {
                await scanBundlesInDirectory(childPath, assetsPath);
            }
        }
    } catch (error) {
        console.error(`Failed to scan bundles in ${dirPath}:`, error);
    }
}

async function initBundleCache(): Promise<void> {
    bundleUrlCache.clear();

    const projectPath = Editor.Project.path;
    const assetsPath = join(projectPath, "assets");

    if (!existsSync(assetsPath)) {
        console.warn("[I18N] Assets directory not found");
        return;
    }

    await scanBundlesInDirectory(assetsPath, assetsPath);
    console.log(`[I18N] Bundle cache initialized, found ${bundleUrlCache.size} bundles:`, Array.from(bundleUrlCache.keys()));
}

function getBundleUrl(bundleName: string): string | null {
    return bundleUrlCache.get(bundleName) ?? null;
}

function watchFile(filePath: string): void {
    if (!enableWatchFile) {
        return;
    }

    if (watchedFilePath && watchedFilePath !== filePath) {
        unwatchFile();
    }

    watchedFilePath = filePath;
    fsWatchFile(filePath, { interval: 1000, persistent: true }, (curr: Stats, prev: Stats) => {
        if (curr.mtime.getTime() !== prev.mtime.getTime()) {
            console.log(`[I18N] Config file changed: ${filePath}`);
            methods.onI18NConfPathChanged("").catch((error) => {
                console.error("[I18N] Failed to reload config after file change:", error);
            });
        }
    });

    console.log(`[I18N] Started watching config file: ${filePath}`);
}

function unwatchFile(): void {
    if (!enableWatchFile) {
        return;
    }

    if (watchedFilePath) {
        fsUnwatchFile(watchedFilePath);
        console.log(`[I18N] Stopped watching config file: ${watchedFilePath}`);
        watchedFilePath = null;
        watchingConfFile = false;
    }
}

export const methods = {
    openPanel() {
        Editor.Panel.open(packageJSON.name);
    },

    async createTemplate() {
        await createTemplate();
    },

    async refreshBundleCache() {
        await initBundleCache();
    },

    async onI18NConfPathChanged(_key: string) {
        const path = await Editor.Profile.getProject("ksgames26", "i18n:game-framework.i18n_conf_path", "project");
        const startRowCol = await Editor.Profile.getProject("ksgames26", "i18n:game-framework.i18n_conf_parse_start_row_col", "project");
        const endRowCol = await Editor.Profile.getProject("ksgames26", "i18n:game-framework.i18n_conf_parse_end_row_col", "project");
        defaultLan = await Editor.Profile.getProject("ksgames26", "i18n:game-framework.i18n_conf_default_lan", "project");

        if (!path || !startRowCol || !endRowCol) {
            console.error("i18n configuration path or row and column not set.");
            return;
        }

        if (startRowCol === "0-0") {
            return;
        }

        const project = Editor.Project.path;
        const confPath = join(project, path);
        const fileType = extname(confPath);
        if (fileType !== ".xlsx" && fileType !== ".xls" && fileType !== ".csv") {
            console.error("i18n configuration file must be xlsx, xls or csv format.");
            return;
        }

        if (!existsSync(confPath)) {
            console.error("i18n configuration file does not exist at path:", confPath);
            conf = null;
            confKeys = [];
            return;
        }

        try {
            conf = await parseI18NConfig(confPath, startRowCol as string, endRowCol as string);
            confKeys = Object.keys(conf);
            console.log("i18n configuration loaded successfully:", confKeys);

            await methods.onI18NConfDefaultLanChanged("");

            if (!watchingConfFile) {
                watchingConfFile = true;
                watchFile(confPath);
            }
        } catch (error) {
            console.error("Failed to parse i18n configuration:", error);
        }
    },

    async getInfoOfI18NConf(key: string, type: string) {
        if (!key || !conf) {
            return "";
        }

        const lans = conf[defaultLan];
        if (!lans) {
            return "";
        }

        const value = lans[key];
        if (!value) {
            return "";
        }

        if (type === "sprite") {
            return parseI18NSpriteInfo(value);
        }

        return value;
    },

    async onI18NConfParseStartRowColChanged(_key: string) {
        await methods.onI18NConfPathChanged("");
    },

    async onI18NConfParseEndRowColChanged(_key: string) {
        await methods.onI18NConfPathChanged("");
        await methods.onI18NConfDefaultLanChanged("");
    },

    async onI18NConfDefaultLanChanged(_key: string) {
        defaultLan = await Editor.Profile.getProject("ksgames26", "i18n:game-framework.i18n_conf_default_lan", "project");
        const options: ExecuteSceneScriptMethodOptions = {
            name: "ksgames26",
            method: "changeDefaultLan",
            args: [defaultLan],
        };
        await Editor.Message.request("scene", "execute-scene-script", options);
    },

    async onAssetDBReady() {
        await initBundleCache();
    },

    async onSceneReady() {
        await methods.onI18NConfDefaultLanChanged("");
    },

    async onI18NConfRefreshAfterSaveChanged() {
        await methods.onI18NConfPathChanged("");
    },
};

export async function load() {
    console.log("ksgames26 extension loaded.");
    await methods.onI18NConfPathChanged("");
}

export async function unload() {
    console.log("ksgames26 extension unloaded.");
    conf = null;
    confKeys = [];
    bundleUrlCache.clear();

    if (watchedFilePath) {
        unwatchFile();
    }
}
