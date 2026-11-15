import { describe, expect, it } from "vitest";
import { diffStats, diffTexts } from "./diffText";

describe("diffTexts", () => {
  it("english text diffs at word level", () => {
    const changes = diffTexts("hello world", "hello big world");
    expect(diffStats(changes)).toEqual({ added: 1, removed: 0 });
  });

  it("marks removed words", () => {
    const changes = diffTexts("hello big world", "hello world");
    expect(diffStats(changes)).toEqual({ added: 0, removed: 1 });
  });

  it("chinese text diffs at char level", () => {
    const changes = diffTexts("今天天气很好", "今天天气很差");
    expect(diffStats(changes)).toEqual({ added: 1, removed: 1 });
  });

  it("identical texts produce no changes", () => {
    expect(diffStats(diffTexts("same text", "same text"))).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it("empty base means everything is added", () => {
    expect(diffStats(diffTexts("", "new text"))).toEqual({
      added: 2, // "new" + "text"
      removed: 0,
    });
  });
});
