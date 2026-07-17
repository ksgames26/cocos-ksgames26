# ksgames26 Skills

这个目录存放只服务 `extensions/ksgames26` 的本地技能。

## Skills

- `ksgames26-editor-extension-author`
  - 维护编辑器扩展能力，包括 panel、menu、inspector、hierarchy、asset-db、scene script 与模板生成入口
- `ksgames26-i18n-workflow-maintainer`
  - 维护 i18n 配置解析、配置监听、Inspector 预览、运行时语言切换与多语言图片解析
- `ksgames26-runtime-ui-scene-builder`
  - 基于 `BaseService`、`BaseView`、`UIService`、`SceneService` 设计和扩展运行时 UI / Scene 架构
  - 场景级模块也必须遵循 `BaseService + BaseView + SceneController`，不要退化成只有 `Service + SceneController`
- `ksgames26-runtime-module-builder`
  - 维护运行时模块的整套落地流程，包括 Service/View/Events/VM、声明式绑定、prefab/meta、uuid 与 asset-db 刷新
  - 运行时 View 默认必须走 `binding-and-fix-special-shaped-screen.ts` 对应的 `@property + userData.binding` 绑定，不要手写 `getChildByName()`
- `ksgames26-runtime-network-config-integrator`
  - 维护 `ConfService`、`ProtobufSerializer`、`ColyseusSdk`、`Room` 相关的数据配置与联网集成

## 通用约束

- 文档和实现必须以 `README.md` 与真实源码为准，不能把未实现能力写成已支持
- 编辑器侧改动优先落在 `source/*`，运行时框架改动优先落在 `game-framework/*`
- 不要混淆两条入口：
  - 编辑器扩展通过 `package.json` 的 `contributions` 和 `dist/*` 接入
  - 运行时代码通过 `asset-db` 挂载，对外以 `db://ksgames26/game-framework` 使用
- 场景级运行时模块的输入真相源默认放在 `BaseService`，键盘采集优先落在 `BaseView`，不要直接把键盘状态塞进 `SceneController`
- `game-framework` 内部文件优先使用相对导入；外部项目代码优先从 `db://ksgames26/game-framework` 导入
- 任何涉及菜单、消息、面板、Inspector 的改动，都要同步检查 `package.json` 与 `source/main.ts` 是否仍然一致

## 最小验证

- 编辑器侧改动后优先执行：

```bash
npm run build
```

- 运行时框架改动后优先执行：

```bash
npx tsc -p tsconfig.game-framework.json
```

- 如果同时改了两侧，两个检查都要执行
