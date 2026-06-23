"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTemplate = createTemplate;
const fs_1 = require("fs");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const child_process_1 = require("child_process");
async function createTemplate() {
    console.log("开始创建模板");
    console.log("创建调试面板自定义宏");
    let macroCustom = await Editor.Profile.getProject("engine", "macroCustom", "project");
    if (!macroCustom) {
        macroCustom = [
            {
                key: "OPEN_DEBUG_PANEL",
                value: true
            }
        ];
    }
    if (!Array.isArray(macroCustom)) {
        console.error("macroCustom is not an array, resetting to default.");
        return;
    }
    const openDebugPanel = macroCustom.find(item => item.key === "OPEN_DEBUG_PANEL");
    if (openDebugPanel) {
        openDebugPanel.value = true;
    }
    Editor.Profile.setProject("engine", "macroCustom", macroCustom, "project");
    const editorPath = Editor.Project.path;
    const assetsPath = `${editorPath}/assets`;
    const scriptsPath = `${assetsPath}/scripts`;
    // 判断有没有launch.ts文件
    const launchFilePath = `${scriptsPath}/launch.ts`;
    if ((0, fs_1.existsSync)(launchFilePath)) {
        console.error("检查已存在launch.ts文件, 不需要创建模板");
        return;
    }
    // 去github下载模版项目
    const templateUrl = "https://github.com/ksgames26/project-templete";
    // 实现在这里
    try {
        console.log(`开始从 ${templateUrl} 下载模板项目`);
        const urlParts = templateUrl.split('/');
        if (urlParts.length < 5 || urlParts[2] !== 'github.com') {
            console.error(`无效的 GitHub URL 格式: ${templateUrl}`);
            return;
        }
        const owner = urlParts[3];
        const repoName = urlParts[4].replace(/\.git$/, ''); // 移除可能的 .git 后缀
        const targetDirInAssets = path.join(assetsPath, repoName);
        console.log(`模板项目将下载到: ${targetDirInAssets}`);
        // 如果目标目录已存在，则先删除 (实现覆盖逻辑)
        if (fs.existsSync(targetDirInAssets)) {
            console.log(`目标目录 ${targetDirInAssets} 已存在，将执行覆盖操作。正在删除旧目录...`);
            await fs.remove(targetDirInAssets);
            console.log(`旧目录 ${targetDirInAssets} 已删除。`);
        }
        await fs.ensureDir(targetDirInAssets);
        const zipUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
        const tempZipFileName = `${repoName}-main.zip`; // 临时ZIP文件名
        const zipFilePath = path.join(assetsPath, tempZipFileName); // 将ZIP文件临时存放在assets目录下
        console.log(`正在从 ${zipUrl} 下载 ZIP 文件到 ${zipFilePath}`);
        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(zipFilePath);
            const requestOptions = {
                headers: {
                    'User-Agent': 'Cocos-Creator-Template-Downloader'
                }
            };
            https.get(zipUrl, requestOptions, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    if (!response.headers.location) {
                        fs.unlink(zipFilePath, () => { }); // 清理不完整的zip
                        reject(new Error('下载重定向时未找到 location header'));
                        return;
                    }
                    console.log(`请求被重定向到: ${response.headers.location}`);
                    https.get(response.headers.location, requestOptions, (redirectResponse) => {
                        if (redirectResponse.statusCode !== 200) {
                            fs.unlink(zipFilePath, () => { });
                            reject(new Error(`下载 ZIP 文件失败，状态码: ${redirectResponse.statusCode}`));
                            return;
                        }
                        redirectResponse.pipe(fileStream);
                        fileStream.on('finish', () => {
                            fileStream.close();
                            console.log('ZIP 文件下载完成。');
                            resolve();
                        });
                    }).on('error', (err) => {
                        fs.unlink(zipFilePath, () => { });
                        reject(new Error(`下载重定向的 ZIP 文件时发生错误: ${err.message}`));
                    });
                    return;
                }
                if (response.statusCode !== 200) {
                    fs.unlink(zipFilePath, () => { });
                    reject(new Error(`下载 ZIP 文件失败，状态码: ${response.statusCode}`));
                    return;
                }
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log('ZIP 文件下载完成。');
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(zipFilePath, () => { }); // 清理
                reject(new Error(`下载 ZIP 文件时发生错误: ${err.message}`));
            });
        });
        console.log('开始解压 ZIP 文件...');
        // 创建一个唯一的临时解压目录，以避免冲突，并放在 assetsPath 外层，如项目根目录的 .temp
        const projectRoot = Editor.Project.path;
        const tempExtractDir = path.join(projectRoot, `.temp_extract_${repoName}_${Date.now()}`);
        await fs.ensureDir(tempExtractDir);
        const isWindows = process.platform === 'win32';
        let unzipCommand;
        if (isWindows) {
            // PowerShell 命令需要确保路径正确处理，特别是包含空格或特殊字符时
            const psZipFilePath = zipFilePath.replace(/'/g, "''");
            const psTempExtractDir = tempExtractDir.replace(/'/g, "''");
            unzipCommand = `powershell -command "Expand-Archive -Path '${psZipFilePath}' -DestinationPath '${psTempExtractDir}' -Force"`;
        }
        else {
            unzipCommand = `unzip -o "${zipFilePath}" -d "${tempExtractDir}"`; // -o 表示覆盖已存在文件而不询问
        }
        console.log(`执行解压命令: ${unzipCommand}`);
        await new Promise((resolve, reject) => {
            (0, child_process_1.exec)(unzipCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`解压 ZIP 文件失败: ${error.message}`);
                    console.error(`Stderr: ${stderr}`);
                    reject(error);
                    return;
                }
                console.log(`解压输出: ${stdout}`);
                resolve();
            });
        });
        console.log('ZIP 文件解压完成。正在移动文件...');
        // GitHub ZIP 包通常会包含一个与仓库名和分支名相关的根目录，例如 'project-temlete-main'
        const extractedItems = await fs.readdir(tempExtractDir);
        let sourceDirToMove = tempExtractDir;
        if (extractedItems.length === 1) {
            const firstItemPath = path.join(tempExtractDir, extractedItems[0]);
            if ((await fs.stat(firstItemPath)).isDirectory()) {
                // 假设这个单目录就是包含所有内容的目录
                sourceDirToMove = firstItemPath;
                console.log(`内容在子目录 ${extractedItems[0]} 中，将从此处移动。`);
            }
        }
        const filesToMove = await fs.readdir(sourceDirToMove);
        for (const file of filesToMove) {
            const srcPath = path.join(sourceDirToMove, file);
            const destPath = path.join(targetDirInAssets, file);
            await fs.move(srcPath, destPath, { overwrite: true });
        }
        console.log(`文件已移动到 ${targetDirInAssets}`);
        console.log('清理临时文件...');
        await fs.remove(zipFilePath);
        await fs.remove(tempExtractDir);
        console.log('临时文件清理完成。');
        // 将模板项目中的 assets 文件夹内容移动到项目根 assets 目录，并删除模板项目原目录
        console.log(`准备处理模板项目 ${repoName} 的内部 assets 文件夹...`);
        const templateInnerAssetsPath = path.join(targetDirInAssets, 'assets');
        if (fs.existsSync(templateInnerAssetsPath) && (await fs.stat(templateInnerAssetsPath)).isDirectory()) {
            console.log(`发现模板内部 assets 文件夹: ${templateInnerAssetsPath}`);
            console.log(`将其内容移动到项目主 assets 目录: ${assetsPath}`);
            const itemsInTemplateAssets = await fs.readdir(templateInnerAssetsPath);
            for (const item of itemsInTemplateAssets) {
                const sourceItemPath = path.join(templateInnerAssetsPath, item);
                const destinationItemPath = path.join(assetsPath, item); // assetsPath 是项目的主 assets 目录
                // 如果目标已存在，先尝试删除，确保 move 操作对于文件夹能正确覆盖
                if (fs.existsSync(destinationItemPath)) {
                    console.log(`目标路径 ${destinationItemPath} 已存在，将先删除以进行覆盖。`);
                    await fs.remove(destinationItemPath);
                }
                await fs.move(sourceItemPath, destinationItemPath, { overwrite: true }); // overwrite 适用于文件，对于目录，先删除再移动更可靠
                console.log(`已移动 ${item} 到 ${destinationItemPath}`);
            }
            console.log('模板内部 assets 内容移动完成。');
        }
        else {
            console.log(`模板项目 ${repoName} 中未找到内部 assets 文件夹，或其不是一个目录。跳过移动内部 assets 步骤。`);
        }
        console.log(`删除模板项目原始根目录: ${targetDirInAssets}`);
        await fs.remove(targetDirInAssets);
        console.log(`模板项目原始根目录 ${targetDirInAssets} 已删除。`);
        console.log('刷新 Cocos Creator 资源数据库...');
        Editor.Message.send('asset-db', 'refresh');
        console.log('资源数据库刷新请求已发送。');
        console.log(`模板项目 ${repoName} 已成功下载并解压到 ${targetDirInAssets}`);
    }
    catch (error) {
        console.error(`创建模板过程中发生错误: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvY3JlYXRlVGVtcGxldGUvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFNQSx3Q0E0TkM7QUFsT0QsMkJBQWdDO0FBQ2hDLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsNkNBQStCO0FBQy9CLGlEQUFxQztBQUU5QixLQUFLLFVBQVUsY0FBYztJQUNoQyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXRCLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDMUIsSUFBSSxXQUFXLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBRXRGLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNmLFdBQVcsR0FBRztZQUNWO2dCQUNJLEdBQUcsRUFBRSxrQkFBa0I7Z0JBQ3ZCLEtBQUssRUFBRSxJQUFJO2FBQ2Q7U0FDSixDQUFDO0lBQ04sQ0FBQztJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDOUIsT0FBTyxDQUFDLEtBQUssQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ3BFLE9BQU87SUFDWCxDQUFDO0lBRUQsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssa0JBQWtCLENBQUMsQ0FBQztJQUNqRixJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ2pCLGNBQWMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFB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Q0FBQztRQUMvQyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9CLENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4aXN0c1N5bmMgfSBmcm9tIFwiZnNcIjtcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMtZXh0cmEnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XHJcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVUZW1wbGF0ZSgpIHtcclxuICAgIGNvbnNvbGUubG9nKFwi5byA5aeL5Yib5bu65qih5p2/XCIpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKFwi5Yib5bu66LCD6K+V6Z2i5p2/6Ieq5a6a5LmJ5a6PXCIpO1xyXG4gICAgbGV0IG1hY3JvQ3VzdG9tID0gYXdhaXQgRWRpdG9yLlByb2ZpbGUuZ2V0UHJvamVjdChcImVuZ2luZVwiLCBcIm1hY3JvQ3VzdG9tXCIsIFwicHJvamVjdFwiKTtcclxuXHJcbiAgICBpZiAoIW1hY3JvQ3VzdG9tKSB7XHJcbiAgICAgICAgbWFjcm9DdXN0b20gPSBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGtleTogXCJPUEVOX0RFQlVHX1BBTkVMXCIsXHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogdHJ1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobWFjcm9DdXN0b20pKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIm1hY3JvQ3VzdG9tIGlzIG5vdCBhbiBhcnJheSwgcmVzZXR0aW5nIHRvIGRlZmF1bHQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvcGVuRGVidWdQYW5lbCA9IG1hY3JvQ3VzdG9tLmZpbmQoaXRlbSA9PiBpdGVtLmtleSA9PT0gXCJPUEVOX0RFQlVHX1BBTkVMXCIpO1xyXG4gICAgaWYgKG9wZW5EZWJ1Z1BhbmVsKSB7XHJcbiAgICAgICAgb3BlbkRlYnVnUGFuZWwudmFsdWUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIEVkaXRvci5Qcm9maWxlLnNldFByb2plY3QoXCJlbmdpbmVcIiwgXCJtYWNyb0N1c3RvbVwiLCBtYWNyb0N1c3RvbSwgXCJwcm9qZWN0XCIpO1xyXG5cclxuICAgIGNvbnN0IGVkaXRvclBhdGggPSBFZGl0b3IuUHJvamVjdC5wYXRoO1xyXG4gICAgY29uc3QgYXNzZXRzUGF0aCA9IGAke2VkaXRvclBhdGh9L2Fzc2V0c2A7XHJcbiAgICBjb25zdCBzY3JpcHRzUGF0aCA9IGAke2Fzc2V0c1BhdGh9L3NjcmlwdHNgO1xyXG5cclxuICAgIC8vIOWIpOaWreacieayoeaciWxhdW5jaC50c+aWh+S7tlxyXG4gICAgY29uc3QgbGF1bmNoRmlsZVBhdGggPSBgJHtzY3JpcHRzUGF0aH0vbGF1bmNoLnRzYDtcclxuICAgIGlmIChleGlzdHNTeW5jKGxhdW5jaEZpbGVQYXRoKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCLmo4Dmn6Xlt7LlrZjlnKhsYXVuY2gudHPmlofku7YsIOS4jemcgOimgeWIm+W7uuaooeadv1wiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5Y67Z2l0aHVi5LiL6L295qih54mI6aG555uuXHJcbiAgICBjb25zdCB0ZW1wbGF0ZVVybCA9IFwiaHR0cHM6Ly9naXRodWIuY29tL2tzZ2FtZXMyNi9wcm9qZWN0LXRlbXBsZXRlXCI7XHJcblxyXG4gICAgLy8g5a6e546w5Zyo6L+Z6YeMXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDlvIDlp4vku44gJHt0ZW1wbGF0ZVVybH0g5LiL6L295qih5p2/6aG555uuYCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHVybFBhcnRzID0gdGVtcGxhdGVVcmwuc3BsaXQoJy8nKTtcclxuICAgICAgICBpZiAodXJsUGFydHMubGVuZ3RoIDwgNSB8fCB1cmxQYXJ0c1syXSAhPT0gJ2dpdGh1Yi5jb20nKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOaXoOaViOeahCBHaXRIdWIgVVJMIOagvOW8jzogJHt0ZW1wbGF0ZVVybH1gKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBvd25lciA9IHVybFBhcnRzWzNdO1xyXG4gICAgICAgIGNvbnN0IHJlcG9OYW1lID0gdXJsUGFydHNbNF0ucmVwbGFjZSgvXFwuZ2l0JC8sICcnKTsgLy8g56e76Zmk5Y+v6IO955qEIC5naXQg5ZCO57yAXHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldERpckluQXNzZXRzID0gcGF0aC5qb2luKGFzc2V0c1BhdGgsIHJlcG9OYW1lKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg5qih5p2/6aG555uu5bCG5LiL6L295YiwOiAke3RhcmdldERpckluQXNzZXRzfWApO1xyXG5cclxuICAgICAgICAvLyDlpoLmnpznm67moIfnm67lvZXlt7LlrZjlnKjvvIzliJnlhYjliKDpmaQgKOWunueOsOimhueblumAu+i+kSlcclxuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyh0YXJnZXREaXJJbkFzc2V0cykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYOebruagh+ebruW9lSAke3RhcmdldERpckluQXNzZXRzfSDlt7LlrZjlnKjvvIzlsIbmiafooYzopobnm5bmk43kvZzjgILmraPlnKjliKDpmaTml6fnm67lvZUuLi5gKTtcclxuICAgICAgICAgICAgYXdhaXQgZnMucmVtb3ZlKHRhcmdldERpckluQXNzZXRzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYOaXp+ebruW9lSAke3RhcmdldERpckluQXNzZXRzfSDlt7LliKDpmaTjgIJgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgZnMuZW5zdXJlRGlyKHRhcmdldERpckluQXNzZXRzKTtcclxuXHJcbiAgICAgICAgY29uc3QgemlwVXJsID0gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke293bmVyfS8ke3JlcG9OYW1lfS9hcmNoaXZlL3JlZnMvaGVhZHMvbWFpbi56aXBgO1xyXG4gICAgICAgIGNvbnN0IHRlbXBaaXBGaWxlTmFtZSA9IGAke3JlcG9OYW1lfS1tYWluLnppcGA7IC8vIOS4tOaXtlpJUOaWh+S7tuWQjVxyXG4gICAgICAgIGNvbnN0IHppcEZpbGVQYXRoID0gcGF0aC5qb2luKGFzc2V0c1BhdGgsIHRlbXBaaXBGaWxlTmFtZSk7IC8vIOWwhlpJUOaWh+S7tuS4tOaXtuWtmOaUvuWcqGFzc2V0c+ebruW9leS4i1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhg5q2j5Zyo5LuOICR7emlwVXJsfSDkuIvovb0gWklQIOaWh+S7tuWIsCAke3ppcEZpbGVQYXRofWApO1xyXG5cclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpbGVTdHJlYW0gPSBmcy5jcmVhdGVXcml0ZVN0cmVhbSh6aXBGaWxlUGF0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RPcHRpb25zID0ge1xyXG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAgICAgICAgICdVc2VyLUFnZW50JzogJ0NvY29zLUNyZWF0b3ItVGVtcGxhdGUtRG93bmxvYWRlcidcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaHR0cHMuZ2V0KHppcFVybCwgcmVxdWVzdE9wdGlvbnMsIChyZXNwb25zZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1c0NvZGUgPT09IDMwMSB8fCByZXNwb25zZS5zdGF0dXNDb2RlID09PSAzMDIpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3BvbnNlLmhlYWRlcnMubG9jYXRpb24pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZnMudW5saW5rKHppcEZpbGVQYXRoLCAoKSA9PiB7fSk7IC8vIOa4heeQhuS4jeWujOaVtOeahHppcFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCfkuIvovb3ph43lrprlkJHml7bmnKrmib7liLAgbG9jYXRpb24gaGVhZGVyJykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDor7fmsYLooqvph43lrprlkJHliLA6ICR7cmVzcG9uc2UuaGVhZGVycy5sb2NhdGlvbn1gKTtcclxuICAgICAgICAgICAgICAgICAgICBodHRwcy5nZXQocmVzcG9uc2UuaGVhZGVycy5sb2NhdGlvbiwgcmVxdWVzdE9wdGlvbnMsIChyZWRpcmVjdFJlc3BvbnNlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWRpcmVjdFJlc3BvbnNlLnN0YXR1c0NvZGUgIT09IDIwMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnMudW5saW5rKHppcEZpbGVQYXRoLCAoKSA9PiB7fSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGDkuIvovb0gWklQIOaWh+S7tuWksei0pe+8jOeKtuaAgeeggTogJHtyZWRpcmVjdFJlc3BvbnNlLnN0YXR1c0NvZGV9YCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZGlyZWN0UmVzcG9uc2UucGlwZShmaWxlU3RyZWFtKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZVN0cmVhbS5vbignZmluaXNoJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZVN0cmVhbS5jbG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1pJUCDmlofku7bkuIvovb3lrozmiJDjgIInKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSkub24oJ2Vycm9yJywgKGVycikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmcy51bmxpbmsoemlwRmlsZVBhdGgsICgpID0+IHt9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihg5LiL6L296YeN5a6a5ZCR55qEIFpJUCDmlofku7bml7blj5HnlJ/plJnor686ICR7ZXJyLm1lc3NhZ2V9YCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZnMudW5saW5rKHppcEZpbGVQYXRoLCAoKSA9PiB7fSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihg5LiL6L29IFpJUCDmlofku7blpLHotKXvvIznirbmgIHnoIE6ICR7cmVzcG9uc2Uuc3RhdHVzQ29kZX1gKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmVzcG9uc2UucGlwZShmaWxlU3RyZWFtKTtcclxuICAgICAgICAgICAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBmaWxlU3RyZWFtLmNsb3NlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1pJUCDmlofku7bkuIvovb3lrozmiJDjgIInKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSkub24oJ2Vycm9yJywgKGVycikgPT4ge1xyXG4gICAgICAgICAgICAgICAgZnMudW5saW5rKHppcEZpbGVQYXRoLCAoKSA9PiB7fSk7IC8vIOa4heeQhlxyXG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihg5LiL6L29IFpJUCDmlofku7bml7blj5HnlJ/plJnor686ICR7ZXJyLm1lc3NhZ2V9YCkpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ+W8gOWni+ino+WOiyBaSVAg5paH5Lu2Li4uJyk7XHJcbiAgICAgICAgLy8g5Yib5bu65LiA5Liq5ZSv5LiA55qE5Li05pe26Kej5Y6L55uu5b2V77yM5Lul6YG/5YWN5Yay56qB77yM5bm25pS+5ZyoIGFzc2V0c1BhdGgg5aSW5bGC77yM5aaC6aG555uu5qC555uu5b2V55qEIC50ZW1wXHJcbiAgICAgICAgY29uc3QgcHJvamVjdFJvb3QgPSBFZGl0b3IuUHJvamVjdC5wYXRoO1xyXG4gICAgICAgIGNvbnN0IHRlbXBFeHRyYWN0RGlyID0gcGF0aC5qb2luKHByb2plY3RSb290LCBgLnRlbXBfZXh0cmFjdF8ke3JlcG9OYW1lfV8ke0RhdGUubm93KCl9YCk7XHJcbiAgICAgICAgYXdhaXQgZnMuZW5zdXJlRGlyKHRlbXBFeHRyYWN0RGlyKTtcclxuXHJcbiAgICAgICAgY29uc3QgaXNXaW5kb3dzID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJztcclxuICAgICAgICBsZXQgdW56aXBDb21tYW5kOiBzdHJpbmc7XHJcbiAgICAgICAgaWYgKGlzV2luZG93cykge1xyXG4gICAgICAgICAgICAvLyBQb3dlclNoZWxsIOWRveS7pOmcgOimgeehruS/nei3r+W+hOato+ehruWkhOeQhu+8jOeJueWIq+aYr+WMheWQq+epuuagvOaIlueJueauiuWtl+espuaXtlxyXG4gICAgICAgICAgICBjb25zdCBwc1ppcEZpbGVQYXRoID0gemlwRmlsZVBhdGgucmVwbGFjZSgvJy9nLCBcIicnXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBwc1RlbXBFeHRyYWN0RGlyID0gdGVtcEV4dHJhY3REaXIucmVwbGFjZSgvJy9nLCBcIicnXCIpO1xyXG4gICAgICAgICAgICB1bnppcENvbW1hbmQgPSBgcG93ZXJzaGVsbCAtY29tbWFuZCBcIkV4cGFuZC1BcmNoaXZlIC1QYXRoICcke3BzWmlwRmlsZVBhdGh9JyAtRGVzdGluYXRpb25QYXRoICcke3BzVGVtcEV4dHJhY3REaXJ9JyAtRm9yY2VcImA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdW56aXBDb21tYW5kID0gYHVuemlwIC1vIFwiJHt6aXBGaWxlUGF0aH1cIiAtZCBcIiR7dGVtcEV4dHJhY3REaXJ9XCJgOyAvLyAtbyDooajnpLropobnm5blt7LlrZjlnKjmlofku7bogIzkuI3or6Lpl65cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDmiafooYzop6Pljovlkb3ku6Q6ICR7dW56aXBDb21tYW5kfWApO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgZXhlYyh1bnppcENvbW1hbmQsIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOino+WOiyBaSVAg5paH5Lu25aSx6LSlOiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgU3RkZXJyOiAke3N0ZGVycn1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDop6PljovovpPlh7o6ICR7c3Rkb3V0fWApO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1pJUCDmlofku7bop6PljovlrozmiJDjgILmraPlnKjnp7vliqjmlofku7YuLi4nKTtcclxuICAgICAgICAvLyBHaXRIdWIgWklQIOWMhemAmuW4uOS8muWMheWQq+S4gOS4quS4juS7k+W6k+WQjeWSjOWIhuaUr+WQjeebuOWFs+eahOagueebruW9le+8jOS+i+WmgiAncHJvamVjdC10ZW1sZXRlLW1haW4nXHJcbiAgICAgICAgY29uc3QgZXh0cmFjdGVkSXRlbXMgPSBhd2FpdCBmcy5yZWFkZGlyKHRlbXBFeHRyYWN0RGlyKTtcclxuICAgICAgICBsZXQgc291cmNlRGlyVG9Nb3ZlID0gdGVtcEV4dHJhY3REaXI7XHJcbiAgICAgICAgaWYgKGV4dHJhY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEl0ZW1QYXRoID0gcGF0aC5qb2luKHRlbXBFeHRyYWN0RGlyLCBleHRyYWN0ZWRJdGVtc1swXSk7XHJcbiAgICAgICAgICAgIGlmICgoYXdhaXQgZnMuc3RhdChmaXJzdEl0ZW1QYXRoKSkuaXNEaXJlY3RvcnkoKSkge1xyXG4gICAgICAgICAgICAgICAgLy8g5YGH6K6+6L+Z5Liq5Y2V55uu5b2V5bCx5piv5YyF5ZCr5omA5pyJ5YaF5a6555qE55uu5b2VXHJcbiAgICAgICAgICAgICAgICBzb3VyY2VEaXJUb01vdmUgPSBmaXJzdEl0ZW1QYXRoO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYOWGheWuueWcqOWtkOebruW9lSAke2V4dHJhY3RlZEl0ZW1zWzBdfSDkuK3vvIzlsIbku47mraTlpITnp7vliqjjgIJgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZmlsZXNUb01vdmUgPSBhd2FpdCBmcy5yZWFkZGlyKHNvdXJjZURpclRvTW92ZSk7XHJcbiAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzVG9Nb3ZlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4oc291cmNlRGlyVG9Nb3ZlLCBmaWxlKTtcclxuICAgICAgICAgICAgY29uc3QgZGVzdFBhdGggPSBwYXRoLmpvaW4odGFyZ2V0RGlySW5Bc3NldHMsIGZpbGUpO1xyXG4gICAgICAgICAgICBhd2FpdCBmcy5tb3ZlKHNyY1BhdGgsIGRlc3RQYXRoLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS5sb2coYOaWh+S7tuW3suenu+WKqOWIsCAke3RhcmdldERpckluQXNzZXRzfWApO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygn5riF55CG5Li05pe25paH5Lu2Li4uJyk7XHJcbiAgICAgICAgYXdhaXQgZnMucmVtb3ZlKHppcEZpbGVQYXRoKTtcclxuICAgICAgICBhd2FpdCBmcy5yZW1vdmUodGVtcEV4dHJhY3REaXIpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfkuLTml7bmlofku7bmuIXnkIblrozmiJDjgIInKTtcclxuXHJcbiAgICAgICAgLy8g5bCG5qih5p2/6aG555uu5Lit55qEIGFzc2V0cyDmlofku7blpLnlhoXlrrnnp7vliqjliLDpobnnm67moLkgYXNzZXRzIOebruW9le+8jOW5tuWIoOmZpOaooeadv+mhueebruWOn+ebruW9lVxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDlh4blpIflpITnkIbmqKHmnb/pobnnm64gJHtyZXBvTmFtZX0g55qE5YaF6YOoIGFzc2V0cyDmlofku7blpLkuLi5gKTtcclxuICAgICAgICBjb25zdCB0ZW1wbGF0ZUlubmVyQXNzZXRzUGF0aCA9IHBhdGguam9pbih0YXJnZXREaXJJbkFzc2V0cywgJ2Fzc2V0cycpO1xyXG5cclxuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyh0ZW1wbGF0ZUlubmVyQXNzZXRzUGF0aCkgJiYgKGF3YWl0IGZzLnN0YXQodGVtcGxhdGVJbm5lckFzc2V0c1BhdGgpKS5pc0RpcmVjdG9yeSgpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDlj5HnjrDmqKHmnb/lhoXpg6ggYXNzZXRzIOaWh+S7tuWkuTogJHt0ZW1wbGF0ZUlubmVyQXNzZXRzUGF0aH1gKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYOWwhuWFtuWGheWuueenu+WKqOWIsOmhueebruS4uyBhc3NldHMg55uu5b2VOiAke2Fzc2V0c1BhdGh9YCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpdGVtc0luVGVtcGxhdGVBc3NldHMgPSBhd2FpdCBmcy5yZWFkZGlyKHRlbXBsYXRlSW5uZXJBc3NldHNQYXRoKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zSW5UZW1wbGF0ZUFzc2V0cykge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlSXRlbVBhdGggPSBwYXRoLmpvaW4odGVtcGxhdGVJbm5lckFzc2V0c1BhdGgsIGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZGVzdGluYXRpb25JdGVtUGF0aCA9IHBhdGguam9pbihhc3NldHNQYXRoLCBpdGVtKTsgLy8gYXNzZXRzUGF0aCDmmK/pobnnm67nmoTkuLsgYXNzZXRzIOebruW9lVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIOWmguaenOebruagh+W3suWtmOWcqO+8jOWFiOWwneivleWIoOmZpO+8jOehruS/nSBtb3ZlIOaTjeS9nOWvueS6juaWh+S7tuWkueiDveato+ehruimhuebllxyXG4gICAgICAgICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZGVzdGluYXRpb25JdGVtUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg55uu5qCH6Lev5b6EICR7ZGVzdGluYXRpb25JdGVtUGF0aH0g5bey5a2Y5Zyo77yM5bCG5YWI5Yig6Zmk5Lul6L+b6KGM6KaG55uW44CCYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZnMucmVtb3ZlKGRlc3RpbmF0aW9uSXRlbVBhdGgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZnMubW92ZShzb3VyY2VJdGVtUGF0aCwgZGVzdGluYXRpb25JdGVtUGF0aCwgeyBvdmVyd3JpdGU6IHRydWUgfSk7IC8vIG92ZXJ3cml0ZSDpgILnlKjkuo7mlofku7bvvIzlr7nkuo7nm67lvZXvvIzlhYjliKDpmaTlho3np7vliqjmm7Tlj6/pnaBcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDlt7Lnp7vliqggJHtpdGVtfSDliLAgJHtkZXN0aW5hdGlvbkl0ZW1QYXRofWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCfmqKHmnb/lhoXpg6ggYXNzZXRzIOWGheWuueenu+WKqOWujOaIkOOAgicpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDmqKHmnb/pobnnm64gJHtyZXBvTmFtZX0g5Lit5pyq5om+5Yiw5YaF6YOoIGFzc2V0cyDmlofku7blpLnvvIzmiJblhbbkuI3mmK/kuIDkuKrnm67lvZXjgILot7Pov4fnp7vliqjlhoXpg6ggYXNzZXRzIOatpemqpOOAgmApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYOWIoOmZpOaooeadv+mhueebruWOn+Wni+agueebruW9lTogJHt0YXJnZXREaXJJbkFzc2V0c31gKTtcclxuICAgICAgICBhd2FpdCBmcy5yZW1vdmUodGFyZ2V0RGlySW5Bc3NldHMpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDmqKHmnb/pobnnm67ljp/lp4vmoLnnm67lvZUgJHt0YXJnZXREaXJJbkFzc2V0c30g5bey5Yig6Zmk44CCYCk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCfliLfmlrAgQ29jb3MgQ3JlYXRvciDotYTmupDmlbDmja7lupMuLi4nKTtcclxuICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdhc3NldC1kYicsICdyZWZyZXNoJyk7IFxyXG4gICAgICAgIGNvbnNvbGUubG9nKCfotYTmupDmlbDmja7lupPliLfmlrDor7fmsYLlt7Llj5HpgIHjgIInKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYOaooeadv+mhueebriAke3JlcG9OYW1lfSDlt7LmiJDlip/kuIvovb3lubbop6PljovliLAgJHt0YXJnZXREaXJJbkFzc2V0c31gKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihg5Yib5bu65qih5p2/6L+H56iL5Lit5Y+R55Sf6ZSZ6K+vOiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgaWYgKGVycm9yLnN0YWNrKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3Iuc3RhY2spO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSJdfQ==