/**
 * 富文本视图对「预览视图专有语法」的往返测试。
 *
 * ## 为什么这个文件单独存在
 * Write 有两类语法，它们的**保真度要求完全不同**：
 *
 *   · 常规 markdown —— 富文本必须能编辑，所以往返有损是设计内的（有测试钉住可接受的差异）
 *   · **预览视图专有语法** —— 数学公式（`$$…$$`）、Mermaid 代码块 ——
 *     富文本里**没有对应的可视样式**，Tiptap 会把它们当普通文本/普通代码块处理。
 *     此时唯一正确的行为是**一字不改地透传**：只要写回磁盘时动了一个字符，
 *     用户的公式或图表就毁了，而且不报错（下次打开预览才发现）。
 *
 * 这类风险比「往返丢格式」严重得多：常规格式丢了用户还能重打，公式内容被改写
 * （比如 `\frac{1}{2}` 变成 `\frac12`）用户根本无从察觉。所以下面每条都是
 * **逐字节比较**，不做任何归一化。
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import RichTextExtensions from "./richTextExtensions";
import {
  restoreEscapedBackslashes,
  protectEscapedChars,
  unprotectEscapedChars,
} from "./restoreBackslashes";

/** 与组件共用同一份扩展清单 —— 测试自己写一份会测出假绿，理由见该文件说明。 */
const EXTENSIONS = [...RichTextExtensions, Markdown];

/* 打开 → 序列化回来，不做任何输入，模拟「用户没改就保存」。
 * 必须走 `restoreEscapedBackslashes` —— 与组件写盘路径一致，否则测的是
 * 「编辑器原始输出」而不是「真正写进用户磁盘的字节」。 */
function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: EXTENSIONS,
    content: protectEscapedChars(markdown),
    contentType: "markdown",
  });
  try {
    // 走完整两层（protect → Tiptap → unprotect → 折半还原），
    // 与 RichTextEditor 实际写盘路径一致；否则测的是中间态而非落盘字节。
    const raw = unprotectEscapedChars(editor.getMarkdown());
    return restoreEscapedBackslashes(raw, markdown);
  } finally {
    editor.destroy();
  }
}

describe("富文本视图：预览视图专有语法的保真", () => {
  /* ⚠️ 本文件的所有 LaTeX 都必须用 String.raw。
   * 早先直接写 "$$ \frac{1}{2} $$"，JS 把 `\f` 当成换页符（U+000C）、
   * `\i` 当成非转义字符直接丢掉，于是**期望值本身就是坏的**，测试红着而
   * 内容其实完好 —— 差点据此去改一个没坏的地方。用 String.raw 就没有这一层。 */

  /* 数学公式：预览侧靠 micromark 前的正则提取 + KaTeX 渲染（见 markdown.ts
     `parseDocument` 的第 2/3 步）。富文本侧没有 KaTeX，但**必须原样透传**。 */
  it("行间公式 $$…$$ 逐字透传", () => {
    const md = String.raw`$$
\frac{1}{2}
$$
`;
    expect(roundTrip(md)).toBe(md);
  });

  it("行内公式 $…$ 逐字透传", () => {
    const md = String.raw`Euler: $e^{i\pi} = -1$ ok
`;
    expect(roundTrip(md)).toBe(md);
  });

  /* 最危险的一类：LaTeX 靠反斜杠与花括号表达结构，被吞掉一个字符就语法错，
     但**不报错** —— 用户下次打开预览才发现公式坏了，且无从追溯。 */
  it("含反斜杠的复杂公式不被吞（花括号必须保住）", () => {
    const md = String.raw`$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
`;
    const out = roundTrip(md);
    expect(out).toBe(md);
    // `\frac{1}{2}` 变成 `\frac12` 是最典型的静默损坏
    expect(out).toContain(String.raw`\frac{\sqrt{\pi}}{2}`);
  });

  /* Mermaid：预览侧渲染成图（源码在 ```mermaid 围栏里）。
     富文本侧只会当普通代码块显示 —— 那可以接受（内容看得见），
     不可接受的是**围栏语言标记丢了**：```mermaid 变成 ``` 就再也渲染不出来。 */
  it("Mermaid 代码块保留 mermaid 语言标记", () => {
    const md = "```mermaid\ngraph TD\n  A --> B\n```\n";
    const out = roundTrip(md);
    expect(out).toContain("```mermaid");
    expect(out).toContain("graph TD");
    expect(out).toContain("A --> B");
  });

  /* 回归：别为了保 mermaid 而改坏全部代码块。上面那条只断言「包含 mermaid」，
     容易让人放松对普通代码块的断言强度 —— 这里逐字比。 */
  it("普通代码块逐字透传", () => {
    const md = "```js\nconst a = 1;\n```\n";
    expect(roundTrip(md)).toBe(md);
  });

  it("公式与普通文本混排不串（$5 / $10 不该被当公式改写）", () => {
    const md = "总价 $5 与 $10 不算公式。\n\n但 $x^2$ 是。\n";
    const out = roundTrip(md);
    // 预览侧靠 pandoc 的「$ 后不跟数字」规则才不当公式，编辑器侧不替它做主
    expect(out).toContain("$5");
    expect(out).toContain("$10");
    expect(out).toContain("$x^2$");
  });

  /* 锁住**当前真实行为**：Tiptap 的 markdown 层不认识这些语法，只把它们当普通
     文本/代码块原样搬过。哪天有人加了数学或 Mermaid 的自定义节点，这条会变 ——
     那时应当改的是本用例的期望值（并确认写盘仍是合法 markdown），
     而不是让公式静默变形。 */
  it("当前实现里公式以纯文本形态存在（护栏：行为变化必须显式改这里）", () => {
    const md = String.raw`$$
\alpha
$$
`;
    const editor = new Editor({
      extensions: EXTENSIONS,
      content: md,
      contentType: "markdown",
    });
    try {
      const json = JSON.stringify(editor.getJSON());
      expect(json).not.toMatch(/"type":"(math|katex|mermaid)"/);
      expect(editor.getMarkdown()).toContain(String.raw`\alpha`);
    } finally {
      editor.destroy();
    }
  });
});
