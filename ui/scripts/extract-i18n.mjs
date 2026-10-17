/**
 * 抽取所有会被 Babel 插件翻译的 JSX 文案，输出英文清单。
 *
 * 用法（在仓库根目录）：
 *   node ui/scripts/extract-i18n.mjs            # 打印统计
 *   node ui/scripts/extract-i18n.mjs --json     # 输出 JSON 数组
 *   node ui/scripts/extract-i18n.mjs --map      # 输出 { 英文: 英文 } 模板
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const pnpmStore = path.resolve(here, "..", "..", "node_modules", ".pnpm");
const require = createRequire(import.meta.url);

function fromStore(name, version, pkgPath) {
  return require(path.join(pnpmStore, `${name}@${version}`, "node_modules", ...pkgPath));
}

const parser = fromStore("@babel+parser", "7.29.8", ["@babel", "parser"]);
const traverseModule = fromStore("@babel+traverse", "7.29.8", ["@babel", "traverse"]);
const traverse = traverseModule.default ?? traverseModule;

const ATTRS = new Set([
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

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeCode(value) {
  if (/^__[A-Za-z0-9_]+__$/.test(value)) return true;
  if (/^__/.test(value)) return true;
  if (/^_[A-Za-z][A-Za-z0-9_]*$/.test(value)) return true;
  if (/^!\[/.test(value)) return true;
  if (value.startsWith("--")) return true;
  if (value.includes("--") && /^[A-Za-z0-9_-]+$/.test(value)) return true;
  if (/^(var|calc|rgba?|hsla?|url)\(/.test(value)) return true;
  if (value.includes("[&")) return true;
  if (/\b(px|py|pl|pr|pt|pb|gap|text|bg|border|rounded|size|w|h|m|mt|mb|ml|mr|mx|my|space-x|space-y)-[0-9a-z[]/.test(value)) return true;
  return false;
}

function templateShape(node) {
  let shape = "";
  for (let i = 0; i < node.quasis.length; i++) {
    shape += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
    if (i < node.expressions.length) shape += `{{${i}}}`;
  }
  return shape;
}

const root = path.resolve(here, "..", "src");
const found = new Map(); // text -> Set<relative file:line>

function add(text, file, line) {
  const value = normalize(text);
  if (!value || !/[A-Za-z]/.test(value)) return;
  if (looksLikeCode(value)) return;
  if (!found.has(value)) found.set(value, new Set());
  found.get(value).add(`${file}:${line}`);
}

/**
 * 判断一个字符串字面量是否像「给用户看的自然语言」。
 * 用于收集默认参数、对象数据、错误消息等构建期 JSX 之外出现的文案。
 */
function isNaturalLanguage(value) {
  if (value.length < 6 || value.length > 300) return false;
  if (!value.includes(" ")) return false;
  if (!/^[A-Za-z]/.test(value)) return false;
  if (/[\\/{}<>=$`]/.test(value)) return false;
  if (/^(https?|file|data):/i.test(value)) return false;
  if (!/^[A-Za-z0-9 ,.'’"()!?%+\-–—:;]+$/.test(value)) return false;
  return true;
}

function analyze(file) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return; // 无法解析的文件跳过（极少）
  }

  traverse(ast, {
    JSXText(p) {
      const parent = p.parent;
      const tag =
        parent && parent.type === "JSXElement" && parent.openingElement.name.type === "JSXIdentifier"
          ? parent.openingElement.name.name
          : null;
      if (tag && SKIP_TAGS.has(tag)) return;
      add(p.node.value, rel, p.node.loc?.start.line ?? 0);
    },
    JSXAttribute(p) {
      const name = p.node.name?.name;
      if (!name || !ATTRS.has(name)) return;
      const init = p.node.value;
      if (!init) return;
      if (init.type === "StringLiteral") {
        add(init.value, rel, p.node.loc?.start.line ?? 0);
      } else if (init.type === "JSXExpressionContainer") {
        const expr = init.expression;
        if (expr && expr.type === "StringLiteral") {
          add(expr.value, rel, p.node.loc?.start.line ?? 0);
        } else if (expr && expr.type === "TemplateLiteral" && expr.expressions.length === 0) {
          add(expr.quasis.map((q) => q.value.cooked ?? "").join(""), rel, p.node.loc?.start.line ?? 0);
        }
      }
    },
    TemplateLiteral(p) {
      const parent = p.parent;
      const inJsx =
        parent &&
        (parent.type === "JSXExpressionContainer" || parent.type === "JSXAttribute");
      if (!inJsx || p.node.expressions.length === 0) return;
      const shape = templateShape(p.node);
      if (!shape.includes(" ") || !/[A-Za-z]/.test(shape) || looksLikeCode(shape)) return;
      add(shape, rel, p.node.loc?.start.line ?? 0);
    },
    JSXExpressionContainer(p) {
      const expr = p.node.expression;
      if (!expr) return;
      const collect = (node) => {
        if (node && node.type === "StringLiteral") {
          add(node.value, rel, node.loc?.start.line ?? p.node.loc?.start.line ?? 0);
        }
      };
      if (expr.type === "StringLiteral") {
        collect(expr);
      } else if (expr.type === "ConditionalExpression") {
        collect(expr.consequent);
        collect(expr.alternate);
      } else if (expr.type === "LogicalExpression") {
        collect(expr.left);
        collect(expr.right);
      }
    },
    StringLiteral(p) {
      if (!isNaturalLanguage(p.node.value)) return;
      add(p.node.value, rel, p.node.loc?.start.line ?? 0);
    },
  });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (
      entry.name.endsWith(".tsx") &&
      !/\.(test|spec|stories)\.tsx$/.test(entry.name)
    )
      analyze(full);
  }
}

walk(root);

const entries = [...found.keys()].sort((a, b) => a.localeCompare(b));

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(entries, null, 2) + "\n");
} else if (process.argv.includes("--map")) {
  const obj = {};
  for (const text of entries) obj[text] = text;
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
} else {
  const files = new Set([...found.values()].flatMap((s) => [...s].map((x) => x.split(":")[0])));
  console.log(`unique strings: ${entries.length}`);
  console.log(`files with strings: ${files.size}`);
  console.log("\nTop 30 by occurrence:");
  [...found.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 30)
    .forEach(([text, where]) => console.log(`  ${String(where.size).padStart(3)}x  ${text.slice(0, 90)}`));
}
