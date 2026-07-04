---
name: "ksgames26-runtime-module-builder"
description: "Builds a full ksgames26 runtime module from UI to Service, binding, prefab/meta, uuid, and asset-db refresh. Invoke when creating or restructuring a module end-to-end."
---

# Ksgames26 Runtime Module Builder

基于 `ksgames26/game-framework` 为业务实现一个完整模块，从目录组织、`BaseService` / `BaseView`、UI 绑定、事件流，到 prefab / `.meta` / `uuid` / 压缩 `uuid` / `asset-db` 刷新与验证。

## 适用场景

- 用户要新增一个完整模块，例如 `main`、`battle`、`login`、`debug`
- 用户要把一个散落在组件脚本里的界面整理成 `BaseService + BaseView`
- 用户要新建 prefab、绑定脚本、接入按钮点击和事件派发
- 用户要处理 `.meta`、`uuid`、压缩 `uuid`、prefab 脚本挂载
- 用户要排查 Cocos 编辑器里 `Missing class`、prefab 丢脚本、asset-db 未刷新
- 用户要用 `ksgames26` 既有的声明式绑定策略，而不是手写 `getChildByName()`

## 必看文件

- `extensions/ksgames26/skills/README.md`
- `extensions/ksgames26/game-framework/model-view/base-service.ts`
- `extensions/ksgames26/game-framework/model-view/base-view.ts`
- `extensions/ksgames26/game-framework/model-view/binding-and-fix-special-shaped-screen.ts`
- `extensions/ksgames26/game-framework/services/ui-service.ts`
- `extensions/ksgames26/source/hierarchy/hierarchy-menu.ts`
- `assets/scripts/modules/*`
- `assets/bundles/*`

## 模块目标结构

通常一个运行时模块至少包含：

- `assets/scripts/modules/<module>/<module>-service.ts`
- `assets/scripts/modules/<module>/<module>-view.ts`
- `assets/scripts/modules/<module>/<module>-events.ts`
- 可选：`assets/scripts/modules/<module>/<module>-vm.ts`
- `assets/bundles/<bundle>/<module>-view.prefab`
- 对应 `.meta` 文件

如果模块很复杂，再追加：

- `BaseViewComponent` 局部组件
- 业务子 VM
- scene 入口或路由层

## 工作步骤

1. 先确认模块职责
   - 是全屏页面、弹窗、局部组件，还是场景级模块
   - 是否需要 `BattleVm` 这类纯状态模型
   - 是否真的需要跨模块复用 VM，还是只抽通用状态片段

2. 设计 Service
   - 新建 `xxxService extends BaseService`
   - 在 `viewOptions()` 中声明 bundle、prefab、`UIShowType`、`UIAnimaOpenMode`
   - 业务状态和业务动作优先放 `Service`
   - 打开其他模块统一走 `uiSvr.open(...)`

3. 设计 View
   - 新建 `xxxView extends BaseView`
   - 视图只处理生命周期、显示刷新、按钮点击与 Service 协调
   - 如果项目已采用声明式绑定，不要手写 `getChildByName()`
   - 优先使用 `@property({ type, userData: { binding: "节点名" } })`

4. 设计事件流
   - 建议为模块建立 `xxx-events.ts`
   - `Service` 通过 `dispatch(...)` 派发视图更新事件
   - `View` 通过 `@eventViewListener(...)` 监听
   - 需要纯展示状态时，使用 `VmState` 接口承载视图数据

5. 设计 VM
   - `VM` 是 `ViewModel`，负责产出界面状态，不直接操作节点
   - `VM` 适合承载标题、状态文案、按钮文案、开关态、计数、列表展示态
   - 模块级 `BattleVm` 不要为了复用而被别的模块直接共用
   - 优先抽离可复用状态片段，而不是把整个业务 VM 横向复用

6. 设计 prefab
   - 节点命名要稳定、唯一、可绑定
   - 既然绑定按名字找，就不要把多个不同语义节点都命名成 `Label`
   - 例如按钮子文案节点用 `StartLabel`、`BackLabel`，不要都叫 `Label`
   - 自定义脚本组件挂在 prefab 时，`__type__` 要写压缩 `uuid`

7. 处理 `.meta` 与 `uuid`
   - `.meta` 里写标准 `uuid`
   - prefab / scene 中自定义脚本的 `__type__` 写压缩 `uuid`
   - 不建议手算压缩值，直接使用：

```js
Editor.Utils.UUID.compressUUID('<script-uuid>', false)
```

   - 反查时使用：

```js
Editor.Utils.UUID.decompressUUID('<compressed-uuid>')
```

8. 处理 asset-db
   - 手工新增脚本、prefab、`.meta` 后，要刷新 `asset-db`
   - 典型调用：

```js
await Editor.Message.request('asset-db', 'refresh');
```

   - 刷新后再查询：

```js
await Editor.Message.request('asset-db', 'query-asset-info', 'db://assets/...');
```

9. 验证 prefab 与脚本挂载
   - 检查 prefab 是否被识别
   - 检查脚本 `.meta` 是否 imported
   - 检查 prefab 的 `dependScripts` 是否包含目标脚本 uuid
   - 检查是否出现 `Missing class`

## 绑定策略约束

- 如果项目已有 `binding-and-fix-special-shaped-screen.ts` 这一套绑定机制：
  - 优先用 `@property + userData.binding`
  - 不要在 `View` 中到处写 `getChildByName()`
- 只有在当前框架绑定能力无法覆盖的场景下，才允许手动查找节点
- 绑定名应和 prefab 节点命名保持一一对应

## `uuid` 和压缩 `uuid` 规则

1. 原始 `uuid`
   - 来自脚本或资源的 `.meta`
   - 示例：

```json
{
  "uuid": "cc6f7452-aee2-4717-98f4-b12b43c67c19"
}
```

2. 压缩 `uuid`
   - 用在 prefab / scene 的自定义脚本组件 `__type__`
   - 示例：

```txt
cc6f7RSruJHF5j0sStDxnwZ
```

3. 记忆法
   - `meta.uuid = 原始 uuid`
   - `prefab.__type__ = 压缩 uuid`

4. 常见错误
   - 手写错压缩 `uuid`
   - prefab 里脚本 `__type__` 与脚本 `.meta` 的 `uuid` 不匹配
   - 结果是 Cocos 报：
     - `Missing class`
     - `Script ... is missing or invalid`

## 常见问题与排查

### 1. `Missing class`

按这个顺序查：

1. 脚本 `.meta` 是否存在且 `uuid` 正确
2. prefab 中脚本组件 `__type__` 是否为正确的压缩 `uuid`
3. `asset-db` 是否已刷新
4. 脚本是否已被 Cocos 识别为 `cc.Script`
5. prefab 的 `dependScripts` 是否包含该脚本 uuid

### 2. 绑定不到节点

按这个顺序查：

1. `@property` 是否带了正确的 `type`
2. `userData.binding` 是否与 prefab 节点名一致
3. 是否存在同名节点冲突
4. 绑定目标是否在当前 view 的子树内

### 3. View 里出现大量手动查找节点

处理原则：

- 优先回到框架绑定策略
- 把节点查找转换成 `@property + binding`
- 保持 View 只写交互，不写节点扫描逻辑

## 推荐实现模板

### 1. Service

```ts
@ccclass("DemoService")
@Container.injectable()
export class DemoService extends BaseService<{}, DemoViewEvents, void> {
    public viewOptions(): OpenViewOptions<void> {
        return new OpenViewOptions<void>(
            this.assetSvr.getOrCreateAssetHandle("demo-ui-res", Prefab, "demo-view"),
            UIAnimaOpenMode.NONE,
            UIShowType.FullScreenView,
        );
    }
}
```

### 2. View

```ts
@ccclass("DemoView")
export class DemoView extends BaseView<DemoService> {
    @property({ type: Label, userData: { binding: "TitleLabel" } })
    private readonly _titleLabel: Label = null!;
}
```

## 最小验证

运行时模块至少验证：

- prefab 已被 asset-db 识别
- 脚本已被识别为 `cc.Script`
- prefab 没有丢资源引用
- 打开界面时不报 `Missing class`
- 绑定字段能正确赋值
- 按钮点击能走到 Service

## 输出要求

最终说明优先包含：

1. 模块目录结构
2. `Service / View / Events / VM` 的职责划分
3. 绑定策略是否遵循框架约定
4. prefab / `.meta` / `uuid` / 压缩 `uuid` 的处理方式
5. `asset-db` 刷新与验证步骤
