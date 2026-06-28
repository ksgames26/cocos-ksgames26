---
name: "ksgames26-editor-extension-author"
description: "Maintains the ksgames26 editor extension. Invoke when adding or updating panels, menus, inspectors, scene hooks, asset-db integration, or template generation."
---

# Ksgames26 Editor Extension Author

为 `extensions/ksgames26` 维护编辑器扩展侧能力。

## 适用场景

- 用户要新增或修改扩展面板
- 用户要新增菜单项、消息注册或主进程方法
- 用户要扩展 Inspector、Hierarchy 菜单、Assets 菜单或 Scene Script
- 用户要调整模板生成入口或静态模板资源
- 用户要排查扩展 build 后为什么没有在 Creator 内生效

## 必看文件

- `package.json`
- `source/main.ts`
- `source/panels/default/index.ts`
- `source/inspector/view-state.ts`
- `source/inspector/i18n-label.ts`
- `source/inspector/i18n-sprite.ts`
- `source/hierarchy/hierarchy-menu.ts`
- `source/assets/assets-db.ts`
- `source/scene/scene.ts`
- `source/createTemplete/index.ts`
- `static/template/*`
- `static/style/*`
- `README.md`

## 核心认知

1. `package.json` 是扩展注册中心。
2. `source/*` 是编辑器侧源码，`dist/*` 是构建后的实际入口。
3. `source/main.ts` 负责绝大多数消息响应、配置读取、bundle 缓存和 i18n 刷新协调。
4. Inspector 扩展、菜单、面板、Scene Script 都必须和 `package.json` 的 `contributions` 保持一致。

## 工作步骤

1. 先从 `package.json` 找到当前能力挂载点：
   - `panels`
   - `contributions.menu`
   - `contributions.messages`
   - `contributions.inspector`
   - `contributions.scene`
   - `contributions.assets`
   - `contributions.hierarchy`
2. 再追到 `source/main.ts` 或对应 `source/*` 模块，确认真正的处理逻辑。
3. 如果是面板类需求：
   - 同时检查 `source/panels/*`、`static/template/*`、`static/style/*`
   - 明确是主进程消息问题、面板渲染问题，还是静态资源路径问题
4. 如果是 Inspector / Scene 联动：
   - 同时检查 Inspector 面板代码和 Scene Script 调用链
   - 确认 `Editor.Message.request(...)` 的 message 名称、参数和返回值一致
5. 如果是模板生成：
   - 从 `source/createTemplete/index.ts` 入手
   - 明确下载、解压、移动资源、刷新 asset-db 的完整链路
6. 改完后必须重新构建扩展，再检查 `dist/*` 输出是否与 `package.json` 指向一致。

## 强约束

- 不要只改 `source/*` 而忘记对应的 `package.json` 注册点
- 不要把编辑器逻辑误写到 `game-framework/*`
- 不要直接修改 `dist/*` 产物，除非用户明确要求处理构建结果
- 新增消息时必须同时定义：
  - `package.json` 的 `contributions.messages`
  - `source/main.ts` 中的实际方法
- 新增面板时必须同时考虑：
  - 面板入口
  - 静态模板
  - 样式
  - 菜单入口
  - 构建产物路径

## 排查要点

- 菜单存在但点击无效：
  - 先检查 `message` 名称和 `methods` 映射
- Inspector 渲染了但行为不对：
  - 先检查 `Editor.Message.request(...)` 的调用链
- 构建成功但 Creator 不加载：
  - 先检查 `dist/*` 路径是否和 `package.json` 对齐
- 模板生成只下载了一半：
  - 先检查下载、解压、移动和 `asset-db refresh` 四步日志

## 最小验证

```bash
npm run build
```

验证时至少确认：

- 相关菜单项可见
- 面板或 Inspector 能正常打开
- 目标消息链路能走通
- `dist/*` 已生成对应入口

## 输出要求

最终说明里优先给：

1. 这次改动影响了哪些扩展挂载点
2. 需要同步修改的源码文件
3. 是否需要重新 build
4. 在 Creator 内如何做最小人工验证
