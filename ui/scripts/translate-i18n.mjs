/**
 * 用 DeepSeek 把 ui/scripts/strings.json 批量翻译成简体中文，
 * 结果写入 ui/src/i18n/zh-CN.overlay.json（英文原文 → 中文）。
 *
 * 特点：
 *  - 断点续跑：已翻译的 key 跳过，中断后重新执行即可；
 *  - 占位符校验：{name}、{{count}}、%s、$1、<tag> 等必须原样保留；
 *  - 失败重试 + 并发控制。
 *
 * 用法（仓库根目录）：
 *   set DEEPSEEK_API_KEY=sk-...
 *   node ui/scripts/translate-i18n.mjs                 # 只翻缺失的
 *   node ui/scripts/translate-i18n.mjs --force         # 全部重翻
 *   node ui/scripts/translate-i18n.mjs --limit 200     # 只翻 200 条（调试）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const stringsPath = path.join(here, "strings.json");
const outPath = path.join(repo, "ui", "src", "i18n", "zh-CN.overlay.json");

const API = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const BATCH = Number(process.env.I18N_BATCH || 40);
const CONCURRENCY = Number(process.env.I18N_CONCURRENCY || 4);
const FORCE = process.argv.includes("--force");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

if (!KEY) {
  console.error("DEEPSEEK_API_KEY is required");
  process.exit(1);
}

const strings = JSON.parse(fs.readFileSync(stringsPath, "utf8"));
const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
const dict = { ...existing };

const PLACEHOLDER_RE = /\{\{[^{}]*\}\}|\{[^{}]*\}|%[sdif@]|\$\d+|<\/?[A-Za-z][^>]*>/g;
const placeholders = (text) => (text.match(PLACEHOLDER_RE) || []).sort();

function writeOut() {
  const tmp = outPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(dict, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, outPath);
}

function keepAsIs(source) {
  // 很短的纯符号/单字符、以及没有字母的，直接原样
  return !/[A-Za-z]/.test(source) || source.trim().length <= 1;
}

async function requestBatch(batch, attempt = 1) {
  const body = {
    model: MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a professional software localization engineer.",
          "Translate each English UI string into concise, natural Simplified Chinese (zh-CN).",
          "Rules:",
          "1. Preserve placeholders EXACTLY, including {name}, {{count}}, %s, $1, <tag ...> and similar tokens.",
          "2. Keep product names and technical identifiers unchanged: Paperclip, Claude Code, Codex, Hermes, OpenCode, GitHub, Slack, API, MCP, CLI, Git, PR, CI, JSON, URL, ID, etc.",
          "3. Keep keyboard shortcuts (Ctrl+K, Cmd+Shift+P) unchanged.",
          "4. UI wording must be short; do not add explanations.",
          "5. Do not translate pure version strings, file paths, CSS, or code.",
          'Return ONLY a JSON object of the form {"t":["translation 1","translation 2", ...]} with exactly the same number of items as the input array, in the same order.',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ strings: batch }),
      },
    ],
  };

  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      const wait = 1500 * attempt + Math.random() * 1000;
      console.warn(`  ${res.status}; retry ${attempt}/5 in ${Math.round(wait)}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return requestBatch(batch, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response");
    parsed = JSON.parse(m[0]);
  }
  const out = parsed.t;
  if (!Array.isArray(out) || out.length !== batch.length) {
    throw new Error(`bad length: got ${Array.isArray(out) ? out.length : typeof out}, want ${batch.length}`);
  }
  return out.map((x) => (typeof x === "string" ? x : ""));
}

async function translateBatch(batch) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const translated = await requestBatch(batch);
      batch.forEach((source, i) => {
        const target = translated[i].trim();
        if (!target) {
          dict[source] = source;
          return;
        }
        const want = placeholders(source).join("|");
        const got = placeholders(target).join("|");
        if (want !== got) {
          console.warn(`  placeholder mismatch, keep English: ${source.slice(0, 60)}`);
          dict[source] = source;
        } else {
          dict[source] = target;
        }
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  console.warn(`  batch failed, keeping English: ${lastError?.message}`);
  for (const source of batch) dict[source] = source;
}

const todo = strings
  .filter((s) => FORCE || !(s in dict))
  .filter((s) => !keepAsIs(s))
  .slice(0, LIMIT);

// simple strings are identity-translated without an API call
for (const s of strings) {
  if (keepAsIs(s) && (FORCE || !(s in dict))) dict[s] = s;
}

console.log(`strings=${strings.length} todo=${todo.length} model=${MODEL} batch=${BATCH} concurrency=${CONCURRENCY}`);

const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

let done = 0;
async function worker() {
  while (batches.length) {
    const batch = batches.shift();
    await translateBatch(batch);
    done += batch.length;
    writeOut();
    if (done % (BATCH * 4) === 0 || done === todo.length) {
      console.log(`  progress ${done}/${todo.length}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
writeOut();
console.log(`done. dictionary entries: ${Object.keys(dict).length} -> ${outPath}`);
