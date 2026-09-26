/**
 * Rocktier Write — YAML frontmatter viewer / editor (sidebar section).
 * Uses services/markdown.ts extractFrontmatter + parseFrontmatter.
 * Edits write back to the active document via onContentChange.
 */
import { memo, useEffect, useState } from "react";
import { extractFrontmatter, parseFrontmatter, type Frontmatter } from "../services/markdown";
import { t } from "../i18n";

interface Props {
  content: string;
  onContentChange: (newContent: string) => void;
}

type Row = { key: string; value: string };

function toRows(fm: Frontmatter): Row[] {
  const builtin = new Set(["raw"]);
  const rows: Row[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (builtin.has(key) || value === undefined) continue;
    rows.push({ key, value });
  }
  return rows;
}

function serialize(rows: Row[]): string {
  return rows
    .filter((r) => r.key.trim() !== "")
    .map((r) => `${r.key}: ${r.value}`)
    .join("\n");
}

export const FrontmatterPanel = memo(function FrontmatterPanel({ content, onContentChange }: Props) {
  const extracted = extractFrontmatter(content);
  const [rows, setRows] = useState<Row[]>(() => toRows(parseFrontmatter(extracted.frontmatter ?? "")));
  const [dirty, setDirty] = useState(false);

  // Reload when document changes (e.g. user switches tabs / opens file)
  useEffect(() => {
    setRows(toRows(parseFrontmatter(extracted.frontmatter ?? "")));
    setDirty(false);
  }, [extracted.frontmatter]);

  const save = () => {
    if (!dirty) return;
    const newFm = serialize(rows);
    let next: string;
    if (extracted.frontmatter !== null) {
      const marker = content.slice(0, content.length - extracted.body.length);
      const idx = content.indexOf(marker);
      next = idx >= 0 ? content.slice(0, idx) + "---\n" + newFm + "\n---\n" + extracted.body : "---\n" + newFm + "\n---\n" + content;
    } else {
      next = newFm.trim() ? "---\n" + newFm + "\n---\n\n" + content : content;
    }
    onContentChange(next);
    setDirty(false);
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { key: "", value: "" }]);
    setDirty(true);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const empty = extracted.frontmatter === null && rows.length === 0;

  return (
    <section className="frontmatter-panel" aria-label={t("frontmatter.title")}>
      <div className="fm-header">
        <span className="fm-title">{t("frontmatter.title")}</span>
        {dirty && (
          <button className="fm-save" onClick={save} title={t("frontmatter.save")} aria-label={t("frontmatter.save")}>
            {t("frontmatter.save")}
          </button>
        )}
      </div>
      {empty ? (
        <div className="fm-empty">{t("frontmatter.empty")}</div>
      ) : (
        <table className="fm-table">
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.key}-${i}`}>
                <td>
                  <input
                    className="fm-input"
                    value={r.key}
                    placeholder={t("frontmatter.field")}
                    onChange={(e) => updateRow(i, { key: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="fm-input"
                    value={r.value}
                    placeholder={t("frontmatter.value")}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                  />
                </td>
                <td>
                  <button className="fm-remove" onClick={() => removeRow(i)} title={t("frontmatter.removeRow")} aria-label={t("frontmatter.removeRow")}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="fm-footer">
        <button className="fm-add" onClick={addRow} title={t("frontmatter.add")} aria-label={t("frontmatter.add")}>
          + {t("frontmatter.add")}
        </button>
      </div>
    </section>
  );
});
