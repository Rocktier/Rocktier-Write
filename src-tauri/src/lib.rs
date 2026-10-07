use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use serde::Serialize;
use tauri_plugin_opener::OpenerExt;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WindowEvent};

// 授权：试用状态与回执验签（单一来源 docs/rocktier/license.rs，规程 FAMILY-LICENSE.md）。
// 写命令的拦截在下方 ensure_write_allowed，界面在 LicenseDialog。
/// 家族内唯一的产品标识，用作试用记录的副存储命名空间。
///
/// 必须与 `tauri.conf.json` 的 `bundle.identifier` 逐字一致 ——
/// 副存储按它分文件，改了会导致老用户的试用记录读不到（等于白送 7 天）。
/// 改动时两处必须同步。
pub const APP_KEY: &str = "com.rocktier.write";

pub mod license;
pub mod trial;
pub mod license;

/* ── 授权：试用与激活（见 license.rs 的模块说明）────────────────────── */

/// 试用与授权状态的落盘目录。由 `setup()` 注入。
///
/// 用全局而不是给每个写命令各加一个参数：那会让所有命令签名都多一个与业务无关的
/// 参数，而它也不是业务状态，读它不需要与文档状态同步。
static LICENSE_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

pub fn init_license_dir(dir: std::path::PathBuf) {
    let _ = LICENSE_DIR.set(dir);
}

/// 供闸门发事件用。setup 注入；即使没注入也照样能拦截，只是界面不会自动弹窗。
static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

pub fn init_app_handle(app: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app);
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 当前授权状态。
///
/// 目录未注入（setup 失败）时按"试用中、满额天数"处理 —— 失败方向刻意选**放行**：
/// 一个取不到的目录不该变成一次锁死。
fn current_license() -> crate::license::Status {
    let Some(dir) = LICENSE_DIR.get() else {
        return crate::license::Status::Trialing { days_left: crate::license::TRIAL_DAYS };
    };
    let now = now_secs();
    let started = /* 试用起点双写（AppData + 副存储）并按机器指纹判定，
       见 trial.rs 的模块说明。app_key 用 bundle identifier ——
       家族内唯一，避免两个产品的副存储互相覆盖。 */
    let started = crate::trial::ensure_started(
        dir,
        crate::APP_KEY,
        now,
        &crate::trial::machine_fingerprint(),
    );;
    // 只认本单品与全家桶的回执：别人的回执即使验签通过，也不是本应用的授权。
    let receipt = crate::license::read_valid_receipt(dir, crate::license::PUBLIC_KEY_B64)
        .filter(crate::license::accepts);
    crate::license::status_from(Some(started), receipt.as_ref(), now)
}

/// 写操作的统一闸门。
///
/// 在**命令层**拦，而不是在每个界面路径上判断：界面路径会随功能增长而增加，漏掉一条
/// 就是一道缝；命令层是所有写操作的必经之路。Write 的写命令只有四个
/// （save_document / export_docx / print_doc / save_paste_image），读操作一律不拦。
///
/// 错误码固定为 `LICENSE_EXPIRED`，前端凭它弹购买/激活框。
fn ensure_write_allowed() -> Result<(), String> {
    if current_license().allows_write(crate::license::enforced()) {
        return Ok(());
    }
    // 让界面主动知道"被拦下了"，而不是在每个动作的 catch 里各判一次错误码 ——
    // 那种写法漏掉一处，用户看到的就只是一个没有解释的失败。
    if let Some(app) = APP_HANDLE.get() {
        let _ = tauri::Emitter::emit(app, "license-expired", ());
    }
    Err("LICENSE_EXPIRED".to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    /// `trial` / `expired` / `licensed`。
    pub status: String,
    /// 仅 `trial` 时有意义。
    pub days_left: i64,
    /// 仅 `licensed` 时有值（`WR` 单品 / `FL` 全家桶）。
    pub product: Option<String>,
    /// 当前是否真的会拦截写操作（渠道 + 公钥 + 总开关三者决定）。
    pub enforcing: bool,
    /// `direct`（官网直链）/ `store`（微软商店 / Mac App Store）。
    pub channel: String,
    /// 本构建是否已配置验签公钥。
    ///
    /// 没配置时**任何人都激活不了**（回执必然验不过）。界面据此如实说明，而不是
    /// 拿"激活码未被接受"去搪塞一位已经付过钱的用户。
    pub activation_configured: bool,
}

fn license_info() -> LicenseInfo {
    let status = current_license();
    LicenseInfo {
        status: status.as_str().to_string(),
        days_left: match &status {
            crate::license::Status::Trialing { days_left } => *days_left,
            _ => 0,
        },
        product: match &status {
            crate::license::Status::Licensed { product } => Some(product.clone()),
            _ => None,
        },
        enforcing: crate::license::enforced(),
        channel: crate::license::channel().to_string(),
        activation_configured: !crate::license::PUBLIC_KEY_B64.trim().is_empty(),
    }
}

/// 供界面展示：剩余试用天数 / 是否已激活 / 当前渠道。
///
/// ⚠️ 不能加 `pub`：Write 的命令都定义在 crate 根（lib.rs），而 `#[tauri::command]` 对
/// `pub` 命令会生成 `#[macro_export]`，宏被提升到 crate 根后与本地定义同名冲突
/// （E0255）。PDF 不踩这一点是因为它的命令在子模块 `commands` 里。
#[tauri::command]
async fn license_status() -> Result<LicenseInfo, String> {
    Ok(license_info())
}

/// 保存服务端签出的回执并立即验签。
///
/// 联网换回执的那一步在**前端**做（`fetch` 到 rocktier.com/api/activate），
/// 为的是不引入 HTTP 客户端依赖；但**验签与落盘必须在这里** —— 前端拿到的只是一段
/// 待验的字符串，能证明它有效与否的只有公钥。
#[tauri::command]
async fn store_receipt(signed: String) -> Result<LicenseInfo, String> {
    let dir = LICENSE_DIR
        .get()
        .ok_or_else(|| "no app data directory".to_string())?;
    let trimmed = signed.trim();
    let receipt = crate::license::verify_receipt(trimmed, crate::license::PUBLIC_KEY_B64)?;

    // 其它单品的码虽然签名有效，但**不属于**本应用 —— 而且不要落盘：落下去以后
    // 会被当成有效回执读回来，等于自己给自己开后门。
    if !crate::license::accepts(&receipt) {
        return Err("LICENSE_WRONG_PRODUCT".to_string());
    }

    crate::license::save_receipt(dir, trimmed)?;
    Ok(license_info())
}

/// 前端完成初始化（关窗确认监听器已注册）后置位。
/// 之前无条件拦截关窗：若前端尚未就绪或 JS 已崩溃，窗口将永远关不掉。
pub struct Ready(pub AtomicBool);

/// 关窗看门狗状态（复审 F5）：就绪后若 JS 崩溃 / 事件循环卡死，
/// 监听器已死但 prevent_close 依旧生效 → 僵尸窗口回归。
/// 前端收到 app-close-requested 后立即调用 close_ack 证明自己存活；
/// 看门狗只在"已请求但 10s 内无 ack"时才强制销毁窗口。
pub struct CloseWatch {
    pub requested: AtomicU64,
    pub acked: AtomicU64,
}

/// 启动时要打开的文档路径，由操作系统传入：
/// - Windows / Linux：文件关联注册的打开命令是 `"app.exe" "%1"`，路径在 argv 里；
/// - macOS / iOS：走 `RunEvent::Opened` 事件（见 `run()`）。冷启动时该事件可能早于
///   前端挂载，所以先缓冲在这里，前端挂载后再用 `initial_file` 拉取。
pub struct InitialFile(pub Mutex<Option<String>>);

/// 启动期到达的文档队列（tao#1235：冷启动时 `application:openURLs:` 早于
/// setup/托管状态，`try_state` 拿不到任何东西，必须在进程级静态里排队，
/// setup 完成后再搬进 `InitialFile`。Chromium 的 `_startupComplete` 同款）。
static PENDING_DOCS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// 与前端 `MARKDOWN_EXTS` 保持一致。只关联 Markdown 家族：把 txt/text 也抢过来
/// 会顶掉记事本等既有关联，且资源管理器「类型」列会被污染成 Markdown。
const MARKDOWN_EXTS: [&str; 8] = [
    "md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext",
];

fn is_markdown_path(path: &std::path::Path) -> bool {
    if !path.is_file() {
        return false;
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => MARKDOWN_EXTS.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

/// 取命令行里第一个真实存在的 Markdown 文件。
/// 更新器开关等其它参数会被 is_markdown_path 自然过滤掉。
fn file_from_args() -> Option<String> {
    std::env::args_os()
        .skip(1)
        .map(std::path::PathBuf::from)
        .find(|p| is_markdown_path(p))
        .map(|p| p.to_string_lossy().into_owned())
}

/// 前端挂载后询问「启动时是否带了文档」。
/// 刻意只 clone 不 take：React StrictMode 在 dev 下会把 effect 跑两遍，
/// take 会让第二次调用拿到 None，启动文件就被丢掉了。
#[tauri::command]
fn initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().ok().and_then(|slot| slot.clone())
}

/// Destroys the main window without re-triggering CloseRequested.
/// The frontend calls this after the user confirms discarding changes.
#[tauri::command]
fn force_close(window: tauri::Window) {
    let _ = window.destroy();
}

/// 弹出系统打印面板（用户可选"存储为 PDF"完成导出）。
/// 根因修复：WKWebView 对 JS 的 window.print() 是静默 no-op，
/// 必须从原生侧调用 wry 的 printOperationWithPrintInfo。
// 导出会产出新文件：受授权闸门保护（FAMILY-LICENSE.md §2）。
#[tauri::command]
fn print_doc(webview: tauri::WebviewWindow) -> Result<(), String> {
    ensure_write_allowed()?;
    webview.print().map_err(|e| e.to_string())
}

/// 前端在注册完 app-close-requested 监听后调用，启用"拦截关窗"流程。
#[tauri::command]
fn mark_ready(state: tauri::State<Ready>) {
    state.0.store(true, Ordering::Release);
}

/// 前端收到 app-close-requested 后立刻调用：证明 JS 事件循环存活。
/// 用户此时可能正停在"未保存更改"确认弹窗上思考，看门狗不得强杀。
#[tauri::command]
fn close_ack(state: tauri::State<CloseWatch>) {
    let req = state.requested.load(Ordering::Acquire);
    state.acked.store(req, Ordering::Release);
}

/// Returns the current git branch for a directory, or null if not a repo.
/// Lightweight: runs `git rev-parse --abbrev-ref HEAD` without extra deps.
#[tauri::command]
fn git_branch(dir: String) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&dir)
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

/// 短 hash：加入恢复文件名，避免 safe_name 把 `/ \ :` 替换为 `_` 后
/// `/a/b.md` 与 `x/a_b.md` 落到同一个文件互相覆盖（复审 F8）。
fn short_hash(s: &str) -> String {
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    format!("{:08x}", h.finish() as u32)
}

#[cfg(desktop)]
fn recovery_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("recovery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn recovery_file_name(path: &str) -> String {
    let safe_name = path.replace(['/', '\\', ':'], "_");
    format!("{}-{}.json", safe_name, short_hash(path))
}

#[derive(Serialize)]
struct RecoveryEntry {
    path: String,
    content: String,
    modified_ms: u64,
}

/// Writes a recovery file (JSON, embedding the original path) to the app's
/// data directory for crash recovery.
#[tauri::command]
#[cfg(desktop)]
fn save_recovery(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let dir = recovery_dir(&app)?;
    let file = dir.join(recovery_file_name(&path));
    let payload = serde_json::json!({ "path": path, "content": content });
    // 原子写：fs::write 先 truncate 再写，崩溃落在两步之间会把旧草稿和新草稿一起毁掉，
    // 正是恢复机制要防的场景。改为写临时文件后 rename（同分区原子）。
    let tmp = dir.join(format!("{}.tmp", recovery_file_name(&path)));
    {
        use std::io::Write as _;
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(payload.to_string().as_bytes()).map_err(|e| e.to_string())?;
        // Without fsync the rename only publishes the name; the bytes may still be
        // in the page cache, so a power loss can leave a zero-length draft — the
        // recovery mechanism destroying the very thing it exists to protect.
        f.sync_all().map_err(|e| e.to_string())?;
    }
    match std::fs::rename(&tmp, &file) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e.to_string())
        }
    }
}

/// Writes a document to disk atomically: temp file in the same directory, then
/// rename.
///
/// The fs plugin's `writeTextFile` truncates the target in place, so a crash, a
/// full disk or a permission error halfway through destroys the user's original
/// document — the one file an editor must never damage. Recovery drafts already
/// used this pattern (see `save_recovery`); actual user documents did not.
#[tauri::command]
#[cfg(desktop)]
fn save_document(path: String, content: String) -> Result<(), String> {
    // 保存是本应用最核心的写操作：受授权闸门保护（FAMILY-LICENSE.md §2）。
    ensure_write_allowed()?;
    let target = std::path::PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or_else(|| "invalid path".to_string())?
        .to_path_buf();
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "invalid file name".to_string())?;
    // Dotted temp name so a leftover never looks like the document itself, and
    // so a crash mid-write leaves the original untouched. The PID alone is not
    // enough: it is constant for the life of the process, so two saves racing
    // (holding Cmd+S twice) would share one temp name and truncate each other.
    // A per-process sequence number makes every write its own file.
    let tmp = dir.join(format!(
        ".{}.{}.{}.tmp",
        name,
        std::process::id(),
        TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    {
        use std::io::Write as _;
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        // rename() only publishes the name; without this the bytes may still be
        // in the page cache, and a power loss leaves a zero-length document.
        f.sync_all().map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    // Persist the rename itself, so the directory entry survives a crash too.
    #[cfg(unix)]
    {
        if let Ok(d) = std::fs::File::open(&dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

/// Makes each concurrent save write to its own temp file. See `save_document`.
static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Lists all recovery drafts, newest first. Frontend offers restore on launch.
#[tauri::command]
#[cfg(desktop)]
fn list_recovery(app: tauri::AppHandle) -> Result<Vec<RecoveryEntry>, String> {
    let dir = recovery_dir(&app)?;
    let mut out: Vec<RecoveryEntry> = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(out),
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&p) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        let (Some(path), Some(content)) = (v["path"].as_str(), v["content"].as_str()) else {
            continue;
        };
        let modified_ms = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(RecoveryEntry {
            path: path.to_string(),
            content: content.to_string(),
            modified_ms,
        });
    }
    out.sort_by_key(|e| std::cmp::Reverse(e.modified_ms));
    Ok(out)
}

/// Deletes the recovery draft for a path (after restore or explicit discard).
#[tauri::command]
#[cfg(desktop)]
fn clear_recovery(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = recovery_dir(&app)?;
    let file = dir.join(recovery_file_name(&path));
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 构建原生应用菜单（对齐 macOS 优秀编辑器的惯例：文件/编辑/显示/窗口）。
/// 由前端在挂载后按当前 UI 语言调用，语言切换时可重建。
/// 自定义项的点击经 on_menu_event 转成 "menu-action" 事件发给前端；
/// 预定义项（撤销/拷贝/粘贴/最小化等）由系统自动本地化并自带快捷键。
/// Menu label in the current UI language. Order matches `i18n.ts`: en, zh, ja,
/// ko, fr, de, es, pt. The native menu previously only had zh/en pairs — every
/// other interface language got an English menu bar (W-P1-07, 准则 §17).
fn tr(
    lang: &str,
    en: &'static str,
    zh: &'static str,
    ja: &'static str,
    ko: &'static str,
    fr: &'static str,
    de: &'static str,
    es: &'static str,
    pt: &'static str,
) -> &'static str {
    match lang {
        "zh" => zh,
        "ja" => ja,
        "ko" => ko,
        "fr" => fr,
        "de" => de,
        "es" => es,
        "pt" => pt,
        _ => en,
    }
}

fn build_app_menu(app: &tauri::AppHandle, lang: &str) -> tauri::Result<()> {
    let new_i = MenuItem::with_id(app, "new", tr(lang, "New", "新建", "新規", "새 문서", "Nouveau", "Neu", "Nuevo", "Novo"), true, Some("CmdOrCtrl+N"))?;
    let open_i = MenuItem::with_id(app, "open", tr(lang, "Open…", "打开…", "開く…", "열기…", "Ouvrir…", "Öffnen…", "Abrir…", "Abrir…"), true, Some("CmdOrCtrl+O"))?;
    let save_i = MenuItem::with_id(app, "save", tr(lang, "Save", "保存", "保存", "저장", "Enregistrer", "Speichern", "Guardar", "Guardar"), true, Some("CmdOrCtrl+S"))?;
    let save_as_i = MenuItem::with_id(
        app,
        "save-as",
        tr(lang, "Save As…", "另存为…", "別名で保存…", "다른 이름으로 저장…", "Enregistrer sous…", "Speichern unter…", "Guardar como…", "Guardar como…"),
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let export_i = MenuItem::with_id(
        app,
        "export-pdf",
        tr(lang, "Export PDF…", "导出 PDF…", "PDF として書き出す…", "PDF로 내보내기…", "Exporter en PDF…", "Als PDF exportieren…", "Exportar PDF…", "Exportar PDF…"),
        true,
        Some("CmdOrCtrl+Shift+P"),
    )?;

    let app_menu = Submenu::with_items(
        app,
        "Rocktier Write",
        true,
        &[
            &PredefinedMenuItem::about(
                app,
                Some(tr(lang, "About Rocktier Write", "关于 Rocktier Write", "Rocktier Write について", "Rocktier Write 정보", "À propos de Rocktier Write", "Über Rocktier Write", "Acerca de Rocktier Write", "Sobre o Rocktier Write")),
                // 第三个参数不能是 None：Windows 后端只有匹配
                // `PredefinedMenuItemType::About(Some(metadata))` 才调 show_about_dialog，
                // None 落入 `_ => {}` —— 菜单项在，点击**完全无反应**。
                // macOS 走 NSAboutPanel（忽略 metadata），此坑只在 Windows 暴露。
                Some(AboutMetadata {
                    version: Some(env!("CARGO_PKG_VERSION").to_string()),
                    copyright: Some("Copyright 2026 Rocktier".to_string()),
                    ..Default::default()
                }),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", tr(lang, "Quit", "退出", "終了", "종료", "Quitter", "Beenden", "Salir", "Sair"), true, Some("CmdOrCtrl+Q"))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        tr(lang, "File", "文件", "ファイル", "파일", "Fichier", "Datei", "Archivo", "Ficheiro"),
        true,
        &[
            &new_i,
            &open_i,
            &PredefinedMenuItem::separator(app)?,
            &save_i,
            &save_as_i,
            &PredefinedMenuItem::separator(app)?,
            &export_i,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        tr(lang, "Edit", "编辑", "編集", "편집", "Édition", "Bearbeiten", "Editar", "Editar"),
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let sidebar_i = MenuItem::with_id(
        app,
        "toggle-sidebar",
        tr(lang, "Toggle Sidebar", "切换侧栏", "サイドバー切り替え", "사이드바 전환", "Afficher/Masquer la barre latérale", "Seitenleiste umschalten", "Alternar barra lateral", "Alternar barra lateral"),
        true,
        Some("CmdOrCtrl+\\"),
    )?;
    let theme_i = MenuItem::with_id(app, "toggle-theme", tr(lang, "Toggle Theme", "切换日夜模式", "テーマ切り替え", "테마 전환", "Basculer le thème", "Thema umschalten", "Alternar tema", "Alternar tema"), true, None::<&str>)?;
    let find_i = MenuItem::with_id(app, "find", tr(lang, "Find & Replace", "查找替换", "検索と置換", "찾기 및 바꾸기", "Rechercher et remplacer", "Suchen & Ersetzen", "Buscar y reemplazar", "Procurar e substituir"), true, Some("CmdOrCtrl+F"))?;
    let view_menu = Submenu::with_items(
        app,
        tr(lang, "View", "显示", "表示", "보기", "Affichage", "Ansicht", "Ver", "Ver"),
        true,
        &[&sidebar_i, &theme_i, &find_i],
    )?;

    let window_menu = Submenu::with_items(
        app,
        tr(lang, "Window", "窗口", "ウィンドウ", "창", "Fenêtre", "Fenster", "Ventana", "Janela"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let site_i = MenuItem::with_id(app, "website", tr(lang, "Website", "官方网站", "公式サイト", "공식 사이트", "Site officiel", "Offizielle Website", "Sitio web", "Site oficial"), true, None::<&str>)?;
    let mail_i = MenuItem::with_id(app, "feedback", tr(lang, "Feedback", "反馈", "フィードバック", "피드백", "Retour d'information", "Rückmeldung", "Comentarios", "Comentários"), true, None::<&str>)?;
    // 购买页面上写着"打开应用 → License → 输入激活码"，所以应用里必须真有一个能到
    // 那儿的入口（授权胶囊在已激活/商店版下会隐藏，帮助菜单是常驻入口）。
    let license_i = MenuItem::with_id(app, "license", tr(lang, "License…", "许可与激活…", "ライセンス…", "라이선스…", "Licence…", "Lizenz…", "Licencia…", "Licença…"), true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, tr(lang, "Help", "帮助", "ヘルプ", "도움말", "Aide", "Hilfe", "Ayuda", "Ajuda"), true, &[&license_i, &site_i, &mail_i])?;

    let menu = Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )?;
    app.set_menu(menu)?;
    Ok(())
}

/// 前端挂载后（以及语言切换时）调用，按 UI 语言（"zh" / "en"）构建菜单。
#[tauri::command]
fn build_menu(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    build_app_menu(&app, &lang).map_err(|e| e.to_string())
}

/// 帮助菜单里的外链（官网 / 反馈邮箱），白名单防止任意 URL。
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    const ALLOWED: [&str; 3] =
        ["https://rocktier.com/", "https://www.rocktier.com/", "mailto:"];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err(format!("blocked url: {url}"));
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// 把粘贴的图片写到文档同目录 assets/ 下（前端传 base64）。
/// 相比把几 MB 的 data URL 内联进 .md：文件可移植、体积小一个数量级，
/// 且避免之后每次按键都要让解析管线完整处理那段 base64（本轮 U2）。
#[tauri::command]
#[cfg(desktop)]
fn save_paste_image(path: String, data: String) -> Result<(), String> {
    // 图片落盘同样产出新文件：受授权闸门保护（FAMILY-LICENSE.md §2）。
    // 被拦时前端回退为内联 base64（不写盘），并弹出许可对话框。
    ensure_write_allowed()?;
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

// ── DOCX import/export commands ─────────────────────────────────
// Fixed academic manuscript template (APA/Chicago-aligned, no user options):
//   Times New Roman 12pt / Double spacing / 1.27cm first-line indent /
//   1in margins / A4 / page numbers bottom-right / no cover page

use docx_rs::*;

/// Import a .docx file, converting it to Markdown for editing.
/// Since the internal format is always Markdown, DOCX is treated as
/// a "loading dock": we extract the text structure on import and
/// re-render from Markdown on export.
#[tauri::command]
#[cfg(desktop)]
fn import_docx(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read: {e}"))?;
    import_docx_from_bytes(bytes)
}

/// Same docx→markdown importer for in-memory bytes: files dropped onto the
/// webview arrive as a DOM File without a filesystem path, so the frontend
/// forwards the raw bytes here (App.tsx onDrop .docx branch).
#[tauri::command]
#[cfg(desktop)]
fn import_docx_data(data: Vec<u8>) -> Result<String, String> {
    import_docx_from_bytes(data)
}

fn import_docx_from_bytes(bytes: Vec<u8>) -> Result<String, String> {
    let doc = docx_rs::read_docx(&bytes).map_err(|e| format!("parse: {e}"))?;

    let mut md = String::new();
    for child in &doc.document.children {
        match child {
            DocumentChild::Paragraph(p) => {
                let style_name = p
                    .property
                    .style
                    .as_ref()
                    .map(|s| s.val.to_lowercase())
                    .unwrap_or_default();
                let text: String = p
                    .children
                    .iter()
                    .filter_map(|c| match c {
                        ParagraphChild::Run(r) => Some(
                            r.children
                                .iter()
                                .filter_map(|rc| match rc {
                                    RunChild::Text(t) => Some(t.text.as_str()),
                                    _ => None,
                                })
                                .collect::<String>(),
                        ),
                        _ => None,
                    })
                    .collect();
                let text = text.trim();
                if text.is_empty() {
                    continue;
                }
                // Detect heading by style id
                if style_name.contains("heading") || style_name.contains("title") {
                    let lvl = style_name
                        .chars()
                        .find(|c| c.is_ascii_digit())
                        .and_then(|c| c.to_digit(10))
                        .unwrap_or(1);
                        md.push_str(&"#".repeat(lvl as usize));
                        md.push(' ');
                        md.push_str(text);
                } else {
                    md.push_str(text);
                }
                md.push_str("\n\n");
            }
            DocumentChild::Table(_) => {
                // Tables: serialize as a placeholder block to avoid data loss
                md.push_str("<!-- table -->\n\n");
            }
            _ => {}
        }
    }

    // Trim trailing blank lines while preserving content
    let trimmed = md.trim_end().to_string();
    Ok(if trimmed.is_empty() {
        String::new()
    } else {
        trimmed + "\n"
    })
}

/// Build a RunFonts pointing to Times New Roman (Latin + CJK).
fn tnr_fonts() -> RunFonts {
    RunFonts::new()
        .ascii("Times New Roman")
        .east_asia("Times New Roman")
}

/// Helper: construct a Run with template font settings.
fn make_run(text: &str, bold: bool) -> Run {
    let mut run = Run::new().size(24).fonts(tnr_fonts());
    if bold {
        run = run.bold();
    }
    run.add_text(text)
}

/// Export Markdown to .docx with the fixed academic manuscript template.
// 导出产出新文件：受授权闸门保护（FAMILY-LICENSE.md §2）。
#[tauri::command]
#[cfg(desktop)]
fn export_docx(markdown: String, output_path: String) -> Result<(), String> {
    ensure_write_allowed()?;
    let mut doc = Docx::new();

    // ── Template styles ──
    // Normal (body): 12pt / TNR / double spacing / first-line indent 1.27cm
    doc = doc.add_style(
        Style::new("Normal", StyleType::Paragraph)
            .name("Normal")
            .size(24)
            .fonts(tnr_fonts())
            .indent(
                None,
                Some(SpecialIndentType::FirstLine(727)),
                None,
                Some(0),
            )
            .line_spacing(
                LineSpacing::new()
                    .line(480)
                    .line_rule(LineSpacingType::Auto),
            ),
    );

    // Heading 1 – bold, centered
    doc = doc.add_style(
        Style::new("Heading1", StyleType::Paragraph)
            .name("Heading 1")
            .size(24)
            .bold()
            .fonts(tnr_fonts())
            .align(AlignmentType::Center),
    );

    // Heading 2 – bold
    doc = doc.add_style(
        Style::new("Heading2", StyleType::Paragraph)
            .name("Heading 2")
            .size(24)
            .bold()
            .fonts(tnr_fonts()),
    );

    // Heading 3 – bold
    doc = doc.add_style(
        Style::new("Heading3", StyleType::Paragraph)
            .name("Heading 3")
            .size(24)
            .bold()
            .fonts(tnr_fonts()),
    );

    // ── Page setup: A4, 1in margins ──
    doc = doc.page_size(11906, 16838);
    doc = doc.page_margin(PageMargin {
        top: 1440,
        left: 1440,
        bottom: 1440,
        right: 1440,
        header: 720,
        footer: 720,
        gutter: 0,
    });
    doc = doc.page_orient(PageOrientationType::Portrait);

    // ── Parse Markdown and build document body ──
    let lines: Vec<&str> = markdown.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Skip empty lines (line breaks)
        if line.trim().is_empty() {
            i += 1;
            continue;
        }

        if line.starts_with("# ") || line.starts_with("#\t") {
            let t = line[2..].trim();
            if !t.is_empty() {
                doc = doc.add_paragraph(
                    Paragraph::new().add_run(make_run(t, true)).style("Heading1"),
                );
            }
            i += 1;
            continue;
        }
        if line.starts_with("## ") || line.starts_with("##\t") {
            let t = line[3..].trim();
            if !t.is_empty() {
                doc = doc.add_paragraph(
                    Paragraph::new().add_run(make_run(t, true)).style("Heading2"),
                );
            }
            i += 1;
            continue;
        }
        if line.starts_with("### ") || line.starts_with("###\t") {
            let t = line[4..].trim();
            if !t.is_empty() {
                doc = doc.add_paragraph(
                    Paragraph::new().add_run(make_run(t, true)).style("Heading3"),
                );
            }
            i += 1;
            continue;
        }

        // Unordered list item
        if let Some(item) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            doc = doc.add_paragraph(
                Paragraph::new()
                    .add_run(make_run(item.trim(), false))
                    .indent(Some(720), None, None, Some(0)),
            );
            i += 1;
            continue;
        }

        // Horizontal rule → skip
        if line.trim() == "---" || line.trim() == "***" || line.trim() == "___" {
            i += 1;
            continue;
        }

        // Blockquote
        if let Some(content) = line.strip_prefix("> ") {
            doc = doc.add_paragraph(
                Paragraph::new()
                    .add_run(make_run(content.trim(), false))
                    .indent(Some(720), None, None, Some(0)),
            );
            i += 1;
            continue;
        }

        // Normal paragraph: gather consecutive non-blank, non-heading,
        // non-list lines (like mdast "soft break → space" rendering).
        let mut para = String::new();
        while i < lines.len() && !lines[i].trim().is_empty() {
            let l = lines[i];
            if l.starts_with('#') || l.starts_with("- ") || l.starts_with("* ")
                || l.starts_with("> ")
            {
                break;
            }
            if !para.is_empty() {
                para.push(' ');
            }
            para.push_str(l.trim());
            i += 1;
        }
        if !para.is_empty() {
            doc = doc.add_paragraph(
                Paragraph::new()
                    .add_run(make_run(&para, false))
                    .style("Normal"),
            );
        } else {
            i += 1;
        }
    }

    // ── Write to file ──
    let path = std::path::PathBuf::from(&output_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }

    // Atomic write: temp file + rename. Unique temp name (PID-suffixed) so two
    // racing exports never share — and truncate each other's — one temp file.
    let tmp_path = path.with_file_name(format!(
        ".{}.{}.docx.tmp",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("document"),
        std::process::id()
    ));
    {
        use std::io::{Cursor, Write};
        let bytes = {
            let mut buf = Cursor::new(Vec::new());
            doc.build()
                .pack(&mut buf)
                .map_err(|e| format!("build: {e}"))?;
            buf.into_inner()
        };
        let mut tmp = std::fs::File::create(&tmp_path).map_err(|e| format!("tmp: {e}"))?;
        tmp.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
        tmp.sync_all().map_err(|e| format!("sync: {e}"))?;
    }
    std::fs::rename(&tmp_path, &path).map_err(|e| format!("rename: {e}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init());
    // MAS 渠道不允许自更新：updater 仅在非 mas 构建注册
    #[cfg(not(feature = "mas"))]
    let app = app.plugin(tauri_plugin_updater::Builder::new().build());
    let app = app
        .setup(|app| {
            app.manage(Ready(AtomicBool::new(false)));
            app.manage(CloseWatch {
                requested: AtomicU64::new(0),
                acked: AtomicU64::new(0),
            });
            // 双击关联文件启动时（Windows/Linux）路径在 argv 里，先缓冲起来。
            app.manage(InitialFile(Mutex::new(file_from_args())));
            // tao#1235：把冷启动队列里的文档搬进托管状态（setup 晚于
            // application:openURLs:，此刻托管状态与窗口才真正可用）。
            let queued: Vec<String> = PENDING_DOCS
                .lock()
                .expect("PENDING_DOCS poisoned")
                .drain(..)
                .collect();
            if let Some(first) = queued.first() {
                if let Some(state) = app.try_state::<InitialFile>() {
                    if let Ok(mut slot) = state.0.lock() {
                        *slot = Some(first.clone());
                    }
                }
            }
            // 授权状态的落盘目录。取不到就留空，current_license() 会按"不拦截"处理
            // —— 宁可少拦一次，也不能因为一个目录取不到把用户锁在外面（与 MD/PDF 同款）。
            if let Ok(dir) = app.path().app_data_dir() {
                init_license_dir(dir);
            }
            init_app_handle(app.handle().clone());
            Ok(())
        })
        // 冷启动竞态补发：Opened 事件可能落在「前端查询 initial_file 之后、
        // 监听器挂载之前」的空窗里（实测复现）。页面加载完成时若仍有待开文档，
        // 再补发一次 —— 前端对同一文档有去重，不会弹两次。
        .on_page_load(|window, payload| {
            if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                return;
            }
            if let Some(state) = window.app_handle().try_state::<InitialFile>() {
                if let Ok(slot) = state.0.lock() {
                    if let Some(path) = slot.as_ref() {
                        let _ = window.emit("open-file", path.clone());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            force_close,
            print_doc,
            mark_ready,
            close_ack,
            open_url,
            git_branch,
            save_recovery,
            save_document,
            list_recovery,
            clear_recovery,
            initial_file,
            save_paste_image,
            build_menu,
            import_docx,
            import_docx_data,
            export_docx,
            license_status,
            store_receipt
        ])
        .on_menu_event(|app, event| {
            // ⌘Q / 应用菜单「退出」不能用 PredefinedMenuItem::quit：它直接 app.exit()，
            // 绕过窗口关闭那条未保存守卫（CloseRequested → 前端 confirmDiscard → force_close）。
            // 改为关闭主窗口，复用同一条已被验证的通道；前端未就绪/已崩溃时，
            // on_window_event 里 !ready 会放行默认关闭，窗口销毁后底层触发 ExitRequested
            // 正常退出——不会变成关不掉。取不到窗口时用 app.exit 兜底，保证 ⌘Q 不是死键。
            if event.id().0.as_str() == "quit" {
                match app.get_webview_window("main") {
                    Some(window) => {
                        let _ = window.close();
                    }
                    None => app.exit(0),
                }
                return;
            }
            // 其余菜单项 → 前端：复用现有的动作处理链（未保存守卫、toast 等都在前端）
            let _ = app.emit("menu-action", event.id().0.as_str());
        })
        .on_window_event(|window, event| {
            // Hand the close decision to the frontend, which checks for
            // unsaved changes before destroying the window.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let ready = window
                    .try_state::<Ready>()
                    .map(|r| r.0.load(Ordering::Acquire))
                    .unwrap_or(false);
                if !ready {
                    return; // 前端未就绪：走默认关闭，避免"僵尸窗口"
                }
                let Some(watch) = window.try_state::<CloseWatch>() else {
                    let _ = window.emit("app-close-requested", ());
                    api.prevent_close();
                    return;
                };
                let gen = watch.requested.fetch_add(1, Ordering::AcqRel) + 1;
                let _ = window.emit("app-close-requested", ());
                api.prevent_close();
                // 看门狗（复审 F5）：emit 后启动 10s 定时器。
                //  - 前端存活 → 立即 close_ack（acked >= gen）→ 不强杀，
                //    用户可以从容处理确认弹窗；
                //  - JS 崩溃 / 事件循环卡死 → 无 ack → 10s 后强制销毁，
                //    "理论上关不掉"变成"最多卡 10 秒"。
                //  - 期间若产生新一轮关窗请求（requested != gen），本轮退避，
                //    由新一轮看门狗接管。
                let w = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    let Some(watch) = w.try_state::<CloseWatch>() else {
                        return;
                    };
                    if watch.acked.load(Ordering::Acquire) < gen
                        && watch.requested.load(Ordering::Acquire) == gen
                    {
                        let _ = w.destroy();
                    }
                });
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // macOS / iOS 的文件关联不是命令行参数，而是一个事件（Windows 见 file_from_args）。
        // 两种时序都要兜住：冷启动时事件可能早于前端挂载 —— 所以写进 InitialFile，
        // 前端挂载后经 initial_file 拉取；也可能晚于挂载 —— 所以同时 emit 出去。
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            for url in urls {
                let Ok(path) = url.to_file_path() else { continue };
                let Some(path) = path.to_str() else { continue };
                if !is_markdown_path(std::path::Path::new(path)) {
                    continue;
                }
                // tao#1235：冷启动时该事件在 setup/托管状态存在之前直达（urls 空、
                // try_state 为 None 都可能发生），所以先入进程级队列，setup 再搬运。
                // 热启动先排空队列：队列只在 setup 里 drain 一次，不排则每打开
                // 一个文件就多残留一条（缓慢内存泄漏）。
                if let Ok(mut q) = PENDING_DOCS.lock() {
                    q.clear();
                    q.push(path.to_string());
                }
                // 热启动（应用已运行）：托管状态与前端监听都在，立即送达。
                if let Some(state) = _app_handle.try_state::<InitialFile>() {
                    if let Ok(mut slot) = state.0.lock() {
                        *slot = Some(path.to_string());
                    }
                }
                let _ = _app_handle.emit("open-file", path);
                break;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_hash_is_stable_and_distinguishes_paths() {
        assert_eq!(short_hash("/a/b.md"), short_hash("/a/b.md"));
        assert_ne!(short_hash("/a/b.md"), short_hash("/a/c.md"));
        assert_eq!(short_hash("x").len(), 8);
    }

    // All drafts live in one flat directory, so the file name must be safe for
    // the filesystem: a raw Windows path would otherwise try to create
    // subdirectories (and a drive-letter colon is outright invalid there).
    #[test]
    fn recovery_file_name_is_filesystem_safe() {
        let n = recovery_file_name("C:\\Users\\me\\My Docs\\notes.md");
        assert!(!n.contains('/'), "{n}");
        assert!(!n.contains('\\'), "{n}");
        assert!(!n.contains(':'), "{n}");
        assert!(n.ends_with(".json"), "{n}");
    }

    // Two documents with the same base name in different folders must not share
    // a draft — the hash is what keeps them apart.
    #[test]
    fn recovery_file_name_is_unique_per_directory() {
        assert_ne!(
            recovery_file_name("/work/a/notes.md"),
            recovery_file_name("/work/b/notes.md")
        );
    }

    #[test]
    fn recovery_file_name_survives_non_ascii_paths() {
        let n = recovery_file_name("/Users/me/笔记/草稿.md");
        assert!(n.ends_with(".json"), "{n}");
        assert!(n.contains("草稿.md"), "{n}");
    }

    /// 验收（FAMILY-LICENSE.md §6 / B-P3）：把试用起始时间改到过期后，
    /// 写命令的闸门 `ensure_write_allowed` 必须返回含 `LICENSE_EXPIRED` 的错误。
    /// 构造法照 license.rs 既有测试：直接往状态目录里写起始时间戳。
    #[test]
    fn an_expired_trial_makes_the_write_gate_return_license_expired() {
        // 闸门真实生效的前提：ENFORCE + 直链渠道 + 公钥已配（测试构建三条都成立，
        // 与 license.rs 的 a_configured_key_in_the_direct_channel_engages_the_gate 同源）。
        assert!(
            license::enforced(),
            "测试前提：ENFORCE=true、直链渠道、公钥已配时 enforced() 应为 true"
        );

        let dir = std::env::temp_dir().join(format!("rt-wr-license-gate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // LICENSE_DIR 是进程级单例：本测试是唯一设置它的测试。若将来有人加第二条，
        // 后到的 set 会失败 —— 那时合并两条测试，不要让闸门测试静默跑偏。
        if LICENSE_DIR.set(dir.clone()).is_err() {
            panic!("LICENSE_DIR 已被其他测试设置，闸门测试无法控制状态目录");
        }

        // 试用期第一天：写操作放行。
        let now = now_secs();
        // 文件名即 license.rs 的 STATE_FILE（模块私有常量，这里按值写）。
        std::fs::write(dir.join("state.bin"), now.to_string()).unwrap();
        assert_eq!(ensure_write_allowed(), Ok(()), "试用期内写操作必须放行");

        // 把试用起始时间改到 30 天前：状态 = Expired，必须被拦，错误码固定。
        std::fs::write(dir.join("state.bin"), (now - 30 * 86_400).to_string()).unwrap();
        let err = ensure_write_allowed().unwrap_err();
        assert!(
            err.contains("LICENSE_EXPIRED"),
            "过期后写操作应返回 LICENSE_EXPIRED，实际为 {err}"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
