/**
 * Focus mode — keep the light on the paragraph or sentence you are writing.
 *
 * The previous implementation tried to do this in CSS against `.editor-area`,
 * a class that disappeared when the textarea was replaced by CodeMirror, so
 * switching modes did nothing visible. Dimming has to decorate real ranges,
 * which is what this does: everything outside the active paragraph or sentence
 * gets a mark, and the stylesheet fades it.
 */
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";

export type FocusMode = "off" | "paragraph" | "sentence";

const dim = Decoration.mark({ class: "cm-focus-dim" });

// Sentence ends here. Chinese and Latin punctuation both count, so a mixed
// paragraph still breaks where the writer expects it to.
const SENTENCE_END = /[。！？；….!?;]/;

function activeRange(view: EditorView, mode: Exclude<FocusMode, "off">): [number, number] {
  const { doc } = view.state;
  const head = view.state.selection.main.head;

  if (mode === "paragraph") {
    const here = doc.lineAt(head);
    let first = here.number;
    while (first > 1 && doc.line(first - 1).length > 0) first -= 1;
    let last = here.number;
    while (last < doc.lines && doc.line(last + 1).length > 0) last += 1;
    return [doc.line(first).from, doc.line(last).to];
  }

  const line = doc.lineAt(head);
  const offset = head - line.from;
  const text = line.text;
  let start = 0;
  for (let i = offset - 1; i >= 0; i -= 1) {
    if (SENTENCE_END.test(text[i])) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = offset; i < text.length; i += 1) {
    if (SENTENCE_END.test(text[i])) {
      end = i + 1;
      break;
    }
  }
  return [line.from + start, line.from + end];
}

function build(view: EditorView, mode: FocusMode): DecorationSet {
  if (mode === "off") return Decoration.none;
  const [from, to] = activeRange(view, mode);
  const ranges: Range<Decoration>[] = [];
  const length = view.state.doc.length;
  if (from > 0) ranges.push(dim.range(0, from));
  if (to < length) ranges.push(dim.range(to, length));
  return Decoration.set(ranges, true);
}

export function focusExtension(mode: FocusMode) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, mode);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          this.decorations = build(update.view, mode);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
