import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { error } from "console";
import { readFileSync } from "fs";
import path from "path";
import { Decorator, Project, Scope } from "ts-morph";
import { shortNames } from "../short-name";

// tsconfig paths 解析缓存
let _tsconfigPathsCache: { alias: string; basePath: string }[] | null = null;

/**
 * 加载 tsconfig.json 中的 paths 配置
 */
function loadTsconfigPaths(): { alias: string; basePath: string }[] {
    if (_tsconfigPathsCache !== null) {
        return _tsconfigPathsCache;
    }

    _tsconfigPathsCache = [];

    const tsconfigPath = Editor.Project.tmpDir + "/tsconfig.cocos.json";

    try {
        // 读取 tsconfig.json
        const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(tsconfigContent);

        // 处理 extends 继承
        let compilerOptions = tsconfig.compilerOptions || {};
        if (tsconfig.extends) {
            const extendPath = path.isAbsolute(tsconfig.extends)
                ? tsconfig.extends
                : path.join(path.dirname(tsconfigPath), tsconfig.extends);

            try {
                const extendContent = readFileSync(extendPath, 'utf-8');
                const extendConfig = JSON.parse(extendContent);
                compilerOptions = {
                    ...extendConfig.compilerOptions,
                    ...compilerOptions
                };
            } catch (e) {
                console.warn(`无法加载继承的配置文件: ${extendPath}`);
            }
        }

        const paths = compilerOptions.paths;
        if (paths) {
            for (const [alias, pathArray] of Object.entries(paths)) {
                if (Array.isArray(pathArray) && pathArray.length > 0) {
                    // 取第一个路径映射，去掉末尾的 *
                    const basePath = pathArray[0].replace(/\*$/, '').replace(/\\/g, '/');
                    const aliasPrefix = alias.replace(/\*$/, '');

                    _tsconfigPathsCache.push({
                        alias: aliasPrefix,
                        basePath: basePath
                    });
                }
            }
        }
    } catch (e) {
        console.warn('加载 tsconfig paths 失败:', e);
    }

    return _tsconfigPathsCache;
}

/**
 * 尝试将绝对路径转换为 tsconfig paths 别名
 */
function tryResolvePathsAlias(targetFilePath: string): string | null {
    const pathMappings = loadTsconfigPaths();
    const normalizedTarget = targetFilePath.replace(/\\/g, '/');

    for (const mapping of pathMappings) {
        // 排除 db://assets/* 的匹配，这个使用相对路径
        if (mapping.alias === 'db://assets/') {
            continue;
        }

        if (normalizedTarget.includes(mapping.basePath)) {
            const relativePart = normalizedTarget.substring(
                normalizedTarget.indexOf(mapping.basePath) + mapping.basePath.length
            );
            // const cleanRelativePart = relativePart.replace(/^\//, '').replace(/\.[^.]*$/, '');
            return `${mapping.alias}game-framework`;
        }
    }

    return null;
}

/**
 * 获取模块导入路径，优先使用 paths 别名，否则使用相对路径
 */
function getModuleSpecifier(fromFilePath: string, targetFilePath: string): string {
    // 尝试使用 tsconfig paths 别名
    const aliasPath = tryResolvePathsAlias(targetFilePath);
    if (aliasPath) {
        return aliasPath;
    }

    // 回退到相对路径
    const fileDir = path.dirname(fromFilePath);
    const relativePath = path.relative(fileDir, path.dirname(targetFilePath));
    const fileNameWithoutExt = path.basename(targetFilePath, path.extname(targetFilePath));

    let modulePath: string;
    if (relativePath === '') {
        modulePath = `./${fileNameWithoutExt}`;
    } else {
        modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
    }

    // 如果路径不是以./或../开头，添加./
    if (!/^\.\.?\//.test(modulePath)) {
        modulePath = `./${modulePath}`;
    }

    return modulePath;
}


function isSameType(types: { name: string, type: string }[], name: string) {
    // 检查是否已经存在同名节点
    const existingType = types.find(t => t.name === name);
    if (existingType) {
        Editor.Dialog.error(`警告: 发现重复的节点名称 "${name}"`);
        throw new Error(`警告: 发现重复的节点名称 "${name}"`);
    }
}

/**
 * @param node 当前节点
 * @param prefab 预制体数据
 * @param types 收集的类型数组
 * @param types.name 成员变量名称
 * @param types.type 成员变量类型是组件的UUID
 */
async function traversePrefabNode(node: any, prefab: any, types: { name: string, type: string }[], allComponents: any[] = []) {

    // 需要先检测这个node是否是预制体
    // 如果是预制体，则需要遍历预制体
    const prefabId = node._prefab.__id__;
    const prefabInfo = prefab[prefabId];
    const isPrefab = prefabInfo.asset && prefabInfo.asset.__uuid__;

    // 检查是不是一个预制体放到了主预制体里面
    // 并且修改了名称
    // 或者是不是在一个节点预制体里面，有一些子节点预制体上挂载了 BaseView或者BaseViewComponent
    // 如果是这类情况，则不参与生产成员变量
    // 因为这种情况，成员变量需要放到 该节点 所在 BaseView 或者 BaseViewComponent 的脚本里面，而不是当前 BaseView 或者 BaseViewComponent 的脚本里面
    const check = function (class_uuid: string, node: any): boolean {
        if (node._name.startsWith("_nod")) {
            types.push({
                name: node._name,
                type: "cc.Node"
            });

            return true;
        }

        // 如果遍历完了，看看预制体的属性重载
        const instanceID = prefabInfo.instance && prefabInfo.instance.__id__;
        const instance = prefab[instanceID];

        if (instance) {
            // 重载属性
            const propertyOverrides = instance.propertyOverrides;
            if (propertyOverrides && Array.isArray(propertyOverrides) && propertyOverrides.length > 0) {
                for (let i = 0; i < propertyOverrides.length; i++) {
                    const propertyOverride = propertyOverrides[i];
                    const override = prefab[propertyOverride.__id__];

                    if (override && override.__type__ == "CCPropertyOverrideInfo") {
                        const propertyPath = override.propertyPath as string[];
                        const value = override.value;

                        if (propertyPath && propertyPath.length > 0) {
                            const index = propertyPath.findIndex(e => e == "_name");
                            if (index != -1) {
                                const name = value;

                                isSameType(types, name);

                                types.push({
                                    name: name,
                                    type: class_uuid
                                });

                                return true;
                            }
                        }
                    }
                }
            }
        }

        const components = node._components ?? [];
        for (const comp of components) {
            const compInfo = prefab[comp.__id__];

            // 默认不取UITransform和Widget
            if (compInfo.__type__ != "cc.UITransform" && compInfo.__type__ != "cc.Widget") {
                isSameType(types, node._name);

                types.push({
                    name: node._name,
                    type: compInfo.__type__
                });

                // 只取第一个
                return true;
            }
        }

        return false;
    }

    if (isPrefab) {
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', isPrefab);

        if (nodeInfo && nodeInfo.file) {
            const prefabContent = readFileSync(nodeInfo!.file, 'utf-8');
            try {
                const prefab1 = JSON.parse(prefabContent);
                const dataId = prefab1[0] && prefab1[0]?.data?.__id__;
                const isNode = prefab1[dataId] && prefab1[dataId]?.__type__ == "cc.Node";

                if (isNode) {
                    // 说明是BaseView或者BaseViewComponent
                    // 他们会在自己的类里面添加成员变量

                    const class_name = await hasChildOfBaseViewOrBaseViewComponent(prefab1[dataId], prefab1, allComponents);
                    if (class_name) {
                        check(class_name, prefab1[dataId]);
                        return;
                    }

                    await traversePrefabNode(prefab1[dataId], prefab1, types, allComponents);
                }
            } catch (error) {
                console.error('Failed to parse prefab content:', error);
            }
        }

        // 如果遍历完了，看看预制体的属性重载
        const instanceID = prefabInfo.instance && prefabInfo.instance.__id__;
        const instance = prefab[instanceID];

        if (instance) {

            // 重载属性
            const propertyOverrides = instance.propertyOverrides;
            if (propertyOverrides && Array.isArray(propertyOverrides) && propertyOverrides.length > 0) {
                for (let i = 0; i < propertyOverrides.length; i++) {
                    const propertyOverride = propertyOverrides[i];
                    const override = prefab[propertyOverride.__id__];

                    if (override && override.__type__ == "CCPropertyOverrideInfo") {
                        const propertyPath = override.propertyPath as string[];
                        const value = override.value;

                        if (propertyPath && propertyPath.length > 0) {
                            const index = propertyPath.findIndex(e => e == "_name");
                            if (index != -1) {
                                const name = value;

                                for (const o in shortNames) {
                                    if (name.startsWith("_" + o)) {
                                        isSameType(types, name);

                                        types.push({
                                            name: name,
                                            type: shortNames[o]
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 扩展节点
            const mountedChildren = instance.mountedChildren;
            if (mountedChildren && Array.isArray(mountedChildren) && mountedChildren.length > 0) {
                for (let i = 0; i < mountedChildren.length; i++) {
                    const child = mountedChildren[i];
                    const childInfo = prefab[child.__id__];
                    const nodes = childInfo.nodes;
                    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
                        for (let j = 0; j < nodes.length; j++) {
                            const node = nodes[j];
                            const nodeInfo = prefab[node.__id__];
                            if (nodeInfo.__type__ == "cc.Node") {

                                // 说明是BaseView或者BaseViewComponent
                                // 他们会在自己的类里面添加成员变量
                                const class_name = await hasChildOfBaseViewOrBaseViewComponent(nodeInfo, prefab, allComponents);
                                if (class_name) {
                                    check(class_name, nodeInfo);
                                    continue;
                                }

                                await traversePrefabNode(nodeInfo, prefab, types, allComponents);
                            }
                        }
                    }
                }
            }
        }
        return;
    }

    if (!node._name) {
        return;
    }

    // 如果是节点，则需要遍历节点
    if (node._name.startsWith('_')) {
        const components = node._components;
        const name = node._name ?? "";
        let find = false;

        if (node._name.startsWith("_nod")) {
            types.push({
                name: node._name,
                type: "cc.Node"
            });

            find = true;
        }

        if (!find) {
            // 如果是用短名称开头，则说明成员变量要用对应的组件类型
            for (const o in shortNames) {
                if (name.startsWith("_" + o)) {
                    const compInfoID = components.find((comp: any) => {
                        const compInfo = prefab[comp.__id__];
                        return compInfo.__type__ == shortNames[o];
                    });

                    if (compInfoID) {
                        const compInfo = prefab[compInfoID.__id__];
                        if (compInfo) {
                            isSameType(types, node._name);

                            types.push({
                                name: node._name,
                                type: compInfo.__type__
                            });
                            find = true;
                        }
                    }
                }
            }
        }

        if (!find) {
            for (const comp of components) {
                const compInfo = prefab[comp.__id__];

                // 默认不取UITransform和Widget
                if (compInfo.__type__ != "cc.UITransform" && compInfo.__type__ != "cc.Widget") {
                    isSameType(types, node._name);

                    types.push({
                        name: node._name,
                        type: compInfo.__type__
                    });

                    find = true;
                    // 只取第一个
                    break;
                }
            }
        }
    }

    if (node._children && Array.isArray(node._children) && node._children.length > 0) {
        for (let i = 0; i < node._children.length; i++) {
            const child = node._children[i];

            const childInfo = prefab[child.__id__];
            if (childInfo.__type__ == "cc.Node") {

                // 说明是BaseView或者BaseViewComponent
                // 他们会在自己的类里面添加成员变量
                const class_name = await hasChildOfBaseViewOrBaseViewComponent(childInfo, prefab, allComponents);
                if (class_name) {
                    check(class_name, childInfo);
                    continue;
                }

                await traversePrefabNode(childInfo, prefab, types, allComponents);
            }
        }
    }
}

async function hasChildOfBaseViewOrBaseViewComponent(node: any, prefab: any, allComponents: any[]): Promise<string> {
    if (!node) return "";
    const components = node._components;

    if (!components || components.length === 0) {
        return "";
    }

    for (let index = 0; index < components.length; index++) {
        const comp = components[index];
        const compInfo = prefab[comp.__id__];

        if (compInfo && (compInfo.__type__ === "BaseView" || compInfo.__type__ === "BaseViewComponent")) {
            return "";
        }

        // 如果是UUID，则需要处理
        if (Editor.Utils.UUID.isUUID(compInfo.__type__)) {
            const componentInfo = await Editor.Message.request('scene', 'query-component',
                Editor.Utils.UUID.decompressUUID(compInfo.__type__)
            );

            if (!componentInfo) {
                const find = allComponents.find(e => e.cid == compInfo.__type__);
                if (!find) continue;
                const hasAssetId = find && find.assetUuid;
                if (!hasAssetId) continue;

                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', hasAssetId);

                if (assetInfo?.file && assetInfo.file.endsWith('.ts')) {
                    // 创建项目
                    const project = new Project();

                    // 添加源文件
                    const sourceFile = project.addSourceFileAtPath(assetInfo.file);

                    const classs = sourceFile.getClasses();
                    for (let i = 0; i < classs.length; i++) {
                        const classDeclaration = classs[i];
                        if (classDeclaration.getName() !== find.name) {
                            continue;
                        }

                        const extendsNode = classDeclaration.getExtends();

                        if (extendsNode) {
                            const extendName = extendsNode.getText();

                            // 创建一个新的检查
                            // 因为对于预制体来说，每一个预制体内部都是一个 BaseViewComponent或者 BaseView
                            // 里面的子节点名字都是一模一样
                            // 必须规避这个问题
                            // 在Runtime 下，该问题不会出现
                            if (extendName.startsWith("BaseView") || extendName.startsWith("BaseViewComponent")) {
                                return hasAssetId;
                            }
                        }
                    }
                }
            }

            if (componentInfo) {

                // 不应该走到这里来
                error("不应该走到这里来 componentInfo", componentInfo);
            }
        }
    }

    return "";
}

async function findNodesWithUnderscorePrefix(assetInfo: AssetInfo & { prefab: { assetUuid: string } }) {
    try {

        const types: { name: string, type: string }[] = [];
        const allComponents = await Editor.Message.request('scene', 'query-components');
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetInfo.prefab.assetUuid);

        if (nodeInfo && nodeInfo.file) {
            const prefabContent = readFileSync(nodeInfo!.file, 'utf-8');
            try {
                const prefab = JSON.parse(prefabContent);
                const node = prefab.find((item: any) => item._name == assetInfo.name && item.__type__ == "cc.Node");
                if (node) {
                    await traversePrefabNode(node, prefab, types, allComponents);
                    return types;
                }
            } catch (error) {
                console.error('Failed to parse prefab content:', error);
            }
        }

    } catch (error) {
        console.error('Failed to traverse nodes:', error);
    }
}

async function generatorMembers(filePath: string, types: { name: string, type: string }[], scope: Scope) {
    // 创建项目
    const project = new Project();

    // 添加源文件
    const sourceFile = project.addSourceFileAtPath(filePath);

    // 获取所有类声明
    const classes = sourceFile.getClasses();

    // 遍历每个类
    for (let i = 0; i < classes.length; i++) {
        const classDeclaration = classes[i];

        // 先添加新的属性
        for (let index = 0; index < types.length; index++) {
            const typeDef = types[index];
            if (!classDeclaration.getProperty(typeDef.name)) {
                // 检查是否是自定义组件（非cc开头）
                const isCustomComponent = !typeDef.type.startsWith('cc.');
                let typeName = typeDef.type;
                let modulePath = 'cc';

                if (isCustomComponent) {
                    const uuid = Editor.Utils.UUID.decompressUUID(typeDef.type);
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);

                    if (assetInfo && assetInfo.file) {

                        // 读取类找到导出
                        const customComponentProject = new Project();
                        const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);

                        // 获取文件中所有导出的类
                        const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());

                        // 如果有导出的类，使用第一个类的名称
                        if (exportedClasses.length > 0) {
                            typeName = exportedClasses[0].getName() || assetInfo.name;

                            // 优先使用 tsconfig paths 别名，否则使用相对路径
                            modulePath = getModuleSpecifier(filePath, assetInfo.file);

                        } else {
                            // 如果没有找到导出的类，使用文件名
                            console.warn(`No exported class found in ${assetInfo.file}, using asset name instead`);
                            typeName = assetInfo.name;

                            // 优先使用 tsconfig paths 别名，否则使用相对路径
                            modulePath = getModuleSpecifier(filePath, assetInfo.file);
                        }
                    }
                } else {
                    // cc组件只需要组件名
                    typeName = typeDef.type.split('.').pop() || '';
                }

                classDeclaration.insertProperty(0, {
                    name: typeDef.name,
                    type: typeName,
                    initializer: "null!",
                    decorators: [{
                        name: 'property',
                        arguments: [`{type: ${typeName}}`]
                    }],
                    isReadonly: true,
                    scope: scope
                });

                // 添加导入
                if (isCustomComponent) {
                    // 添加自定义组件的导入
                    const existingImport = sourceFile.getImportDeclaration(i =>
                        i.getModuleSpecifierValue() === modulePath
                    );

                    if (existingImport) {
                        const namedImports = existingImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            existingImport.addNamedImport(typeName);
                        }
                    } else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: modulePath
                        });
                    }
                } else {
                    // 添加 cc 组件导入
                    const ccImport = sourceFile.getImportDeclaration(i =>
                        i.getModuleSpecifierValue() === 'cc'
                    );

                    if (ccImport) {
                        const namedImports = ccImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            ccImport.addNamedImport(typeName);
                        }
                    } else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: 'cc'
                        });
                    }
                }
            }
        }

        // 获取所有私有属性
        const privateProps = classDeclaration.getProperties().filter(prop =>
            prop.getName().startsWith('_')
        );

        // 处理现有属性
        for (let index = 0; index < privateProps.length; index++) {
            const prop = privateProps[index];

            const name = prop.getName();
            const type = prop.getType().getText();
            prop.setScope(scope);
            const typeDef = types.find(item => item.name === name);

            if (typeDef) {
                // 更新类型和装饰器
                if (typeDef.type !== type) {
                    // 检查是否是自定义组件
                    const isCustomComponent = !typeDef.type.startsWith('cc.');
                    let typeName = typeDef.type;
                    let modulePath = 'cc';

                    if (isCustomComponent) {
                        const uuid = Editor.Utils.UUID.decompressUUID(typeDef.type);
                        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);

                        if (assetInfo && assetInfo.file) {
                            // 读取类找到导出
                            const customComponentProject = new Project();
                            const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);

                            // 获取文件中所有导出的类
                            const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());

                            // 如果有导出的类，使用第一个类的名称
                            if (exportedClasses.length > 0) {
                                typeName = exportedClasses[0].getName() || assetInfo.name;

                                // 优先使用 tsconfig paths 别名，否则使用相对路径
                                modulePath = getModuleSpecifier(filePath, assetInfo.file);
                            } else {
                                // 如果没有找到导出的类，使用文件名
                                typeName = assetInfo.name;

                                // 优先使用 tsconfig paths 别名，否则使用相对路径
                                modulePath = getModuleSpecifier(filePath, assetInfo.file);
                            }
                        }
                    } else {
                        // cc组件只需要组件名
                        typeName = typeDef.type.split('.').pop() || '';
                    }

                    const decorators = prop.getDecorators();
                    let existingPropertyDecorator: Decorator | null = null;

                    // 查找现有的 property 装饰器
                    for (const decorator of decorators) {
                        if (decorator.getName() === 'property') {
                            existingPropertyDecorator = decorator;
                            break;
                        }
                    }

                    // 更新类型
                    prop.setType(typeName);

                    if (existingPropertyDecorator) {
                        // 获取现有装饰器的参数文本
                        const args = existingPropertyDecorator.getArguments();

                        if (args.length > 0) {
                            // 尝试解析现有参数
                            const argText = args[0].getText();

                            // 如果是对象形式的参数
                            if (argText.startsWith('{') && argText.endsWith('}')) {
                                // 提取对象内容，移除前后的花括号
                                const objectContents = argText.substring(1, argText.length - 1).trim();

                                // 检查是否有其他属性
                                if (objectContents.includes(',') || !objectContents.includes('type:')) {
                                    // 构建新的对象参数，包含原有属性和新的类型
                                    let newArg = '{';

                                    // 处理已有属性
                                    const properties = objectContents.split(',').map(p => p.trim());
                                    const typeIndex = properties.findIndex(p => p.startsWith('type:'));

                                    if (typeIndex >= 0) {
                                        // 替换类型属性
                                        properties[typeIndex] = `type: ${typeName}`;
                                    } else {
                                        // 添加类型属性
                                        properties.push(`type: ${typeName}`);
                                    }

                                    newArg += properties.join(', ') + '}';

                                    // 更新装饰器
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(newArg);
                                } else {
                                    // 仅包含类型定义，更新类型
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                                }
                            } else {
                                // 非对象形式参数，替换为新参数
                                existingPropertyDecorator.removeArgument(0);
                                existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                            }
                        } else {
                            // 没有参数，添加参数
                            existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                        }
                    } else {
                        // 没有找到 property 装饰器，添加新装饰器
                        prop.addDecorator({
                            name: 'property',
                            arguments: [`{type: ${typeName}}`],
                        });
                    }

                    if (!prop.getInitializer()) {
                        prop.setInitializer('null');
                    }

                    // 添加导入
                    if (isCustomComponent) {
                        // 添加自定义组件的导入
                        const existingImport = sourceFile.getImportDeclaration(i =>
                            i.getModuleSpecifierValue() === modulePath
                        );

                        if (existingImport) {
                            const namedImports = existingImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                existingImport.addNamedImport(typeName);
                            }
                        } else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: modulePath
                            });
                        }
                    } else {
                        // 添加 cc 组件导入
                        const ccImport = sourceFile.getImportDeclaration(i =>
                            i.getModuleSpecifierValue() === 'cc'
                        );

                        if (ccImport) {
                            const namedImports = ccImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                ccImport.addNamedImport(typeName);
                            }
                        } else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: 'cc'
                            });
                        }
                    }
                }
            }
            else {
                // 先看看是不是property装饰器
                const decorators = prop.getDecorators();
                let existingPropertyDecorator: Decorator | null = null;

                for (const decorator of decorators) {
                    if (decorator.getName() === 'property') {
                        existingPropertyDecorator = decorator;
                        break;
                    }
                }

                if (existingPropertyDecorator) {
                    // 检查装饰器参数中是否包含 userData
                    const args = existingPropertyDecorator.getArguments();
                    let hasUserData = false;

                    if (args.length > 0) {
                        const argText = args[0].getText();
                        // 检查是否包含 userData 参数
                        if (argText.includes('userData')) {
                            hasUserData = true;
                        }
                    }

                    // 如果没有 userData 参数，才移除属性
                    if (!hasUserData) {
                        prop.remove();
                    }
                }
            }
        }
    }
    // 保存修改
    project.saveSync();
}

export function onRootMenu(assetInfo: AssetInfo & { components: any[], prefab: { assetUuid: string } }) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.rootMenu',
            async click() {
                if (!assetInfo) {
                    Editor.Dialog.info('i18n:game-framework.hierarchy.error.noAssetInfo');
                } else {

                    // 遍历节点树查找带下划线的节点和属性
                    const types = await findNodesWithUnderscorePrefix(assetInfo);

                    // 处理组件信息
                    const components = assetInfo.components;
                    if (!components || components.length === 0) {
                        return;
                    }

                    let hasBaseView = false;
                    for (let index = 0; index < components.length; index++) {
                        const component = components[index];

                        // 获取组件详细信息
                        const componentInfo = await Editor.Message.request('scene', 'query-component',
                            component.value  // 这里的 value 就是组件的 UUID
                        );

                        if (componentInfo) {
                            const baseView = componentInfo.extends?.find(item => item.startsWith("BaseView") || item.startsWith("BaseViewComponent"));
                            if (baseView) {
                                hasBaseView = true;
                                // 获取资源信息
                                const uuid = Editor.Utils.UUID.decompressUUID(componentInfo.cid!);
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);

                                if (assetInfo && assetInfo.file) {
                                    generatorMembers(assetInfo.file, types ?? [], Scope.Private);

                                    Editor.Dialog.info('构造成员函数成功');
                                }
                            }
                        }
                    }

                    if (!hasBaseView) {
                        Editor.Dialog.error(Editor.I18n.t('game-framework.hierarchy.error.noBaseView'));
                    }
                }
            },
        },

        {
            label: 'i18n:game-framework.hierarchy.menu.publicMenu',
            async click() {
                if (!assetInfo) {
                    Editor.Dialog.info('i18n:game-framework.hierarchy.error.noAssetInfo');
                } else {

                    // 遍历节点树查找带下划线的节点和属性
                    const types = await findNodesWithUnderscorePrefix(assetInfo);

                    // 处理组件信息
                    const components = assetInfo.components;
                    if (!components || components.length === 0) {
                        return;
                    }

                    let hasBaseView = false;
                    for (let index = 0; index < components.length; index++) {
                        const component = components[index];

                        // 获取组件详细信息
                        const componentInfo = await Editor.Message.request('scene', 'query-component',
                            component.value  // 这里的 value 就是组件的 UUID
                        );

                        if (componentInfo) {
                            const baseView = componentInfo.extends?.find(item => item.startsWith("BaseView") || item.startsWith("BaseViewComponent"));
                            if (baseView) {
                                hasBaseView = true;
                                // 获取资源信息
                                const uuid = Editor.Utils.UUID.decompressUUID(componentInfo.cid!);
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);

                                if (assetInfo && assetInfo.file) {
                                    generatorMembers(assetInfo.file, types ?? [], Scope.Public);

                                    Editor.Dialog.info('构造成员函数成功');
                                }
                            }
                        }
                    }

                    if (!hasBaseView) {
                        Editor.Dialog.error(Editor.I18n.t('game-framework.hierarchy.error.noBaseView'));
                    }
                }
            },
        },
    ];
};

export function onNodeMenu(node: AssetInfo) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.nodeMenu',
            async click() {

                if (!node || !node.uuid || node.type !== "cc.Node") {
                    return;
                }

                Editor.Panel.open('game-framework.set-name', node.uuid);
            }
        },
    ];
}