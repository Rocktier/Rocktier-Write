import { describe, expect, it } from "vitest";
import * as mod from "./htmlToMarkdown";

const toMd: (html: string) => string =
  (mod as Record<string, unknown>).htmlToMarkdown as (html: string) => string ??
  (mod as Record<string, unknown>).default as (html: string) => string;
const convert = (html: string) => toMd(html);

describe("htmlToMarkdown", () => {
  it("converts headings, emphasis and links", () => {
    expect(convert("<h2>Title</h2>")).toContain("## Title");
    expect(convert("<p><strong>bold</strong></p>")).toContain("**bold**");
    expect(convert('<p><a href="https://x.dev">x</a></p>')).toContain("[x](https://x.dev)");
  });

  it("keeps fenced code blocks fenced", () => {
    const md = convert('<pre><code class="language-js">let a = 1;</code></pre>');
    expect(md).toContain("```js");
    expect(md).toContain("let a = 1;");
  });

  // Regression: inline() recursed into nested ul/ol, so the child text was also
  // glued onto the parent line ("- itemsub") on top of its own line.
  it("does not duplicate nested list text into the parent item", () => {
    const md = convert("<ul><li>item<ul><li>sub</li></ul></li></ul>");
    expect(md).not.toContain("itemsub");
    expect(md).toContain("- item");
    expect(md).toContain("sub");
  });

  it("converts nested lists at all (they survive as their own lines)", () => {
    const md = convert("<ol><li>one<ol><li>child</li></ol></li></ol>");
    expect(md).toContain("1. one");
    expect(md).toContain("child");
  });

  it("quotes blockquote content", () => {
    expect(convert("<blockquote><p>hi</p></blockquote>")).toContain("> hi");
  });
});
