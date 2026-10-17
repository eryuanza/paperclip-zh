/**
 * Paperclip 简体中文覆盖层运行时。
 *
 * 词典：`ui/src/i18n/zh-CN.overlay.json`（英文原文 → 中文）。
 * 构建时 Babel 插件把 JSX 文案包成 `__pcT("原文")`，这里做查表。
 *
 * 修改翻译不需要改任何组件：编辑 JSON 后重新构建即可。
 * 未命中的文案原样返回英文（并记录到 window.__pcMissing 供排查）。
 */
import messages from "./zh-CN.overlay.json";

type Dictionary = Record<string, string>;

let dictionary: Dictionary = messages as Dictionary;
const missing = new Set<string>();
const MAX_MISSING = 20000;

export function translate(text: string): string {
  if (!text) return text;
  const hit = dictionary[text];
  if (hit !== undefined) return hit;
  if (missing.size < MAX_MISSING) missing.add(text);
  return text;
}

/**
 * 翻译带插值的模板文案。
 * 构建时 `` `Remove ${name}` `` 会变成 `__pcTt("Remove {{0}}", name)`。
 */
export function translateTemplate(shape: string, ...values: unknown[]): string {
  const translated = translate(shape);
  return translated.replace(/\{\{(\d+)\}\}/g, (_match, index) => {
    const value = values[Number(index)];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function setTranslations(next: Dictionary): void {
  dictionary = next;
}

export function getMissingTranslations(): string[] {
  return [...missing];
}

const globalScope = globalThis as unknown as {
  __pcT?: (text: string) => string;
  __pcTt?: (shape: string, ...values: unknown[]) => string;
  __pcMissing?: Set<string>;
  __pcSetTranslations?: (next: Dictionary) => void;
};

globalScope.__pcT = translate;
globalScope.__pcTt = translateTemplate;
globalScope.__pcMissing = missing;
globalScope.__pcSetTranslations = setTranslations;

// ---------------------------------------------------------------------------
// DOM 兜底翻译
//
// 有些文案不是 JSX 字面量，而是数据/默认参数/运行时拼接出来的，例如面包屑
// (`label: "Dashboard"`)、组件默认值 (`emptyMessage = "No recent agent runs."`)。
// 构建期拿不到它们，这里在渲染后按「英文原文 → 中文」再补一遍，并监听后续
// DOM 变化。未命中的文本保持原样。
// ---------------------------------------------------------------------------

const TEXT_ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

const RELATIVE_UNITS: Record<string, string> = {
  s: "秒",
  m: "分钟",
  h: "小时",
  d: "天",
  w: "周",
  mo: "个月",
  y: "年",
};

/** `3h ago` -> `3 小时前`，`just now` -> `刚刚`。 */
function translateRelativeTime(text: string): string | null {
  if (/^just now$/i.test(text)) return "刚刚";
  const match = text.match(/^(\d+)\s*(s|m|h|d|w|mo|y)\s+ago$/i);
  if (!match) return null;
  const unit = RELATIVE_UNITS[match[2].toLowerCase()];
  return unit ? `${match[1]} ${unit}前` : null;
}

function translateTextNode(node: Text): void {
  const raw = node.nodeValue;
  if (!raw || !/[A-Za-z]/.test(raw)) return;
  const trimmed = raw.trim();
  if (!trimmed) return;
  const hit = dictionary[trimmed] ?? translateRelativeTime(trimmed);
  if (hit == null) return;
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const trail = raw.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = lead + hit + trail;
}

function translateAttributes(element: Element): void {
  for (const name of TEXT_ATTRS) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const hit = dictionary[trimmed];
    if (hit !== undefined) {
      element.setAttribute(name, value.replace(trimmed, hit));
    }
  }
}

function walkNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  translateAttributes(node as Element);
  for (const child of Array.from(node.childNodes)) walkNode(child);
}

export function installDomTranslator(): void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  const start = () => {
    if (!document.body) return;
    walkNode(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text);
          continue;
        }
        mutation.addedNodes.forEach((node) => walkNode(node));
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

installDomTranslator();
