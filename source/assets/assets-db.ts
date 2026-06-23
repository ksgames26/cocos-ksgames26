import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
type BundleDirectoryInfo = {
    url: string;
    name: string;
    realType: string;
    relativePath: string; // 从bundle到文件的相对路径(不含后缀)
    isPlist: boolean;
    spriteFrame: string;
};

async function findLastBundleDirectory(assetUrl: string): Promise<BundleDirectoryInfo | null> {
    if (!assetUrl) {
        return null;
    }

    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetUrl);
    const type = assetInfo?.type || '';
    const importer = assetInfo?.importer || '';
    const url = assetInfo?.url || '';

    const isPlist = url.includes('.plist');
    // "db://assets/bundles/common-res/common.plist/data"

    let plistPath = "";
    let spriteFrame = "";
    if (isPlist) {
        plistPath = url.split('.plist/')[0];
        spriteFrame = assetInfo?.name ?? "";
    }

    // 如果是文件夹类型，直接返回null
    if (importer == "directory") {
        return null;
    }

    let realType = type;
    if (type && type.startsWith('cc')) {
        // 删除cc.前缀，获取真实类型
        realType = type.slice(3);
    }

    // 统一路径分隔符
    const normalized = assetUrl.replace(/\\/g, '/');

    // 分离协议前缀(如 db://)和路径主体
    const match = normalized.match(/^(db:\/\/)(.*)$/);
    if (!match) {
        return null;
    }

    const prefix = match[1];  // db://
    const pathBody = match[2].replace(/\/$/, '');  // 移除尾部斜杠
    const segments = pathBody.split('/');

    // 从完整路径开始，逐个减少尾部段，从后往前查找 bundle
    for (let i = segments.length; i > 0; i--) {
        const candidatePath = segments.slice(0, i).join('/');
        const candidate = prefix + candidatePath;


        try {
            const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', candidate);

            if (assetInfo?.isBundle) {
                // 从bundle目录到原始文件的相对路径(移除文件后缀)
                const remainingSegments = segments.slice(i);
                let relativePath = remainingSegments.join('/');
                // 移除文件后缀
                relativePath = relativePath.replace(/\.[^/.]+$/, '');

                return {
                    url: candidate,
                    name: assetInfo.name || segments[i - 1] || '',
                    realType,
                    relativePath: relativePath,
                    isPlist,
                    spriteFrame,
                };
            }
        } catch (error) {
            console.warn(`[assets-db] Failed to inspect directory ${candidate}`, error);
        }
    }

    return null;
}

export function onAssetMenu(info: AssetInfo) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandlerTitle',
            submenu: [
                {
                    label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandler.hasAssetService',
                    async click() {

                        if (!info || !info.uuid) {
                            return;
                        }

                        const path = await Editor.Message.request('asset-db', 'query-url', info.uuid);
                        if (!path) {
                            Editor.Dialog.error('无法获取资源路径');
                            return;
                        }

                        const bundleInfo = await findLastBundleDirectory(path);
                        if (!bundleInfo) {
                            Editor.Dialog.error('未找到包含 Asset Bundle 的目录, 请确认资源位于某个 Bundle 下');
                            return;
                        }

                        let ctrlC = `
                            const handle = assSvr.getOrCreateAssetHandle('${bundleInfo.name}',${bundleInfo.isPlist ? "SpriteAtlas" : bundleInfo.realType},'${bundleInfo.relativePath}');`;

                        if (bundleInfo.isPlist) {
                            ctrlC += `
                            const spriteFrame = handle.getAsset()!.getSpriteFrame('${bundleInfo.spriteFrame}');`;
                        }

                        Editor.Clipboard.write("text", ctrlC.trim());
                        Editor.Dialog.info(`代码已复制到剪贴板`, { title: '复制成功' });
                    }
                },
                {
                    label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandler.noAssetService',
                    async click() {

                        if (!info || !info.uuid) {
                            return;
                        }

                        const path = await Editor.Message.request('asset-db', 'query-url', info.uuid);
                        if (!path) {
                            Editor.Dialog.error('无法获取资源路径');
                            return;
                        }

                        const bundleInfo = await findLastBundleDirectory(path);
                        if (!bundleInfo) {
                            Editor.Dialog.error('未找到包含 Asset Bundle 的目录, 请确认资源位于某个 Bundle 下');
                            return;
                        }

                        let ctrlC = `
                            const assSvr = Container.get(AssetService)!;
                            const handle = assSvr.getOrCreateAssetHandle('${bundleInfo.name}',${bundleInfo.isPlist ? "SpriteAtlas" : bundleInfo.realType},'${bundleInfo.relativePath}');`;

                        if (bundleInfo.isPlist) {
                            ctrlC += `
                        const spriteFrame = handle.getAsset()!.getSpriteFrame('${bundleInfo.spriteFrame}');`;
                        }

                        Editor.Clipboard.write("text", ctrlC.trim());
                        Editor.Dialog.info(`代码已复制到剪贴板`, { title: '复制成功' });
                    }
                },
                {
                    label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandler.copyI18nfo',
                    async click() {
                        if (!info || !info.uuid) {
                            return;
                        }

                        const path = await Editor.Message.request('asset-db', 'query-url', info.uuid);
                        if (!path) {
                            Editor.Dialog.error('无法获取资源路径');
                            return;
                        }

                        const bundleInfo = await findLastBundleDirectory(path);
                        if (!bundleInfo) {
                            Editor.Dialog.error('未找到包含 Asset Bundle 的目录, 请确认资源位于某个 Bundle 下');
                            return;
                        }

                        let text = "";
                        if (bundleInfo.isPlist) {
                            text = bundleInfo.name + "/" + bundleInfo.relativePath + ".plist" + "/" + bundleInfo.spriteFrame;
                        } else {
                            text = bundleInfo.name + "/" + bundleInfo.relativePath;
                        }

                        Editor.Clipboard.write("text", text);
                        Editor.Dialog.info(`i18n信息已复制到剪贴板`, { title: '复制成功' });
                    }
                }
            ]
        }
    ];
}
