/**
 * ConfirmDialog 的组件级回归测试。
 *
 * 这一层测的是「7 处丢弃确认现在真的走应用内框」，而不是系统弹窗：
 *   · 框里出现的是调用点传进来的那句话（不是路由错了、不是空字符串）；
 *   · 确定/取消两个方向都能把 Promise 结掉 —— 只结一边就等于「点了没反应」；
 *   · Esc 与点遮罩都算取消（与 UpdateDialog / LicenseDialog 同一个约定）。
 *
 * ⚠️ 家族 vitest 的 include 只收 `.test.ts`（不含 `.test.tsx`），所以这里用
 * createElement 而非 JSX。别改成 `.tsx` —— 那样它不会被跑到。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** 挂载并返回收集到的决议序列。 */
function mount(message: string) {
  const got: boolean[] = [];
  act(() => {
    root.render(createElement(ConfirmDialog, { message, onResolve: (ok: boolean) => got.push(ok) }));
  });
  return got;
}

const byText = (label: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === label);

describe("ConfirmDialog", () => {
  it("把调用点给的文案原样放进对话框", () => {
    mount("当前文档有未保存的更改，确定要丢弃吗？");
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("当前文档有未保存的更改");
    // 没有 message 就只剩一个空框 —— 那等于把「要确认什么」弄丢了
    expect(host.querySelector(".confirm-message")!.textContent).not.toBe("");
  });

  it("点「确定」决议为 true", () => {
    const got = mount("Discard?");
    // 界面文案取自 i18n，测试环境没有本地语言偏好 ⇒ 默认英文档
    const ok = byText("OK");
    expect(ok, "找不到确定按钮").toBeTruthy();
    act(() => ok!.click());
    expect(got).toEqual([true]);
  });

  it("点「取消」决议为 false", () => {
    const got = mount("Discard?");
    const cancel = byText("Cancel");
    expect(cancel, "找不到取消按钮").toBeTruthy();
    act(() => cancel!.click());
    expect(got).toEqual([false]);
  });

  it("Esc 决议为 false", () => {
    const got = mount("丢弃？");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(got).toEqual([false]);
  });

  it("点遮罩决议为 false，点框内不误触", () => {
    const got = mount("丢弃？");
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(got).toEqual([]);
    act(() => {
      host.querySelector(".update-overlay")!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });
    expect(got).toEqual([false]);
  });
});
