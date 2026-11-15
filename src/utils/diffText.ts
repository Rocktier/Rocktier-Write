import { diffChars, diffWords, type Change } from "diff";

/**
 * 草稿对比的粒度选择：英文按词（diffWords 的删改块可读性最好），
 * 中文没有空格词边界 —— 按字（diffChars）才能标出真正改动的那几个字。
 * 任一侧含 CJK 即按字；混排时英文名词会被拆成字母级，但中文写作场景
 * 里这是可接受的取舍（与 Word/WPS 的中文对比行为一致）。
 */
export function diffTexts(a: string, b: string): Change[] {
  const cjk = /[\u3400-\u4dbf\u4e00-\u9fff]/.test(a) || /[\u3400-\u4dbf\u4e00-\u9fff]/.test(b);
  return cjk ? diffChars(a, b) : diffWords(a, b);
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(changes: Change[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    if (c.added) added += c.count ?? 0;
    else if (c.removed) removed += c.count ?? 0;
  }
  return { added, removed };
}
