/* 家族标准语言表 —— 单一真源（与 PDF 仓同构）。 */

export const LOCALES = [
  { code: 'en', endonym: 'English', english: 'English' },
  { code: 'zh', endonym: '中文', english: 'Chinese' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];
