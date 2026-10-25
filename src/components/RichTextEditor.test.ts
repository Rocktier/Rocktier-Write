/**
 * RichTextEditor 的端到端回归测试（组件级）。
 *
 * ## 为什么要有这一层
 * 服务层（`richTextSync.ts`）测的是「判定逻辑对不对」，但用户报障的是
 * **在真实组件里、在真实的状态往返下**光标跳走了。中间还隔着：
 *   · 父组件把 content 存进 state 再送回来（App 的真实做法）；
 *   · `onUpdate` 上抛 → `onChange` → state 更新 → content prop 变化 → 回灌 effect；
 *   · frontmatter 的拆分与拼装。
 * 这些环节任一处没接对，症状都会重现，而服务层的单测照样是绿的。
 * 所以这里用**真实的 React 组件 + 真实的状态往返**复现一遍。
 *
 * ## 复现的用户操作
 * 文档中间有一段，用户在**这一段的中间**按回车 —— 光标（插入点）应该留在
 * 刚拆开的那一段里，而不是跳到整篇文档的末尾。
 *
 * ⚠️ 组件级测试在本仓是新引入的形态：家族 vitest 的 `include` 只收
 * `.test.ts`（不含 `.test.tsx`），所以这里用 `createElement` 而非 JSX
 * 写成 `.test.ts`。别改成 `.tsx` —— 那样它不会被跑到，会变成「看着有测试、
 * 其实从没执行过」的最坏形态。
 *
 * （注：本文件开头的注释里不能出现 glob 写法 —— 那个星号斜杠组合会把
 *  块注释提前闭合，esbuild 直接报 "Unexpected *"。）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { RichTextEditor } from "./RichTextEditor";

/* React 18 要求显式声明 act 环境，否则警告刷屏。 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 从挂载后的 DOM 拿 editor 实例（ProseMirror 把它挂在 contenteditable 元素上）。 */
interface EditorLike {
  state: { selection: { from: number; to: number } };
  commands: Record<string, (...args: never[]) => unknown>;
  can: () => { undo: () => boolean };
  getMarkdown: () => string;
}

function getEditor(container: HTMLElement): EditorLike {
  const el = container.querySelector(".rich-editor") as unknown as {
    editor?: EditorLike;
  };
  if (!el?.editor) throw new Error("拿不到 editor 实例");
  return el.editor;
}

/** 文档正文：三段，光标要落在第二段中间。 */
const BODY = "第一段。\n\n第二段文\n\n字在这里。\n";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

/**
 * 宿主组件 —— **刻意复刻 App 的真实做法**：
 * content 存进 state，onChange 再把它送回 content prop。
 * 这个往返正是回灌 effect 的触发源，也是本 bug 的必要条件。
 */
function Host({ initial }: { initial: string }) {
  const [content, setContent] = useState(initial);
  return createElement(RichTextEditor, {
    content,
    viewMode: "rich" as const,
    onViewChange: () => {},
    onChange: (c: string) => setContent(c),
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(initial: string) {
  await act(async () => {
    root.render(createElement(Host, { initial }));
  });
  return getEditor(container);
}

describe("RichTextEditor —— 编辑中段时光标不得跳走", () => {
  it("段落中间按回车：光标留在原处，不跳到文档末尾", async () => {
    const editor = await mount(BODY);

    // 把光标放到第二段中间（「第二段文」的「段」字之后）
    await act(async () => {
      editor.commands.setTextSelection(11 as never);
    });
    expect(editor.state.selection.from).toBe(11);

    await act(async () => {
      await editor.commands.splitBlock();
    });

    // 回车会触发 onUpdate → onChange → 父组件 state 更新 → content prop 变化
    // → 回灌 effect。这条链路走完，光标必须还在中间那段。
    const after = editor.state.selection.from;
    expect(after).toBe(13); // 拆段后光标落在拆开处（11 + 拆出的 2 个位置偏移）

    // 关键断言：光标**不在**文档末尾
    const docEnd = editor.getMarkdown().length;
    expect(after).toBeLessThan(docEnd);
  });

  it("段落中间按退格：光标留在原处，不跳到文档末尾", async () => {
    const editor = await mount(BODY);

    await act(async () => {
      editor.commands.setTextSelection(11 as never);
    });

    await act(async () => {
      await editor.commands.deleteRange({
        from: 10,
        to: 11,
      } as never);
    });

    const after = editor.state.selection.from;
    expect(after).toBe(10); // 删掉一个字，光标跟到该处
    expect(after).toBeLessThan(editor.getMarkdown().length);
  });

  it("连续编辑后撤销仍能逐步回退（回灌不得顶替撤销栈）", async () => {
    const editor = await mount(BODY);

    await act(async () => {
      editor.commands.setTextSelection(11 as never);
    });
    await act(async () => {
      await editor.commands.insertContent("新" as never);
    });
    expect(editor.getMarkdown()).toContain("新");

    // 触发一次完整往返（onUpdate → state → prop → 回灌 effect）
    await act(async () => {
      await Promise.resolve();
    });

    // ⌘Z 一次：只应撤掉刚打的「新」。
    // 反例（回灌触发整篇替换时）：新字和整篇重置被一起撤掉 ——
    // 表现是「⌘Z 一下字全没了」，那正是用户会遇到的另一个症状。
    await act(async () => {
      await editor.commands.undo();
    });
    expect(editor.getMarkdown()).not.toContain("新");
    expect(editor.getMarkdown()).toContain("第二段文");
  });

  it("两次分组编辑后，⌘Z 能逐步回退（回灌不得把栈顶换成整篇重置）", async () => {
    const editor = await mount(BODY);

    await act(async () => {
      editor.commands.setTextSelection(11 as never);
    });
    await act(async () => {
      await editor.commands.insertContent("A" as never);
    });
    // 隔开 undo 分组（prosemirror-history 的 newGroupDelay = 500ms）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    await act(async () => {
      await editor.commands.insertContent("B" as never);
    });
    expect(editor.getMarkdown()).toContain("AB");

    // 触发完整往返
    await act(async () => {
      await Promise.resolve();
    });

    // ⌘Z 一次：只撤掉 B，A 必须在。
    await act(async () => {
      await editor.commands.undo();
    });
    expect(editor.getMarkdown()).toContain("A");
    expect(editor.getMarkdown()).not.toContain("B");
  });
});
