# 给后续 Agent 的高效汉化指南

本仓库的汉化**没有**把中文写进组件，而是集中在一张词典里。
按照下面的流程做增量翻译，通常只需几分钟，不要重写组件。

## 文件地图

| 文件 | 作用 |
| --- | --- |
| `ui/src/i18n/zh-CN.overlay.json` | **唯一译文词典**：`"English": "中文"` |
| `ui/src/i18n/overlay.ts` | 运行时查表、模板插值、DOM 兜底翻译 |
| `ui/scripts/babel-plugin-paperclip-zh.cjs` | 构建期把 JSX 文案包成 `__pcT(...)` / `__pcTt(...)` |
| `ui/scripts/extract-i18n.mjs` | 从 `ui/src/**/*.tsx` 抽取英文文案 |
| `ui/scripts/translate-i18n.mjs` | 调 DeepSeek 批量翻译缺失项（断点续跑） |
| `ui/vite.config.ts` | 注册 `paperclip-zh-overlay` 预处理器 |

## 标准流程（增量优先）

```bash
# 1. 只抽取，不改英文源码
node ui/scripts/extract-i18n.mjs --json > ui/scripts/strings.json

# 2. 看还缺多少（脚本只翻缺失项）
node ui/scripts/translate-i18n.mjs

# 3. 构建
pnpm --filter @paperclipai/ui build

# 4. 部署到本地实例后验证
```

环境变量：

```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-pro      # 默认
I18N_BATCH=40                        # 每批条数
I18N_CONCURRENCY=4                   # 并发
```

## 效率要点

1. **永远先增量**：脚本会跳过词典里已有的 key。合并上游后直接重跑即可，
   不要 `--force` 全量重翻（会消耗大量 token 且可能改坏已确认的译文）。
2. **不要改组件里的英文**：`__pcT` 在构建期注入。改组件会扩大上游 diff。
3. **key 必须完全匹配渲染文本**：保留标点、空格、大小写。词典是精确匹配。
4. **占位符必须保留**：`{name}`、`{{0}}`、`%s`、`$1`、`<tag>` 会被自动校验，
   不一致时该条自动回退英文，不会渲染出坏文本。
5. **动态模板**用 `{{0}}`、`{{1}}` 表示插值；运行时由 `__pcTt` 填回。
6. **构建后必须验证**：至少确认 `__pcT(` 出现在构建产物里，并截图检查 2~3 个页面。
7. **合并上游后**：`extract → translate` 只会处理新增文案，旧译文自动复用。

## 查漏

浏览器控制台执行：

```js
copy([...window.__pcMissing].join("\n"))
```

会复制当前页面出现过的、词典里没有的英文原文，把它们补进
`zh-CN.overlay.json` 即可。

## 不建议的做法

- 不要把中文直接写进 `.tsx`（会破坏集中式词典，且难以跟进上游）。
- 不要删除 `NOTICE` / `LICENSE` 中的上游署名。
- 不要翻译 `<code>` / `<pre>` / `<style>` / `<script>` 内部的代码片段
  （抽取器和插件已自动跳过）。
