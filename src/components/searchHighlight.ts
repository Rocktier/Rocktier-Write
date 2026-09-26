/**
 * Search highlighting for our own Find panel.
 *
 * CodeMirror's built-in highlighter only draws decorations while ITS panel is
 * open; ours is a React component, so that gate never opens. And the matching
 * part of SearchQuery (highlight) is not in the public typings. So this does
 * the matching by hand over the visible ranges - plain indexOf or a global
 * regexp, same semantics as the counter in the Find panel - and marks every
 * match: cm-searchMatch for all, cm-searchMatch-selected for the one under
 * the cursor.
 */
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { getSearchQuery } from "@codemirror/search";
import type { Range } from "@codemirror/state";

const match = Decoration.mark({ class: "cm-searchMatch" });
const matchSelected = Decoration.mark({ class: "cm-searchMatch-selected" });

interface QuerySpec {
  search: string;
  replace?: string;
  caseSensitive?: boolean;
  regexp?: boolean;
}

function build(view: EditorView): DecorationSet {
  // getSearchQuery 返回 query 的 spec（普通对象）
  const spec = getSearchQuery(view.state) as unknown as QuerySpec;
  if (!spec?.search) return Decoration.none;

  let re: RegExp | null = null;
  if (spec.regexp) {
    try {
      re = new RegExp(spec.search, spec.caseSensitive ? "g" : "gi");
    } catch {
      return Decoration.none;          // 非法正则输入中，静默
    }
  }
  const needle = re ? spec.search : (spec.caseSensitive ? spec.search : spec.search.toLowerCase());

  const ranges: Range<Decoration>[] = [];
  const sel = view.state.selection.main;
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);
    if (re) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (!m[0].length) { re.lastIndex += 1; continue; }   // 零宽匹配防死循环
        const a = from + m.index;
        const selected = sel.from === a && sel.to === a + m[0].length;
        ranges.push((selected ? matchSelected : match).range(a, a + m[0].length));
      }
    } else {
      const hay = spec.caseSensitive ? text : text.toLowerCase();
      let idx = 0;
      while ((idx = hay.indexOf(needle, idx)) !== -1) {
        const a = from + idx;
        const selected = sel.from === a && sel.to === a + needle.length;
        ranges.push((selected ? matchSelected : match).range(a, a + needle.length));
        idx += needle.length;
      }
    }
  }
  return Decoration.set(ranges, true);
}

export function searchHighlight() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view);
      }

      update(update: ViewUpdate) {
        // 面板打字只派发 setSearchQuery（无文档/选区/视口变化）——查询词一变就必须重画
        const before = getSearchQuery(update.startState).search;
        const after = getSearchQuery(update.state).search;
        if (before !== after || update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
