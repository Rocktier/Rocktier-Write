import { describe, expect, it } from "vitest";
import { findMatches } from "./RichTextFindReplace";

describe("findMatches", () => {
  it("默认不分大小写", () => {
    expect(findMatches("Foo foo FOO", "foo", false)).toEqual([0, 4, 8]);
  });

  it("勾上区分大小写后只匹配原样", () => {
    expect(findMatches("Foo foo FOO", "foo", true)).toEqual([4]);
  });

  it("连续匹配不跳字，且 needle 为空时无结果", () => {
    expect(findMatches("aaaa", "aa", false)).toEqual([0, 1, 2]);
    expect(findMatches("anything", "", false)).toEqual([]);
  });
});
