/**
 * Paperclip 简体中文覆盖层 —— 构建期 Babel 插件。
 *
 * 目标：不改业务组件里的英文文案，而是在编译时把所有可见的 JSX 文案包成
 * `__pcT("原文")`。运行时 `__pcT` 查 `ui/src/i18n/zh-CN.overlay.json`
 * （英文原文 → 中文），查不到就原样返回。
 *
 * 好处：
 *  - 翻译集中在一个 JSON 里，后续人或 agent 只改词典即可；
 *  - 上游 Paperclip 源码的 diff 很小，方便持续合并；
 *  - 新增上游英文文案会自动回退英文，不会报错。
 *
 * 只处理 ui/src 下的文件，避免影响依赖库。
 */

const DEFAULT_ATTRS = new Set([
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "alt",
  "label",
  "description",
  "tooltip",
  "message",
  "emptyMessage",
  "heading",
  "subheading",
  "subtitle",
  "help",
  "hint",
  "caption",
  "summary",
  "body",
  "text",
  "confirmText",
  "cancelText",
  "submitText",
  "actionLabel",
  "errorMessage",
  "successMessage",
  "note",
  "legend",
]);

const SKIP_TAGS = new Set(["code", "pre", "style", "script", "textarea", "kbd", "samp"]);

function hasLetter(value) {
  return /[A-Za-z]/.test(value);
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeCode(value) {
  if (/^__[A-Za-z0-9_]+__$/.test(value)) return true; // __all__, __none__
  if (/^__/.test(value)) return true; // __unfiled, __latest__
  if (/^_[A-Za-z][A-Za-z0-9_]*$/.test(value)) return true; // _blank, _ungrouped
  if (/^!\[/.test(value)) return true; // markdown image syntax
  if (value.startsWith("--")) return true;
  if (value.includes("--") && /^[A-Za-z0-9_-]+$/.test(value)) return true;
  if (/^(var|calc|rgba?|hsla?|url)\(/.test(value)) return true;
  // Tailwind / CSS utility strings that sit in JSX by mistake
  if (value.includes("[&")) return true;
  if (/\b(px|py|pl|pr|pt|pb|gap|text|bg|border|rounded|size|w|h|m|mt|mb|ml|mr|mx|my|space-x|space-y)-[0-9a-z[]/.test(value)) return true;
  return false;
}

function insideSkippedTag(path) {
  const parent = path.parentPath;
  if (!parent || !parent.isJSXElement()) return false;
  const name = parent.node.openingElement.name;
  return name.type === "JSXIdentifier" && SKIP_TAGS.has(name.name);
}

function templateShape(node) {
  let shape = "";
  for (let i = 0; i < node.quasis.length; i++) {
    shape += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
    if (i < node.expressions.length) shape += `{{${i}}}`;
  }
  return shape;
}

module.exports = function paperclipZhOverlay(api, options = {}) {
  const t = api.types;
  const attrs = new Set(options.attributes || DEFAULT_ATTRS);
  const include = options.include || /[\\/]ui[\\/]src[\\/]/;

  const isTarget = (filename) => Boolean(filename && include.test(filename));
  const translateCall = (text) =>
    t.callExpression(t.identifier("__pcT"), [t.stringLiteral(text)]);

  const wrapText = (node) => {
    if (!t.isStringLiteral(node)) return node;
    if (!hasLetter(node.value) || looksLikeCode(node.value)) return node;
    return translateCall(node.value);
  };

  return {
    name: "paperclip-zh-overlay",
    visitor: {
      JSXText(path, state) {
        if (!isTarget(state.file.opts.filename)) return;
        if (insideSkippedTag(path)) return;

        const raw = path.node.value;
        const core = normalize(raw);
        if (!core || !hasLetter(core) || looksLikeCode(core)) return;

        // JSX 会折叠换行导致的空白；只保留同一行内真正有意义的单个空格。
        const keepLead = raw.startsWith(" ");
        const keepTrail = raw.endsWith(" ");
        const nodes = [];
        if (keepLead) nodes.push(t.jsxExpressionContainer(t.stringLiteral(" ")));
        nodes.push(t.jsxExpressionContainer(translateCall(core)));
        if (keepTrail) nodes.push(t.jsxExpressionContainer(t.stringLiteral(" ")));

        path.replaceWithMultiple(nodes);
      },

      JSXAttribute(path, state) {
        if (!isTarget(state.file.opts.filename)) return;

        const name = path.node.name;
        if (!t.isJSXIdentifier(name) || !attrs.has(name.name)) return;

        const init = path.node.value;
        if (!t.isStringLiteral(init)) return;
        if (!hasLetter(init.value)) return;

        path.node.value = t.jsxExpressionContainer(translateCall(init.value));
      },

      TemplateLiteral(path, state) {
        if (!isTarget(state.file.opts.filename)) return;

        const parent = path.parentPath;
        const inJsx =
          parent &&
          (parent.isJSXExpressionContainer() || parent.isJSXAttribute());
        if (!inJsx) return;
        if (!path.node.expressions.length) return;

        const shape = templateShape(path.node);
        // 只翻译像自然语言的模板（含空格）；路径、ID、CSS 一律跳过
        if (!shape.includes(" ") || !hasLetter(shape) || looksLikeCode(shape)) return;

        path.replaceWith(
          t.callExpression(t.identifier("__pcTt"), [
            t.stringLiteral(shape),
            ...path.node.expressions,
          ]),
        );
      },

      JSXExpressionContainer(path, state) {
        if (!isTarget(state.file.opts.filename)) return;

        const expr = path.node.expression;
        if (t.isJSXEmptyExpression(expr)) return;

        if (t.isStringLiteral(expr)) {
          path.node.expression = wrapText(expr);
        } else if (t.isConditionalExpression(expr)) {
          expr.consequent = wrapText(expr.consequent);
          expr.alternate = wrapText(expr.alternate);
        } else if (t.isLogicalExpression(expr)) {
          expr.left = wrapText(expr.left);
          expr.right = wrapText(expr.right);
        }
      },
    },
  };
};
