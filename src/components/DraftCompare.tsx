/**
 * 草稿对比对话框：把「磁盘上已保存的版本」与「当前编辑内容」做行内 diff。
 *
 * 为什么做：未保存标记只说「有改动」，不说改动在哪 —— 保存前看着 diff
 * 决定存不存，是写作者的刚需（借鉴帮小忙「文本比较」的交互，
 * 用 jsdiff 做行内标注；中英混排按内容自动选词级/字级，见 diffTexts）。
 *
 * 打开条件由调用方保证：已有磁盘文件且内容与磁盘不一致。
 */
import { useMemo } from "react";
import { t } from "../i18n";
import { diffStats, diffTexts } from "../utils/diffText";

interface Props {
  saved: string;
  current: string;
  path: string;
  onClose: () => void;
}

export function DraftCompare({ saved, current, path, onClose }: Props) {
  const changes = useMemo(() => diffTexts(saved, current), [saved, current]);
  const stats = useMemo(() => diffStats(changes), [changes]);

  return (
    <div className="license-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="license-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("compare.title")}
      >
        <div className="license-header">
          <h3>{t("compare.title")}</h3>
          <button type="button" className="license-close" onClick={onClose} aria-label={t("license.close")}>
            ×
          </button>
        </div>
        <div className="license-body compare-body">
          <div className="compare-meta">
            <span className="compare-stat ins">
              +{stats.added} {t("compare.added")}
            </span>
            <span className="compare-stat del">
              −{stats.removed} {t("compare.removed")}
            </span>
            <span className="compare-path" title={path}>
              {path}
            </span>
          </div>
          <div className="compare-view">
            {changes.map((c, i) =>
              c.added ? (
                <ins key={i}>{c.value}</ins>
              ) : c.removed ? (
                <del key={i}>{c.value}</del>
              ) : (
                <span key={i}>{c.value}</span>
              ),
            )}
          </div>
        </div>
        <div className="license-footer">
          <span className="license-footer-spacer" />
          <button type="button" onClick={onClose}>
            {t("compare.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
