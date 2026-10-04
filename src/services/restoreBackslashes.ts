/**
 * Tiptap 序列化结果的**写盘还原层**。
 *
 * ## 为什么需要这一层（全部为实测，非推测）
 * 富文本视图打开文档、什么都不改直接保存，Tiptap 的 markdown 层会改写内容：
 *
 * | 原文 | Tiptap 原始输出 | 危害 |
 * |---|---|---|
 * | `\int_0`（LaTeX 命令） | `\\int_0` | 反斜杠翻倍 → 公式多重转义，静默变形 |
 * | `\,`（LaTeX 细空格） | `,` | **反斜杠被吃掉** → 公式语义丢失 |
 * | `_` `*` `[` `]` `~` `` ` `` | `\_` `\*` … | 转义是对的但**污染源码**：用户看到 `\int\_0` 会以为写错了 |
 * | `<` `>` | `&lt;` `&gt;` | HTML 实体化，正文里纯属噪音 |
 * | 文档末尾换行 | 丢失 | git 显示「no newline at end of file」；违 POSIX 文本约定 |
 *
 * 严重性：前两项是**内容篡改** —— 用户打开预览才发现公式坏了，且无从追溯
 * 是哪一次保存造成的。后三项是源码污染，不影响渲染但让用户怀疑自己的文件。
 *
 * ## 分工：两个函数，一个在编辑器前、一个在编辑器后
 *
 *   protectEscapedChars   （进编辑器前）把「反斜杠 + 标点」藏进占位符。
 *                         这些是 LaTeX 语义字符（`\,` `\(` `\!` `\%` `\$`），
 *      Tiptap 会解析成 markdown 转义并丢掉反斜杠，**出了编辑器就不可逆**。
 *
 *   restoreEscapedBackslashes（写盘前）折半翻倍的、去掉它多加的转义与实体、
 *                         按原文补回末尾换行。
 *
 * ## 为什么不在 Tiptap 里修
 * 这是 `@tiptap/markdown` 序列化层的缺陷。该包版本号稳定（3.x）但官方文档
 * 仍标注 early release，属「已知会变」的状态 —— 与其赌上游何时修，不如在自己
 * 的写盘边界上把结果钉住。范围严格限定**代码块与行内代码之外**：围栏内的
 * 反斜杠是用户代码的字面内容，Tiptap 在那里本来就是对的。
 */

/** 与 `markdown.ts` 的 `mapOutsideCode` 同法：按围栏/行内代码切段，奇数段原样保留。 */
const CODE_SPLIT = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

/** 对每个分段套用变换；奇数段（代码）原样返回。 */
function mapOutsideCode(markdown: string, fn: (segment: string) => string): string {
  return markdown
    .split(CODE_SPLIT)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/* 占位符用 Unicode 私有区（U+E000 起）——踩过两次坑才定下来：
 *   · 空格当分隔：正文里出现同名字面文本就误换，而 "rtbs" 用户真可能写
 *   · ASCII NUL：源码文件里成了**裸字节**，grep 判为二进制、diff 失真
 * 私有区字符：markdown 源里不会出现、编辑器不产生、在源码视图里可见。 */
const SENTINEL_START = String.fromCharCode(0xe000);
const SENTINEL_END = String.fromCharCode(0xe001);

/** 「刚解出来的转义」在处理期间的临时占位 —— 用另一个私有区码位，
 *  与 SENTINEL 区分，且同样用 fromCharCode 以免源码里出现裸控制字节。 */
const MARK = String.fromCharCode(0xe002);

/** 文件是否以换行结尾。 */
function hasTrailingNewline(s: string): boolean {
  return s.endsWith("\n") || s.endsWith("\r\n");
}

/* ── 一、输入端：protectEscapedChars ─────────────────────────────────── */

/**
 * 把「反斜杠 + 非字母数字」换成占位符。内容进编辑器**之前**调用。
 *
 * 只处理标点类（`\,` `\(` `\)` `\[` `\]` `\!` `\%` `\$` `\-` …）。
 * 刻意**不**处理 `\n` `\f` `\i` 这类 LaTeX 命令：Tiptap 对它们的处理是
 * 「翻倍」，可逆，由写盘前那层折半解决；保护它们反而多一层无谓转换。
 *
 * @param markdown 磁盘原文
 * @returns 可安全交给 Tiptap 的文本
 */
export function protectEscapedChars(markdown: string): string {
  return mapOutsideCode(markdown, (seg) =>
    seg.replace(/\\([^A-Za-z0-9])/g, (_m, ch: string) =>
      `${SENTINEL_START}${ch}${SENTINEL_END}`,
    ),
  );
}

/* ── 二、写盘端：unprotect + 折半/去转义/补换行 ──────────────────────── */

/**
 * 把占位符换回「反斜杠 + 字符」，并**保护**它不被后续的「去转义」脱掉。
 *
 * ⚠️ 为什么要多这一层标记：`\[ x \]` 进出两轮后会变成 `[ x ]` ——
 * 保护层放它出来，写盘层又把它当Tiptap 多加的转义脱掉。LaTeX 的显示模式
 * 标记（`\[`）丢了，公式就坏在预览里。
 *
 * 标记用**零宽**形式：写成 `\` + 字符 + U+E002，最终剥标记时不会在源码里留痕。
 */
export function unprotectEscapedChars(markdown: string): string {
  if (!markdown.includes(SENTINEL_START)) return markdown;
  /* 手工切分而非拼正则。占位符里含 Unicode 私有区字符，写成
   * `new RegExp(`${SENTINEL_START}(.)...`)` 要过两道解析：模板串先吃掉
   * 反斜杠，正则再吃掉一层 —— 两次都栽在同一个地方，改用 split 最省心。
   *
   * 切分后奇数下标是被藏起来的那个字符，替回「反斜杠 + MARK + 它」——
   * 与 restoreEscapedBackslashes 里的暂存顺序严格对应。 */
  const BSLASH = String.fromCharCode(92);
  /* 占位符形态是「起始符 + 被藏字符 + 结束符」三个字符，
   * 故按起始符切开后，奇数段的首字符即被藏字符、其余是尾随正文。 */
  const parts = markdown.split(SENTINEL_START);
  if (parts.length === 1) return markdown;
  return parts
    .map((seg, i) => {
      if (i === 0) return seg;
      const ch = seg.charAt(0);
      const rest = seg.slice(1).replace(SENTINEL_END, "");
      return `${BSLASH}${MARK}${ch}${rest}`;
    })
    .join("");
}

export function restoreEscapedBackslashes(markdown: string, original?: string): string {
  const restored = mapOutsideCode(markdown, (seg) => {
    /* 把「刚由占位符解出来的转义」摘出来暂存。
     *
     * 匹配「反斜杠 + MARK」，存下它后面那个字符、换成光秃秃的 MARK ——
     * 于是折半与去转义两步都看不见它（它们只处理反斜杠），处理完再放回。
     *
     * ⚠️ 存的是**被藏的字符**，不是 MARK 本身。早先写成
     * `marked.push(MARK)`，放回时又 `marked.shift()` 拼进模板 —— 结果
     * MARK 自己被当成被藏的字符塞回去，标记永远剥不掉。
     */
    /* 把「刚由占位符解出来的转义」摘出来暂存。
     *
     * 顺序：`unprotectEscapedChars` 写出的是 `\` + MARK + 字符。这一段要
     * 把它换成「只有 MARK」，让随后的折半与去转义两步**看不见**这个反斜杠 ——
     * 它们只处理反斜杠，看不见才不会被误改。处理完再放回去。
     *
     * ⚠️ 匹配式**不能用模板串拼反斜杠**。模板串先解析一遍（`\\` → 一个
     * 字面 `\`），拼进 RegExp 后那个 `\` 又是转义符，把 MARK 吃掉 ——
     * 实测症状是暂存段永不命中，输出 `a\,\b`（多一个反斜杠）。
     * 用 String.raw 从头到尾只解析一次，或者干脆手工构造：
     * 这里用 `String.fromCharCode(92)` 拼，绕开全部转义歧义。
     *
     * 存的必须是**被藏的那个字符**，不是 MARK 本身（否则放回时把标记也
     * 塞回去，标记永远剥不掉）。
     */
    const BSLASH = String.fromCharCode(92);
    const hidden: string[] = [];
    let work = seg;
    /* 去掉「反斜杠 + MARK」，只留 MARK；随后按 MARK 切分，奇数段的首字符
       即被藏的那个字符 —— 收进 hidden，纯文本拼回 plain。
       ⚠️ 必须是「去掉反斜杠后按 MARK 切」这个顺序。早先写成
       `split(BSLASH + MARK).join(MARK).split(MARK)`，逻辑等价，但下一步
       `plain.push(marked[i])` 把被藏字符连同它的余下正文一起塞进了纯文本，
       放回时索引错位 —— 表现是 `\(x\)` 出来成 `(x)`，反斜杠凭空消失。 */
    const stripped = seg.split(BSLASH + MARK).join(MARK);
    if (stripped.includes(MARK)) {
      const parts = stripped.split(MARK);
      for (let i = 0; i < parts.length; i++) {
        /* 奇数段 = 「被藏字符 + 其后的正文」。被藏字符**不**摘出来 ——
         * 它只是标记「这里原本有个反斜杠」，字符本身仍在正文里，
         * 放回时补上反斜杠即可。
         * ⚠️ 早先把奇数段整段 push 进 plain（还多切了个 slice），
         * 于是 work 变成 "ab" —— 被藏的 `,` 连同 MARK 一起消失。
         * 表现是输出短一个字符，极难归因。 */
        if (i % 2 === 1) hidden.push(parts[i].charAt(0));
      }
      work = stripped;
    }

    work = work
      // 折半：连续偶数个反斜杠 → 一半（多写一层转义的逆运算）
      .replace(/\\{2,}/g, (m) => "\\".repeat(m.length / 2))
      // 去掉 Tiptap 多加的转义与 HTML 实体（详见文件头说明）
      .replace(/\\([_*[\]~`])/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    /* 放回暂存段：每个 MARK 前补一个反斜杠 —— 它们都是被藏起来的转义。
     * 用字符串拼接而非模板串：模板串里 `\\` 是**一个**反斜杠（正确），
     * 但这行已经被反复改过、两次栽在转义上 —— 显式拼接没有歧义。 */
    /* 放回暂存段：每个 MARK 前补一个反斜杠。
     * ⚠️ 只补反斜杠，**不要**再把 hidden 里的字符拼上去 ——
     * 那个字符本来就在 stripped 里（stripped 只是「去掉反斜杠」，
     * 字符从没被摘走）。早先写成 BSLASH + hidden[i++]，
     * 于是 `a\,b` 变成 `a\,,b`（多一个逗号）。 */
    return work.replace(new RegExp(MARK, "g"), () => BSLASH);
  });

  if (original && hasTrailingNewline(original) && !hasTrailingNewline(restored)) {
    return restored.replace(/\r?\n?$/, "\n");
  }
  return restored;
}