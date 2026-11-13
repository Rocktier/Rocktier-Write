#!/usr/bin/env node
/* Rocktier · fs 插件权限对账判据（家族通用版）
 *
 * 用法:
 *   node scripts/verify-fs-permissions.mjs              主检查（真实仓）
 *   node scripts/verify-fs-permissions.mjs --selftest   判据自身的正反对照
 *
 * 为什么需要它：
 *   Tauri v2 的 fs 插件是「一命令一权限」：代码里 `import { readFile }` 只让
 *   TS 编译通过，真正能不能调还要 capabilities 里授权。没授权时不是编译错误，
 *   而是运行时被 ACL 拒掉 —— 若调用点还包着 try/catch（"一张图读不到不该让
 *   整份导出失败"、"文件不存在就当没更新"），就变成**静默功能缺失**：
 *   测试全绿、界面正常、产物不对。
 *   已中招两例：
 *     - MD 1.0.21 导出 HTML 不内联本地图（readFile 无授权，D-140 / D-142）
 *     - MD/Write 草稿恢复告警恒说「草稿更新」（stat 无授权 → catch 吞掉，
 *       stale 恒 false → 用户点恢复就用旧草稿盖掉磁盘新内容，D-142）
 *
 * 特别提醒 `fs:default`：
 *   它**不**涵盖任何具体文件 API。实测 `default_permission.permissions` 只有
 *   create-app-specific-dirs / read-app-specific-dirs-recursive / deny-default
 *   三条，其余路径的读写一律要显式授权。把 `fs:default` 当成"通用许可"是
 *   最容易犯的错，所以 --selftest 专门有这一条负对照。
 *
 * 证据边界：本脚本只对账「源码要的 API」与「配置给了的权限」，不证明运行时
 *   scope 匹配（deny 清单、$APPDATA 展开等）也没问题。真机行为仍需装包实测。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 前端源码根的候选名。家族内不统一：多数用 src/，OCR 用 ui/。 */
const SOURCE_ROOTS = ["src", "ui", "app", "web"];

/** 仓名从 tauri.conf.json 读，家族各仓直接复用本脚本、无需改文案。 */
function productName(root) {
  try {
    const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
    return conf.productName ?? "Rocktier";
  } catch {
    return "Rocktier";
  }
}

/** 插件 API → 需要的 permission。只列本仓可能用的读/写族，未知 API 单独报「未登记」。 */
const REQUIRED = {
  readFile: "fs:allow-read-file",
  readTextFile: "fs:allow-read-text-file",
  readTextFileLines: "fs:allow-read-text-file-lines",
  writeFile: "fs:allow-write-file",
  writeTextFile: "fs:allow-write-text-file",
  exists: "fs:allow-exists",
  stat: "fs:allow-stat",
  lstat: "fs:allow-lstat",
  readDir: "fs:allow-read-dir",
  mkdir: "fs:allow-mkdir",
  remove: "fs:allow-remove",
  rename: "fs:allow-rename",
  copyFile: "fs:allow-copy-file",
  truncate: "fs:allow-truncate",
  open: "fs:allow-open",
  seek: "fs:allow-seek",
  size: "fs:allow-size",
};

/** 不覆盖具体 API 的集合式权限：列在这里是为了让「为什么它不算授权」可读。 */
const NOT_COVERING = new Set(["fs:default"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === "target") continue;
      walk(p, out);
    } else if ([".ts", ".tsx"].includes(extname(name.name)) && !/\.test\./.test(name.name)) {
      out.push(p);
    }
  }
  return out;
}

/** 存在的源码根。一个都没找到时主流程判红 —— 空目录不能当「没用 fs」看。 */
function sourceRoots(root) {
  return SOURCE_ROOTS.map((n) => join(root, n)).filter((dir) => existsSync(dir));
}

/** 收集源码里从 plugin-fs 具名导入的 API。 */
function collectImports(root) {
  const hits = [];
  for (const base of sourceRoots(root)) {
    for (const file of walk(base)) {
      const src = readFileSync(file, "utf8");
      const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']@tauri-apps\/plugin-fs["']/g;
      let m;
      while ((m = re.exec(src))) {
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (name) hits.push({ file: relative(root, file), api: name });
        }
      }
    }
  }
  return hits;
}

/** capabilities 里实际授予的 permission id（字符串与对象两种写法）。 */
function grantedIds(root) {
  const dir = join(root, "src-tauri", "capabilities");
  const ids = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const json = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const p of json.permissions ?? []) {
      const id = typeof p === "string" ? p : p?.identifier;
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** 纯函数，便于 selftest 直接喂假数据。 */
function audit(hits, ids) {
  const granted = ids instanceof Set ? ids : new Set(ids);
  const byApi = new Map();
  for (const h of hits) {
    if (!byApi.has(h.api)) byApi.set(h.api, new Set());
    byApi.get(h.api).add(h.file);
  }
  const results = [];
  for (const [api, files] of [...byApi].sort()) {
    const permission = REQUIRED[api];
    const where = [...files].join(", ");
    if (!permission) {
      results.push({ ok: false, id: api, detail: `未登记的 fs API（${where}）—— 先在 REQUIRED 里补映射` });
      continue;
    }
    const ok = granted.has(permission);
    results.push({
      ok,
      id: api,
      detail: ok
        ? `${permission} 已授予（${where}）`
        : `缺 ${permission}（${where}）—— 运行时会被 ACL 拒，调用点的 catch 会把它吞掉`,
    });
  }
  if (results.length === 0) {
    results.push({ ok: true, id: "no-fs-usage", detail: "源码未使用 fs 插件" });
  }
  return results;
}

function selftest() {
  const cases = [
    {
      name: "用 readFile 但一条都没授权 → 必须判红",
      hits: [{ file: "src/a.ts", api: "readFile" }],
      ids: [],
      expectRed: true,
    },
    {
      name: "给了 fs:allow-read-file → 必须判绿",
      hits: [{ file: "src/a.ts", api: "readFile" }],
      ids: ["fs:allow-read-file"],
      expectRed: false,
    },
    {
      name: "只有 fs:default 不算授权 → 必须仍判红（本仓踩过的坑）",
      hits: [{ file: "src/a.ts", api: "readFile" }],
      ids: ["fs:default"],
      expectRed: true,
    },
    {
      name: "同类 API 不能张冠李戴（只有 text-file 权限，用 readFile）→ 必须判红",
      hits: [{ file: "src/a.ts", api: "readFile" }],
      ids: ["fs:allow-read-text-file"],
      expectRed: true,
    },
    {
      name: "stat 只给了 read-text-file → 必须判红（Write/MD 草稿告警那条）",
      hits: [{ file: "src/App.tsx", api: "stat" }],
      ids: ["fs:default", "fs:allow-read-text-file", "fs:allow-write-text-file", "fs:allow-exists"],
      expectRed: true,
    },
    {
      name: "补上 fs:allow-stat → 必须判绿",
      hits: [{ file: "src/App.tsx", api: "stat" }],
      ids: ["fs:default", "fs:allow-read-text-file", "fs:allow-stat"],
      expectRed: false,
    },
    {
      name: "完全不用 fs → 不该误报",
      hits: [],
      ids: [],
      expectRed: false,
    },
  ];
  let pass = 0;
  const failures = [];
  for (const c of cases) {
    const results = audit(c.hits, c.ids);
    const isRed = results.some((r) => !r.ok);
    if (isRed === c.expectRed) pass++;
    else failures.push(`${c.name}：期望${c.expectRed ? "红" : "绿"}，实得${isRed ? "红" : "绿"}`);
  }
  console.log(`\n  判据正反对照: ${pass}/${cases.length} 通过`);
  for (const f of failures) console.log(`  ❌ ${f}`);
  return failures.length === 0;
}

const roots = sourceRoots(ROOT);
console.log(`\n══════ ${productName(ROOT)} · fs 权限对账判据 ══════`);
if (roots.length === 0) {
  // 空目录与「真的不用 fs」在 audit 眼里长得一样，必须分开处理 ——
  // 否则换个前端目录名（OCR 是 ui/）就会静默变成永远绿。
  console.log(`  ❌ 找不到前端源码根（试过 ${SOURCE_ROOTS.join(" / ")}）`);
  console.log(`     空目录不能当「没用 fs」看，判据在这里必须红\n`);
  process.exit(1);
}
console.log(`  源码根: ${roots.map((r) => relative(ROOT, r)).join(", ")}`);

const results = audit(collectImports(ROOT), grantedIds(ROOT));
for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.id.padEnd(18)} ${r.detail}`);
const mainOk = results.every((r) => r.ok);
console.log(`\n  主检查: ${results.filter((r) => r.ok).length}/${results.length} 通过`);
console.log(`  边界: 只对账权限 id，不覆盖 scope/deny 展开与运行时行为\n`);
console.log(`  备注: ${[...NOT_COVERING].join(", ")} 不覆盖任何具体文件 API`);
if (process.argv.includes("--selftest")) {
  const ok = selftest();
  process.exit(mainOk && ok ? 0 : 1);
}
process.exit(mainOk ? 0 : 1);
