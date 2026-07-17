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

## 场景级模块强约束

如果模块是 `battle`、`world`、`stage` 这类“场景级模块”，也仍然要遵循 `BaseService + BaseView + SceneController` 三层结构，不允许只有 `Service + SceneController`。

- `xxxService`
  - 必须继承 `BaseService`
  - 必须提供 `viewOptions()`
  - 负责持有输入状态、业务状态、对外动作和跨模块调用
- `xxxView`
  - 必须继承 `BaseView`
  - 负责键盘事件、按钮点击、界面生命周期
  - 如果模块需要键盘焦点，必须把键盘处理写在 `onKeyDown()` / `onKeyUp()` / `onKeyPressing()`
- `xxxSceneController`
  - 只负责场景节点构建、运行时更新、场景资源消费
  - 只读取 `Service` 中的状态，不拥有输入真相
  - 不要把键盘状态、业务状态重新复制一份藏在 `SceneController`

典型职责边界：

- `View` 采集输入
- `Service` 存储输入和业务状态
- `SceneController` 消费状态驱动场景表现

典型反例：

- `BattleSceneController` 里直接 `input.on(Input.EventType.KEY_DOWN, ...)`
- 场景控制器内部维护 `_inputState.up/down/left/right`
- 模块没有 `battle-view.ts` 和 `battle-view.prefab`
- `BattleService` 不是 `BaseService`

上面这些都应该视为偏离框架约定，必须回退到标准三层结构。

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
   - 如果是场景级模块，也必须有 `View`，不能因为“主要内容在场景里”就省略 `View`
   - 场景级模块的键盘输入默认落在 `View`，不要直接写在 `SceneController`
   - 如果项目已采用声明式绑定，必须复用 `binding-and-fix-special-shaped-screen.ts` 这一套机制，不要手写 `getChildByName()`
   - 默认使用 `@property({ type, userData: { binding: "节点名" } })`
   - 只有在框架绑定当前确实无法覆盖时，才允许手动查找节点，并且需要在说明里明确原因
4. 设计 SceneController
   - 仅在确实有场景根节点、滚动地图、实体生成、逐帧战斗更新时才引入 `SceneController`
   - `SceneController` 不负责 UI 打开逻辑，UI 由 `Service.viewOptions()` 和 `UIService` 体系负责
   - 场景切入时如需同时打开模块 View，应通过 `SceneOptions.autoOpenViews` 接通，而不是手动绕开 `UIService`
   - `SceneController` 读取 `Service` 状态，不直接订阅键盘输入
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

1. 处理 asset-db
   - 手工新增脚本、prefab、`.meta` 后，要刷新 `asset-db`
   - 典型调用：

```js
await Editor.Message.request('asset-db', 'refresh');
```

- 刷新后再查询：

```js
await Editor.Message.request('asset-db', 'query-asset-info', 'db://assets/...');
```

1. 验证 prefab 与脚本挂载
   - 检查 prefab 是否被识别
   - 检查脚本 `.meta` 是否 imported
   - 检查 prefab 的 `dependScripts` 是否包含目标脚本 uuid
   - 检查是否出现 `Missing class`

## 绑定策略约束

- 如果项目已有 `binding-and-fix-special-shaped-screen.ts` 这一套绑定机制：
  - 优先用 `@property + userData.binding`
  - 不要在 `View` 中到处写 `getChildByName()`
  - `Node`、`Button`、`Label`、自定义组件等常见场景都应先走声明式绑定，再考虑手动查找
- 只有在当前框架绑定能力无法覆盖的场景下，才允许手动查找节点
- 绑定名应和 prefab 节点命名保持一一对应

## 输入与场景约束

- 键盘输入优先落在 `BaseView.onKeyDown()` / `onKeyUp()` / `onKeyPressing()`
- 不要在业务模块里直接 `input.on(Input.EventType.KEY_DOWN, ...)` 处理键盘，除非用户明确要求绕过框架
- 鼠标、触摸如果只是 UI 交互，仍应优先放在 `View`
- 鼠标、触摸如果确实是场景瞄准、拖拽、选点这类“世界交互”，可以由 `SceneController` 采集，但最终也应回写到 `Service`
- 不要让 `View`、`Service`、`SceneController` 各自维护一份输入状态
- 输入状态要有唯一真相源，默认放在 `Service`

推荐模式：

```txt
BattleView.onKeyDown/onKeyUp
  -> BattleService.setMoveState(...)
  -> BattleSceneController 读取 BattleService.inputState
  -> 驱动坦克移动/旋转/射击
```

如果是场景级模块，必须显式检查：

1. 是否存在 `xxx-view.ts`
2. 是否存在 `xxx-view.prefab`
3. `xxxService` 是否继承 `BaseService`
4. `SceneOptions.autoOpenViews` 是否接通该模块 View
5. 是否把输入错误地下沉到了 `SceneController`

## `uuid` 和压缩 `uuid` 规则

1. 原始 `uuid`
   - 来自脚本或资源的 `.meta`
   - 示例：

```json
{
  "uuid": "cc6f7452-aee2-4717-98f4-b12b43c67c19"
}
```

1. 压缩 `uuid`
   - 用在 prefab / scene 的自定义脚本组件 `__type__`
   - 示例：

```txt
cc6f7RSruJHF5j0sStDxnwZ
```

1. 记忆法
   - `meta.uuid = 原始 uuid`
   - `prefab.__type__ = 压缩 uuid`
2. 常见错误
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

### 4. 场景模块没有 View

按这个顺序查：

1. `xxxService` 是否错误地没有继承 `BaseService`
2. `viewOptions()` 是否缺失
3. 是否遗漏了 `xxx-view.ts` 和 `xxx-view.prefab`
4. `SceneOptions.autoOpenViews` 是否为空
5. 是否误把所有输入和生命周期都堆进了 `SceneController`

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

### 3. 场景级模块

```ts
@ccclass("BattleService")
@Container.injectable()
export class BattleService extends BaseService<{}, BattleEvents, void> {
    public viewOptions(): OpenViewOptions<void> {
        return new OpenViewOptions<void>(
            this.assetSvr.getOrCreateAssetHandle("main-ui-res", Prefab, "battle-view"),
            UIAnimaOpenMode.NONE,
            UIShowType.FullScreenView,
        );
    }
}
```

```ts
@ccclass("BattleView")
export class BattleView extends BaseView<BattleService> {
    public override onKeyDown(event: EventKeyboard): void {
        // 在这里把键盘输入写回 Service，而不是直接写 SceneController
    }
}
```

```ts
await sceneSvr.switchScene(
    createBattleSceneOptions(assetSvr, sceneConfig, [{ service: BattleService }]),
    new BattleSceneController(),
);
```

## 最小验证

运行时模块至少验证：

- prefab 已被 asset-db 识别
- 脚本已被识别为 `cc.Script`
- prefab 没有丢资源引用
- 打开界面时不报 `Missing class`
- 绑定字段能正确赋值
- 按钮点击能走到 Service
- 场景级模块已实际打开 `xxxView`
- 键盘输入没有直接挂在 `SceneController`

## 输出要求

最终说明优先包含：

1. 模块目录结构
2. `Service / View / Events / VM` 的职责划分
3. 绑定策略是否遵循框架约定
4. prefab / `.meta` / `uuid` / 压缩 `uuid` 的处理方式
5. `asset-db` 刷新与验证步骤
