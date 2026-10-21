// UI strings for Rocktier Write.
// Default language: English (per family convention; do not follow system locale).
// Supports 2 languages: en (default), zh. Converged from 9 on 2026-10-13 (family ruling $locales_2026_10_13).
import { useEffect, useReducer } from "react";

export type Lang = "en" | "zh";

/* 2026-10-04 键改名（"rocktier-write-lang" → "rocktier.lang"），读取处回落旧键。
 * 语言是用户感知最强的偏好，重置一次就等于「中文用户变英文界面」。 */
const STORE_KEY = "rocktier.lang";
const STORE_KEY_LEGACY = "rocktier-write-lang";

/** ⌘ on macOS, Ctrl+ elsewhere — shortcut hints are written with ⌘ in the dictionary. */
const MOD_KEY =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) ? "⌘" : "Ctrl+";

// Family language standard (2026-10-13 ruling): en / zh two doors only.
// Both share the en key set; an unknown saved value falls back to en.
export const UI_LANGS: ReadonlyArray<{ id: Lang; label: string }> = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
];

const STRINGS = {
  en: {

    // 富文本模式（2026-10-04 Tiptap 选型）—— 视图由二态变三态：富文本 / 源码 / 预览。
    // `toolbar.editView` 保留原键名并沿用原义（源码），避免改键名让老用户
    // 本地存的界面语言设置失效。
    // Slash 菜单（2026-10-04）—— labelKey 必须与 SlashMenu.tsx 的 SlashKey 联合一致。
    "slash.menuLabel": "Insert block",
    "slash.paragraph": "Text",
    "slash.heading1": "Heading 1",
    "slash.heading2": "Heading 2",
    "slash.heading3": "Heading 3",
    "slash.bulletList": "Bulleted list",
    "slash.orderedList": "Numbered list",
    "slash.taskList": "Task list",
    "slash.blockquote": "Quote",
    "slash.codeBlock": "Code block",
    "slash.divider": "Divider",
    "rt.toolbarLabel": "Formatting",
    "rt.undo": "Undo",
    "rt.redo": "Redo",
    "rt.addLink": "Add link…",
    "rt.removeLinkConfirm": "Remove this link?",
    "toolbar.richView": "Rich",
    "toolbar.sourceView": "Source",
    "rt.bold": "Bold",
    "rt.italic": "Italic",
    "rt.strike": "Strikethrough",
    "rt.h1": "Heading 1",
    "rt.h2": "Heading 2",
    "rt.bulletList": "Bulleted list",
    "rt.orderedList": "Numbered list",
    "rt.taskList": "Task list",
    "rt.blockquote": "Quote",
    "rt.codeBlock": "Code block",
    "rt.link": "Link",
    "sidebar.close": "Close",
    "toolbar.toggleSidebar": "Chapters (\\)",
    "toolbar.info": "Document info",
    "toolbar.new": "New (⌘N)",
    "toolbar.open": "Open (⌘O)",
    "toolbar.save": "Save (⌘S)",
    "toolbar.saveAs": "Save as",
    "toolbar.find": "Find & Replace (⌘F)",
    "toolbar.theme": "Toggle theme",
    "theme.mode.auto": "Follow system",
    "theme.mode.light": "Light",
    "theme.mode.dark": "Dark",
    "toolbar.unsaved": "Unsaved changes",
    "toolbar.focusOff": "Off",
    "toolbar.focusParagraph": "Paragraph",
    "toolbar.focusSentence": "Sentence",
    "toolbar.focusCycle": "Cycle focus mode",
    "toolbar.typewriter": "Typewriter",
    "toolbar.typewriterOn": "On",
    "toolbar.typewriterOff": "Off",
    "toolbar.typewriterCycle": "Toggle typewriter scrolling",
    "toolbar.statAria": "{n} words / {m} min read",
    "toolbar.importDocx": "Import DOCX",
    "toolbar.exportDocx": "Export DOCX",
    "toolbar.setGoal": "Set word goal",
    "confirm.recover": "An unsaved draft was found. Restore it?",
    "confirm.recoverNamedCount": "({n} unsaved draft(s) in total.)",
    "confirm.recoverUntitled": "An unsaved new document was found. Restore it?",
    "toolbar.import": "Import",
    "toolbar.findShort": "Find",
    "toolbar.focus": "Focus",
    "toolbar.groupCreate": "Create and open",
    "toolbar.groupOutput": "Export",
    "toolbar.groupTools": "Tools",
    "toolbar.goalShort": "Goal",
    "toolbar.clearGoal": "Clear goal",
    "toolbar.setGoalPrompt": "Target word count (0 to cancel):",
    "toolbar.goalProgress": "{pct}% done",
    "toolbar.goalPlaceholder": "words",
    "find.noMatch": "No matches",
    "find.matchCaseTitle": "Match case",
    "find.find": "Find",
    "find.replace": "Replace",
    "find.replaceAll": "All",
    "find.prevTitle": "Previous (Shift+Enter)",
    "find.nextTitle": "Next (Enter)",
    "find.replaceTitle": "Replace current",
    "find.replaceAllTitle": "Replace all (undoable)",
    "find.closeTitle": "Close (Esc)",
    "find.matchCase": "Match case",
    "find.useRegex": "Use regex",
    "dashboard.title": "Workspace statistics",
    "dashboard.totalWords": "Total words",
    "dashboard.ofGoal": "of {goal} goal",
    "dashboard.docsProgress": "{completed} / {total} docs hit goal",
    "toast.fileOpened": "File opened",
    "toast.saved": "Saved",
    "toast.savedAs": "Saved as new file",
    "toast.newDoc": "New document",
    "toast.saveFailed": "Save failed: could not write file",
    "toast.unsupportedType": "Unsupported file type",
    "toast.cannotReadFile": "Could not read file",
    "toast.cannotOpenFile": "Could not open file",
    "toast.reloaded": "Reloaded",
    "toast.docxImported": "DOCX imported",
    "toast.docxExported": "DOCX exported",
    "confirm.discard": "This document has unsaved changes. Discard them?",
    "confirm.externalChange": "This file was changed externally. Reload it? Unsaved changes will be lost.",
    "confirm.recoverNamedNewer": "An unsaved draft for \"{name}\" was found and is newer than the file on disk. Restore it?",
    "confirm.recoverNamedOlder": "An unsaved draft for \"{name}\" was found, but it is older than the file on disk. Restoring it would overwrite newer content. Restore anyway?",
    "doc.untitled": "Untitled",
    "status.words": "{n} words",
    "status.chars": "{n} chars",
    "status.minutes": "{m} min read",
    "status.session": "{m} min writing",
    "status.goal": "{pct}%",
    "status.focusOff": "Focus: Off",
    "status.focusParagraph": "Focus: Paragraph",
    "status.focusSentence": "Focus: Sentence",
    "status.focusToggle": "Toggle focus mode",
    "statusBar.lang": "Cycle language",
    "status.savedAt": "Saved {time}",    "status.draftSavedAt": "Draft saved {time}",    "status.unsaved": "Unsaved",    "status.savedTitle": "Saved to disk",    "status.draftTitle": "Draft auto-saved (crash recovery)",    "status.unsavedTitle": "Unsaved changes",
    "editor.placeholder": "Start writing…",
    "chapters.title": "Chapters",
    "chapters.empty": "No headings yet (use # Heading)",
    "chapters.goalPlaceholder": "words",
    "chapters.setGoal": "Set chapter word goal",
    "chapters.goalBadge": "goal: {goal}",
    "toolbar.preview": "Preview",
    "toolbar.editView": "Edit",
    "menu.exportPdf": "Export PDF",
    "recent.title": "Open Recent",
    "recent.empty": "No recent files",
    "recent.clear": "Clear",
    "frontmatter.title": "Document Info",
    "frontmatter.empty": "No frontmatter",
    "frontmatter.field": "Field",
    "frontmatter.value": "Value",
    "frontmatter.save": "Save",
    "frontmatter.removeRow": "Remove row",
    "frontmatter.add": "Add field",
    "toast.pastedImage": "Image pasted",
    "toast.imageFailed": "Failed to save image",
    "toast.saveFirstForImage": "Save the document first before pasting images",
    "license.title": "License",
    "license.loading": "Checking…",
    "license.trialLeft": "Free trial — {days} day(s) left.",
    "license.trialChip": "Trial · {days}d",
    "license.expiredChip": "Not activated",
    "license.expired": "Your trial has ended. Reading and previewing still work; saving and exporting need a license.",
    "license.licensed": "Licensed. Thank you.",
    "license.licensedFamily": "Licensed — family bundle. Every Rocktier app is unlocked.",
    "license.licensedNote": "This copy is activated. No further checks, and no network access.",
    "license.storeNote": "This copy came from the Microsoft Store, so the Store handles the license for it.",
    "license.notConfigured": "This build cannot activate a code yet — it carries no verification key. Please write to hello@rocktier.com.",
    "license.codeLabel": "Activation code",
    "license.codePlaceholder": "RKT-…",
    "license.activate": "Activate",
    "license.activating": "Activating…",
    "license.buy": "Buy — $12.99",
    "license.close": "Close",
    "license.invalid": "That code was not accepted. Check it for a typo — the code is not case-sensitive.",
    "license.wrongProduct": "That code belongs to a different Rocktier app. Each app has its own code — or the family bundle, which unlocks all of them.",
    "license.refunded": "That code was refunded, so it no longer unlocks anything. If this is a mistake, write to hello@rocktier.com with your order number.",
    "license.revokedNotice": "This licence has been revoked — usually after a refund or a payment dispute. Your licence status has been reset. Activate again below to continue, or write to hello@rocktier.com (with your order number) if you believe this is a mistake.",
    "license.offline": "Could not reach rocktier.com. Activating needs one connection; after that the app stays offline.",
    "license.deviceLimit": "This code has reached its device limit. Deactivate a device at rocktier.com/license, then try again.",
    "update.check": "Check for updates",
    "update.checking": "Checking…",
    "update.upToDate": "You're up to date",
    "update.available": "Version {v} is available",
    "update.failed": "Couldn't check for updates",
    "update.lastChecked": "Last checked {date}",
    "update.never": "Never",
    "update.download": "Get {v}",
    "update.privacyNote": "Only checks when you click — the app never checks on its own",
    "update.close": "Close",
    "update.openReleases": "Open releases",
    "update.openReleasesHint": "You can also open the releases page directly.",
    "license.whereToFind": "Your code was shown on the page right after payment, and is in the purchase email too.",
    "license.privacyNote": "Activating sends the code to rocktier.com once and stores the signed reply locally. Nothing else is sent.",
  },
  zh: {

    // 富文本模式（2026-10-04 Tiptap 选型）—— 视图由二态变三态：富文本 / 源码 / 预览。
    // `toolbar.editView` 保留原键名并沿用原义（源码），避免改键名让老用户
    // 本地存的界面语言设置失效。
    // Slash 菜单（2026-10-04）—— labelKey 必须与 SlashMenu.tsx 的 SlashKey 联合一致。
    "slash.menuLabel": "插入块",
    "slash.paragraph": "正文",
    "slash.heading1": "标题 1",
    "slash.heading2": "标题 2",
    "slash.heading3": "标题 3",
    "slash.bulletList": "无序列表",
    "slash.orderedList": "有序列表",
    "slash.taskList": "任务列表",
    "slash.blockquote": "引用",
    "slash.codeBlock": "代码块",
    "slash.divider": "分割线",
    "rt.toolbarLabel": "格式",
    "rt.undo": "撤销",
    "rt.redo": "重做",
    "rt.removeLinkConfirm": "移除这个链接？",
    "toolbar.richView": "富文本",
    "toolbar.sourceView": "源码",
    "rt.bold": "粗体",
    "rt.italic": "斜体",
    "rt.strike": "删除线",
    "rt.h1": "标题 1",
    "rt.h2": "标题 2",
    "rt.bulletList": "无序列表",
    "rt.orderedList": "有序列表",
    "rt.taskList": "任务列表",
    "rt.blockquote": "引用",
    "rt.codeBlock": "代码块",
    "rt.link": "链接",
    "rt.addLink": "添加链接…",
    "sidebar.close": "关闭",
    "toolbar.toggleSidebar": "章节 (\\)",
    "toolbar.info": "文档信息",
    "toolbar.new": "新建 (⌘N)",
    "toolbar.open": "打开 (⌘O)",
    "toolbar.save": "保存 (⌘S)",
    "toolbar.saveAs": "另存为",
    "toolbar.find": "查找替换 (⌘F)",
    "toolbar.theme": "切换主题",
    "theme.mode.auto": "跟随系统",
    "theme.mode.light": "浅色",
    "theme.mode.dark": "深色",
    "toolbar.unsaved": "有未保存的更改",
    "toolbar.focusOff": "关",
    "toolbar.focusParagraph": "段落",
    "toolbar.focusSentence": "句子",
    "toolbar.focusCycle": "切换专注模式",
    "toolbar.typewriter": "打字机",
    "toolbar.typewriterOn": "开",
    "toolbar.typewriterOff": "关",
    "toolbar.typewriterCycle": "切换打字机滚动",
    "toolbar.statAria": "{n} 词 / {m} 分钟阅读",
    "toolbar.importDocx": "导入 DOCX",
    "toolbar.exportDocx": "导出 DOCX",
    "toolbar.setGoal": "设置字数目标",
    "confirm.recover": "检测到未保存的草稿，是否恢复？",
    "confirm.recoverNamedCount": "（本地另有 {n} 份未保存的草稿。）",
    "confirm.recoverNamedNewer": "检测到未保存的草稿「{name}」，且它比磁盘上的文件新。是否恢复？",
    "confirm.recoverNamedOlder": "检测到未保存的草稿「{name}」，但它比磁盘上的文件旧。恢复会用旧内容覆盖磁盘，确定恢复吗？",
    "confirm.recoverUntitled": "检测到一份从未保存的新文档草稿，是否恢复？",
    "toolbar.import": "导入",
    "toolbar.findShort": "查找",
    "toolbar.focus": "专注",
    "toolbar.groupCreate": "新建与打开",
    "toolbar.groupOutput": "导出",
    "toolbar.groupTools": "工具",
    "toolbar.goalShort": "目标",
    "toolbar.clearGoal": "清除字数目标",
    "toolbar.setGoalPrompt": "目标字数（0 取消）：",
    "toolbar.goalProgress": "已完成 {pct}%",
    "toolbar.goalPlaceholder": "字数",
    "find.noMatch": "无匹配",
    "find.matchCaseTitle": "区分大小写",
    "find.find": "查找",
    "find.replace": "替换",
    "find.replaceAll": "全部替换",
    "find.prevTitle": "上一个 (Shift+Enter)",
    "find.nextTitle": "下一个 (Enter)",
    "find.replaceTitle": "替换当前匹配",
    "find.replaceAllTitle": "全部替换（可撤销）",
    "find.closeTitle": "关闭 (Esc)",
    "find.matchCase": "区分大小写",
    "find.useRegex": "使用正则表达式",
    "dashboard.title": "工作区统计",
    "dashboard.totalWords": "总字数",
    "dashboard.ofGoal": "目标 {goal}",
    "dashboard.docsProgress": "{completed} / {total} 个文档达标",
    "toast.fileOpened": "已打开",
    "toast.saved": "已保存",
    "toast.savedAs": "已另存为新文件",
    "toast.newDoc": "新文档",
    "toast.saveFailed": "保存失败：无法写入文件",
    "toast.unsupportedType": "不支持的文件类型",
    "toast.cannotReadFile": "无法读取文件",
    "toast.cannotOpenFile": "无法打开文件",
    "toast.reloaded": "已重新加载",
    "toast.docxImported": "DOCX 已导入",
    "toast.docxExported": "DOCX 已导出",
    "confirm.discard": "当前文档有未保存的更改，确定要丢弃吗？",
    "confirm.externalChange": "文件已在外部被修改。是否重新加载？未保存的更改将丢失。",
    "doc.untitled": "未命名",
    "status.words": "{n} 词",
    "status.chars": "{n} 字",
    "status.minutes": "{m} 分钟阅读",
    "status.session": "本次 {m} 分钟",
    "status.goal": "{pct}%",
    "status.focusOff": "专注：关",
    "status.focusParagraph": "专注：段落",
    "status.focusSentence": "专注：句子",
    "status.focusToggle": "切换专注模式",
    "statusBar.lang": "切换语言",
    "status.savedAt": "已保存 {time}",    "status.draftSavedAt": "草稿已自动保存 {time}",    "status.unsaved": "未保存",    "status.savedTitle": "已保存到磁盘",    "status.draftTitle": "草稿已自动保存（崩溃恢复用）",    "status.unsavedTitle": "有未保存的修改",
    "editor.placeholder": "开始专注写作…",
    "chapters.title": "章节",
    "chapters.empty": "尚无章节标题（使用 # 标题）",
    "chapters.goalPlaceholder": "字数",
    "chapters.setGoal": "设置章节字数目标",
    "chapters.goalBadge": "目标：{goal}",
    "toolbar.preview": "预览",
    "toolbar.editView": "编辑",
    "menu.exportPdf": "导出 PDF",
    "recent.title": "打开最近文件",
    "recent.empty": "暂无最近文件",
    "recent.clear": "清空列表",
    "frontmatter.title": "文档信息",
    "frontmatter.empty": "无前置元数据",
    "frontmatter.field": "字段",
    "frontmatter.value": "值",
    "frontmatter.save": "保存",
    "frontmatter.removeRow": "删除该行",
    "frontmatter.add": "添加字段",
    "toast.pastedImage": "图片已粘贴",
    "toast.imageFailed": "保存图片失败",
    "toast.saveFirstForImage": "请先保存文档再粘贴图片",
    "license.title": "许可与激活",
    "license.loading": "正在检查…",
    "license.trialLeft": "免费试用中 —— 还剩 {days} 天。",
    "license.trialChip": "试用 {days} 天",
    "license.expiredChip": "未激活",
    "license.expired": "试用已结束。阅读与预览仍可用；保存与导出需要许可。",
    "license.licensed": "已激活。谢谢。",
    "license.licensedFamily": "已激活 —— 全家桶，所有 Rocktier 应用均已解锁。",
    "license.licensedNote": "此副本已激活。此后不再有任何校验，也不联网。",
    "license.storeNote": "此副本购自微软商店，许可由商店负责。",
    "license.notConfigured": "此构建尚未配置验签公钥，暂时无法激活。请写信到 hello@rocktier.com。",
    "license.codeLabel": "激活码",
    "license.codePlaceholder": "RKT-…",
    "license.activate": "激活",
    "license.activating": "正在激活…",
    "license.buy": "购买 — $12.99",
    "license.close": "关闭",
    "license.invalid": "该激活码未被接受。请检查是否输错（不区分大小写）。",
    "license.wrongProduct": "这个激活码属于另一个 Rocktier 应用。每个应用各有自己的码，或者用全家桶（可解锁全部）。",
    "license.refunded": "这个激活码对应的购买已退款，因此不能再解锁。如属误判，请把订单号发到 hello@rocktier.com。",
    "license.revokedNotice": "该许可已被吊销 —— 通常是退款或支付争议导致。授权状态已重置。在下方重新激活即可继续使用；若你认为这是误判，请把订单号发到 hello@rocktier.com。",
    "license.offline": "连不上 rocktier.com。激活需要一次联网，之后便不再联网。",
    "license.deviceLimit": "这张激活码的设备数已达上限。请先到 rocktier.com/license 解绑一台设备，再重试。",
    "update.check": "检查更新",
    "update.checking": "正在检查…",
    "update.upToDate": "已是最新版本",
    "update.available": "有新版本 {v}",
    "update.failed": "检查失败，请稍后再试",
    "update.lastChecked": "上次检查：{date}",
    "update.never": "从未检查",
    "update.download": "获取 {v}",
    "update.privacyNote": "点击才会联网，应用不会自动检查",
    "update.close": "关闭",
    "update.openReleases": "打开发布页",
    "update.openReleasesHint": "也可以直接打开发布页查看。",
    "license.whereToFind": "付款后页面上会显示激活码，购买确认邮件里也有一份。",
    "license.privacyNote": "激活会把激活码发送到 rocktier.com 一次，并把签名回执保存在本机。除此之外不传输任何内容。",
    /* 2026-10-04 删：en 块里多出一个 zh 块没有的键 goal，且 t("goal") 零引用。
     * 属字典垃圾 —— 补译一份反而是给死键续命。功能开关用的是
     * "toolbar.setGoal" / "dashboard.ofGoal"，与它无关。 */
},
} as const;

export type UiLang = Lang;
export type UiKey = keyof typeof STRINGS.en;

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(STORE_KEY_LEGACY);
    if (saved) {
      // Validate it's one of our 2 supported langs
      if (UI_LANGS.some((l) => l.id === saved)) return saved as Lang;
    }
  } catch {
    // storage unavailable
  }
  return "en";
}

let currentLang: Lang = detectLang();
document.documentElement.lang = currentLang === "zh" ? "zh-CN" : currentLang;

const listeners = new Set<() => void>();

export function getUiLang(): Lang {
  return currentLang;
}

export function setUiLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    // storage unavailable
  }
  listeners.forEach((fn) => fn());
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
}

/**
 * Cycle to the next language in the list (used by the language toggle button).
 * Wraps around from the last language back to the first.
 */
export function cycleUiLang(): Lang {
  const idx = UI_LANGS.findIndex((l) => l.id === currentLang);
  const next = UI_LANGS[(idx + 1) % UI_LANGS.length];
  setUiLang(next.id);
  return next.id;
}

export function t(key: UiKey, params?: Record<string, string | number>): string {
  let text: string = STRINGS[currentLang][key] ?? STRINGS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text.replaceAll("⌘", MOD_KEY);
}

/** Subscribe to language changes: triggers component re-render on lang switch. */
export function useUiLang(): Lang {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, [force]);
  return currentLang;
}

// Locale tag per UI lang for Intl APIs
const LOCALE_MAP: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
};

// ── v1.1 P2: Intl-aware date / relative time ──────────────────────────────────────────────

/**
 * Locale-aware date string using the active UI language (fallback to en).
 * e.g. "Jan 25, 2026" (en) / "2026 年 1 月 25 日" (zh).
 */
export function formatDate(
  date: Date | number | string,
  lang: Lang = currentLang,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_MAP[lang], opts).format(d);
}

/**
 * Relative-time string using Intl.RelativeTimeFormat.
 * e.g. "3 分钟前" / "2 hours ago".
 */
export function formatRelative(
  date: Date | number | string,
  lang: Lang = currentLang,
  opts: Intl.RelativeTimeFormatOptions = { numeric: "auto" },
): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = d.getTime() - now;
  const absSec = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE_MAP[lang], opts);
  const cutoff = 7 * 24 * 3600 * 1000;
  if (absSec > cutoff) return formatDate(d, lang);

  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (Math.abs(sec) < 60) return rtf.format(sec, "second");
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return rtf.format(day, "day");
}
