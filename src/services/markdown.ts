// Markdown parsing + syntax highlighting
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import katex from "katex";

// Minimal language set for 极致快: 20 common languages, GitHub-style coverage
// without heavyweight grammars (php/ruby/swift 等 omitted on size grounds)
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import rust from "highlight.js/lib/languages/rust";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import cssLang from "highlight.js/lib/languages/css";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import diff from "highlight.js/lib/languages/diff";
import markdownLang from "highlight.js/lib/languages/markdown";
import makefile from "highlight.js/lib/languages/makefile";
import dockerfile from "highlight.js/lib/languages/dockerfile";

const LANGS: [string, Parameters<typeof hljs.registerLanguage>[1], string[]][] = [
  ["javascript", javascript, ["js"]],
  ["typescript", typescript, ["ts"]],
  ["python", python, ["py"]],
  ["bash", bash, ["sh", "shell", "zsh"]],
  ["json", json, []],
  ["rust", rust, ["rs"]],
  ["c", c, []],
  ["cpp", cpp, ["c++"]],
  ["csharp", csharp, ["cs"]],
  ["java", java, []],
  ["go", go, ["golang"]],
  ["sql", sql, []],
  ["xml", xml, ["html", "svg", "vue"]],
  ["css", cssLang, []],
  ["yaml", yaml, ["yml"]],
  ["ini", ini, ["toml"]],
  ["diff", diff, []],
  ["markdown", markdownLang, ["md"]],
  ["makefile", makefile, []],
  ["dockerfile", dockerfile, ["docker"]],
];
for (const [name, lang, aliases] of LANGS) {
  hljs.registerLanguage(name, lang);
  for (const alias of aliases) hljs.registerAliases(alias, { languageName: name });
}

import type { Extension } from "micromark-util-types";

const EXT: Extension[] = [gfm({ singleTilde: false })];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HTML_EXT: any[] = [gfmHtml()];

// --- Math extraction: pull out KaTeX before micromark sees the source ----
// Replaced after DOMPurify to avoid KaTeX HTML being sanitized away. The slot
// must be an element DOMPurify keeps (comments are stripped): an empty
// div/span with a data attribute survives sanitization.
const MATH_SLOT = (n: number, block: boolean) =>
  block ? `<div data-rocktier-math="${n}"></div>` : `<span data-rocktier-math="${n}"></span>`;

export interface ParseResult {
  html: string;
  frontmatter: string | null;
}

export function parseMarkdown(src: string): string {
  return parseDocument(src).html;
}

/**
 * 只对代码之外的文本段应用替换。奇数下标是围栏代码块/行内代码原文，保持原样。
 * 这样 shell 里的 `$PATH:$HOME` 不会被误提取成数学公式（Typora/Obsidian 同规则）。
 */
function mapOutsideCode(src: string, fn: (segment: string) => string): string {
  const parts = src.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g);
  return parts.map((part, i) => (i % 2 === 1 ? part : fn(part))).join("");
}

export function parseDocument(src: string): ParseResult {
  // 1. Extract frontmatter
  const { body, frontmatter } = extractFrontmatter(src);

  // 2. Extract math blocks before micromark so LaTeX doesn't get mangled.
  //    替换只在代码块/行内代码之外的段落上进行。
  const mathStore: string[] = [];
  let text = mapOutsideCode(body, (seg) =>
    seg.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex) => {
      const i = mathStore.length;
      mathStore.push(`<div class="katex-block">${renderMath(tex, true)}</div>`);
      return MATH_SLOT(i, true);
    })
  );
  // Inline math: $...$ (must not start/end with whitespace, must be non-empty;
  // closing $ must not be followed by a digit — pandoc's rule, so prices like
  // "$5 和 $10" are not treated as math)
  text = mapOutsideCode(text, (seg) =>
    seg.replace(/(^|[^\\])\$(?=\S)(.+?)(?<=\S)\$(?!\$|\d)/g, (_m, pre, tex) => {
      const i = mathStore.length;
      mathStore.push(`<span class="katex-inline">${renderMath(tex, false)}</span>`);
      return `${pre}${MATH_SLOT(i, false)}`;
    })
  );
  // Unescape any \$ that we skipped（代码块内的 \$ 保持字面）
  text = mapOutsideCode(text, (seg) => seg.replace(/\\\$/g, "$"));

  // 3. Image resize syntax: ![alt](url =200x100)
  //    Strip "=WxH" before micromark, re-apply on the img tags after render.
  const sizeMap = new Map<string, { w: number; h: number | null }>();
  text = mapOutsideCode(text, (seg) =>
    seg.replace(/!\[([^\]]*)\]\(([^)\s]+)\s*=(\d+)(?:x(\d+))?\)/g,
      (_m, alt: string, url: string, w: string, h: string) => {
        sizeMap.set(url, { w: +w, h: h ? +h : null });
        return `![${alt}](${url})`;
      })
  );

  // 4. Parse with micromark
  const raw = micromark(text, {
    allowDangerousHtml: true,
    allowDangerousProtocol: false,
    extensions: EXT,
    htmlExtensions: HTML_EXT,
  });

  // 5. Highlight + sanitize
  let html = DOMPurify.sanitize(highlightCode(raw));

  // 6. Re-apply image sizes (width/height attributes)
  if (sizeMap.size > 0) {
    html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (_m, pre: string, url: string, post: string) => {
      const sz = sizeMap.get(url) ?? sizeMap.get(decodeURIComponent(url));
      if (!sz) return _m;
      // Skip if width/height already present (raw HTML user override)
      const hasW = /\bwidth=/.test(pre) || /\bwidth=/.test(post);
      const hasH = /\bheight=/.test(pre) || /\bheight=/.test(post);
      const wAttr = hasW ? '' : ` width="${sz.w}"`;
      const hAttr = sz.h && !hasH ? ` height="${sz.h}"` : '';
      return `<img${pre}src="${url}"${post}${wAttr}${hAttr}>`;
    });
  }

  // 7. Restore math slots after DOMPurify. A replacer function is required:
  // a string replacement would treat "$&" inside KaTeX output as the match.
  html = html.replace(/<(div|span) data-rocktier-math="(\d+)"><\/\1>/g,
    (_m, _tag: string, n: string) => mathStore[+n]);

  return { html, frontmatter };
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return `<code class="katex-error">${escapeHtml(tex)}</code>`;
  }
}

export interface Frontmatter {
  raw: string;
  title?: string;
  author?: string;
  date?: string;
  [key: string]: string | undefined;
}

export function extractFrontmatter(src: string): { body: string; frontmatter: string | null } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { body: src, frontmatter: null };
  return { body: src.slice(m[0].length), frontmatter: m[1] };
}

/** Parse frontmatter string into key:value map (YAML subset) */
export function parseFrontmatter(raw: string): Frontmatter {
  const result: Frontmatter = { raw };
  raw.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) return;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && val) result[key] = val;
  });
  return result;
}

function highlightCode(html: string): string {
  return html.replace(
    /<code class="language-([^"]+)">([\s\S]*?)<\/code>/g,
    (_match, lang: string, code: string) => {
      const decoded = decodeHtml(code);
      let highlighted: string;
      try {
        if (hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(decoded, { language: lang }).value;
        } else {
          // GitHub convention: unlabeled or unknown languages render as
          // plain text — auto-detection misfires and costs a full scan.
          highlighted = escapeHtml(decoded);
        }
      } catch {
        highlighted = escapeHtml(decoded);
      }
      return `<code class="hljs language-${lang}" data-lang="${lang}">${highlighted}</code>`;
    }
  );
}

function decodeHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface Heading {
  level: number;
  text: string;
  id: string;
  line: number; // 1-based line number in source
}

export function extractHeadings(src: string): Heading[] {
  const headings: Heading[] = [];
  // 与 Preview.applyHeadingIds 同规则去重：重复标题 → id、id-1、id-2。
  // 不去重的话 TOC 点击 getElementById 永远命中第一个重复标题（本轮 B2）。
  const used = new Map<string, number>();
  let inCodeBlock = false;
  src.split("\n").forEach((line, idx) => {
    // Skip headings inside fenced code blocks
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) return;
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      let id = slugify(stripInlineMarkers(m[2]));
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      headings.push({
        level: m[1].length,
        text: m[2].replace(/\s+#+$/, "").trim(),
        id,
        line: idx + 1,
      });
    }
  });
  return headings;
}

/**
 * Return 1-based line numbers of source lines that micromark renders as GFM
 * task-list checkboxes. Mirrors its acceptance (verified empirically): list
 * marker, [ ]/[x]/[X], whitespace, then non-empty content — so empty markers
 * like "- [ ] " are excluded and the rendered-checkbox order stays aligned
 * with this list for index-based mapping. Fenced code blocks are skipped.
 */
export function getTaskLines(src: string): number[] {
  const lines: number[] = [];
  let inCodeBlock = false;
  src.split("\n").forEach((line, idx) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) return;
    if (/^\s*(>\s*)*[-*+]\s+\[[ xX]\]\s+\S/.test(line)) lines.push(idx + 1);
  });
  return lines;
}

/** Strip markdown inline markers for slug generation (bold, italic, code, links) */
function stripInlineMarkers(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Shared internal: returns cn/en/total counts to avoid re-matching the text.
function wordCounts(text: string): { cn: number; en: number; total: number } {
  // CJK unified ideographs: Extension A (3400-4DBF), URO (4E00-9FFF),
  // Compatibility Ideographs (F900-FAFF)
  const cn = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const en = (text.match(/[a-zA-Z0-9_]+/g) || []).length;
  return { cn, en, total: cn + en };
}

/** Word count + reading time in one pass over the text. */
export function readStats(text: string): { words: number; minutes: number } {
  const { cn, total } = wordCounts(text);
  if (total === 0) return { words: 0, minutes: 0 };
  // Blended WPM: pure English → 350, pure Chinese → 500
  const ratio = cn / total;
  const wpm = 350 + ratio * 150;
  return { words: total, minutes: Math.max(1, Math.ceil(total / wpm)) };
}
