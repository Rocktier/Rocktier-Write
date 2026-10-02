// 相对路径解析工具：与 Rocktier MD 同源（抽取自 App.tsx 的 resolvePath），
// Preview 解析相对图片时必须与 .md 链接完全同一套规则。

// Resolve a relative markdown link against the current document's directory.
// Handles ./ and ../ segments; accepts both POSIX and Windows separators
// and drive letters — returns an absolute path usable by the fs plugin.
export function resolvePath(base: string, rel: string): string {
  const relIsAbs = /^[/\\]/.test(rel) || /^[A-Za-z]:[\\/]/.test(rel);
  const combined = relIsAbs ? rel : base + rel;
  const parts = combined.split(/[\\/]/);
  // Windows 盘符（"C:"）保留在结果开头，其余段做 .. / . 归一化
  const drive = /^[A-Za-z]:$/.test(parts[0]) ? parts.shift() : null;
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  const joined = out.join("/");
  return drive ? `${drive}/${joined}` : `/${joined}`;
}

// 取文件所在目录（含结尾分隔符），空路径返回 ""。
export function baseDirOf(filePath: string): string {
  return filePath.replace(/[^/\\]+$/, "");
}
