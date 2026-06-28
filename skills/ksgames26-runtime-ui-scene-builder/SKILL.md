---
name: "ksgames26-runtime-ui-scene-builder"
description: "Builds runtime UI and scene architecture on ksgames26. Invoke when creating or refactoring BaseService/BaseView flows, UIService usage, scene lifecycle, ViewState, or view reuse."
---

# Ksgames26 Runtime UI Scene Builder

基于 `ksgames26/game-framework` 维护运行时 UI、Scene 和 Service 分层架构。

## 适用场景

- 用户要新增一个界面或弹窗
- 用户要把业务逻辑从组件脚本整理到 `BaseService`
- 用户要扩展 `UIService`、`SceneService`、`BaseView` 或 `BaseViewComponent`
- 用户要处理 `ViewState`、`ViewLock`、push-pop view、异步打开关闭或安全区适配
- 用户要设计一个符合框架风格的中大型 UI 模块

## 必看文件

- `README.md`
- `game-framework/game-framework.ts`
- `game-framework/model-view/base-service.ts`
- `game-framework/model-view/base-view.ts`
- `game-framework/model-view/base-view-component.ts`
- `game-framework/model-view/open-lock/view-lock.ts`
- `game-framework/model-view/state/view-state.ts`
- `game-framework/services/ui-service.ts`
- `game-framework/services/scene-service.ts`
- `game-framework/services/task-service.ts`
- `game-framework/services/asset-service.ts`
- `game-framework/utils/observer-value.ts`

## 设计原则

1. `BaseService` 管状态和业务逻辑。
2. `BaseView` 管界面生命周期和关闭流程。
3. `BaseViewComponent` 管局部节点组和局部交互。
4. `UIService` 统一负责打开、关闭、层级、动画、push-pop 和组件挂载。
5. `SceneService` 统一负责大场景生命周期和场景内 UI 协调。

## 工作步骤

1. 先判断需求属于：
   - 单界面问题
   - 多界面调度问题
   - 场景切换问题
   - 公共组件或状态机问题
2. 如果是单界面或弹窗：
   - 先设计 `xxxService extends BaseService`
   - 再定义 `viewOptions()`
   - 再实现 `xxxView extends BaseView`
3. 如果界面包含复杂局部区域：
   - 把局部节点拆到 `xxxComponent extends BaseViewComponent`
   - 不要把所有交互都堆进 `BaseView`
4. 如果界面有多状态切换：
   - 优先考虑 `ViewState`
   - 明确默认状态、状态切换动画和编辑器预览需求
5. 如果要防止重复打开：
   - 优先考虑 `ViewLock` 或 `ViewComponentLock`
6. 如果需求涉及顺序动画、异步关闭、等待结果：
   - 同时检查 `TaskService` 和 `BaseView` 的关闭/等待行为

## 强约束

- 不要把业务状态直接散落在节点脚本里，优先收敛到 `BaseService`
- 不要绕开 `UIService` 手动管理大量 view 生命周期
- 新界面设计时必须先确定：
  - prefab 资源来源
  - `OpenViewOptions`
  - layer
  - showType
  - 是否 push-pop
- `game-framework` 内部改动优先保持相对导入，不要把内部实现写成 `db://` 导入
- 修改 `UIService`、`SceneService` 这类底层能力时，要评估对现有 view 生命周期的连带影响

## 常见误区

- 直接在 `BaseView` 里写满业务逻辑
- 打开界面时不经过 `OpenViewOptions`
- 忽略 `pushPopView` 与普通 view 的差异
- 需要复用的弹窗没有使用 `ViewLock`
- 只改显示层，不考虑 `ObserverValue`、任务流和事件流

## 最小验证

```bash
npx tsc -p tsconfig.game-framework.json
```

人工验证至少覆盖：

- 界面能正确打开和关闭
- 所属 layer 与 showType 正确
- 重复打开行为符合预期
- 场景切换后界面或场景节点没有遗留脏状态

## 输出要求

最终说明里优先给：

1. 本次方案如何落在 `Service / View / ViewComponent`
2. 是否改动了 `UIService`、`SceneService` 或底层复用机制
3. 需要关注的生命周期风险点
4. 最小接入示例或调用方式
