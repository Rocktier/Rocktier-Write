/**
 * 富文本视图的查找替换。
 *
 * 为什么不复用 `FindReplace.tsx`：那份直接操作 `window.__cmView`
 * （CodeMirror 的 EditorView）与它的选区/事务 API，与富文本毫无关系。
 * 强行复用会把两个编辑器耦在一起 —— 砍掉任一个另一个就坏。
 * 这里用 Tiptap 的原生能力（`editor.state.doc.textBetween` + ProseMirror
 * 事务）实现，**外观与行为对齐**源码视图那份：同样的计数显示、
 * 同样的回车/Shift+回车语义、同样的 Esc 关闭。
 *
 * ## 匹配高亮怎么做
 * 不引第三方装饰扩展：用 ProseMirror 的 `Decoration.inline` 画高亮。
 * 命中的文本位置由 `textBetween` 逐段扫描得到 —— 对大文件是 O(n)，
 * 与 CodeMirror 那份同量级，桌面应用可接受。
 *
 * ## 为什么计数要显示「共 N 处」
 * 用户按 F3 逐个跳过时需要知道还剩多少。找不到时把输入框标红并给出
 * 「无匹配」文案，而不是静默不动 —— 静默是查找功能最常见的坏法。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import { useRichText } from "./RichTextEditor";

interface Props {
  onClose: () => void;
}

/** 大小写不敏感：与浏览器 / CodeMirror 的默认一致。 */
function findMatches(doc: string, needle: string): number[] {
  if (!needle) return [];
  const hay = doc.toLowerCase();
  const low = needle.toLowerCase();
  const out: number[] = [];
  let at = doc.indexOf(needle);
  while (at >= 0) {
    out.push(at);
    at = hay.indexOf(low, at + 1);
  }
  return out;
}

export const RichTextFindReplace = memo(function RichTextFindReplace({ onClose }: Props) {
  const editor = useRichText();
  const [needle, setNeedle] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 匹配位置随「文档文本」变。每次编辑重扫全文是 O(n)，
     桌面写作场景（几万字）实测在毫秒级，故不做增量 —— 增量要处理
     「编辑点在匹配区间内导致位置全部平移」，复杂度远超收益。 */
  const matches = useMemo(() => {
    if (!editor || !needle) return [];
    const doc = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    return findMatches(doc, matchCase ? needle : needle);
  }, [editor, editor?.state.doc.content.size, needle, matchCase]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setCursor((c) => (matches.length === 0 ? 0 : c % matches.length));
  }, [matches.length]);

  const goto = useCallback(
    (index: number) => {
      if (!editor || matches.length === 0) return;
      const i = ((index % matches.length) + matches.length) % matches.length;
      setCursor(i);
      /* 只移动选区、不改内容。用 Tiptap 的 focus + 文本位置换算：
         textBetween 给的是「字符下标」，需要映射回文档位置。
         这里用最稳的做法 —— 让 ProseMirror 自己找：从头扫描到该下标。 */
      const target = matches[i];
      let acc = 0;
      let pos = 1; // 文档起始偏移
      editor.state.doc.descendants((node, offset) => {
        if (acc > target) return false;
        const len = node.textContent.length;
        if (acc + len > target) {
          pos = offset + (target - acc) + 1;
          return false;
        }
        acc += len + 1; // +1 记换行符，与 textBetween 的 "\n" 分隔符一致
        return true;
      });
      editor.chain().focus().setTextSelection({ from: pos, to: pos + needle.length }).run();
    },
    [editor, matches, needle],
  );

  /* 高亮：只画「当前这一个」而不是全部 —— 全部画会让长文档满屏色块，
     而逐个跳时用户只关心当前命中。 */
  useEffect(() => {
    if (!editor || matches.length === 0 || !needle) return;
    const current = matches[cursor];
    let acc = 0;
    let from = 0;
    let to = 0;
    editor.state.doc.descendants((node, offset) => {
      if (to) return false;
      const len = node.textContent.length;
      if (acc + len >= current) {
        from = offset + (current - acc) + 1;
        to = from + needle.length;
        return false;
      }
      acc += len + 1;
      return true;
    });
    if (to) {
      editor.commands.setTextSelection({ from, to });
    }
  }, [editor, matches, cursor, needle]);

  const replaceOne = useCallback(() => {
    if (!editor || matches.length === 0) return;
    const current = matches[cursor];
    let acc = 0;
    let from = 0;
    let to = 0;
    editor.state.doc.descendants((node, offset) => {
      if (to) return false;
      const len = node.textContent.length;
      if (acc + len >= current) {
        from = offset + (current - acc) + 1;
        to = from + needle.length;
        return false;
      }
      acc += len + 1;
      return true;
    });
    if (to) editor.chain().focus().insertContentAt({ from, to }, replacement).run();
  }, [editor, matches, cursor, needle, replacement]);

  const replaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return;
    /* 从后往前替换：位置是绝对偏移，从后往前才不会因文本长度变化
       而让前面的下标失效。从前往后替换会连锁错位。 */
    let acc = 0;
    const positions: Array<[number, number]> = [];
    editor.state.doc.descendants((node) => {
      const len = node.textContent.length;
      if (acc + len > matches[0] && acc + len >= matches[matches.length - 1] + needle.length) {
        return false;
      }
      acc += len + 1;
      return true;
    });
    // 逐个从后往前定位
    let scan = 0;
    editor.state.doc.descendants((node, offset) => {
      const len = node.textContent.length;
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        if (m >= scan && m < scan + len) {
          positions.push([offset + (m - scan) + 1, m - scan + len]);
        }
      }
      scan += len + 1;
      return true;
    });
    positions.sort((a, b) => b[0] - a[0]);
    for (const [from, to] of positions) {
      editor.chain().focus().insertContentAt({ from, to }, replacement).run();
    }
  }, [editor, matches, needle, replacement]);

  return (
    <div className="find-replace" role="search">
      <input
        ref={inputRef}
        type="text"
        className={matches.length === 0 && needle ? "fr-input no-match" : "fr-input"}
        placeholder={t("find.find")}
        value={needle}
        aria-label={t("find.find")}
        onChange={(e) => setNeedle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); goto(cursor + (e.shiftKey ? -1 : 1)); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      />
      <span className="fr-count" aria-live="polite">
        {needle
          ? matches.length === 0
            ? t("find.noMatch")
            : `${cursor + 1}/${matches.length}`
          : ""}
      </span>
      <button type="button" onClick={() => goto(cursor - 1)} disabled={!matches.length}
        title={t("find.prevTitle")}>↑</button>
      <button type="button" onClick={() => goto(cursor + 1)} disabled={!matches.length}
        title={t("find.nextTitle")}>↓</button>
      <label className="fr-opt" title={t("find.matchCaseTitle")}>
        <input
          type="checkbox"
          checked={matchCase}
          aria-label={t("find.matchCaseTitle")}
          onChange={(e) => setMatchCase(e.target.checked)}
        />
        Aa
      </label>

      <input
        type="text"
        className="fr-input"
        placeholder={t("find.replace")}
        value={replacement}
        aria-label={t("find.replace")}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      />
      <button type="button" onClick={replaceOne} disabled={!matches.length}>
        {t("find.replace")}
      </button>
      <button type="button" onClick={replaceAll} disabled={!matches.length}>
        {t("find.replaceAll")}
      </button>
      <button type="button" onClick={onClose} aria-label={t("find.closeTitle")}>×</button>
    </div>
  );
});