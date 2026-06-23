"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAssetMenu = onAssetMenu;
async function findLastBundleDirectory(assetUrl) {
    var _a;
    if (!assetUrl) {
        return null;
    }
    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetUrl);
    const type = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.type) || '';
    const importer = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.importer) || '';
    const url = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.url) || '';
    const isPlist = url.includes('.plist');
    // "db://assets/bundles/common-res/common.plist/data"
    let plistPath = "";
    let spriteFrame = "";
    if (isPlist) {
        plistPath = url.split('.plist/')[0];
        spriteFrame = (_a = assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.name) !== null && _a !== void 0 ? _a : "";
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
    const prefix = match[1]; // db://
    const pathBody = match[2].replace(/\/$/, ''); // 移除尾部斜杠
    const segments = pathBody.split('/');
    // 从完整路径开始，逐个减少尾部段，从后往前查找 bundle
    for (let i = segments.length; i > 0; i--) {
        const candidatePath = segments.slice(0, i).join('/');
        const candidate = prefix + candidatePath;
        try {
            const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', candidate);
            if (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.isBundle) {
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
        }
        catch (error) {
            console.warn(`[assets-db] Failed to inspect directory ${candidate}`, error);
        }
    }
    return null;
}
function onAssetMenu(info) {
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
                        }
                        else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXRzLWRiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2Fzc2V0cy9hc3NldHMtZGIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUF1RkEsa0NBdUdDO0FBcExELEtBQUssVUFBVSx1QkFBdUIsQ0FBQyxRQUFnQjs7SUFDbkQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ1osT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3pGLE1BQU0sSUFBSSxHQUFHLENBQUEsU0FBUyxhQUFULFNBQVMsdUJBQVQsU0FBUyxDQUFFLElBQUksS0FBSSxFQUFFLENBQUM7SUFDbkMsTUFBTSxRQUFRLEdBQUcsQ0FBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsUUFBUSxLQUFJLEVBQUUsQ0FBQztJQUMzQyxNQUFNLEdBQUcsR0FBRyxDQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxHQUFHLEtBQUksRUFBRSxDQUFDO0lBRWpDLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdkMscURBQXFEO0lBRXJELElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNuQixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7SUFDckIsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUNWLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLFdBQVcsR0FBRyxNQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxJQUFJLG1DQUFJLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsb0JBQW9CO0lBQ3BCLElBQUksUUFBUSxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQzFCLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDcEIsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ2hDLGlCQUFpQjtRQUNqQixRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBRUQsVUFBVTtJQUNWLE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRWhELHVCQUF1QjtJQUN2QixNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDbEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1QsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLFFBQVE7SUFDbEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBRSxTQUFTO0lBQ3hELE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFckMsZ0NBQWdDO0lBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JELE1BQU0sU0FBUyxHQUFHLE1BQU0sR0FBRyxhQUFhLENBQUM7UUFHekMsSUFBSSxDQUFDO1lBQ0QsTUFBTSxTQUFTLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFMUYsSUFBSSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsUUFBUSxFQUFFLENBQUM7Z0JBQ3RCLDhCQUE4QjtnQkFDOUIsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QyxJQUFJLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQy9DLFNBQVM7Z0JBQ1QsWUFBWSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUVyRCxPQUFPO29CQUNILEdBQUcsRUFBRSxTQUFTO29CQUNkLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRTtvQkFDN0MsUUFBUTtvQkFDUixZQUFZLEVBQUUsWUFBWTtvQkFDMUIsT0FBTztvQkFDUCxXQUFXO2lCQUNkLENBQUM7WUFDTixDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDYixPQUFPLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxTQUFTLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRixDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUM7QUFFRCxTQUFnQixXQUFXLENBQUMsSUFBZTtJQUN2QyxPQUFPO1FBQ0g7WUFDSSxLQUFLLEVBQUUsc0VBQXNFO1lBQzdFLE9BQU8sRUFBRTtnQkFDTDtvQkFDSSxLQUFLLEVBQUUsaUZBQWlGO29CQUN4RixLQUFLLENBQUMsS0FBSzt3QkFFUCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUN0QixPQUFPO3dCQUNYLENBQUM7d0JBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDOUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUNSLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDOzRCQUNoQyxPQUFPO3dCQUNYLENBQUM7d0JBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDdkQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDOzRCQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7NEJBQ2xFLE9BQU87d0JBQ1gsQ0FBQzt3QkFFRCxJQUFJLEtBQUssR0FBRzs0RUFDd0MsVUFBVSxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEtBQUssVUFBVSxDQUFDLFlBQVksS0FBSyxDQUFDO3dCQUVsSyxJQUFJLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQzs0QkFDckIsS0FBSyxJQUFJO3FGQUNnRCxVQUFVLENBQUMsV0FBVyxLQUFLLENBQUM7d0JBQ3pGLENBQUM7d0JBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUM3QyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztvQkFDdkQsQ0FBQztpQkFDSjtnQkFDRDtvQkFDSSxLQUFLLEVBQUUsZ0ZBQWdGO29CQUN2RixLQUFLLENBQUMsS0FBSzt3QkFFUCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUN0QixPQUFPO3dCQUNYLENBQUM7d0JBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDOUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUNSLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDOzRCQUNoQyxPQUFPO3dCQUNYLENBQUM7d0JBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDdkQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDOzRCQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7NEJBQ2xFLE9BQU87d0JBQ1gsQ0FBQzt3QkFFRCxJQUFJLEtBQUssR0FBRzs7NEVBRXdDLFVBQVUsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxLQUFLLFVBQVUsQ0FBQyxZQUFZLEtBQUssQ0FBQzt3QkFFbEssSUFBSSxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7NEJBQ3JCLEtBQUssSUFBSTtpRkFDNEMsVUFBVSxDQUFDLFdBQVcsS0FBSyxDQUFDO3dCQUNyRixDQUFDO3dCQUVELE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQzt3QkFDN0MsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7b0JBQ3ZELENBQUM7aUJBQ0o7Z0JBQ0Q7b0JBQ0ksS0FBSyxFQUFFLDRFQUE0RTtvQkFDbkYsS0FBSyxDQUFDLEtBQUs7d0JBQ1AsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQzs0QkFDdEIsT0FBTzt3QkFDWCxDQUFDO3dCQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQzlFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQzs0QkFDUixNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQzs0QkFDaEMsT0FBTzt3QkFDWCxDQUFDO3dCQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sdUJBQXVCLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ3ZELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQzs0QkFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDOzRCQUNsRSxPQUFPO3dCQUNYLENBQUM7d0JBRUQsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO3dCQUNkLElBQUksVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDOzRCQUNyQixJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsVUFBVSxDQUFDLFlBQVksR0FBRyxRQUFRLEdBQUcsR0FBRyxHQUFHLFVBQVUsQ0FBQyxXQUFXLENBQUM7d0JBQ3JHLENBQUM7NkJBQU0sQ0FBQzs0QkFDSixJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQzt3QkFDM0QsQ0FBQzt3QkFFRCxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQ3JDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO29CQUMzRCxDQUFDO2lCQUNKO2FBQ0o7U0FDSjtLQUNKLENBQUM7QUFDTixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XHJcbnR5cGUgQnVuZGxlRGlyZWN0b3J5SW5mbyA9IHtcclxuICAgIHVybDogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcmVhbFR5cGU6IHN0cmluZztcclxuICAgIHJlbGF0aXZlUGF0aDogc3RyaW5nOyAvLyDku45idW5kbGXliLDmlofku7bnmoTnm7jlr7not6/lvoQo5LiN5ZCr5ZCO57yAKVxyXG4gICAgaXNQbGlzdDogYm9vbGVhbjtcclxuICAgIHNwcml0ZUZyYW1lOiBzdHJpbmc7XHJcbn07XHJcblxyXG5hc3luYyBmdW5jdGlvbiBmaW5kTGFzdEJ1bmRsZURpcmVjdG9yeShhc3NldFVybDogc3RyaW5nKTogUHJvbWlzZTxCdW5kbGVEaXJlY3RvcnlJbmZvIHwgbnVsbD4ge1xyXG4gICAgaWYgKCFhc3NldFVybCkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldFVybCk7XHJcbiAgICBjb25zdCB0eXBlID0gYXNzZXRJbmZvPy50eXBlIHx8ICcnO1xyXG4gICAgY29uc3QgaW1wb3J0ZXIgPSBhc3NldEluZm8/LmltcG9ydGVyIHx8ICcnO1xyXG4gICAgY29uc3QgdXJsID0gYXNzZXRJbmZvPy51cmwgfHwgJyc7XHJcblxyXG4gICAgY29uc3QgaXNQbGlzdCA9IHVybC5pbmNsdWRlcygnLnBsaXN0Jyk7XHJcbiAgICAvLyBcImRiOi8vYXNzZXRzL2J1bmRsZXMvY29tbW9uLXJlcy9jb21tb24ucGxpc3QvZGF0YVwiXHJcblxyXG4gICAgbGV0IHBsaXN0UGF0aCA9IFwiXCI7XHJcbiAgICBsZXQgc3ByaXRlRnJhbWUgPSBcIlwiO1xyXG4gICAgaWYgKGlzUGxpc3QpIHtcclxuICAgICAgICBwbGlzdFBhdGggPSB1cmwuc3BsaXQoJy5wbGlzdC8nKVswXTtcclxuICAgICAgICBzcHJpdGVGcmFtZSA9IGFzc2V0SW5mbz8ubmFtZSA/PyBcIlwiO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIOWmguaenOaYr+aWh+S7tuWkueexu+Wei++8jOebtOaOpei/lOWbnm51bGxcclxuICAgIGlmIChpbXBvcnRlciA9PSBcImRpcmVjdG9yeVwiKSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IHJlYWxUeXBlID0gdHlwZTtcclxuICAgIGlmICh0eXBlICYmIHR5cGUuc3RhcnRzV2l0aCgnY2MnKSkge1xyXG4gICAgICAgIC8vIOWIoOmZpGNjLuWJjee8gO+8jOiOt+WPluecn+Wunuexu+Wei1xyXG4gICAgICAgIHJlYWxUeXBlID0gdHlwZS5zbGljZSgzKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyDnu5/kuIDot6/lvoTliIbpmpTnrKZcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBhc3NldFVybC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XHJcblxyXG4gICAgLy8g5YiG56a75Y2P6K6u5YmN57yAKOWmgiBkYjovLynlkozot6/lvoTkuLvkvZNcclxuICAgIGNvbnN0IG1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihkYjpcXC9cXC8pKC4qKSQvKTtcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwcmVmaXggPSBtYXRjaFsxXTsgIC8vIGRiOi8vXHJcbiAgICBjb25zdCBwYXRoQm9keSA9IG1hdGNoWzJdLnJlcGxhY2UoL1xcLyQvLCAnJyk7ICAvLyDnp7vpmaTlsL7pg6jmlpzmnaBcclxuICAgIGNvbnN0IHNlZ21lbnRzID0gcGF0aEJvZHkuc3BsaXQoJy8nKTtcclxuXHJcbiAgICAvLyDku47lrozmlbTot6/lvoTlvIDlp4vvvIzpgJDkuKrlh4/lsJHlsL7pg6jmrrXvvIzku47lkI7lvoDliY3mn6Xmib4gYnVuZGxlXHJcbiAgICBmb3IgKGxldCBpID0gc2VnbWVudHMubGVuZ3RoOyBpID4gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlUGF0aCA9IHNlZ21lbnRzLnNsaWNlKDAsIGkpLmpvaW4oJy8nKTtcclxuICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSBwcmVmaXggKyBjYW5kaWRhdGVQYXRoO1xyXG5cclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGNhbmRpZGF0ZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoYXNzZXRJbmZvPy5pc0J1bmRsZSkge1xyXG4gICAgICAgICAgICAgICAgLy8g5LuOYnVuZGxl55uu5b2V5Yiw5Y6f5aeL5paH5Lu255qE55u45a+56Lev5b6EKOenu+mZpOaWh+S7tuWQjue8gClcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZ1NlZ21lbnRzID0gc2VnbWVudHMuc2xpY2UoaSk7XHJcbiAgICAgICAgICAgICAgICBsZXQgcmVsYXRpdmVQYXRoID0gcmVtYWluaW5nU2VnbWVudHMuam9pbignLycpO1xyXG4gICAgICAgICAgICAgICAgLy8g56e76Zmk5paH5Lu25ZCO57yAXHJcbiAgICAgICAgICAgICAgICByZWxhdGl2ZVBhdGggPSByZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFwuW14vLl0rJC8sICcnKTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHVybDogY2FuZGlkYXRlLFxyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0SW5mby5uYW1lIHx8IHNlZ21lbnRzW2kgLSAxXSB8fCAnJyxcclxuICAgICAgICAgICAgICAgICAgICByZWFsVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZVBhdGg6IHJlbGF0aXZlUGF0aCxcclxuICAgICAgICAgICAgICAgICAgICBpc1BsaXN0LFxyXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZUZyYW1lLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2Fzc2V0cy1kYl0gRmFpbGVkIHRvIGluc3BlY3QgZGlyZWN0b3J5ICR7Y2FuZGlkYXRlfWAsIGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvbkFzc2V0TWVudShpbmZvOiBBc3NldEluZm8pIHtcclxuICAgIHJldHVybiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUuYXNzZXRNZW51LmNyZWF0ZUFzc2V0SGFuZGxlclRpdGxlJyxcclxuICAgICAgICAgICAgc3VibWVudTogW1xyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5hc3NldE1lbnUuY3JlYXRlQXNzZXRIYW5kbGVyLmhhc0Fzc2V0U2VydmljZScsXHJcbiAgICAgICAgICAgICAgICAgICAgYXN5bmMgY2xpY2soKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWluZm8gfHwgIWluZm8udXVpZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgaW5mby51dWlkKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwYXRoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKCfml6Dms5Xojrflj5botYTmupDot6/lvoQnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYnVuZGxlSW5mbyA9IGF3YWl0IGZpbmRMYXN0QnVuZGxlRGlyZWN0b3J5KHBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWJ1bmRsZUluZm8pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuZXJyb3IoJ+acquaJvuWIsOWMheWQqyBBc3NldCBCdW5kbGUg55qE55uu5b2VLCDor7fnoa7orqTotYTmupDkvY3kuo7mn5DkuKogQnVuZGxlIOS4iycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY3RybEMgPSBgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBhc3NTdnIuZ2V0T3JDcmVhdGVBc3NldEhhbmRsZSgnJHtidW5kbGVJbmZvLm5hbWV9Jywke2J1bmRsZUluZm8uaXNQbGlzdCA/IFwiU3ByaXRlQXRsYXNcIiA6IGJ1bmRsZUluZm8ucmVhbFR5cGV9LCcke2J1bmRsZUluZm8ucmVsYXRpdmVQYXRofScpO2A7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYnVuZGxlSW5mby5pc1BsaXN0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdHJsQyArPSBgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzcHJpdGVGcmFtZSA9IGhhbmRsZS5nZXRBc3NldCgpIS5nZXRTcHJpdGVGcmFtZSgnJHtidW5kbGVJbmZvLnNwcml0ZUZyYW1lfScpO2A7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5DbGlwYm9hcmQud3JpdGUoXCJ0ZXh0XCIsIGN0cmxDLnRyaW0oKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbyhg5Luj56CB5bey5aSN5Yi25Yiw5Ymq6LS05p2/YCwgeyB0aXRsZTogJ+WkjeWItuaIkOWKnycgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUuYXNzZXRNZW51LmNyZWF0ZUFzc2V0SGFuZGxlci5ub0Fzc2V0U2VydmljZScsXHJcbiAgICAgICAgICAgICAgICAgICAgYXN5bmMgY2xpY2soKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWluZm8gfHwgIWluZm8udXVpZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgaW5mby51dWlkKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwYXRoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKCfml6Dms5Xojrflj5botYTmupDot6/lvoQnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYnVuZGxlSW5mbyA9IGF3YWl0IGZpbmRMYXN0QnVuZGxlRGlyZWN0b3J5KHBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWJ1bmRsZUluZm8pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuZXJyb3IoJ+acquaJvuWIsOWMheWQqyBBc3NldCBCdW5kbGUg55qE55uu5b2VLCDor7fnoa7orqTotYTmupDkvY3kuo7mn5DkuKogQnVuZGxlIOS4iycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY3RybEMgPSBgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NTdnIgPSBDb250YWluZXIuZ2V0KEFzc2V0U2VydmljZSkhO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gYXNzU3ZyLmdldE9yQ3JlYXRlQXNzZXRIYW5kbGUoJyR7YnVuZGxlSW5mby5uYW1lfScsJHtidW5kbGVJbmZvLmlzUGxpc3QgPyBcIlNwcml0ZUF0bGFzXCIgOiBidW5kbGVJbmZvLnJlYWxUeXBlfSwnJHtidW5kbGVJbmZvLnJlbGF0aXZlUGF0aH0nKTtgO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJ1bmRsZUluZm8uaXNQbGlzdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3RybEMgKz0gYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzcHJpdGVGcmFtZSA9IGhhbmRsZS5nZXRBc3NldCgpIS5nZXRTcHJpdGVGcmFtZSgnJHtidW5kbGVJbmZvLnNwcml0ZUZyYW1lfScpO2A7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5DbGlwYm9hcmQud3JpdGUoXCJ0ZXh0XCIsIGN0cmxDLnRyaW0oKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbyhg5Luj56CB5bey5aSN5Yi25Yiw5Ymq6LS05p2/YCwgeyB0aXRsZTogJ+WkjeWItuaIkOWKnycgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUuYXNzZXRNZW51LmNyZWF0ZUFzc2V0SGFuZGxlci5jb3B5STE4bmZvJyxcclxuICAgICAgICAgICAgICAgICAgICBhc3luYyBjbGljaygpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpbmZvIHx8ICFpbmZvLnV1aWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LXVybCcsIGluZm8udXVpZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcGF0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcign5peg5rOV6I635Y+W6LWE5rqQ6Lev5b6EJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ1bmRsZUluZm8gPSBhd2FpdCBmaW5kTGFzdEJ1bmRsZURpcmVjdG9yeShwYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFidW5kbGVJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKCfmnKrmib7liLDljIXlkKsgQXNzZXQgQnVuZGxlIOeahOebruW9lSwg6K+356Gu6K6k6LWE5rqQ5L2N5LqO5p+Q5LiqIEJ1bmRsZSDkuIsnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHRleHQgPSBcIlwiO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYnVuZGxlSW5mby5pc1BsaXN0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gYnVuZGxlSW5mby5uYW1lICsgXCIvXCIgKyBidW5kbGVJbmZvLnJlbGF0aXZlUGF0aCArIFwiLnBsaXN0XCIgKyBcIi9cIiArIGJ1bmRsZUluZm8uc3ByaXRlRnJhbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gYnVuZGxlSW5mby5uYW1lICsgXCIvXCIgKyBidW5kbGVJbmZvLnJlbGF0aXZlUGF0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkNsaXBib2FyZC53cml0ZShcInRleHRcIiwgdGV4dCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbyhgaTE4buS/oeaBr+W3suWkjeWItuWIsOWJqui0tOadv2AsIHsgdGl0bGU6ICflpI3liLbmiJDlip8nIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXVxyXG4gICAgICAgIH1cclxuICAgIF07XHJcbn1cclxuIl19