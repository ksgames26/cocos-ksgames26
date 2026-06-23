import { logger } from "../core/log";
import { Container } from "../core/container";
import { _decorator, js, SpriteAtlas, SpriteFrame } from "cc";
import { EventDispatcher } from "../core/event-dispatcher";
import { AssetHandle, AssetService } from "../services/asset-service";
import { ConfService } from "../services/conf-service";

const { ccclass } = _decorator;

/**
 * i18n Sprite 信息
 */
export interface I18NSpriteInfo {
    /** bundle 名称 */
    bundleName: string;
    /** 相对路径（不含后缀） */
    relativePath: string;
    /** 是否是 plist 图集 */
    isPlist: boolean;
    /** plist 中的 spriteFrame 名称 */
    spriteFrame: string;
}

export type I18NSpriteHandle = AssetHandle<typeof SpriteFrame> | { atlas: AssetHandle<typeof SpriteAtlas>, frame: string };

export interface I18NConf {

    /**
     * 设置当前语言
     * @param locale 语言标识
     * @param refresh 是否通知各个组件语音文本和图片需要刷新到新的资源
     */
    setLocale(locale: string, refresh: boolean): void;

    /**
     * 获取当前语言
     */
    get locale(): string;

    /** 获取多语言配置资源 */
    getResources(): Record<string, Record<string, string>>;

    /**
     * 获取多语言字符串
     * @param key 
     * @param args 
     */
    getString(key: string, ...args: string[]): string;

    /**
     * 获取多语言图片资源
     * @param key 多语言键
     * @returns SpriteFrame 的 Promise
     */
    getAssetHandle?(key: string): Promise<IGameFramework.Nullable<I18NSpriteHandle>>;
}

/** 语言切换事件 */
export const I18N_EVENT = {
    I18N_EVENT_LOCALE_CHANGED: "i18n-locale-changed",
} as const;

interface I18NEventMap {
    [I18N_EVENT.I18N_EVENT_LOCALE_CHANGED]: string;
}

export class I18NDefaultConf implements I18NConf {
    private _confName: string = "";
    private _locale: string = "zh";

    public get locale(): string {
        return this._locale;
    }

    public setLocale(locale: string, refresh: boolean = true): void {
        this._locale = locale;

        if (refresh) {
            // 刷新资源等操作
            Container.get(I18NService)?.switchLocale(this);
        }
    }

    public constructor(confName: string) {
        this._confName = confName;
        this.check();
    }

    public check(): void {
        if (!this._confName) {
            logger.warn(`[I18NDefaultConf] confName is empty.`);
            return;
        }

        const confService = Container.get(ConfService<any>);
        if (!confService) {
            logger.warn("[I18NDefaultConf] ConfService is not available.");
            return;
        }
        const conf = confService.conf(this._confName);

        if (!conf) {
            logger.warn(`[I18NDefaultConf] Configuration ${this._confName} not found.`);
            return;
        }
    }

    public getResources(): Record<string, Record<string, string>> {
        const confService = Container.get(ConfService<any>);
        if (!confService) {
            return {};
        }
        return confService.conf(this._confName) ?? {};
    }

    public getString(key: string, ...args: any[]): string {
        const res = this.getResources()?.[key];
        let str = "";
        if (!res) {
            logger.warn(`[I18NDefaultConf] key ${key} not found in conf`);
            return str;
        }

        str = res[this._locale] || "";
        if (!str) {
            logger.warn(`[I18NDefaultConf] locale ${this._locale} not found in res : ${res}`);
            return key;
        }

        // formatter
        return js.formatStr(str, ...args);
    }

    public async getAssetHandle(key: string): Promise<AssetHandle<typeof SpriteFrame> | { atlas: AssetHandle<typeof SpriteAtlas>, frame: string } | null> {
        const assetSvr = Container.get(AssetService)!;

        const res = this.getResources()?.[key];
        let str = "";
        if (!res) {
            logger.warn(`[I18NDefaultConf] key ${key} not found in conf`);
            return null;
        }

        str = res[this._locale] || "";
        if (!str) {
            logger.warn(`[I18NDefaultConf] locale ${this._locale} not found in res : ${res}`);
            return null;
        }

        const i18nService = Container.get(I18NService);
        if (!i18nService) {
            logger.warn("[I18NDefaultConf] I18NService is not available.");
            return null;
        }

        const info = i18nService.parseI18NSpriteInfo(str);

        if (info.isPlist) {
            if (!info.bundleName || !info.relativePath || !info.spriteFrame) {
                logger.warn(`[I18NDefaultConf] Invalid I18NSpriteInfo for plist: ${JSON.stringify(info)}`);
                return null;
            }

            const atlasHandle = assetSvr.getOrCreateAssetHandle(info.bundleName, SpriteAtlas, info.relativePath);
            if (!atlasHandle) {
                logger.warn(`[I18NDefaultConf] SpriteAtlas not found: bundle=${info.bundleName}, path=${info.relativePath}`);
                return null;
            }

            let assetAtlas = atlasHandle.getAsset();
            if (!assetAtlas) {
                assetAtlas = await assetSvr.loadAssetAsync(atlasHandle);
            }

            if (!assetAtlas) {
                logger.warn(`[I18NDefaultConf] Failed to load SpriteAtlas: bundle=${info.bundleName}, path=${info.relativePath}`);
                return null;
            }

            const spriteFrame = assetAtlas.getSpriteFrame(info.spriteFrame);
            if (!spriteFrame) {
                logger.warn(`[I18NDefaultConf] SpriteFrame ${info.spriteFrame} not found in atlas: bundle=${info.bundleName}, path=${info.relativePath}`);
                return null;
            }

            return { atlas: atlasHandle, frame: info.spriteFrame };
        } else {
            if (!info.bundleName || !info.relativePath) {
                logger.warn(`[I18NDefaultConf] Invalid I18NSpriteInfo: ${JSON.stringify(info)}`);
                return null;
            }

            const spriteHandle = assetSvr.getOrCreateAssetHandle(info.bundleName, SpriteFrame, info.relativePath);
            if (!spriteHandle) {
                logger.warn(`[I18NDefaultConf] SpriteFrame not found: bundle=${info.bundleName}, path=${info.relativePath}`);
                return null;
            }

            let assetSprite = spriteHandle.getAsset();
            if (!assetSprite) {
                assetSprite = await assetSvr.loadAssetAsync(spriteHandle);
            }

            if (!assetSprite) {
                logger.warn(`[I18NDefaultConf] Failed to load SpriteFrame: bundle=${info.bundleName}, path=${info.relativePath}`);
                return null;
            }

            return spriteHandle;
        }
    }
}

@ccclass("I18NService")
export class I18NService extends EventDispatcher<I18NEventMap> {

    private _conf: I18NConf = null!;

    constructor() {
        super();
    }

    /**
     * 设置默认的conf
     *
     * @return {*}  {this}
     * @memberof I18NService
     */
    public withDefaultConf(confName: string): this {
        this._conf = new I18NDefaultConf(confName);
        return this;
    }

    /**
     * 初始化多语言服务
     * @param conf 多语言配置
     */
    public initialize(conf: I18NConf): void {
        this._conf = conf;

        if (!this._conf) {
            logger.warn("[I18NService] Initialized with null conf.");
            return;
        }

        if (!this._conf.locale) {
            logger.error("[I18NService] Conf locale is invalid.");
            return;
        }

        // 切换语言配置
        this.switchLocale(this._conf);
    }

    public set locale(locale: string) {
        if (!this._conf) {
            logger.warn(`[I18NService] Service not initialized, cannot set locale to ${locale}`);
            return;
        }

        this._conf.setLocale(locale, false);

        // 切换语言配置
        this.switchLocale(this._conf);
    }

    /** 获取当前语言 */
    public get locale(): string {
        return this._conf.locale;
    }

    /**
     * 切换语言配置
     * @param conf 新的语言配置
     */
    public switchLocale(conf: I18NConf): void {
        this._conf = conf;
        this.dispatch(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this._conf.locale);
    }

    /**
     * 获取多语言字符串
     * @param key 多语言键
     * @param args 格式化参数
     * @returns 翻译后的字符串
     */
    public getString(key: string, ...args: string[]): string {
        if (!this._conf) {
            logger.warn(`[I18NService] Service not initialized, key: ${key}`);
            return key;
        }
        return this._conf.getString(key, ...args);
    }

    /**
     * 检查是否存在指定的多语言键
     * @param key 多语言键
     * @returns 是否存在
     */
    public hasKey(key: string): boolean {
        if (!this._conf) {
            return false;
        }
        return key in (this._conf.getResources()?.[this._conf.locale] ?? {});
    }

    /**
     * 获取多语言图片资源
     * @param key 多语言键
     * @returns SpriteFrame 的 Promise
     */
    public getAssetHandle(key: string): Promise<IGameFramework.Nullable<AssetHandle<typeof SpriteFrame> | { atlas: AssetHandle<typeof SpriteAtlas>, frame: string }>> {
        if (!this._conf) {
            logger.warn(`[I18NService] Service not initialized, key: ${key}`);
            return Promise.resolve(null);
        }

        if (!this._conf.getAssetHandle) {
            logger.warn(`[I18NService] getSpriteFrame not implemented in conf, key: ${key}`);
            return Promise.resolve(null);
        }

        if (!key) {
            logger.warn(`[I18NService] getAssetHandle params key must not be nullable, ${key}`);
            return Promise.resolve(null);
        }

        return this._conf.getAssetHandle(key);
    }

    /**
     * 解析多语言精灵类型的配置
     *
     * @param {string} value
     * @return {*}  {I18NSpriteInfo}
     * @memberof I18NService
     */
    public parseI18NSpriteInfo(value: string): I18NSpriteInfo {
        if (!value) {
            return {
                bundleName: "",
                relativePath: "",
                isPlist: false,
                spriteFrame: "",
            };
        }

        const plistIndex = value.indexOf('.plist/');

        let bundleName: string | null = null;
        let relativePath: string;
        let spriteFrame: string = '';

        if (plistIndex !== -1) {
            // plist 格式: bundleName/relativePath.plist/spriteFrame
            const beforePlist = value.substring(0, plistIndex);
            spriteFrame = value.substring(plistIndex + 7); // 7 = '.plist/'.length

            const firstSlash = beforePlist.indexOf('/');
            if (firstSlash === -1) {
                return {
                    bundleName: "",
                    relativePath: "",
                    isPlist: true,
                    spriteFrame: "",
                };
            }

            bundleName = beforePlist.substring(0, firstSlash);
            relativePath = beforePlist.substring(firstSlash + 1);
        } else {
            // 普通格式: bundleName/relativePath
            const firstSlash = value.indexOf('/');
            if (firstSlash === -1) {
                return {
                    bundleName: "",
                    relativePath: "",
                    isPlist: false,
                    spriteFrame: "",
                };
            }

            bundleName = value.substring(0, firstSlash);
            relativePath = value.substring(firstSlash + 1);
        }

        return {
            bundleName,
            relativePath,
            isPlist: plistIndex !== -1,
            spriteFrame
        };
    }
}
