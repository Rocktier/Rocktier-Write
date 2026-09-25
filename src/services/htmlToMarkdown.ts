/**
 * Dependency-free HTML → Markdown converter.
 * Converts rich-text clipboard (from Word, Google Docs, browsers) into clean
 * Markdown. Covers: headings, bold/italic/code, links, images, lists,
 * blockquotes, paragraphs, line breaks, and pre/code blocks.
 *
 * 已知局限（复审 F16，best-effort 粘贴转换可接受）：
 *  - inline() 会把所有连续空白折叠为单个空格，行内代码中的多空格/换行会失真；
 *  - blockquote 嵌套 pre/code 的结构会走样。
 */
export function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  const out: string[] = [];

  function inline(node: ChildNode): string {
    let result = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        // 嵌套列表由 block() 的 ul/ol 分支单独成行输出；这里再递归一次，
        // 子项文本会先被拼进父项那一行（"<li>item<ul><li>sub</li></ul></li>"
        // 会得到 "- itemsub" 再加一行 "- sub"）。
        if (tag === "ul" || tag === "ol") return;
        const content = inline(el);

        switch (tag) {
          case "b":
          case "strong":
            result += `**${content}**`;
            break;
          case "i":
          case "em":
            result += `*${content}*`;
            break;
          case "code":
            result += `\`${content}\``;
            break;
          case "a":
            result += `[${content}](${el.getAttribute("href") ?? ""})`;
            break;
          case "img":
            result += `![${el.getAttribute("alt") ?? "image"}](${el.getAttribute("src") ?? ""})`;
            break;
          case "br":
            result += "\n";
            break;
          case "s":
          case "del":
            result += `~~${content}~~`;
            break;
          default:
            result += content;
        }
      }
    });
    return result.replace(/\s+/g, " ").trim();
  }

  function block(node: ChildNode) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "h1": out.push(`# ${inline(el)}`, ""); break;
      case "h2": out.push(`## ${inline(el)}`, ""); break;
      case "h3": out.push(`### ${inline(el)}`, ""); break;
      case "h4": out.push(`#### ${inline(el)}`, ""); break;
      case "h5": out.push(`##### ${inline(el)}`, ""); break;
      case "h6": out.push(`###### ${inline(el)}`, ""); break;
      case "p": out.push(inline(el), ""); break;
      case "blockquote": {
        const inner = htmlToMarkdown(el.innerHTML);
        out.push(inner.split("\n").map((l) => `> ${l}`).join("\n"), "");
        break;
      }
      case "pre": {
        const code = el.querySelector("code");
        const lang = code?.className.replace(/^language-/, "") ?? "";
        const codeText = code?.textContent ?? el.textContent ?? "";
        out.push(`\`\`\`${lang}`, codeText.trimEnd(), "```", "");
        break;
      }
      case "ul":
      case "ol": {
        const items = Array.from(el.querySelectorAll(":scope > li"));
        items.forEach((li, i) => {
          const prefix = tag === "ul" ? "- " : `${i + 1}. `;
          out.push(`${prefix}${inline(li)}`);
          // handle nested lists
          li.childNodes.forEach((c) => {
            if (c.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes((c as Element).tagName.toLowerCase())) {
              const nested = htmlToMarkdown((c as Element).innerHTML);
              out.push(nested.split("\n").filter(Boolean).map((l) => `  ${l}`).join("\n"));
            }
          });
        });
        out.push("");
        break;
      }
      case "img":
        out.push(`![${el.getAttribute("alt") ?? "image"}](${el.getAttribute("src") ?? ""})`, "");
        break;
      case "hr":
        out.push("---", "");
        break;
      default:
        // recurse into unknown containers
        node.childNodes.forEach(block);
    }
  }

  div.childNodes.forEach(block);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
