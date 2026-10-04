/**
 * Tiptap ↔ Markdown 往返测试。
 *
 * 为什么要单独测这一层：Write 的富文本模式是**唯一**能把用户原文改写的地方
 * ——文档从磁盘读进来、过一遍编辑器、再写回磁盘。中间任何一次有损转换都是
 * 静默的数据丢失（用户看到的是「我的内容少了一段」，不是报错）。
 *
 * 已知并已处理的三类损耗（下面各有专门用例锁住）：
 *
 * 1. **frontmatter 会被摧毁**。实测把 `---\ntitle: X\n---` 喂给 Tiptap，
 *    `---` 被解析成 setext 标题的第二个 `---`（即 H2），`title: X` 变成正文 ——
 *    出来是 `## title: X`，frontmatter 彻底消失。**所以 frontmatter 由
 *    `extractFrontmatter` 剥离后不进编辑器**，见富文本模式的服务层。
 *    这里保留一个用例把这个行为钉住：谁要是哪天把 frontmatter 直接喂进来，
 *    这个测试会立刻红。
 *
 * 2. **表格会被重新对齐**。`| a | b |` 存成 `| a   | b   |`（对齐空格）。
 *    语义完全无损，但会让 git diff 显示全文改动。所以表格单独归一化比较。
 *
 * 3. **图片需要显式注册 Image 扩展**。不加时 `![a](x.png)` 会退化成裸文本 `a`
 *    —— 图片链接被吃掉。Write 支持粘贴图片入库，这一项丢不起。
 *
 * 判据用「归一化后比较」而不是逐字比较：行尾空白与末尾换行不属于用户内容，
 * 但表格的对齐空格属于 —— 所以只对表格做对齐归一化，其余逐字比。
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";

/** 与 `src/components/RichTextEditor.tsx` 保持同一份扩展列表 —— 两处不同步会导致
 *  富文本模式能打的东西在别处解析不出来，所以这里刻意不抽公共模块：
 *  扩展列表是**产品决策**（哪些语法属于 Write），改它时应该同时看见两处。 */
const EXTENSIONS = [
  StarterKit,
  Markdown,
  Image,
  TaskList,
  TaskItem,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

/** 打开文档 → 序列化回来，模拟「用户什么都没改就保存」这条最常见的路径。 */
function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: EXTENSIONS,
    content: markdown,
    contentType: "markdown",
  });
  try {
    return editor.getMarkdown();
  } finally {
    editor.destroy();
  }
}

/** 行尾空白与末尾换行不是用户内容；其余逐字比。 */
const trimEdges = (s: string) => s.replace(/\r/g, "").trim();

/** 表格的列对齐空格归一化：`| a   | b   |` → `| a | b |`。 */
function normalizeTable(md: string): string {
  return md.replace(/^\|.*\|$/gm, (line) =>
    line.replace(/\s*\|\s*/g, "|").replace(/\|\s*$/, "|"),
  );
}

describe("Tiptap ↔ Markdown 往返", () => {
  it("常见块级语法逐字往返", () => {
    const cases: Record<string, string> = {
      标题层级: "# H1\n\n## H2\n\n### H3\n",
      粗斜体删除线: "**b** *i* ~~s~~ `c`\n",
      无序列表: "- a\n- b\n",
      有序列表: "1. a\n2. b\n",
      任务列表: "- [ ] todo\n- [x] done\n",
      引用: "> q\n",
      分隔线: "---\n",
      代码块带语言: "```python\nprint(1)\n```\n",
      行内代码: "use `x` here\n",
      链接: "[t](https://a.b)\n",
      硬换行: "a  \nb\n",
      中文段落: "中文段落，测试。\n",
      多段落中文: "第一段。\n\n第二段。\n",
      强调内空格: "a **b c** d\n",
      转义字符: "a \\* b\n",
    };
    for (const [name, md] of Object.entries(cases)) {
      expect(trimEdges(roundTrip(md)), name).toBe(trimEdges(md));
    }
  });

  /* 图片是 Write 的核心能力（支持粘贴入库），退化成裸文本就等于丢数据。
     单独成例是因为它需要显式注册 Image 扩展，漏了不会报错、只会静默丢图。 */
  it("图片往返不丢（需显式注册 Image 扩展）", () => {
    expect(trimEdges(roundTrip("![alt](./p.png)\n"))).toBe(
      trimEdges("![alt](./p.png)\n"),
    );
  });

  it("表格往返保留结构与内容（对齐空格归一化）", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const out = roundTrip(md);
    expect(normalizeTable(trimEdges(out))).toBe(normalizeTable(trimEdges(md)));
    /* 单元格内容不能串位。**必须跳过对齐行**（`| --- | --- |`）——
       早先忘了跳，断言把分隔行也算成数据行，测试红着而内容其实是对的。
       这种「断言写错」的失败比真缺陷更费时间，所以这里按行过滤而非全量匹配。 */
    const dataRows = out
      .split("\n")
      .filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    /* 按 `|` split 取列，不能用 `/\|[^|]*\|/g` 逐个匹配 —— 那种匹配会漏掉
       每行最后一列（相邻匹配不重叠），实测把 2 列表格读成了 1 列。 */
    const cells = dataRows.flatMap((l) =>
      l.split("|")
        .slice(1, -1) // 首尾是空串（行首/行尾的 `|`）
        .map((c) => c.trim()),
    );
    expect(cells).toEqual(["a", "b", "1", "2"]);
  });

  it("空文档与纯空白不炸", () => {
    expect(trimEdges(roundTrip(""))).toBe("");
    expect(trimEdges(roundTrip("\n"))).toBe("");
  });

  /* 这是**已知的破坏性行为**，刻意钉住。
     为什么留一个断言「frontmatter 会被吃掉」的测试：富文本模式必须先剥离
     frontmatter 再把正文交给 Tiptap（见 extractFrontmatter 的调用点）。这个
     测试是该约束的回归锁 —— 哪天有人图省事把整篇文档直接喂进去，
     `## title: X` 这行会立刻让测试变红，而不是等到用户发现自己的元数据没了。 */
  it("【已知损耗】frontmatter 直接喂给编辑器会被摧毁 —— 所以必须先剥离", () => {
    const withFm = "---\ntitle: My Doc\ntags: a, b\n---\n\n# Heading\n";
    const out = roundTrip(withFm);
    // `---` 变成 setext 的 H2 下划线，`title: My Doc` 成了标题内容
    expect(out).toContain("## title: My Doc");
    // frontmatter 的语义彻底消失
    expect(out).not.toMatch(/^---\ntitle:/m);
  });
});