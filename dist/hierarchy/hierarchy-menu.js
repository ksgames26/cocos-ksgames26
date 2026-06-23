"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRootMenu = onRootMenu;
exports.onNodeMenu = onNodeMenu;
const console_1 = require("console");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const short_name_1 = require("../short-name");
// tsconfig paths 解析缓存
let _tsconfigPathsCache = null;
/**
 * 加载 tsconfig.json 中的 paths 配置
 */
function loadTsconfigPaths() {
    if (_tsconfigPathsCache !== null) {
        return _tsconfigPathsCache;
    }
    _tsconfigPathsCache = [];
    const tsconfigPath = Editor.Project.tmpDir + "/tsconfig.cocos.json";
    try {
        // 读取 tsconfig.json
        const tsconfigContent = (0, fs_1.readFileSync)(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(tsconfigContent);
        // 处理 extends 继承
        let compilerOptions = tsconfig.compilerOptions || {};
        if (tsconfig.extends) {
            const extendPath = path_1.default.isAbsolute(tsconfig.extends)
                ? tsconfig.extends
                : path_1.default.join(path_1.default.dirname(tsconfigPath), tsconfig.extends);
            try {
                const extendContent = (0, fs_1.readFileSync)(extendPath, 'utf-8');
                const extendConfig = JSON.parse(extendContent);
                compilerOptions = Object.assign(Object.assign({}, extendConfig.compilerOptions), compilerOptions);
            }
            catch (e) {
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
    }
    catch (e) {
        console.warn('加载 tsconfig paths 失败:', e);
    }
    return _tsconfigPathsCache;
}
/**
 * 尝试将绝对路径转换为 tsconfig paths 别名
 */
function tryResolvePathsAlias(targetFilePath) {
    const pathMappings = loadTsconfigPaths();
    const normalizedTarget = targetFilePath.replace(/\\/g, '/');
    for (const mapping of pathMappings) {
        // 排除 db://assets/* 的匹配，这个使用相对路径
        if (mapping.alias === 'db://assets/') {
            continue;
        }
        if (normalizedTarget.includes(mapping.basePath)) {
            const relativePart = normalizedTarget.substring(normalizedTarget.indexOf(mapping.basePath) + mapping.basePath.length);
            // const cleanRelativePart = relativePart.replace(/^\//, '').replace(/\.[^.]*$/, '');
            return `${mapping.alias}game-framework`;
        }
    }
    return null;
}
/**
 * 获取模块导入路径，优先使用 paths 别名，否则使用相对路径
 */
function getModuleSpecifier(fromFilePath, targetFilePath) {
    // 尝试使用 tsconfig paths 别名
    const aliasPath = tryResolvePathsAlias(targetFilePath);
    if (aliasPath) {
        return aliasPath;
    }
    // 回退到相对路径
    const fileDir = path_1.default.dirname(fromFilePath);
    const relativePath = path_1.default.relative(fileDir, path_1.default.dirname(targetFilePath));
    const fileNameWithoutExt = path_1.default.basename(targetFilePath, path_1.default.extname(targetFilePath));
    let modulePath;
    if (relativePath === '') {
        modulePath = `./${fileNameWithoutExt}`;
    }
    else {
        modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
    }
    // 如果路径不是以./或../开头，添加./
    if (!/^\.\.?\//.test(modulePath)) {
        modulePath = `./${modulePath}`;
    }
    return modulePath;
}
function isSameType(types, name) {
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
async function traversePrefabNode(node, prefab, types, allComponents = []) {
    var _a, _b, _c, _d;
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
    const check = function (class_uuid, node) {
        var _a;
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
                        const propertyPath = override.propertyPath;
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
        const components = (_a = node._components) !== null && _a !== void 0 ? _a : [];
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
    };
    if (isPrefab) {
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', isPrefab);
        if (nodeInfo && nodeInfo.file) {
            const prefabContent = (0, fs_1.readFileSync)(nodeInfo.file, 'utf-8');
            try {
                const prefab1 = JSON.parse(prefabContent);
                const dataId = prefab1[0] && ((_b = (_a = prefab1[0]) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.__id__);
                const isNode = prefab1[dataId] && ((_c = prefab1[dataId]) === null || _c === void 0 ? void 0 : _c.__type__) == "cc.Node";
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
            }
            catch (error) {
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
                        const propertyPath = override.propertyPath;
                        const value = override.value;
                        if (propertyPath && propertyPath.length > 0) {
                            const index = propertyPath.findIndex(e => e == "_name");
                            if (index != -1) {
                                const name = value;
                                for (const o in short_name_1.shortNames) {
                                    if (name.startsWith("_" + o)) {
                                        isSameType(types, name);
                                        types.push({
                                            name: name,
                                            type: short_name_1.shortNames[o]
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
        const name = (_d = node._name) !== null && _d !== void 0 ? _d : "";
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
            for (const o in short_name_1.shortNames) {
                if (name.startsWith("_" + o)) {
                    const compInfoID = components.find((comp) => {
                        const compInfo = prefab[comp.__id__];
                        return compInfo.__type__ == short_name_1.shortNames[o];
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
async function hasChildOfBaseViewOrBaseViewComponent(node, prefab, allComponents) {
    if (!node)
        return "";
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
            const componentInfo = await Editor.Message.request('scene', 'query-component', Editor.Utils.UUID.decompressUUID(compInfo.__type__));
            if (!componentInfo) {
                const find = allComponents.find(e => e.cid == compInfo.__type__);
                if (!find)
                    continue;
                const hasAssetId = find && find.assetUuid;
                if (!hasAssetId)
                    continue;
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', hasAssetId);
                if ((assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.file) && assetInfo.file.endsWith('.ts')) {
                    // 创建项目
                    const project = new ts_morph_1.Project();
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
                (0, console_1.error)("不应该走到这里来 componentInfo", componentInfo);
            }
        }
    }
    return "";
}
async function findNodesWithUnderscorePrefix(assetInfo) {
    try {
        const types = [];
        const allComponents = await Editor.Message.request('scene', 'query-components');
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetInfo.prefab.assetUuid);
        if (nodeInfo && nodeInfo.file) {
            const prefabContent = (0, fs_1.readFileSync)(nodeInfo.file, 'utf-8');
            try {
                const prefab = JSON.parse(prefabContent);
                const node = prefab.find((item) => item._name == assetInfo.name && item.__type__ == "cc.Node");
                if (node) {
                    await traversePrefabNode(node, prefab, types, allComponents);
                    return types;
                }
            }
            catch (error) {
                console.error('Failed to parse prefab content:', error);
            }
        }
    }
    catch (error) {
        console.error('Failed to traverse nodes:', error);
    }
}
async function generatorMembers(filePath, types, scope) {
    // 创建项目
    const project = new ts_morph_1.Project();
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
                        const customComponentProject = new ts_morph_1.Project();
                        const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);
                        // 获取文件中所有导出的类
                        const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());
                        // 如果有导出的类，使用第一个类的名称
                        if (exportedClasses.length > 0) {
                            typeName = exportedClasses[0].getName() || assetInfo.name;
                            // 优先使用 tsconfig paths 别名，否则使用相对路径
                            modulePath = getModuleSpecifier(filePath, assetInfo.file);
                        }
                        else {
                            // 如果没有找到导出的类，使用文件名
                            console.warn(`No exported class found in ${assetInfo.file}, using asset name instead`);
                            typeName = assetInfo.name;
                            // 优先使用 tsconfig paths 别名，否则使用相对路径
                            modulePath = getModuleSpecifier(filePath, assetInfo.file);
                        }
                    }
                }
                else {
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
                    const existingImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === modulePath);
                    if (existingImport) {
                        const namedImports = existingImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            existingImport.addNamedImport(typeName);
                        }
                    }
                    else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: modulePath
                        });
                    }
                }
                else {
                    // 添加 cc 组件导入
                    const ccImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === 'cc');
                    if (ccImport) {
                        const namedImports = ccImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            ccImport.addNamedImport(typeName);
                        }
                    }
                    else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: 'cc'
                        });
                    }
                }
            }
        }
        // 获取所有私有属性
        const privateProps = classDeclaration.getProperties().filter(prop => prop.getName().startsWith('_'));
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
                            const customComponentProject = new ts_morph_1.Project();
                            const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);
                            // 获取文件中所有导出的类
                            const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());
                            // 如果有导出的类，使用第一个类的名称
                            if (exportedClasses.length > 0) {
                                typeName = exportedClasses[0].getName() || assetInfo.name;
                                // 优先使用 tsconfig paths 别名，否则使用相对路径
                                modulePath = getModuleSpecifier(filePath, assetInfo.file);
                            }
                            else {
                                // 如果没有找到导出的类，使用文件名
                                typeName = assetInfo.name;
                                // 优先使用 tsconfig paths 别名，否则使用相对路径
                                modulePath = getModuleSpecifier(filePath, assetInfo.file);
                            }
                        }
                    }
                    else {
                        // cc组件只需要组件名
                        typeName = typeDef.type.split('.').pop() || '';
                    }
                    const decorators = prop.getDecorators();
                    let existingPropertyDecorator = null;
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
                                    }
                                    else {
                                        // 添加类型属性
                                        properties.push(`type: ${typeName}`);
                                    }
                                    newArg += properties.join(', ') + '}';
                                    // 更新装饰器
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(newArg);
                                }
                                else {
                                    // 仅包含类型定义，更新类型
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                                }
                            }
                            else {
                                // 非对象形式参数，替换为新参数
                                existingPropertyDecorator.removeArgument(0);
                                existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                            }
                        }
                        else {
                            // 没有参数，添加参数
                            existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                        }
                    }
                    else {
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
                        const existingImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === modulePath);
                        if (existingImport) {
                            const namedImports = existingImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                existingImport.addNamedImport(typeName);
                            }
                        }
                        else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: modulePath
                            });
                        }
                    }
                    else {
                        // 添加 cc 组件导入
                        const ccImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === 'cc');
                        if (ccImport) {
                            const namedImports = ccImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                ccImport.addNamedImport(typeName);
                            }
                        }
                        else {
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
                let existingPropertyDecorator = null;
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
function onRootMenu(assetInfo) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.rootMenu',
            async click() {
                var _a;
                if (!assetInfo) {
                    Editor.Dialog.info('i18n:game-framework.hierarchy.error.noAssetInfo');
                }
                else {
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
                        const componentInfo = await Editor.Message.request('scene', 'query-component', component.value // 这里的 value 就是组件的 UUID
                        );
                        if (componentInfo) {
                            const baseView = (_a = componentInfo.extends) === null || _a === void 0 ? void 0 : _a.find(item => item.startsWith("BaseView") || item.startsWith("BaseViewComponent"));
                            if (baseView) {
                                hasBaseView = true;
                                // 获取资源信息
                                const uuid = Editor.Utils.UUID.decompressUUID(componentInfo.cid);
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                                if (assetInfo && assetInfo.file) {
                                    generatorMembers(assetInfo.file, types !== null && types !== void 0 ? types : [], ts_morph_1.Scope.Private);
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
                var _a;
                if (!assetInfo) {
                    Editor.Dialog.info('i18n:game-framework.hierarchy.error.noAssetInfo');
                }
                else {
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
                        const componentInfo = await Editor.Message.request('scene', 'query-component', component.value // 这里的 value 就是组件的 UUID
                        );
                        if (componentInfo) {
                            const baseView = (_a = componentInfo.extends) === null || _a === void 0 ? void 0 : _a.find(item => item.startsWith("BaseView") || item.startsWith("BaseViewComponent"));
                            if (baseView) {
                                hasBaseView = true;
                                // 获取资源信息
                                const uuid = Editor.Utils.UUID.decompressUUID(componentInfo.cid);
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                                if (assetInfo && assetInfo.file) {
                                    generatorMembers(assetInfo.file, types !== null && types !== void 0 ? types : [], ts_morph_1.Scope.Public);
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
}
;
function onNodeMenu(node) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2h5LW1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvaGllcmFyY2h5L2hpZXJhcmNoeS1tZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBNnlCQSxnQ0FvR0M7QUFFRCxnQ0FjQztBQWg2QkQscUNBQWdDO0FBQ2hDLDJCQUFrQztBQUNsQyxnREFBd0I7QUFDeEIsdUNBQXFEO0FBQ3JELDhDQUEyQztBQUUzQyxzQkFBc0I7QUFDdEIsSUFBSSxtQkFBbUIsR0FBaUQsSUFBSSxDQUFDO0FBRTdFOztHQUVHO0FBQ0gsU0FBUyxpQkFBaUI7SUFDdEIsSUFBSSxtQkFBbUIsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUMvQixPQUFPLG1CQUFtQixDQUFDO0lBQy9CLENBQUM7SUFFRCxtQkFBbUIsR0FBRyxFQUFFLENBQUM7SUFFekIsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsc0JBQXNCLENBQUM7SUFFcEUsSUFBSSxDQUFDO1FBQ0QsbUJBQW1CO1FBQ25CLE1BQU0sZUFBZSxHQUFHLElBQUEsaUJBQVksRUFBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDNUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUU3QyxnQkFBZ0I7UUFDaEIsSUFBSSxlQUFlLEdBQUcsUUFBUSxDQUFDLGVBQWUsSUFBSSxFQUFFLENBQUM7UUFDckQsSUFBSSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbkIsTUFBTSxVQUFVLEdBQUcsY0FBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO2dCQUNoRCxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU87Z0JBQ2xCLENBQUMsQ0FBQyxjQUFJLENBQUMsSUFBSSxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxD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Q0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BGLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7U0FDSjtLQUNKLENBQUM7QUFDTixDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQWdCLFVBQVUsQ0FBQyxJQUFlO0lBQ3RDLE9BQU87UUFDSDtZQUNJLEtBQUssRUFBRSw2Q0FBNkM7WUFDcEQsS0FBSyxDQUFDLEtBQUs7Z0JBRVAsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDakQsT0FBTztnQkFDWCxDQUFDO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1RCxDQUFDO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFzc2V0SW5mbyB9IGZyb20gXCJAY29jb3MvY3JlYXRvci10eXBlcy9lZGl0b3IvcGFja2FnZXMvYXNzZXQtZGIvQHR5cGVzL3B1YmxpY1wiO1xyXG5pbXBvcnQgeyBlcnJvciB9IGZyb20gXCJjb25zb2xlXCI7XHJcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gXCJmc1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBEZWNvcmF0b3IsIFByb2plY3QsIFNjb3BlIH0gZnJvbSBcInRzLW1vcnBoXCI7XHJcbmltcG9ydCB7IHNob3J0TmFtZXMgfSBmcm9tIFwiLi4vc2hvcnQtbmFtZVwiO1xyXG5cclxuLy8gdHNjb25maWcgcGF0aHMg6Kej5p6Q57yT5a2YXHJcbmxldCBfdHNjb25maWdQYXRoc0NhY2hlOiB7IGFsaWFzOiBzdHJpbmc7IGJhc2VQYXRoOiBzdHJpbmcgfVtdIHwgbnVsbCA9IG51bGw7XHJcblxyXG4vKipcclxuICog5Yqg6L29IHRzY29uZmlnLmpzb24g5Lit55qEIHBhdGhzIOmFjee9rlxyXG4gKi9cclxuZnVuY3Rpb24gbG9hZFRzY29uZmlnUGF0aHMoKTogeyBhbGlhczogc3RyaW5nOyBiYXNlUGF0aDogc3RyaW5nIH1bXSB7XHJcbiAgICBpZiAoX3RzY29uZmlnUGF0aHNDYWNoZSAhPT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVybiBfdHNjb25maWdQYXRoc0NhY2hlO1xyXG4gICAgfVxyXG5cclxuICAgIF90c2NvbmZpZ1BhdGhzQ2FjaGUgPSBbXTtcclxuXHJcbiAgICBjb25zdCB0c2NvbmZpZ1BhdGggPSBFZGl0b3IuUHJvamVjdC50bXBEaXIgKyBcIi90c2NvbmZpZy5jb2Nvcy5qc29uXCI7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICAvLyDor7vlj5YgdHNjb25maWcuanNvblxyXG4gICAgICAgIGNvbnN0IHRzY29uZmlnQ29udGVudCA9IHJlYWRGaWxlU3luYyh0c2NvbmZpZ1BhdGgsICd1dGYtOCcpO1xyXG4gICAgICAgIGNvbnN0IHRzY29uZmlnID0gSlNPTi5wYXJzZSh0c2NvbmZpZ0NvbnRlbnQpO1xyXG5cclxuICAgICAgICAvLyDlpITnkIYgZXh0ZW5kcyDnu6fmib9cclxuICAgICAgICBsZXQgY29tcGlsZXJPcHRpb25zID0gdHNjb25maWcuY29tcGlsZXJPcHRpb25zIHx8IHt9O1xyXG4gICAgICAgIGlmICh0c2NvbmZpZy5leHRlbmRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGV4dGVuZFBhdGggPSBwYXRoLmlzQWJzb2x1dGUodHNjb25maWcuZXh0ZW5kcylcclxuICAgICAgICAgICAgICAgID8gdHNjb25maWcuZXh0ZW5kc1xyXG4gICAgICAgICAgICAgICAgOiBwYXRoLmpvaW4ocGF0aC5kaXJuYW1lKHRzY29uZmlnUGF0aCksIHRzY29uZmlnLmV4dGVuZHMpO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZENvbnRlbnQgPSByZWFkRmlsZVN5bmMoZXh0ZW5kUGF0aCwgJ3V0Zi04Jyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBleHRlbmRDb25maWcgPSBKU09OLnBhcnNlKGV4dGVuZENvbnRlbnQpO1xyXG4gICAgICAgICAgICAgICAgY29tcGlsZXJPcHRpb25zID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIC4uLmV4dGVuZENvbmZpZy5jb21waWxlck9wdGlvbnMsXHJcbiAgICAgICAgICAgICAgICAgICAgLi4uY29tcGlsZXJPcHRpb25zXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYOaXoOazleWKoOi9vee7p+aJv+eahOmFjee9ruaWh+S7tjogJHtleHRlbmRQYXRofWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBwYXRocyA9IGNvbXBpbGVyT3B0aW9ucy5wYXRocztcclxuICAgICAgICBpZiAocGF0aHMpIHtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBbYWxpYXMsIHBhdGhBcnJheV0gb2YgT2JqZWN0LmVudHJpZXMocGF0aHMpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwYXRoQXJyYXkpICYmIHBhdGhBcnJheS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5Y+W56ys5LiA5Liq6Lev5b6E5pig5bCE77yM5Y675o6J5pyr5bC+55qEICpcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlUGF0aCA9IHBhdGhBcnJheVswXS5yZXBsYWNlKC9cXCokLywgJycpLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGlhc1ByZWZpeCA9IGFsaWFzLnJlcGxhY2UoL1xcKiQvLCAnJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIF90c2NvbmZpZ1BhdGhzQ2FjaGUucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFsaWFzOiBhbGlhc1ByZWZpeCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmFzZVBhdGg6IGJhc2VQYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCfliqDovb0gdHNjb25maWcgcGF0aHMg5aSx6LSlOicsIGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBfdHNjb25maWdQYXRoc0NhY2hlO1xyXG59XHJcblxyXG4vKipcclxuICog5bCd6K+V5bCG57ud5a+56Lev5b6E6L2s5o2i5Li6IHRzY29uZmlnIHBhdGhzIOWIq+WQjVxyXG4gKi9cclxuZnVuY3Rpb24gdHJ5UmVzb2x2ZVBhdGhzQWxpYXModGFyZ2V0RmlsZVBhdGg6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgY29uc3QgcGF0aE1hcHBpbmdzID0gbG9hZFRzY29uZmlnUGF0aHMoKTtcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWRUYXJnZXQgPSB0YXJnZXRGaWxlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXBwaW5nIG9mIHBhdGhNYXBwaW5ncykge1xyXG4gICAgICAgIC8vIOaOkumZpCBkYjovL2Fzc2V0cy8qIOeahOWMuemFje+8jOi/meS4quS9v+eUqOebuOWvuei3r+W+hFxyXG4gICAgICAgIGlmIChtYXBwaW5nLmFsaWFzID09PSAnZGI6Ly9hc3NldHMvJykge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChub3JtYWxpemVkVGFyZ2V0LmluY2x1ZGVzKG1hcHBpbmcuYmFzZVBhdGgpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGFydCA9IG5vcm1hbGl6ZWRUYXJnZXQuc3Vic3RyaW5nKFxyXG4gICAgICAgICAgICAgICAgbm9ybWFsaXplZFRhcmdldC5pbmRleE9mKG1hcHBpbmcuYmFzZVBhdGgpICsgbWFwcGluZy5iYXNlUGF0aC5sZW5ndGhcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgLy8gY29uc3QgY2xlYW5SZWxhdGl2ZVBhcnQgPSByZWxhdGl2ZVBhcnQucmVwbGFjZSgvXlxcLy8sICcnKS5yZXBsYWNlKC9cXC5bXi5dKiQvLCAnJyk7XHJcbiAgICAgICAgICAgIHJldHVybiBgJHttYXBwaW5nLmFsaWFzfWdhbWUtZnJhbWV3b3JrYDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDojrflj5bmqKHlnZflr7zlhaXot6/lvoTvvIzkvJjlhYjkvb/nlKggcGF0aHMg5Yir5ZCN77yM5ZCm5YiZ5L2/55So55u45a+56Lev5b6EXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXRNb2R1bGVTcGVjaWZpZXIoZnJvbUZpbGVQYXRoOiBzdHJpbmcsIHRhcmdldEZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgLy8g5bCd6K+V5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQjVxyXG4gICAgY29uc3QgYWxpYXNQYXRoID0gdHJ5UmVzb2x2ZVBhdGhzQWxpYXModGFyZ2V0RmlsZVBhdGgpO1xyXG4gICAgaWYgKGFsaWFzUGF0aCkge1xyXG4gICAgICAgIHJldHVybiBhbGlhc1BhdGg7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5Zue6YCA5Yiw55u45a+56Lev5b6EXHJcbiAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZyb21GaWxlUGF0aCk7XHJcbiAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKGZpbGVEaXIsIHBhdGguZGlybmFtZSh0YXJnZXRGaWxlUGF0aCkpO1xyXG4gICAgY29uc3QgZmlsZU5hbWVXaXRob3V0RXh0ID0gcGF0aC5iYXNlbmFtZSh0YXJnZXRGaWxlUGF0aCwgcGF0aC5leHRuYW1lKHRhcmdldEZpbGVQYXRoKSk7XHJcblxyXG4gICAgbGV0IG1vZHVsZVBhdGg6IHN0cmluZztcclxuICAgIGlmIChyZWxhdGl2ZVBhdGggPT09ICcnKSB7XHJcbiAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIG1vZHVsZVBhdGggPSBgJHtyZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpfS8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIOWmguaenOi3r+W+hOS4jeaYr+S7pS4v5oiWLi4v5byA5aS077yM5re75YqgLi9cclxuICAgIGlmICghL15cXC5cXC4/XFwvLy50ZXN0KG1vZHVsZVBhdGgpKSB7XHJcbiAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7bW9kdWxlUGF0aH1gO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBtb2R1bGVQYXRoO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gaXNTYW1lVHlwZSh0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10sIG5hbWU6IHN0cmluZykge1xyXG4gICAgLy8g5qOA5p+l5piv5ZCm5bey57uP5a2Y5Zyo5ZCM5ZCN6IqC54K5XHJcbiAgICBjb25zdCBleGlzdGluZ1R5cGUgPSB0eXBlcy5maW5kKHQgPT4gdC5uYW1lID09PSBuYW1lKTtcclxuICAgIGlmIChleGlzdGluZ1R5cGUpIHtcclxuICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKGDorablkYo6IOWPkeeOsOmHjeWkjeeahOiKgueCueWQjeensCBcIiR7bmFtZX1cImApO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihg6K2m5ZGKOiDlj5HnjrDph43lpI3nmoToioLngrnlkI3np7AgXCIke25hbWV9XCJgKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEBwYXJhbSBub2RlIOW9k+WJjeiKgueCuVxyXG4gKiBAcGFyYW0gcHJlZmFiIOmihOWItuS9k+aVsOaNrlxyXG4gKiBAcGFyYW0gdHlwZXMg5pS26ZuG55qE57G75Z6L5pWw57uEXHJcbiAqIEBwYXJhbSB0eXBlcy5uYW1lIOaIkOWRmOWPmOmHj+WQjeensFxyXG4gKiBAcGFyYW0gdHlwZXMudHlwZSDmiJDlkZjlj5jph4/nsbvlnovmmK/nu4Tku7bnmoRVVUlEXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZTogYW55LCBwcmVmYWI6IGFueSwgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdLCBhbGxDb21wb25lbnRzOiBhbnlbXSA9IFtdKSB7XHJcblxyXG4gICAgLy8g6ZyA6KaB5YWI5qOA5rWL6L+Z5Liqbm9kZeaYr+WQpuaYr+mihOWItuS9k1xyXG4gICAgLy8g5aaC5p6c5piv6aKE5Yi25L2T77yM5YiZ6ZyA6KaB6YGN5Y6G6aKE5Yi25L2TXHJcbiAgICBjb25zdCBwcmVmYWJJZCA9IG5vZGUuX3ByZWZhYi5fX2lkX187XHJcbiAgICBjb25zdCBwcmVmYWJJbmZvID0gcHJlZmFiW3ByZWZhYklkXTtcclxuICAgIGNvbnN0IGlzUHJlZmFiID0gcHJlZmFiSW5mby5hc3NldCAmJiBwcmVmYWJJbmZvLmFzc2V0Ll9fdXVpZF9fO1xyXG5cclxuICAgIC8vIOajgOafpeaYr+S4jeaYr+S4gOS4qumihOWItuS9k+aUvuWIsOS6huS4u+mihOWItuS9k+mHjOmdolxyXG4gICAgLy8g5bm25LiU5L+u5pS55LqG5ZCN56ewXHJcbiAgICAvLyDmiJbogIXmmK/kuI3mmK/lnKjkuIDkuKroioLngrnpooTliLbkvZPph4zpnaLvvIzmnInkuIDkupvlrZDoioLngrnpooTliLbkvZPkuIrmjILovb3kuoYgQmFzZVZpZXfmiJbogIVCYXNlVmlld0NvbXBvbmVudFxyXG4gICAgLy8g5aaC5p6c5piv6L+Z57G75oOF5Ya177yM5YiZ5LiN5Y+C5LiO55Sf5Lqn5oiQ5ZGY5Y+Y6YePXHJcbiAgICAvLyDlm6DkuLrov5nnp43mg4XlhrXvvIzmiJDlkZjlj5jph4/pnIDopoHmlL7liLAg6K+l6IqC54K5IOaJgOWcqCBCYXNlVmlldyDmiJbogIUgQmFzZVZpZXdDb21wb25lbnQg55qE6ISa5pys6YeM6Z2i77yM6ICM5LiN5piv5b2T5YmNIEJhc2VWaWV3IOaIluiAhSBCYXNlVmlld0NvbXBvbmVudCDnmoTohJrmnKzph4zpnaJcclxuICAgIGNvbnN0IGNoZWNrID0gZnVuY3Rpb24gKGNsYXNzX3V1aWQ6IHN0cmluZywgbm9kZTogYW55KTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKG5vZGUuX25hbWUuc3RhcnRzV2l0aChcIl9ub2RcIikpIHtcclxuICAgICAgICAgICAgdHlwZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxyXG4gICAgICAgICAgICAgICAgdHlwZTogXCJjYy5Ob2RlXCJcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIOWmguaenOmBjeWOhuWujOS6hu+8jOeci+eci+mihOWItuS9k+eahOWxnuaAp+mHjei9vVxyXG4gICAgICAgIGNvbnN0IGluc3RhbmNlSUQgPSBwcmVmYWJJbmZvLmluc3RhbmNlICYmIHByZWZhYkluZm8uaW5zdGFuY2UuX19pZF9fO1xyXG4gICAgICAgIGNvbnN0IGluc3RhbmNlID0gcHJlZmFiW2luc3RhbmNlSURdO1xyXG5cclxuICAgICAgICBpZiAoaW5zdGFuY2UpIHtcclxuICAgICAgICAgICAgLy8g6YeN6L295bGe5oCnXHJcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGVzID0gaW5zdGFuY2UucHJvcGVydHlPdmVycmlkZXM7XHJcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eU92ZXJyaWRlcyAmJiBBcnJheS5pc0FycmF5KHByb3BlcnR5T3ZlcnJpZGVzKSAmJiBwcm9wZXJ0eU92ZXJyaWRlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByb3BlcnR5T3ZlcnJpZGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlPdmVycmlkZSA9IHByb3BlcnR5T3ZlcnJpZGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlID0gcHJlZmFiW3Byb3BlcnR5T3ZlcnJpZGUuX19pZF9fXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG92ZXJyaWRlICYmIG92ZXJyaWRlLl9fdHlwZV9fID09IFwiQ0NQcm9wZXJ0eU92ZXJyaWRlSW5mb1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5UGF0aCA9IG92ZXJyaWRlLnByb3BlcnR5UGF0aCBhcyBzdHJpbmdbXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvdmVycmlkZS52YWx1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVBhdGggJiYgcHJvcGVydHlQYXRoLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gcHJvcGVydHlQYXRoLmZpbmRJbmRleChlID0+IGUgPT0gXCJfbmFtZVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjbGFzc191dWlkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZS5fY29tcG9uZW50cyA/PyBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgY29tcG9uZW50cykge1xyXG4gICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XHJcblxyXG4gICAgICAgICAgICAvLyDpu5jorqTkuI3lj5ZVSVRyYW5zZm9ybeWSjFdpZGdldFxyXG4gICAgICAgICAgICBpZiAoY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5VSVRyYW5zZm9ybVwiICYmIGNvbXBJbmZvLl9fdHlwZV9fICE9IFwiY2MuV2lkZ2V0XCIpIHtcclxuICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5vZGUuX25hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIOWPquWPluesrOS4gOS4qlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaXNQcmVmYWIpIHtcclxuICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBpc1ByZWZhYik7XHJcblxyXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkNvbnRlbnQgPSByZWFkRmlsZVN5bmMobm9kZUluZm8hLmZpbGUsICd1dGYtOCcpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiMSA9IEpTT04ucGFyc2UocHJlZmFiQ29udGVudCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhSWQgPSBwcmVmYWIxWzBdICYmIHByZWZhYjFbMF0/LmRhdGE/Ll9faWRfXztcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzTm9kZSA9IHByZWZhYjFbZGF0YUlkXSAmJiBwcmVmYWIxW2RhdGFJZF0/Ll9fdHlwZV9fID09IFwiY2MuTm9kZVwiO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChpc05vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyDor7TmmI7mmK9CYXNlVmlld+aIluiAhUJhc2VWaWV3Q29tcG9uZW50XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5LuW5Lus5Lya5Zyo6Ieq5bex55qE57G76YeM6Z2i5re75Yqg5oiQ5ZGY5Y+Y6YePXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsYXNzX25hbWUgPSBhd2FpdCBoYXNDaGlsZE9mQmFzZVZpZXdPckJhc2VWaWV3Q29tcG9uZW50KHByZWZhYjFbZGF0YUlkXSwgcHJlZmFiMSwgYWxsQ29tcG9uZW50cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsYXNzX25hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2soY2xhc3NfbmFtZSwgcHJlZmFiMVtkYXRhSWRdKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdHJhdmVyc2VQcmVmYWJOb2RlKHByZWZhYjFbZGF0YUlkXSwgcHJlZmFiMSwgdHlwZXMsIGFsbENvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHByZWZhYiBjb250ZW50OicsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g5aaC5p6c6YGN5Y6G5a6M5LqG77yM55yL55yL6aKE5Yi25L2T55qE5bGe5oCn6YeN6L29XHJcbiAgICAgICAgY29uc3QgaW5zdGFuY2VJRCA9IHByZWZhYkluZm8uaW5zdGFuY2UgJiYgcHJlZmFiSW5mby5pbnN0YW5jZS5fX2lkX187XHJcbiAgICAgICAgY29uc3QgaW5zdGFuY2UgPSBwcmVmYWJbaW5zdGFuY2VJRF07XHJcblxyXG4gICAgICAgIGlmIChpbnN0YW5jZSkge1xyXG5cclxuICAgICAgICAgICAgLy8g6YeN6L295bGe5oCnXHJcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGVzID0gaW5zdGFuY2UucHJvcGVydHlPdmVycmlkZXM7XHJcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eU92ZXJyaWRlcyAmJiBBcnJheS5pc0FycmF5KHByb3BlcnR5T3ZlcnJpZGVzKSAmJiBwcm9wZXJ0eU92ZXJyaWRlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByb3BlcnR5T3ZlcnJpZGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlPdmVycmlkZSA9IHByb3BlcnR5T3ZlcnJpZGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlID0gcHJlZmFiW3Byb3BlcnR5T3ZlcnJpZGUuX19pZF9fXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG92ZXJyaWRlICYmIG92ZXJyaWRlLl9fdHlwZV9fID09IFwiQ0NQcm9wZXJ0eU92ZXJyaWRlSW5mb1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5UGF0aCA9IG92ZXJyaWRlLnByb3BlcnR5UGF0aCBhcyBzdHJpbmdbXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvdmVycmlkZS52YWx1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVBhdGggJiYgcHJvcGVydHlQYXRoLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gcHJvcGVydHlQYXRoLmZpbmRJbmRleChlID0+IGUgPT0gXCJfbmFtZVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSB2YWx1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBvIGluIHNob3J0TmFtZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcIl9cIiArIG8pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1NhbWVUeXBlKHR5cGVzLCBuYW1lKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHNob3J0TmFtZXNbb11cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIOaJqeWxleiKgueCuVxyXG4gICAgICAgICAgICBjb25zdCBtb3VudGVkQ2hpbGRyZW4gPSBpbnN0YW5jZS5tb3VudGVkQ2hpbGRyZW47XHJcbiAgICAgICAgICAgIGlmIChtb3VudGVkQ2hpbGRyZW4gJiYgQXJyYXkuaXNBcnJheShtb3VudGVkQ2hpbGRyZW4pICYmIG1vdW50ZWRDaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdW50ZWRDaGlsZHJlbi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbW91bnRlZENoaWxkcmVuW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkSW5mbyA9IHByZWZhYltjaGlsZC5fX2lkX19dO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVzID0gY2hpbGRJbmZvLm5vZGVzO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlcyAmJiBBcnJheS5pc0FycmF5KG5vZGVzKSAmJiBub2Rlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbm9kZXMubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBub2Rlc1tqXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVJbmZvID0gcHJlZmFiW25vZGUuX19pZF9fXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlSW5mby5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIikge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDor7TmmI7mmK9CYXNlVmlld+aIluiAhUJhc2VWaWV3Q29tcG9uZW50XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LuW5Lus5Lya5Zyo6Ieq5bex55qE57G76YeM6Z2i5re75Yqg5oiQ5ZGY5Y+Y6YePXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xhc3NfbmFtZSA9IGF3YWl0IGhhc0NoaWxkT2ZCYXNlVmlld09yQmFzZVZpZXdDb21wb25lbnQobm9kZUluZm8sIHByZWZhYiwgYWxsQ29tcG9uZW50cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNsYXNzX25hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2soY2xhc3NfbmFtZSwgbm9kZUluZm8pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShub2RlSW5mbywgcHJlZmFiLCB0eXBlcywgYWxsQ29tcG9uZW50cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghbm9kZS5fbmFtZSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyDlpoLmnpzmmK/oioLngrnvvIzliJnpnIDopoHpgY3ljoboioLngrlcclxuICAgIGlmIChub2RlLl9uYW1lLnN0YXJ0c1dpdGgoJ18nKSkge1xyXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlLl9jb21wb25lbnRzO1xyXG4gICAgICAgIGNvbnN0IG5hbWUgPSBub2RlLl9uYW1lID8/IFwiXCI7XHJcbiAgICAgICAgbGV0IGZpbmQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgaWYgKG5vZGUuX25hbWUuc3RhcnRzV2l0aChcIl9ub2RcIikpIHtcclxuICAgICAgICAgICAgdHlwZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxyXG4gICAgICAgICAgICAgICAgdHlwZTogXCJjYy5Ob2RlXCJcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBmaW5kID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghZmluZCkge1xyXG4gICAgICAgICAgICAvLyDlpoLmnpzmmK/nlKjnn63lkI3np7DlvIDlpLTvvIzliJnor7TmmI7miJDlkZjlj5jph4/opoHnlKjlr7nlupTnmoTnu4Tku7bnsbvlnotcclxuICAgICAgICAgICAgZm9yIChjb25zdCBvIGluIHNob3J0TmFtZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJfXCIgKyBvKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvSUQgPSBjb21wb25lbnRzLmZpbmQoKGNvbXA6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wSW5mby5fX3R5cGVfXyA9PSBzaG9ydE5hbWVzW29dO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcEluZm9JRCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wSW5mb0lELl9faWRfX107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wSW5mbykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbm9kZS5fbmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5fbmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wSW5mby5fX3R5cGVfX1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFmaW5kKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgY29tcCBvZiBjb21wb25lbnRzKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XHJcblxyXG4gICAgICAgICAgICAgICAgLy8g6buY6K6k5LiN5Y+WVUlUcmFuc2Zvcm3lkoxXaWRnZXRcclxuICAgICAgICAgICAgICAgIGlmIChjb21wSW5mby5fX3R5cGVfXyAhPSBcImNjLlVJVHJhbnNmb3JtXCIgJiYgY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5XaWRnZXRcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5vZGUuX25hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5fbmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgZmluZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5Y+q5Y+W56ys5LiA5LiqXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG5vZGUuX2NoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobm9kZS5fY2hpbGRyZW4pICYmIG5vZGUuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUuX2NoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbm9kZS5fY2hpbGRyZW5baV07XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjaGlsZEluZm8gPSBwcmVmYWJbY2hpbGQuX19pZF9fXTtcclxuICAgICAgICAgICAgaWYgKGNoaWxkSW5mby5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIikge1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIOivtOaYjuaYr0Jhc2VWaWV35oiW6ICFQmFzZVZpZXdDb21wb25lbnRcclxuICAgICAgICAgICAgICAgIC8vIOS7luS7rOS8muWcqOiHquW3seeahOexu+mHjOmdoua3u+WKoOaIkOWRmOWPmOmHj1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xhc3NfbmFtZSA9IGF3YWl0IGhhc0NoaWxkT2ZCYXNlVmlld09yQmFzZVZpZXdDb21wb25lbnQoY2hpbGRJbmZvLCBwcmVmYWIsIGFsbENvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNsYXNzX25hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjaGVjayhjbGFzc19uYW1lLCBjaGlsZEluZm8pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShjaGlsZEluZm8sIHByZWZhYiwgdHlwZXMsIGFsbENvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYXNDaGlsZE9mQmFzZVZpZXdPckJhc2VWaWV3Q29tcG9uZW50KG5vZGU6IGFueSwgcHJlZmFiOiBhbnksIGFsbENvbXBvbmVudHM6IGFueVtdKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGlmICghbm9kZSkgcmV0dXJuIFwiXCI7XHJcbiAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZS5fY29tcG9uZW50cztcclxuXHJcbiAgICBpZiAoIWNvbXBvbmVudHMgfHwgY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY29tcG9uZW50cy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICBjb25zdCBjb21wID0gY29tcG9uZW50c1tpbmRleF07XHJcbiAgICAgICAgY29uc3QgY29tcEluZm8gPSBwcmVmYWJbY29tcC5fX2lkX19dO1xyXG5cclxuICAgICAgICBpZiAoY29tcEluZm8gJiYgKGNvbXBJbmZvLl9fdHlwZV9fID09PSBcIkJhc2VWaWV3XCIgfHwgY29tcEluZm8uX190eXBlX18gPT09IFwiQmFzZVZpZXdDb21wb25lbnRcIikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDlpoLmnpzmmK9VVUlE77yM5YiZ6ZyA6KaB5aSE55CGXHJcbiAgICAgICAgaWYgKEVkaXRvci5VdGlscy5VVUlELmlzVVVJRChjb21wSW5mby5fX3R5cGVfXykpIHtcclxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudCcsXHJcbiAgICAgICAgICAgICAgICBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRChjb21wSW5mby5fX3R5cGVfXylcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghY29tcG9uZW50SW5mbykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZmluZCA9IGFsbENvbXBvbmVudHMuZmluZChlID0+IGUuY2lkID09IGNvbXBJbmZvLl9fdHlwZV9fKTtcclxuICAgICAgICAgICAgICAgIGlmICghZmluZCkgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNBc3NldElkID0gZmluZCAmJiBmaW5kLmFzc2V0VXVpZDtcclxuICAgICAgICAgICAgICAgIGlmICghaGFzQXNzZXRJZCkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGhhc0Fzc2V0SWQpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8/LmZpbGUgJiYgYXNzZXRJbmZvLmZpbGUuZW5kc1dpdGgoJy50cycpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5Yib5bu66aG555uuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOa6kOaWh+S7tlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZUZpbGUgPSBwcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGFzc3MgPSBzb3VyY2VGaWxlLmdldENsYXNzZXMoKTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNsYXNzcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGFzc0RlY2xhcmF0aW9uID0gY2xhc3NzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xhc3NEZWNsYXJhdGlvbi5nZXROYW1lKCkgIT09IGZpbmQubmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZHNOb2RlID0gY2xhc3NEZWNsYXJhdGlvbi5nZXRFeHRlbmRzKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXh0ZW5kc05vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZE5hbWUgPSBleHRlbmRzTm9kZS5nZXRUZXh0KCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Yib5bu65LiA5Liq5paw55qE5qOA5p+lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlm6DkuLrlr7nkuo7pooTliLbkvZPmnaXor7TvvIzmr4/kuIDkuKrpooTliLbkvZPlhoXpg6jpg73mmK/kuIDkuKogQmFzZVZpZXdDb21wb25lbnTmiJbogIUgQmFzZVZpZXdcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOmHjOmdoueahOWtkOiKgueCueWQjeWtl+mDveaYr+S4gOaooeS4gOagt1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5b+F6aG76KeE6YG/6L+Z5Liq6Zeu6aKYXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlnKhSdW50aW1lIOS4i++8jOivpemXrumimOS4jeS8muWHuueOsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4dGVuZE5hbWUuc3RhcnRzV2l0aChcIkJhc2VWaWV3XCIpIHx8IGV4dGVuZE5hbWUuc3RhcnRzV2l0aChcIkJhc2VWaWV3Q29tcG9uZW50XCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhhc0Fzc2V0SWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8g5LiN5bqU6K+l6LWw5Yiw6L+Z6YeM5p2lXHJcbiAgICAgICAgICAgICAgICBlcnJvcihcIuS4jeW6lOivpei1sOWIsOi/memHjOadpSBjb21wb25lbnRJbmZvXCIsIGNvbXBvbmVudEluZm8pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBcIlwiO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBmaW5kTm9kZXNXaXRoVW5kZXJzY29yZVByZWZpeChhc3NldEluZm86IEFzc2V0SW5mbyAmIHsgcHJlZmFiOiB7IGFzc2V0VXVpZDogc3RyaW5nIH0gfSkge1xyXG4gICAgdHJ5IHtcclxuXHJcbiAgICAgICAgY29uc3QgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudHMnKTtcclxuICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldEluZm8ucHJlZmFiLmFzc2V0VXVpZCk7XHJcblxyXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkNvbnRlbnQgPSByZWFkRmlsZVN5bmMobm9kZUluZm8hLmZpbGUsICd1dGYtOCcpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiID0gSlNPTi5wYXJzZShwcmVmYWJDb250ZW50KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBwcmVmYWIuZmluZCgoaXRlbTogYW55KSA9PiBpdGVtLl9uYW1lID09IGFzc2V0SW5mby5uYW1lICYmIGl0ZW0uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZSwgcHJlZmFiLCB0eXBlcywgYWxsQ29tcG9uZW50cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVzO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHByZWZhYiBjb250ZW50OicsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB0cmF2ZXJzZSBub2RlczonLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRvck1lbWJlcnMoZmlsZVBhdGg6IHN0cmluZywgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdLCBzY29wZTogU2NvcGUpIHtcclxuICAgIC8vIOWIm+W7uumhueebrlxyXG4gICAgY29uc3QgcHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XHJcblxyXG4gICAgLy8g5re75Yqg5rqQ5paH5Lu2XHJcbiAgICBjb25zdCBzb3VyY2VGaWxlID0gcHJvamVjdC5hZGRTb3VyY2VGaWxlQXRQYXRoKGZpbGVQYXRoKTtcclxuXHJcbiAgICAvLyDojrflj5bmiYDmnInnsbvlo7DmmI5cclxuICAgIGNvbnN0IGNsYXNzZXMgPSBzb3VyY2VGaWxlLmdldENsYXNzZXMoKTtcclxuXHJcbiAgICAvLyDpgY3ljobmr4/kuKrnsbtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNsYXNzRGVjbGFyYXRpb24gPSBjbGFzc2VzW2ldO1xyXG5cclxuICAgICAgICAvLyDlhYjmt7vliqDmlrDnmoTlsZ7mgKdcclxuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdHlwZXMubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHR5cGVEZWYgPSB0eXBlc1tpbmRleF07XHJcbiAgICAgICAgICAgIGlmICghY2xhc3NEZWNsYXJhdGlvbi5nZXRQcm9wZXJ0eSh0eXBlRGVmLm5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbmmK/oh6rlrprkuYnnu4Tku7bvvIjpnZ5jY+W8gOWktO+8iVxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNDdXN0b21Db21wb25lbnQgPSAhdHlwZURlZi50eXBlLnN0YXJ0c1dpdGgoJ2NjLicpO1xyXG4gICAgICAgICAgICAgICAgbGV0IHR5cGVOYW1lID0gdHlwZURlZi50eXBlO1xyXG4gICAgICAgICAgICAgICAgbGV0IG1vZHVsZVBhdGggPSAnY2MnO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRCh0eXBlRGVmLnR5cGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K+75Y+W57G75om+5Yiw5a+85Ye6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudFByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRGaWxlID0gY3VzdG9tQ29tcG9uZW50UHJvamVjdC5hZGRTb3VyY2VGaWxlQXRQYXRoKGFzc2V0SW5mby5maWxlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPluaWh+S7tuS4reaJgOacieWvvOWHuueahOexu1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBvcnRlZENsYXNzZXMgPSBjdXN0b21Db21wb25lbnRGaWxlLmdldENsYXNzZXMoKS5maWx0ZXIoYyA9PiBjLmlzRXhwb3J0ZWQoKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInlr7zlh7rnmoTnsbvvvIzkvb/nlKjnrKzkuIDkuKrnsbvnmoTlkI3np7BcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4cG9ydGVkQ2xhc3Nlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGV4cG9ydGVkQ2xhc3Nlc1swXS5nZXROYW1lKCkgfHwgYXNzZXRJbmZvLm5hbWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LyY5YWI5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQje+8jOWQpuWImeS9v+eUqOebuOWvuei3r+W+hFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGdldE1vZHVsZVNwZWNpZmllcihmaWxlUGF0aCwgYXNzZXRJbmZvLmZpbGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeacieaJvuWIsOWvvOWHuueahOexu++8jOS9v+eUqOaWh+S7tuWQjVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBObyBleHBvcnRlZCBjbGFzcyBmb3VuZCBpbiAke2Fzc2V0SW5mby5maWxlfSwgdXNpbmcgYXNzZXQgbmFtZSBpbnN0ZWFkYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGFzc2V0SW5mby5uYW1lO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS8mOWFiOS9v+eUqCB0c2NvbmZpZyBwYXRocyDliKvlkI3vvIzlkKbliJnkvb/nlKjnm7jlr7not6/lvoRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBnZXRNb2R1bGVTcGVjaWZpZXIoZmlsZVBhdGgsIGFzc2V0SW5mby5maWxlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cclxuICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZS5zcGxpdCgnLicpLnBvcCgpIHx8ICcnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNsYXNzRGVjbGFyYXRpb24uaW5zZXJ0UHJvcGVydHkoMCwge1xyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHR5cGVEZWYubmFtZSxcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0eXBlTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBpbml0aWFsaXplcjogXCJudWxsIVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIGRlY29yYXRvcnM6IFt7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6ICdwcm9wZXJ0eScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3VtZW50czogW2B7dHlwZTogJHt0eXBlTmFtZX19YF1cclxuICAgICAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgICAgICAgICBpc1JlYWRvbmx5OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlOiBzY29wZVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8g5re75Yqg5a+85YWlXHJcbiAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDoh6rlrprkuYnnu4Tku7bnmoTlr7zlhaVcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpLmdldE1vZHVsZVNwZWNpZmllclZhbHVlKCkgPT09IG1vZHVsZVBhdGhcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdJbXBvcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gZXhpc3RpbmdJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6IG1vZHVsZVBhdGhcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqAgY2Mg57uE5Lu25a+85YWlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2NJbXBvcnQgPSBzb3VyY2VGaWxlLmdldEltcG9ydERlY2xhcmF0aW9uKGkgPT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNjSW1wb3J0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWVkSW1wb3J0cyA9IGNjSW1wb3J0LmdldE5hbWVkSW1wb3J0cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZWRJbXBvcnRzOiBbdHlwZU5hbWVdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiAnY2MnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g6I635Y+W5omA5pyJ56eB5pyJ5bGe5oCnXHJcbiAgICAgICAgY29uc3QgcHJpdmF0ZVByb3BzID0gY2xhc3NEZWNsYXJhdGlvbi5nZXRQcm9wZXJ0aWVzKCkuZmlsdGVyKHByb3AgPT5cclxuICAgICAgICAgICAgcHJvcC5nZXROYW1lKCkuc3RhcnRzV2l0aCgnXycpXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8g5aSE55CG546w5pyJ5bGe5oCnXHJcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHByaXZhdGVQcm9wcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgcHJvcCA9IHByaXZhdGVQcm9wc1tpbmRleF07XHJcblxyXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gcHJvcC5nZXROYW1lKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBwcm9wLmdldFR5cGUoKS5nZXRUZXh0KCk7XHJcbiAgICAgICAgICAgIHByb3Auc2V0U2NvcGUoc2NvcGUpO1xyXG4gICAgICAgICAgICBjb25zdCB0eXBlRGVmID0gdHlwZXMuZmluZChpdGVtID0+IGl0ZW0ubmFtZSA9PT0gbmFtZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAodHlwZURlZikge1xyXG4gICAgICAgICAgICAgICAgLy8g5pu05paw57G75Z6L5ZKM6KOF6aWw5ZmoXHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZURlZi50eXBlICE9PSB0eXBlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+l5piv5ZCm5piv6Ieq5a6a5LmJ57uE5Lu2XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNDdXN0b21Db21wb25lbnQgPSAhdHlwZURlZi50eXBlLnN0YXJ0c1dpdGgoJ2NjLicpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgbW9kdWxlUGF0aCA9ICdjYyc7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQodHlwZURlZi50eXBlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K+75Y+W57G75om+5Yiw5a+85Ye6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRQcm9qZWN0ID0gbmV3IFByb2plY3QoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudEZpbGUgPSBjdXN0b21Db21wb25lbnRQcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPluaWh+S7tuS4reaJgOacieWvvOWHuueahOexu1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwb3J0ZWRDbGFzc2VzID0gY3VzdG9tQ29tcG9uZW50RmlsZS5nZXRDbGFzc2VzKCkuZmlsdGVyKGMgPT4gYy5pc0V4cG9ydGVkKCkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOacieWvvOWHuueahOexu++8jOS9v+eUqOesrOS4gOS4quexu+eahOWQjeensFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4cG9ydGVkQ2xhc3Nlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBleHBvcnRlZENsYXNzZXNbMF0uZ2V0TmFtZSgpIHx8IGFzc2V0SW5mby5uYW1lO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDkvJjlhYjkvb/nlKggdHNjb25maWcgcGF0aHMg5Yir5ZCN77yM5ZCm5YiZ5L2/55So55u45a+56Lev5b6EXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGdldE1vZHVsZVNwZWNpZmllcihmaWxlUGF0aCwgYXNzZXRJbmZvLmZpbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmsqHmnInmib7liLDlr7zlh7rnmoTnsbvvvIzkvb/nlKjmlofku7blkI1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGFzc2V0SW5mby5uYW1lO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDkvJjlhYjkvb/nlKggdHNjb25maWcgcGF0aHMg5Yir5ZCN77yM5ZCm5YiZ5L2/55So55u45a+56Lev5b6EXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGdldE1vZHVsZVNwZWNpZmllcihmaWxlUGF0aCwgYXNzZXRJbmZvLmZpbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGUuc3BsaXQoJy4nKS5wb3AoKSB8fCAnJztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY29yYXRvcnMgPSBwcm9wLmdldERlY29yYXRvcnMoKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcjogRGVjb3JhdG9yIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOafpeaJvueOsOacieeahCBwcm9wZXJ0eSDoo4XppbDlmahcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGRlY29yYXRvciBvZiBkZWNvcmF0b3JzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWNvcmF0b3IuZ2V0TmFtZSgpID09PSAncHJvcGVydHknKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yID0gZGVjb3JhdG9yO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei1xyXG4gICAgICAgICAgICAgICAgICAgIHByb3Auc2V0VHlwZSh0eXBlTmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlueOsOacieijhemlsOWZqOeahOWPguaVsOaWh+acrFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0gZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5nZXRBcmd1bWVudHMoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWwneivleino+aekOeOsOacieWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnVGV4dCA9IGFyZ3NbMF0uZ2V0VGV4dCgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaYr+WvueixoeW9ouW8j+eahOWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ1RleHQuc3RhcnRzV2l0aCgneycpICYmIGFyZ1RleHQuZW5kc1dpdGgoJ30nKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaPkOWPluWvueixoeWGheWuue+8jOenu+mZpOWJjeWQjueahOiKseaLrOWPt1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9iamVjdENvbnRlbnRzID0gYXJnVGV4dC5zdWJzdHJpbmcoMSwgYXJnVGV4dC5sZW5ndGggLSAxKS50cmltKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuacieWFtuS7luWxnuaAp1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvYmplY3RDb250ZW50cy5pbmNsdWRlcygnLCcpIHx8ICFvYmplY3RDb250ZW50cy5pbmNsdWRlcygndHlwZTonKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnoTlu7rmlrDnmoTlr7nosaHlj4LmlbDvvIzljIXlkKvljp/mnInlsZ7mgKflkozmlrDnmoTnsbvlnotcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5ld0FyZyA9ICd7JztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhuW3suacieWxnuaAp1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gb2JqZWN0Q29udGVudHMuc3BsaXQoJywnKS5tYXAocCA9PiBwLnRyaW0oKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVJbmRleCA9IHByb3BlcnRpZXMuZmluZEluZGV4KHAgPT4gcC5zdGFydHNXaXRoKCd0eXBlOicpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlSW5kZXggPj0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5pu/5o2i57G75Z6L5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3R5cGVJbmRleF0gPSBgdHlwZTogJHt0eXBlTmFtZX1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg57G75Z6L5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzLnB1c2goYHR5cGU6ICR7dHlwZU5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0FyZyArPSBwcm9wZXJ0aWVzLmpvaW4oJywgJykgKyAnfSc7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDoo4XppbDlmahcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChuZXdBcmcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7heWMheWQq+exu+Wei+WumuS5ie+8jOabtOaWsOexu+Wei1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDpnZ7lr7nosaHlvaLlvI/lj4LmlbDvvIzmm7/mjaLkuLrmlrDlj4LmlbBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQoYHt0eXBlOiAke3R5cGVOYW1lfX1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOayoeacieWPguaVsO+8jOa3u+WKoOWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChge3R5cGU6ICR7dHlwZU5hbWV9fWApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rKh5pyJ5om+5YiwIHByb3BlcnR5IOijhemlsOWZqO+8jOa3u+WKoOaWsOijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLmFkZERlY29yYXRvcih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiAncHJvcGVydHknLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiBbYHt0eXBlOiAke3R5cGVOYW1lfX1gXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXByb3AuZ2V0SW5pdGlhbGl6ZXIoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLnNldEluaXRpYWxpemVyKCdudWxsJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDlr7zlhaVcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg6Ieq5a6a5LmJ57uE5Lu255qE5a+85YWlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpLmdldE1vZHVsZVNwZWNpZmllclZhbHVlKCkgPT09IG1vZHVsZVBhdGhcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0ltcG9ydCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gZXhpc3RpbmdJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ0ltcG9ydC5hZGROYW1lZEltcG9ydCh0eXBlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VGaWxlLmFkZEltcG9ydERlY2xhcmF0aW9uKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiBtb2R1bGVQYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoCBjYyDnu4Tku7blr7zlhaVcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2NJbXBvcnQgPSBzb3VyY2VGaWxlLmdldEltcG9ydERlY2xhcmF0aW9uKGkgPT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gJ2NjJ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNjSW1wb3J0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBjY0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6ICdjYydcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8g5YWI55yL55yL5piv5LiN5pivcHJvcGVydHnoo4XppbDlmahcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRlY29yYXRvcnMgPSBwcm9wLmdldERlY29yYXRvcnMoKTtcclxuICAgICAgICAgICAgICAgIGxldCBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yOiBEZWNvcmF0b3IgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGRlY29yYXRvciBvZiBkZWNvcmF0b3JzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRlY29yYXRvci5nZXROYW1lKCkgPT09ICdwcm9wZXJ0eScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvciA9IGRlY29yYXRvcjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+l6KOF6aWw5Zmo5Y+C5pWw5Lit5piv5ZCm5YyF5ZCrIHVzZXJEYXRhXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJncyA9IGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuZ2V0QXJndW1lbnRzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc1VzZXJEYXRhID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnVGV4dCA9IGFyZ3NbMF0uZ2V0VGV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbljIXlkKsgdXNlckRhdGEg5Y+C5pWwXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdUZXh0LmluY2x1ZGVzKCd1c2VyRGF0YScpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNVc2VyRGF0YSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeaciSB1c2VyRGF0YSDlj4LmlbDvvIzmiY3np7vpmaTlsZ7mgKdcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc1VzZXJEYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3AucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8g5L+d5a2Y5L+u5pS5XHJcbiAgICBwcm9qZWN0LnNhdmVTeW5jKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvblJvb3RNZW51KGFzc2V0SW5mbzogQXNzZXRJbmZvICYgeyBjb21wb25lbnRzOiBhbnlbXSwgcHJlZmFiOiB7IGFzc2V0VXVpZDogc3RyaW5nIH0gfSkge1xyXG4gICAgcmV0dXJuIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5yb290TWVudScsXHJcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcclxuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5LmVycm9yLm5vQXNzZXRJbmZvJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDpgY3ljoboioLngrnmoJHmn6Xmib7luKbkuIvliJLnur/nmoToioLngrnlkozlsZ7mgKdcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eXBlcyA9IGF3YWl0IGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhue7hOS7tuS/oeaBr1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBhc3NldEluZm8uY29tcG9uZW50cztcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbXBvbmVudHMgfHwgY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc0Jhc2VWaWV3ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvbXBvbmVudHMubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGNvbXBvbmVudHNbaW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W57uE5Lu26K+m57uG5L+h5oGvXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LnZhbHVlICAvLyDov5nph4znmoQgdmFsdWUg5bCx5piv57uE5Lu255qEIFVVSURcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlVmlldyA9IGNvbXBvbmVudEluZm8uZXh0ZW5kcz8uZmluZChpdGVtID0+IGl0ZW0uc3RhcnRzV2l0aChcIkJhc2VWaWV3XCIpIHx8IGl0ZW0uc3RhcnRzV2l0aChcIkJhc2VWaWV3Q29tcG9uZW50XCIpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXNlVmlldykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc0Jhc2VWaWV3ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5botYTmupDkv6Hmga9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQoY29tcG9uZW50SW5mby5jaWQhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLmZpbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdG9yTWVtYmVycyhhc3NldEluZm8uZmlsZSwgdHlwZXMgPz8gW10sIFNjb3BlLlByaXZhdGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5pbmZvKCfmnoTpgKDmiJDlkZjlh73mlbDmiJDlip8nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghaGFzQmFzZVZpZXcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcihFZGl0b3IuSTE4bi50KCdnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkuZXJyb3Iubm9CYXNlVmlldycpKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUucHVibGljTWVudScsXHJcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcclxuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5LmVycm9yLm5vQXNzZXRJbmZvJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDpgY3ljoboioLngrnmoJHmn6Xmib7luKbkuIvliJLnur/nmoToioLngrnlkozlsZ7mgKdcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eXBlcyA9IGF3YWl0IGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhue7hOS7tuS/oeaBr1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBhc3NldEluZm8uY29tcG9uZW50cztcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbXBvbmVudHMgfHwgY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc0Jhc2VWaWV3ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvbXBvbmVudHMubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGNvbXBvbmVudHNbaW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W57uE5Lu26K+m57uG5L+h5oGvXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LnZhbHVlICAvLyDov5nph4znmoQgdmFsdWUg5bCx5piv57uE5Lu255qEIFVVSURcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlVmlldyA9IGNvbXBvbmVudEluZm8uZXh0ZW5kcz8uZmluZChpdGVtID0+IGl0ZW0uc3RhcnRzV2l0aChcIkJhc2VWaWV3XCIpIHx8IGl0ZW0uc3RhcnRzV2l0aChcIkJhc2VWaWV3Q29tcG9uZW50XCIpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXNlVmlldykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc0Jhc2VWaWV3ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5botYTmupDkv6Hmga9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQoY29tcG9uZW50SW5mby5jaWQhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLmZpbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdG9yTWVtYmVycyhhc3NldEluZm8uZmlsZSwgdHlwZXMgPz8gW10sIFNjb3BlLlB1YmxpYyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ+aehOmAoOaIkOWRmOWHveaVsOaIkOWKnycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNCYXNlVmlldykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKEVkaXRvci5JMThuLnQoJ2dhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Jhc2VWaWV3JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgXTtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvbk5vZGVNZW51KG5vZGU6IEFzc2V0SW5mbykge1xyXG4gICAgcmV0dXJuIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5ub2RlTWVudScsXHJcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICghbm9kZSB8fCAhbm9kZS51dWlkIHx8IG5vZGUudHlwZSAhPT0gXCJjYy5Ob2RlXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgRWRpdG9yLlBhbmVsLm9wZW4oJ2dhbWUtZnJhbWV3b3JrLnNldC1uYW1lJywgbm9kZS51dWlkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICBdO1xyXG59Il19