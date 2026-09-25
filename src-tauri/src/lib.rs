mod paddle;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use serde::Serialize;
use tauri_plugin_opener::OpenerExt;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WindowEvent};

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
#[tauri::command]
fn print_doc(webview: tauri::WebviewWindow) -> Result<(), String> {
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
fn build_app_menu(app: &tauri::AppHandle, lang: &str) -> tauri::Result<()> {
    let zh = lang.starts_with("zh");
    let l = |zhv: &'static str, en: &'static str| if zh { zhv } else { en };

    let new_i = MenuItem::with_id(app, "new", l("新建", "New"), true, Some("CmdOrCtrl+N"))?;
    let open_i = MenuItem::with_id(app, "open", l("打开…", "Open…"), true, Some("CmdOrCtrl+O"))?;
    let save_i = MenuItem::with_id(app, "save", l("保存", "Save"), true, Some("CmdOrCtrl+S"))?;
    let save_as_i = MenuItem::with_id(
        app,
        "save-as",
        l("另存为…", "Save As…"),
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let export_i = MenuItem::with_id(
        app,
        "export-pdf",
        l("导出 PDF…", "Export PDF…"),
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
                Some(l("关于 Rocktier Write", "About Rocktier Write")),
                None,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", l("退出", "Quit"), true, Some("CmdOrCtrl+Q"))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        l("文件", "File"),
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
        l("编辑", "Edit"),
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
        l("切换侧栏", "Toggle Sidebar"),
        true,
        Some("CmdOrCtrl+\\"),
    )?;
    let theme_i = MenuItem::with_id(app, "toggle-theme", l("切换日夜模式", "Toggle Theme"), true, None::<&str>)?;
    let find_i = MenuItem::with_id(app, "find", l("查找替换", "Find & Replace"), true, Some("CmdOrCtrl+F"))?;
    let view_menu = Submenu::with_items(
        app,
        l("显示", "View"),
        true,
        &[&sidebar_i, &theme_i, &find_i],
    )?;

    let window_menu = Submenu::with_items(
        app,
        l("窗口", "Window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let site_i = MenuItem::with_id(app, "website", l("官方网站", "Website"), true, None::<&str>)?;
    let mail_i = MenuItem::with_id(app, "feedback", l("反馈", "Feedback"), true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, l("帮助", "Help"), true, &[&site_i, &mail_i])?;

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
#[tauri::command]
#[cfg(desktop)]
fn export_docx(markdown: String, output_path: String) -> Result<(), String> {
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

    // Atomic write: temp file + rename (same pattern as save_document)
    let tmp_path = path.with_extension("docx.tmp");
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

// ── Paddle License Commands ─────────────────────────────────────────

#[tauri::command]
async fn paddle_activate(
    app_handle: tauri::AppHandle,
    license_key: String,
) -> Result<paddle::LicenseRecord, String> {
    let path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    paddle::activate_license(&path, &license_key).await
}

#[tauri::command]
fn paddle_check(app_handle: tauri::AppHandle) -> Result<paddle::LicenseStatus, String> {
    let path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    Ok(paddle::check_license(&path))
}

#[tauri::command]
fn paddle_deactivate(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    paddle::remove_license(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            export_docx,
            paddle_activate,
            paddle_check,
            paddle_deactivate
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
}
