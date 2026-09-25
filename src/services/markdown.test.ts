import { describe, expect, it } from "vitest";
import {
  extractHeadings, getTaskLines, parseDocument, readStats, slugify,
} from "./markdown";

describe("getTaskLines", () => {
  it("returns 1-based line numbers of task items", () => {
    expect(getTaskLines("# t\n\n- [ ] one\n- [x] two\nplain\n")).toEqual([3, 4]);
  });

  it("ignores task markers inside fenced code blocks", () => {
    expect(getTaskLines("```\n- [ ] not a task\n```\n- [ ] real\n")).toEqual([4]);
  });

  it("ignores empty markers, matching what micromark renders", () => {
    expect(getTaskLines("- [ ] \n- [ ] done\n")).toEqual([2]);
  });

  it("accepts task items inside block quotes", () => {
    expect(getTaskLines("> - [ ] quoted\n")).toEqual([1]);
  });
});

describe("extractHeadings", () => {
  it("collects level, text and 1-based line", () => {
    const hs = extractHeadings("# One\n\n## Two\n");
    expect(hs.map((h) => [h.level, h.text, h.line])).toEqual([
      [1, "One", 1],
      [2, "Two", 3],
    ]);
  });

  it("slugs inline markers away but keeps them in the label", () => {
    const [h] = extractHeadings("# Hello **world**\n");
    expect(h.text).toBe("Hello **world**");
    expect(h.id).toBe("hello-world");
  });

  it("de-duplicates ids so TOC clicks cannot all land on the first one", () => {
    const ids = extractHeadings("# Same\n\n# Same\n\n# Same\n").map((h) => h.id);
    expect(ids).toEqual(["same", "same-1", "same-2"]);
  });

  it("skips headings inside code fences", () => {
    expect(extractHeadings("```\n# not a heading\n```\n")).toHaveLength(0);
  });
});

describe("slugify", () => {
  it("strips punctuation and lowercases", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("keeps CJK characters", () => {
    expect(slugify("中文标题")).toBe("中文标题");
  });
});

describe("readStats", () => {
  it("counts latin words", () => {
    expect(readStats("one two three").words).toBe(3);
  });

  it("counts CJK characters", () => {
    expect(readStats("你好世界").words).toBe(4);
  });

  it("reports zero for empty input rather than a minimum of one minute", () => {
    expect(readStats("   ")).toEqual({ words: 0, minutes: 0 });
  });
});

describe("parseDocument", () => {
  it("removes executable content", () => {
    const { html } = parseDocument("# hi\n\n<script>alert(1)</script>\n");
    expect(html).not.toContain("<script");
  });

  it("removes event-handler attributes", () => {
    const { html } = parseDocument('<img src="x" onerror="alert(1)">\n');
    expect(html).not.toContain("onerror");
  });

  it("lifts frontmatter out of the body", () => {
    const parsed = parseDocument("---\ntitle: T\n---\n\nbody\n");
    expect(parsed.frontmatter).toContain("title: T");
    expect(parsed.html).not.toContain("title: T");
  });
});
