---
name: "ksgames26-runtime-ui-scene-builder"
description: "Builds ksgames26 runtime UI and scenes. Use for BaseService/BaseView flows, reusable Prefabs, Widget adaptation, shared UI bundles, sprite atlases, and UI draw-call verification."
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

## 多分辨率布局

每次创建或修改页面，都要明确窗口增宽、变高或变短时，哪些区域获得这部分空间，哪些元素应保持尺寸。先看项目启动入口的设计分辨率与策略。使用本框架的自动策略时，由启动组件调用 `listenAutoDesignResolutionSize` 并在销毁时解绑；各页面依据当前可见区域布局。

- **先约束父容器，再定位子节点。** 全屏内容根用 Widget 四边贴父级。头部与底栏左右拉伸并分别贴顶、贴底；两侧入口行左右拉伸。希望 iPad 利用新增宽度时，避免把整页锁在设计稿宽度、整体放大或用黑边填空。
- **分别处理背景和主体。** 可延展的环境层左右铺满；需要保持比例的车辆、角色或插画独立成层，按稿件居中或贴边定位。按钮、图标和文字保持可读尺寸；通常让位置和间距随屏宽变化。
- **按设计关系选 Widget。** 固定边距用绝对值，中间项用居中对齐，随宽度分布的项用百分比偏移。例如五项底栏可让首尾分别贴左、贴右，第三项居中，第二、四项以水平中心作负、正百分比偏移。百分比按各自设计稿确定。短屏空间不足时调整间距、换行或滚动，并保留主操作和返回入口。
- **异形屏按节点适配。** 先读 `game-framework/model-view/binding-and-fix-special-shaped-screen.ts`。对确需避让的 `BaseView` / `BaseViewComponent` 绑定字段，通过 `userData.specialShapedScreen` 按节点的 Widget 选择 `fixTop`、`fixBottom` 或 `fixWxRightTop`。同一边距只处理一次。不要默认创建全页 `SafeArea` 容器，也不要让脚本反复写回 Widget 管理的尺寸和位置。
- **以手调 Prefab 为基准。** 用户已经在 Creator 调好布局时，先比较节点层级、锚点、对齐边和绝对值／百分比模式，再核对运行脚本及生成器是否会覆盖它。确认生成源同步前，保留手调结果。

## 强约束

- 跨页面复用的头部、按钮、面板和高频图标统一归属项目的 `common` Bundle。页面嵌套共享 Prefab，页面专用素材留在业务 Bundle。先查现有打包工程和帧名，避免各页面重复导入同一图片。
- 公共小图先建可重建的静态图集工程：原始切图与打包配置纳入版本管理，图集纹理、描述文件及 Creator 导入的稳定 `.meta` 进入对应 Bundle。按同屏使用和加载生命周期分页，背景、独立大图与特殊采样材质单独处理。
- 在 Creator 导入图集后，静态 Prefab 的 Sprite 必须引用 **SpriteAtlas 的 SpriteFrame 子资源**；生成器读取实际子资源 UUID。动态换图通过框架公开的 AssetService 获取 SpriteAtlas 句柄并按帧名绑定。移除运行包里的散图前，核对 Prefab、代码及生成源已全部切换，检查透明留白、裁切偏移和九宫格边距。

- 界面结构优先使用 Creator 可直接编辑的 Prefab：静态节点层级、组件、图片、尺寸和位置由 Prefab 持有；脚本负责绑定、交互、数据、动画及必要的安全区适配，不在运行时用代码拼装固定界面。
- 更新已有 Prefab 或素材时先确认唯一编辑源；素材导入、构建或重生成脚本不能无提示清空或覆盖人工调整。已有由生成器维护的界面遵循其项目约定，不擅自改变生成源。
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
- 同一次 Creator 预览中，从设计尺寸稍微拉宽，继续拉到 iPad 比例，再检查短屏、长屏并缩回原尺寸。检查实际画布、背景覆盖、按钮边界、文字遮挡和点击位置，确认恢复后布局一致。对刘海、底部手势区和小游戏胶囊分别检查相关节点，区分模拟结果与目标设备实测。
- 图集变更后在 Creator 检查实际 SpriteFrame 共用预期纹理，并验证重打图集后的帧名和引用。在相同设备、页面、分辨率及状态下比较 Draw Calls；如未下降，检查绘制顺序、材质、Label 和 Mask 造成的批次中断，分别记录引用核查与运行测量。

## 输出要求

最终说明里优先给：

1. 本次方案如何落在 `Service / View / ViewComponent`
2. 是否改动了 `UIService`、`SceneService` 或底层复用机制
3. 需要关注的生命周期风险点
4. 最小接入示例或调用方式
