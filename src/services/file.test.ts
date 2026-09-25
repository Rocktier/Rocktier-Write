import { describe, expect, it } from "vitest";
import { applyEol, normalizeEol } from "./file";

// A textarea's value normalises \r\n to \n, so a CRLF document came back as LF
// and was written back that way — silently rewriting every line of the file.
describe("line endings", () => {
  it("keeps LF documents as LF", () => {
    const { content, eol } = normalizeEol("a\nb\n");
    expect(eol).toBe("\n");
    expect(content).toBe("a\nb\n");
    expect(applyEol(content, eol)).toBe("a\nb\n");
  });

  it("remembers CRLF and writes it back as CRLF", () => {
    const { content, eol } = normalizeEol("a\r\nb\r\n");
    expect(eol).toBe("\r\n");
    expect(content).toBe("a\nb\n");
    expect(applyEol(content, eol)).toBe("a\r\nb\r\n");
  });

  it("treats a lone CR as a line break", () => {
    const { content, eol } = normalizeEol("a\rb");
    expect(eol).toBe("\n");
    expect(content).toBe("a\nb");
  });

  it("round-trips mixed endings without doubling CR", () => {
    const { content, eol } = normalizeEol("a\r\nb\nc");
    expect(eol).toBe("\r\n");
    expect(applyEol(content, eol)).toBe("a\r\nb\r\nc");
  });
});
