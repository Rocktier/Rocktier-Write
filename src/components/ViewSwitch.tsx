/**
 * 视图切换 —— 富文本 / 源码 / 预览，三态（2026-10-04）。
 *
 * 为什么从二态变三态：富文本模式（Tiptap）是**并列的第三条路**，不是替换。
 * 三个视图共用同一份 markdown 内容，各有不可替代的用户：
 *   · 富文本 —— 不想学语法的人（多数非技术用户）
 *   · 源码   —— 要精确控制语法的人（写 GFM 表格、脚注、HTML 块）
 *   · 预览   —— 只读校对（且是前端唯一渲染数学公式与 Mermaid 的地方）
 *
 * 仍放在书写区而不是工具栏：工具栏放的是对文档的**动作**（导入、导出、目标），
 * 视图切换不是动作。三个按钮在同一角，切换时眼睛不必找第二次。
 *
 * `aria-pressed` 而非 `role="tab"`：三个视图换的是**同一份内容的不同呈现**，
 * 不是三个不同的面板 —— 用 tab 会让屏幕阅读器念出「选项卡」语义，误导。
 */
import { memo } from "react";
import { t } from "../i18n";

export type ViewMode = "rich" | "source" | "preview";

interface Props {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

type ViewLabelKey = "toolbar.richView" | "toolbar.editView" | "toolbar.preview";

/* key 用**字面量联合**而不是 `string`：t() 的签名要求字典键字面量，写成
   `string` 会让 t(key) 编译不过，也就没人会发现打错键名。 */
const MODES: ReadonlyArray<{ id: ViewMode; key: ViewLabelKey }> = [
  { id: "rich", key: "toolbar.richView" },
  { id: "source", key: "toolbar.editView" },
  { id: "preview", key: "toolbar.preview" },
];

export const ViewSwitch = memo(function ViewSwitch({ viewMode, onChange }: Props) {
  return (
    <div className="view-switch" role="group">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`view-switch-btn ${viewMode === m.id ? "active" : ""}`}
          onClick={() => onChange(m.id)}
          aria-pressed={viewMode === m.id}
        >
          {t(m.key)}
        </button>
      ))}
    </div>
  );
});