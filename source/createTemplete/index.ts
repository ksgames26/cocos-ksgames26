import { existsSync } from "fs";
import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { exec } from 'child_process';

export async function createTemplate() {
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
    if (existsSync(launchFilePath)) {
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

        await new Promise<void>((resolve, reject) => {
            const fileStream = fs.createWriteStream(zipFilePath);
            const requestOptions = {
                headers: {
                    'User-Agent': 'Cocos-Creator-Template-Downloader'
                }
            };
            https.get(zipUrl, requestOptions, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    if (!response.headers.location) {
                        fs.unlink(zipFilePath, () => {}); // 清理不完整的zip
                        reject(new Error('下载重定向时未找到 location header'));
                        return;
                    }
                    console.log(`请求被重定向到: ${response.headers.location}`);
                    https.get(response.headers.location, requestOptions, (redirectResponse) => {
                        if (redirectResponse.statusCode !== 200) {
                            fs.unlink(zipFilePath, () => {});
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
                        fs.unlink(zipFilePath, () => {});
                        reject(new Error(`下载重定向的 ZIP 文件时发生错误: ${err.message}`));
                    });
                    return;
                }

                if (response.statusCode !== 200) {
                    fs.unlink(zipFilePath, () => {});
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
                fs.unlink(zipFilePath, () => {}); // 清理
                reject(new Error(`下载 ZIP 文件时发生错误: ${err.message}`));
            });
        });

        console.log('开始解压 ZIP 文件...');
        // 创建一个唯一的临时解压目录，以避免冲突，并放在 assetsPath 外层，如项目根目录的 .temp
        const projectRoot = Editor.Project.path;
        const tempExtractDir = path.join(projectRoot, `.temp_extract_${repoName}_${Date.now()}`);
        await fs.ensureDir(tempExtractDir);

        const isWindows = process.platform === 'win32';
        let unzipCommand: string;
        if (isWindows) {
            // PowerShell 命令需要确保路径正确处理，特别是包含空格或特殊字符时
            const psZipFilePath = zipFilePath.replace(/'/g, "''");
            const psTempExtractDir = tempExtractDir.replace(/'/g, "''");
            unzipCommand = `powershell -command "Expand-Archive -Path '${psZipFilePath}' -DestinationPath '${psTempExtractDir}' -Force"`;
        } else {
            unzipCommand = `unzip -o "${zipFilePath}" -d "${tempExtractDir}"`; // -o 表示覆盖已存在文件而不询问
        }

        console.log(`执行解压命令: ${unzipCommand}`);
        await new Promise<void>((resolve, reject) => {
            exec(unzipCommand, (error, stdout, stderr) => {
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
        } else {
            console.log(`模板项目 ${repoName} 中未找到内部 assets 文件夹，或其不是一个目录。跳过移动内部 assets 步骤。`);
        }

        console.log(`删除模板项目原始根目录: ${targetDirInAssets}`);
        await fs.remove(targetDirInAssets);
        console.log(`模板项目原始根目录 ${targetDirInAssets} 已删除。`);

        console.log('刷新 Cocos Creator 资源数据库...');
        Editor.Message.send('asset-db', 'refresh'); 
        console.log('资源数据库刷新请求已发送。');

        console.log(`模板项目 ${repoName} 已成功下载并解压到 ${targetDirInAssets}`);

    } catch (error: any) {
        console.error(`创建模板过程中发生错误: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}