# ksgames26

`ksgames26` 是一个面向 Cocos Creator `3.8.7+` 的综合扩展包，包含两部分能力：

- 编辑器扩展：面板、菜单、Inspector 扩展、Hierarchy 菜单、Scene 扩展、资产菜单、i18n 配置解析与监听、项目模板生成。
- 运行时框架：通过 `asset-db.mount` 挂载到 `db://ksgames26/*`，提供 UI、场景、任务、资源、音频、i18n、状态机、protobuf、Colyseus、常用组件与工具库。

这个仓库已经不是默认模板示例，而是把原有多套 Cocos 扩展能力整合进了一个独立扩展包中。

## 环境要求

- Node.js
- Cocos Creator `>= 3.8.7`

## 安装与构建

```bash
npm install
npm run build
```

构建完成后：

- 编辑器扩展入口输出到 `dist/*`
- 运行时源码位于 `game-framework/*`
- 运行时独立类型检查可使用 `tsconfig.game-framework.json`

## 功能概览

### 编辑器侧

- `默认面板`：Vue 3 面板示例，用于演示扩展面板打开与消息通讯。
- `set-name` 面板：扩展内的附加面板。
- `Inspector 扩展`：
  - `ViewState`
  - `I18NLabel`
  - `I18NRichText`
  - `I18NSprite`
- `Scene 扩展`：注册场景脚本扩展。
- `Hierarchy 菜单`：为根节点和普通节点提供扩展菜单。
- `Assets 菜单`：提供资源面板相关扩展入口。
- `项目配置`：在 Project 设置中维护 i18n 表路径、解析范围、默认语言等参数。
- `i18n 配置监听`：支持读取 `xlsx`、`xls`、`csv`，并在配置文件变更后自动重新解析。
- `模板生成`：通过菜单触发 `create_template`，用于生成框架模板或初始化内容。

### 运行时侧

运行时代码挂载在：

```ts
db://ksgames26/*
```

统一导出入口：

```ts
import { UIService, SceneService, TaskService } from "db://ksgames26/game-framework";
```

已整合的主要模块包括：

- `core`：容器、日志、事件分发、任务、装饰器、基础工具。
- `services`：`AssetService`、`AudioService`、`ConfService`、`SceneService`、`TaskService`、`UIService`、`PalService`。
- `model-view`：`BaseService`、`BaseView`、`BaseViewComponent`、`ViewLock`、`ViewState` 以及常用 UI 组件。
- `i18n`：`I18NLabel`、`I18NRichText`、`I18NSprite` 与 `I18NService`。
- `protobuf` / `protobuf-ts`：protobuf 编解码与消息类型支持。
- `client` / `room` / `colyseus`：联机房间和网络层能力。
- `structures` / `utils` / `intelligence` / `camera`：数据结构、计时器、状态机、相机组件等基础能力。

### `model-view` 详解

`model-view` 是这套运行时框架里最核心的一层，用来把“服务逻辑、界面视图、视图子组件、打开关闭控制、动画状态控制”组织成统一范式。

#### 1. 基础抽象

- `BaseService`
  - 作为单个界面或业务域的服务层基类
  - 默认接入 `AssetService`、`UIService`、`TaskService`、`I18NService`
  - 提供 `t()`、`h()`、`rpcService()`、`observerValue()`、`setValue()`、`getValue()` 等常用能力
  - 适合承载界面数据、事件派发、与其他服务通讯
- `BaseView`
  - 作为完整界面 Prefab 的基类
  - 负责持有 `service`、`options`、`args`
  - 统一处理界面打开、关闭、键盘控制、透明度过渡、异形屏绑定、关闭回调等待
  - 约定子类实现 `onClose()`
- `BaseViewComponent`
  - 作为挂在 `BaseView` 内部节点上的子组件基类
  - 自动注入所属 `view` 和 `service`
  - 支持 `asyncBinding`，适合动态实例化后再挂到 View 里的 Prefab 组件
  - 支持自身关闭、关闭后等待、异形屏修正、onShow 生命周期补齐

这套设计的目标是让业务代码更自然地分成：

- `Service` 管状态与逻辑
- `View` 管界面生命周期
- `ViewComponent` 管局部交互与局部节点

#### 2. 状态控制

- `state/view-state.ts`
  - 提供 `ViewState` 组件
  - 基于 `Animation` + `AsyncStateMachine` 做视图状态切换
  - 适合“页签切换”、“折叠展开”、“多状态按钮”、“步骤式 UI”这类用动画帧表达状态的场景
- 特点
  - 支持默认状态
  - 支持状态间过渡时间计算
  - 支持编辑器模式下预览
  - 已在编辑器侧注册对应 Inspector 扩展，便于直接配置

#### 3. 打开锁与复用控制

- `open-lock/view-lock.ts`
  - `ViewLock`
    - 防止同一个 View 被重复打开
    - 支持引用计数模式 `enableRefCount`
    - 适合 Loading、全局遮罩、单例弹窗这类需要“多方复用，但最终只保留一个实例”的界面
  - `ViewComponentLock`
    - 防止同一个子组件 Prefab 被重复 append
    - 适合 Tooltip、浮层、临时局部组件等场景

#### 4. 常用组件

`components/*` 下已经内置了一批可复用 UI 组件：

- `auto-asset/auto-sprite.ts`
  - 自动绑定和释放 `SpriteFrame` 资源句柄
- `animation/frame-animations.ts`
  - 帧动画辅助组件
- `circle-header/*`
  - 头像圆形裁切与远程头像处理
- `label/*`
  - `PopupLabel`
  - `SpecialLabel`
  - 文本弹字与特殊文本渲染能力
- `left-right-button.ts`
  - 左右切换式按钮控件
- `page-view-plus.ts`
  - 对 `PageView` 的增强封装
- `popup/popup-message.ts`
  - 通用弹出提示
- `resizable/*`
  - 对齐、自适应、按子节点重算尺寸、扩展 `Layout` 排版能力
- `scroll-view-plus.ts`
  - 对 `ScrollView` 的增强封装
- `rotate-around-circle.ts`
  - 环形旋转布局辅助
- `super-rich-text.ts`
  - 增强版富文本能力
- `view-group-nesting.ts`
  - 嵌套视图组相关能力
- `virtual-list/*`
  - 虚拟列表、吸顶列表、嵌套滚动配置、多列表分组协调
- `steer/*`
  - 摇杆相关材质与组件

#### 5. 适合怎么用

一个比较推荐的使用方式是：

1. 每个主界面定义一个 `xxxService extends BaseService`
2. 每个界面 Prefab 挂一个 `xxxView extends BaseView`
3. 界面中的复杂节点块拆成多个 `xxxComponent extends BaseViewComponent`
4. 如果是单例弹窗或复用型界面，用 `ViewLock`
5. 如果界面状态很多，用 `ViewState` 把状态切换交给动画状态机

这样做的好处是：

- UI 生命周期统一
- 业务逻辑不会散在各个节点脚本里
- 动态组件和异形屏适配都有现成机制
- 比较适合中大型项目的 UI 分层开发

### `services` 详解

`services` 是这套框架的运行时中枢，负责把资源、UI、场景、任务、音频、配置和平台适配这些横切能力收敛成统一服务层。通常项目启动时会先把这些 Service 注册进 `Container`，再由业务 `BaseService` 去消费它们。

#### 1. `UIService`

- 整个 UI 系统的核心调度器
- 负责：
  - 打开与关闭 `BaseView`
  - 管理 UI 层级，如 `Root`、`PopUp`、`Top`、`Mid`、`Bottom`
  - 区分 `FullScreenView`、`BlackBaseView`、`TransparentBaseView`
  - 维护 push/pop 视图栈
  - 动态 append `BaseViewComponent`
  - 键盘事件启用与禁用
- `OpenViewOptions` 是它的关键参数对象，里面定义了：
  - prefab 句柄
  - 动画模式
  - 显示类型
  - 打开参数 `args`
  - 层级与自定义层节点
  - view 名称
  - push/pop 模式

#### 2. `SceneService`

- 负责 3D 场景或大场景上下文的完整生命周期管理
- 核心能力：
  - 加载场景预制体
  - 场景预加载资源
  - 创建与销毁 3D 根节点
  - 场景切换
  - 场景级 UI 自动打开
  - 场景控制器 `SceneController` 生命周期回调
- 内置了清晰的阶段流转：
  - `None -> Loading -> Loaded -> Entering -> Running -> Exiting -> Exited -> Destroyed`
- 适合大厅、战斗、房间、地图等“场景切换驱动”的项目结构

#### 3. `AssetService`

- 负责统一资源加载、缓存、引用计数和释放
- 核心概念是 `AssetHandle`
- `AssetHandle` 负责：
  - 记录 bundle、路径、类型
  - 跟踪引用计数
  - 统一安全加载
  - 在引用归零时释放资源
- 支持的能力包括：
  - 常规 bundle 资源
  - 目录资源
  - 远程图片资源
  - Prefab 实例化配套资源控制
- 这个 Service 是 `UIService`、`AudioService`、i18n 资源加载等能力的底层基础

#### 4. `TaskService`

- 负责统一管理同步任务、异步任务和可等待任务句柄
- 适合解决：
  - 等待下一帧
  - 顺序任务调度
  - 异步流程串联
  - 可中断或可观察的任务执行
- 里面的 `TaskHandle` 提供：
  - Promise 化等待
  - 完成事件
  - 自动回收
  - 日志追踪开关
- 在 View 动画、异步绑定、资源预载、时序控制里都很常用

#### 5. `AudioService`

- 负责背景音乐和音效播放
- 特点：
  - 启动时创建独立音频根节点
  - 支持常驻节点
  - 区分 BGM 与 SFX
  - 内置音效 source 池
  - 通过 `AssetService` 加载 `AudioClip`
  - 支持单独控制音乐音量与音效音量
- 适合直接作为全局单例音频管理器使用

#### 6. `ConfService`

- 负责解析二进制配置表
- 依赖 `Byte` 和 `IGameFramework.ISerializable` 解码配置内容
- 当前支持的打包类型包括：
  - 单对象 `KV`
  - 列表 `LIST`
  - 映射 `MAP`
- 适合承接策划导出的表格二进制产物，在运行时统一转成可查询配置对象

#### 7. `PalService`

- `Pal` 可以理解为平台抽象层
- 负责封装登录平台、账号体系或宿主环境差异
- 通过 `IPal` / `ILoginAdapter` 做接口抽象
- 默认支持：
  - `EmptyPal` 空实现
  - `DefaultPal` 默认平台适配
- 常见用途：
  - 登录
  - 登出
  - 获取平台 `openId`
  - 注入自定义平台实现

#### 8. 它们之间怎么配合

一个典型关系可以理解为：

- `AssetService` 提供资源基础设施
- `UIService` 基于资源系统管理界面
- `SceneService` 基于资源系统和 UI 系统管理场景上下文
- `AudioService` 基于资源系统播放音频
- `TaskService` 给 UI、场景、资源加载提供时序调度
- `ConfService` 提供业务配置数据
- `PalService` 提供平台登录与宿主能力抽象
- `BaseService` 再把这些基础 Service 组合成具体业务服务

#### 9. 推荐初始化顺序

通常建议项目启动时按这个顺序准备：

1. `AssetService`
2. `TaskService`
3. `UIService`
4. `SceneService`
5. `AudioService`
6. `ConfService`
7. `PalService`

这样后续业务 Service 在 `Container.get(...)` 时，依赖基本都已经齐全。

## 目录结构

```text
ksgames26/
|- source/              编辑器扩展源码
|- dist/                编辑器扩展构建产物
|- game-framework/      运行时框架源码，挂载到 db://ksgames26/*
|- static/              面板模板与样式
|- i18n/                扩展自身的中英文文案
|- package.json         扩展注册信息
|- tsconfig.json        编辑器扩展构建配置
|- tsconfig.game-framework.json 运行时独立类型检查配置
```

## 常用入口

启用扩展后，可以通过以下菜单访问主要功能：

- `面板 -> ksgames26 -> 默认面板`
- `开发者 -> ksgames26 -> 发送消息给面板`
- `ksgames26/game-framework -> Create Template`
- `ksgames26/game-framework -> i18n 配置刷新/监听相关入口`

其中：

- `open-panel` 会打开默认面板。
- `send-to-panel` 会向默认面板发送消息，并调用面板的 `hello` 方法。
- `create_template` 会调用扩展主进程里的模板生成逻辑。

## i18n 配置说明

扩展会从项目配置里读取以下信息：

- i18n 配置文件路径
- 起始解析单元格
- 结束解析单元格
- 默认语言

当前支持：

- `xlsx`
- `xls`
- `csv`

解析后可以为编辑器 Inspector 提供：

- 文本 key 对应的默认语言内容
- Sprite 资源路径解析
- 图集 spriteFrame 定位
- 配置文件变更后的自动刷新

## 开发说明

- 编辑器扩展源码修改后执行 `npm run build`
- 运行时框架建议单独执行类型检查：

```bash
npx tsc -p tsconfig.game-framework.json
```

- `game-framework` 内部源码应优先使用相对导入，不建议在内部再次通过 barrel 入口回引自身
- 对外业务代码建议统一从 `db://ksgames26/game-framework` 导入

## 适用场景

这个扩展适合用作：

- Cocos Creator 项目的基础运行时框架
- UI / Scene / Service 分层开发骨架
- i18n 编辑器工具链
- protobuf / Colyseus 集成基础设施
- 公司或团队内部统一扩展包的单仓发布形态
