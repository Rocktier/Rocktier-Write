/**
 * 反斜杠还原层的测试。
 *
 * 每条都对应一个**已实测**的破坏形态（见 `restoreBackslashes.ts` 的表格），
 * 不是推测出来的假设。这层逻辑改错的表现是「用户的公式/转义静默变形」，
 * 所以正确性与幂等性都要测。
 *
 * ⚠️ 全部 LaTeX 一律用 `String.raw`。早先直接写 "\\frac"，JS 先把 `\f`
 * 当换页符（U+000C）、`\i` 当非转义字符丢掉，于是**期望值本身就是坏的**，
 * 测试红着而内容其实完好 —— 差点据此去改一个没坏的地方。
 *
 * ⚠️ 断言一律走**完整两层**（protect → Tiptap → unprotect → restore）。
 * 单层 `unprotect(protect(x))` 的结果里还带 MARK（U+E002）——
 * 那是给 restore 暂存段的中转标记，由 restore 在最后剥掉。
 */
import { describe, it, expect } from "vitest";
import {
  restoreEscapedBackslashes,
  protectEscapedChars,
  unprotectEscapedChars,
} from "./restoreBackslashes";

/** 完整两层：用户真正落盘的字节。 */
const write = (markdown: string) =>
  restoreEscapedBackslashes(
    unprotectEscapedChars(protectEscapedChars(markdown)),
    markdown,
  );

describe("restoreEscapedBackslashes", () => {
  it("把翻倍的反斜杠折半（核心场景）", () => {
    expect(restoreEscapedBackslashes(String.raw`a\\nb`)).toBe(String.raw`a\nb`);
    expect(restoreEscapedBackslashes(String.raw`$$\\frac{1}{2}$$`)).toBe(
      String.raw`$$\frac{1}{2}$$`,
    );
  });

  /* Tiptap 会给 `_ * [ ] ~ ` ` 加转义、并把 `< >` 转成 HTML 实体。
     那些转义语义正确但**污染用户源码**（`\int_0` 存成 `\int\_0`），
     写盘时要去掉 —— 见 restoreBackslashes.ts 的说明。 */
  it("去掉 Tiptap 加的多余转义与 HTML 实体", () => {
    expect(restoreEscapedBackslashes(String.raw`\int\_0`)).toBe(String.raw`\int_0`);
    expect(restoreEscapedBackslashes(String.raw`a\*b`)).toBe("a*b");
    expect(restoreEscapedBackslashes("a\\[b\\]")).toBe("a[b]");
    expect(restoreEscapedBackslashes("a\\~b")).toBe("a~b");
    expect(restoreEscapedBackslashes("a &lt; b")).toBe("a < b");
    expect(restoreEscapedBackslashes("a &gt; b")).toBe("a > b");
  });

  it("折半与去转义叠加后收敛（幂等）", () => {
    /* `a\\*b`：折半得 `a\*b`，去转义再脱掉 `\*` 的反斜杠 → `a*b`。
     * 两步都生效，不是其中之一；再跑一次不再变化。 */
    const two = restoreEscapedBackslashes(String.raw`a\\*b`);
    expect(two).toBe("a*b");
    expect(restoreEscapedBackslashes(two)).toBe(two);
    // 单次去转义也幂等
    const once = restoreEscapedBackslashes(String.raw`a\*b`);
    expect(once).toBe("a*b");
    expect(restoreEscapedBackslashes(once)).toBe(once);
    // 只折半不去转义：本义一个反斜杠（后跟字母，不在去转义字符集里）
    const bslash = restoreEscapedBackslashes("a\\\\b");
    expect(bslash).toBe(String.raw`a\b`);
    expect(restoreEscapedBackslashes(bslash)).toBe(bslash);
  });

  it("代码块与行内代码内不碰（用户代码的字面反斜杠必须原样）", () => {
    const fenced = "```\na\\nb\n```";
    expect(restoreEscapedBackslashes(fenced)).toBe(fenced);
    const inline = "`a\\nb`";
    expect(restoreEscapedBackslashes(inline)).toBe(inline);
  });

  it("同一次调用里两种作用域各按各的来", () => {
    const mixed = "text \\(x\\) more\n\n```\nkeep\\n```\n\nafter \\(y\\)";
    const out = restoreEscapedBackslashes(mixed);
    expect(out).toContain(String.raw`\(x\)`);
    expect(out).toContain("keep\\n"); // 围栏内原样
    expect(out).toContain(String.raw`\(y\)`);
  });

  it("无反斜杠的文本零变化（绝大多数文档走这条路径）", () => {
    const plain = "# 标题\n\n正文段落。\n\n- 项目\n\n| a | b |\n";
    expect(restoreEscapedBackslashes(plain)).toBe(plain);
  });

  it("空与纯空白不炸", () => {
    expect(restoreEscapedBackslashes("")).toBe("");
    expect(restoreEscapedBackslashes("\n")).toBe("\n");
    expect(restoreEscapedBackslashes("```\n```")).toBe("```\n```");
  });

  it("四个反斜杠折成两个（多重复数也成立）", () => {
    expect(restoreEscapedBackslashes("a\\\\\\\\b")).toBe("a\\\\b");
  });

  it("末尾换行按原文补回（原文有才有）", () => {
    expect(restoreEscapedBackslashes("hello", "hello\n")).toBe("hello\n");
    // 原文本来就没有 → 尊重用户，不擅自添加
    expect(restoreEscapedBackslashes("hello", "hello")).toBe("hello");
  });
});

describe("protectEscapedChars / unprotectEscapedChars", () => {
  it("完整两层往返一致（含各类 LaTeX 转义）", () => {
    for (const md of [
      String.raw`a\,b`,
      String.raw`\!x`,
      String.raw`\[not a link\]`,
      String.raw`\(x\)`,
      String.raw`100\%`,
      String.raw`a\_b\_c`,
      String.raw`\$5 and \$10`,
    ]) {
      expect(write(md), md).toBe(md);
    }
  });

  it("protect 之后标点类转义的裸反斜杠已被藏起", () => {
    const p = protectEscapedChars(String.raw`a\,b \(x\)`);
    expect(p).not.toContain("\\");
  });

  it("LaTeX 命令的反斜杠不被藏（由折半层处理）", () => {
    const md = String.raw`\frac{1}{2} \alpha \infty`;
    expect(protectEscapedChars(md)).toBe(md);
    expect(write(md)).toBe(md);
  });

  it("代码块内不保护（围栏里是用户代码的字面内容）", () => {
    const fenced = "```\na\\,b\n```";
    expect(protectEscapedChars(fenced)).toBe(fenced);
    expect(write(fenced)).toBe(fenced);
  });

  it("无转义的普通文档零变化", () => {
    const plain = "# 标题\n\n正文。\n";
    expect(protectEscapedChars(plain)).toBe(plain);
    expect(unprotectEscapedChars(plain)).toBe(plain);
  });

  /* 完整往返：这才是「用户改一次再存盘」的真实路径，也是最有价值的一条。 */
  it("完整文档逐字往返（含公式、转义、列表、表格）", () => {
    const md = String.raw`---
title: Doc
---

text \(x\) more

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

- [ ] task
- item with 100\%

| a | b |
|---|---|
| 1 | 2 |

end
`;
    expect(write(md)).toBe(md);
  });
});
