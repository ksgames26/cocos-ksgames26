---
name: "ksgames26-i18n-workflow-maintainer"
description: "Maintains the ksgames26 i18n workflow. Invoke when changing i18n config parsing, file watching, inspector preview, locale switching, or i18n sprite resolution."
---

# Ksgames26 I18N Workflow Maintainer

为 `extensions/ksgames26` 维护 i18n 配置链路、Inspector 预览和运行时多语言能力。

## 适用场景

- 用户要修改 `xlsx` / `xls` / `csv` 的 i18n 配置解析
- 用户要调整默认语言、起止行列、项目配置项或自动刷新逻辑
- 用户要修改 `I18NLabel` / `I18NRichText` / `I18NSprite` 的 Inspector 预览
- 用户要处理 bundle 路径、多语言图片解析或 plist spriteFrame 问题
- 用户要让运行时 `I18NService` 和编辑器配置链路保持一致

## 必看文件

- `README.md`
- `package.json`
- `source/main.ts`
- `source/misc/parse_i18n.ts`
- `source/inspector/i18n-label.ts`
- `source/inspector/i18n-sprite.ts`
- `game-framework/i18n/i18n-label.ts`
- `game-framework/i18n/i18n-richtext.ts`
- `game-framework/i18n/i18n-sprite.ts`
- `game-framework/i18n/i18n-services.ts`
- `game-framework/services/asset-service.ts`

## 核心链路

1. 项目配置通过 `Editor.Profile` 读写。
2. `source/main.ts` 负责：
   - 读取 i18n 配置路径与解析范围
   - 监听配置文件变化
   - 解析文本和图片键值
   - 把默认语言变化同步给 scene script
3. `source/misc/parse_i18n.ts` 负责把 `csv/xlsx/xls` 解析为 `I18NData`
4. Inspector 通过 `Editor.Message.request("ksgames26", "i18n_getInfoOfI18NConf", ...)` 获取预览值
5. 运行时 `I18NService` 负责语言切换、文本获取和图片句柄获取

## 工作步骤

1. 先确认需求落在编辑器侧、运行时侧，还是两边都要改。
2. 如果是配置解析问题：
   - 先看 `parse_i18n.ts`
   - 再看 `source/main.ts` 如何传入路径、范围和默认语言
3. 如果是 Inspector 预览问题：
   - 先看 `source/inspector/i18n-label.ts` 或 `source/inspector/i18n-sprite.ts`
   - 再追它调用的 `i18n_getInfoOfI18NConf`
4. 如果是运行时文本或图片问题：
   - 先看 `game-framework/i18n/i18n-services.ts`
   - 再看 `AssetService` 如何加载 `SpriteFrame` / `SpriteAtlas`
5. 如果需求涉及语言切换：
   - 同时确认编辑器默认语言、scene script 通知和运行时 `I18NService.locale` 是否一致

## 强约束

- 不要只改 Inspector 展示层而忽略底层配置解析
- 不要只改运行时 `I18NService` 而忽略编辑器侧 `i18n_getInfoOfI18NConf`
- i18n 图片路径协议必须同时覆盖：
  - 普通 `bundle/path`
  - 图集 `bundle/path.plist/spriteFrame`
- 配置项变更后要检查：
  - `package.json` 中的 project profile 字段
  - `source/main.ts` 中读取这些字段的 key
- 文件监听相关改动要特别注意重复监听和切换路径后的 unwatch 行为

## 常见误区

- 只修 `parseExcel()`，没有同步考虑 `parseCSV()`
- 只返回文本值，没有兼容 sprite 类型请求
- 修改默认语言逻辑后，忘了把变化同步到 scene script
- 处理 sprite key 时，只支持普通资源路径，不支持 plist/frame 形式

## 最小验证

```bash
npm run build
```

人工验证至少覆盖：

- 文本 key 在 Inspector 内能预览
- sprite key 在 Inspector 内能返回正确 uuid 或空值
- 修改 i18n 配置文件后能自动刷新
- 切换默认语言后运行时文本或图片能跟着更新

## 输出要求

最终说明里优先给：

1. 修改影响的是解析、监听、Inspector 还是运行时服务
2. 新支持或修复了哪种 i18n 数据格式
3. 是否影响默认语言切换或 sprite 路径协议
4. 最小回归验证步骤
