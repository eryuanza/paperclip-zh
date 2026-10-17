# Paperclip 简体中文版（非官方 Fork）

本仓库是 [paperclipai/paperclip](https://github.com/paperclipai/paperclip) 的非官方简体中文 Fork，
用于把 Paperclip 的 Web 界面完整汉化，同时尽量少改动上游业务代码，方便持续跟进上游更新。

- 上游仓库：<https://github.com/paperclipai/paperclip>
- 上游提交：`5555817c2b18a1a5ebc3a3b01883c1b12b86df5a`（2026-10-16）
- 许可证：MIT（见 [LICENSE](./LICENSE)）
- 上游版权：Copyright (c) 2025 Paperclip AI

> 本 Fork 与 Paperclip AI 无隶属或背书关系，"Paperclip" 等名称与标识归其各自权利人所有。
> 完整署名见 [NOTICE](./NOTICE)。

## AI 构建声明

**本仓库的简体中文改造完全由 AI 编程代理生成**，基于上游 Paperclip 源码构建，包括：

- 构建期 Babel 翻译插件
- 运行时覆盖层与 DOM 兜底层
- 12,000+ 条的 `zh-CN` 词典
- 文案抽取/批量翻译脚本
- Fork 文档与署名文件

上游 Paperclip 本体由 Paperclip AI 及其贡献者开发，**不是**本 Fork 的 AI 产物。

译文由机器批量生成，未经人工逐条审校；术语和语气可能存在不一致，欢迎提 PR 修正。

> 后续 agent 请先阅读 [I18N-AGENT-GUIDE.md](./I18N-AGENT-GUIDE.md)，
> 按里面的流程增量翻译，避免重复全量翻译。

## 汉化是怎么做的

上游的界面文案是硬编码在 React 组件里的。逐文件改写成 `t("key")` 会产生上万行 diff，
以后几乎无法合并上游更新。

因此本 Fork 增加了一层**集中式翻译覆盖层**：

1. `ui/scripts/babel-plugin-paperclip-zh.cjs`
   在构建时把 JSX 文本和常见属性（`title` / `placeholder` / `aria-label` / `alt` 等）
   包成 `__pcT("英文原文")`。
2. `ui/src/i18n/overlay.ts`
   在运行时查表，返回中文；查不到就原样返回英文。
3. `ui/src/i18n/zh-CN.overlay.json`
   **唯一的翻译词典**：`"English": "中文"`。

这样：

- 业务组件保持上游原样，上游 diff 很小；
- 新增的上游英文会自动回退英文，不会报错；
- **改翻译 = 改一个 JSON 文件，不需要碰组件代码**。

## 修改/补充翻译

直接编辑 `ui/src/i18n/zh-CN.overlay.json`：

```json
{
  "Cancel": "取消",
  "Save changes": "保存更改"
}
```

key 必须与界面上渲染的英文原文**完全一致**（含标点与空格）。

### 查看哪些文案还没翻译

在浏览器控制台执行：

```js
copy([...window.__pcMissing].join("\n"))
```

会把当前页面出现过的未翻译英文复制到剪贴板。

### 重新抽取与批量翻译

```bash
node ui/scripts/extract-i18n.mjs          # 统计
node ui/scripts/extract-i18n.mjs --json > ui/scripts/strings.json

# 可选：用 DeepSeek 批量补齐缺失翻译（断点续跑）
set DEEPSEEK_API_KEY=sk-...
node ui/scripts/translate-i18n.mjs
```

## 构建

```bash
pnpm install
pnpm --filter @paperclipai/ui build
```

构建产物在 `ui/dist`，由 server 的 `ui-dist` 静态服务加载。

## 同步上游

```bash
git remote add upstream https://github.com/paperclipai/paperclip.git
git fetch upstream
git merge upstream/main
```

若合并后出现新的英文文案，重新执行一次抽取/翻译脚本即可；旧翻译不受影响。

详细的高效工作流见 [I18N-AGENT-GUIDE.md](./I18N-AGENT-GUIDE.md)。

## 许可证与署名

本项目沿用上游 MIT 许可证，并保留原始版权声明。
分发或再发布时请同时保留 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
