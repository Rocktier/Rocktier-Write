# Rocktier Write — Microsoft Store 提交主文档（v1.1.7 · 首次提交）

> **唯一真源**。本文所有字段可直接粘贴到 Partner Center。
> 产品截图在 `store-assets/screenshots/`，商店磁贴在 `store-assets/store-tile-300.png`，
> 样板文档在 `store-assets/sample-novel.md`。**界面语言以英文为准**（用户群 English-first，
> 中文列表仅作第二语言补充）。

---

## 0. 身份与包标识（提交后不可更改）

| 字段 | 值 |
|---|---|
| 应用名（商店显示） | **Rocktier Write** |
| 包标识 `Identity/Name` | `Rocktier.RocktierWrite` |
| 发布者 `Identity/Publisher` | `CN=4EA39D7A-401B-4D56-98D0-8ECB1F2B8DF7` |
| 发布者显示名 | `Rocktier` |
| 包版本 | `1.1.7.0`（与 git tag `v1.1.7` 一致，商店从包清单读取） |
| 可执行文件 | `RocktierWrite.exe` |
| 架构 | x64（CI 产物） |

⚠️ 先在 Partner Center 预留应用名 `Rocktier Write`，拿到的 `Identity/Name` 必须与 `Rocktier.RocktierWrite` 逐字一致。
⚠️ `Identity/Name` / `Identity/Publisher` 提交后不得再改。

---

## 1. 定价与试用

| 字段 | 填写 | 说明 |
|---|---|---|
| 定价 | **$4.99 USD 买断** | 家族统一价 |
| 促销（发行价） | **$2.99 USD，上市首 14 天** | Partner Center → 定价和可用性 → 促销价，填起止日期（上市日 ~ +14 天） |
| 试用 | **启用 · 时限 7 天** | ⚠️ 见下方说明——没有应用侧检测 = 到期后照常使用 |

> ⚠️ **试用的强制是应用侧的，不是商店侧的**（Windows 包，非 iOS）：时限试用到期后，
> Store 只把许可证置为“未激活”，**应用必须自己调用 Store 许可 API 检测并响应**；
> 不检测 = 7 天后用户照常用，等于白送。这正是 MD 上次判定“纯买断是唯一诚实选项”的原因。
>
> **【2026-09-26 定案】** 按计划执行：**$4.99 买断 + $2.99 首 14 天促销 + 7 天试用，随 v1.1.7 包直接提交**
>（包内暂无 license 检测，试用为“荣誉制”，到期不强制）。后续版本实现 Store 许可检测
>（启动查 IsTrial/ExpirationDate，过期弹购买引导并限制编辑）后，试用才真正生效。

---

## 2. 分类与关键词

| 字段 | 填写 |
|---|---|
| 类别 | **生产力（Productivity）** |
| 子类别 | Partner Center 下拉中最接近「写作 / 笔记」的一项；无可选则留空 |

### 搜索关键词（可直接粘贴）

```
novel writing, long-form writing, markdown editor, chapter outline,
word count, focus mode, docx export, offline editor, manuscript, privacy
```

自查（避坑 #16）：无平台名（不含 Windows/macOS/Linux）、无其他产品名（不含 Word/Typora/Notion/Scrivener 等）、无字面 "free"。

---

## 3. 商店列表文案（可直接粘贴，英文母版）

### 简短描述（≤100 字符，必填）

```
Focused writing for novels and long-form work. Chapters, focus mode, DOCX/PDF export. 100% offline.
```

（实测 96 字符 ✅。零字面 "free"——付费产品红线，见避坑 #13。）

### 详细描述

```
Rocktier Write is a writing app for the long thing — novels, memoirs, theses, scripts —
work that is measured in chapters, not notes. It runs entirely on your Windows PC,
with no account, no cloud and no connection of any kind.

WHY OFFLINE IS THE SAFEST CHOICE
A manuscript is irreplaceable. The moment your draft lives on someone else's server,
its safety depends on their security, their backups, their privacy policy — and their
company's future. Rocktier Write keeps every word on your own machine: there is no
server to breach, no account to leak, no third party to trust. Your work exists in
exactly one place — the place you chose — until you choose otherwise. For writing you
cannot afford to lose, offline is not a limitation. It is the safest architecture
there is.

BUILT FOR CHAPTERS
A chapter sidebar lists every heading with per-chapter word counts and goals, so you
always know where the book stands. Set a session goal and track progress as you write.
Multi-document tabs keep several drafts open at once.

FOCUS MODE
Focus mode dims everything except the paragraph — or the single sentence — you are
writing, and typewriter scrolling keeps your eyes on the words instead of the window.

FROM DRAFT TO SUBMISSION
Write in clean Markdown with a live preview, then export the format the publisher
asked for: .docx, PDF or plain text — all rendered on your own machine. Existing
Word documents can be imported back into Markdown. Find and replace, word goals and
a dark theme round out long writing sessions.

YOUR FILES, ORDINARY FILES
Everything is plain .md in folders you control. Open them with any editor, any time,
even if this app disappears tomorrow. Line endings are preserved exactly, and crash
recovery keeps unsaved work — including documents you never saved to disk.

SMALL AND PRIVATE BY ARCHITECTURE
Around 3 MB to install — the whole app, not a downloader. No telemetry, no analytics,
no account, no updater phoning home. The package declares no network capability at
all: the app cannot reach the internet even if it wanted to.

Eight interface languages: English, Chinese, Japanese, Korean, French, German,
Spanish, Portuguese. Works fully offline, forever.
```

自查：
- 零字面 "free" / "distraction-free"（避坑 #13：微软逐词扫描，子串也算）
- 无 macOS / Mac / Apple / iOS / Android 字样（避坑 #10.1.5）
- 无其他产品名（避坑 #16）；格式只用扩展名（.docx / PDF / .md）
- 隐私论点为用户点名的核心卖点（a）；focus / offline / exports 三个点各有专段（b）

### 此版本的新增功能（Release Notes · v1.1.7）

```
Initial release of Rocktier Write for Windows.

• Chapter sidebar with per-chapter word counts and goals
• Focus mode (paragraph / sentence dimming) and typewriter scrolling
• Markdown editing with live preview and dark theme
• Export to .docx, PDF and plain text; .docx import
• Multi-document tabs with unsaved-change protection
• Find and replace, word goals and progress tracking
• Crash recovery for every document, including never-saved ones
• Eight interface languages; works fully offline
```

---

## 4. 商店信息字段

| 字段 | 填写 |
|---|---|
| 支持邮箱 | `hello@rocktier.com` |
| 支持 URL | `https://rocktier.com` |
| 官网 | `https://rocktier.com/write` |
| 隐私政策 URL | `https://rocktier.com/privacy`（提交前已确认返回 200 ✅） |
| 版权 | `© 2026 Rocktier` |
| 是否含广告 | 否 |
| 是否含应用内购买 | 否 |
| 需要网络连接 | **否（纯离线）** |
| 界面语言 | en-US（母版），zh-Hans（第二语言，见 `store-assets/listing-zh.md`） |
| 最低系统要求 | Windows 10 版本 1809（build 17763）或更高 / Windows 11 · x64 |

---

## 5. 素材

### 商店磁贴（1:1 应用磁贴图标）

| 文件 | 尺寸 | 状态 |
|---|---|---|
| `store-assets/store-tile-300.png` | 300×300 RGBA | ✅ 由 `src-tauri/icons/icon.svg` 栅格化，301 色真实图形（非占位块） |

### 包内磁贴（避坑 #17：打包只读 `gen/windows/Assets/`，已入库且为真图）

```
src-tauri/gen/windows/Assets/StoreLogo.png          50×50
src-tauri/gen/windows/Assets/Square44x44Logo.png    44×44
src-tauri/gen/windows/Assets/Square150x150Logo.png  150×150
src-tauri/gen/windows/Assets/Wide310x150Logo.png    310×150
```

### 截图（`store-assets/screenshots/`，英文界面）

| # | 文件 | 画面 |
|---|---|---|
| 1 | `write-1-editor-chapters.png` | 编辑视图 + 章节侧栏（词数/目标） |
| 2 | `write-2-focus-mode.png` | 专注模式（段落淡出） |
| 3 | `write-3-preview.png` | 实时预览视图 |
| 4 | `write-4-find-replace.png` | 查找替换栏 |
| 5 | `write-5-multi-tab.png` | 多文档标签 |
| 6 | `write-6-dark.png` | 深色主题 + 句子专注（夜间写作场景） |

拍摄方法（家族已验证流程，取自 MD）：构建 macOS 版 → 打开 `sample-novel.md` →
`osascript` 激活并固定窗口 1280×772 于 {20,60} → `screencapture -x -R20,60,1280,772` →
PIL 后处理（Write 用透明标题栏不可整裁）：**交通灯区域按顶栏底色精准覆盖 + 圆角修方**
（脚本 `/tmp/w-shot.py`，底色自适应深浅主题）→ 自查：交通灯三色像素计数为 0、四角为底色。
※ 操作要点：按钮点击优先用 System Events AX 元素名（坐标易偏）；输入文本走 pbcopy+⌘V
（osascript keystroke 会被中文输入法拦截产生乱串）；每拍一张先跑"灯位哨兵"确认窗口在最前。

> 截图一律英文界面 + 英文样板 `sample-novel.md`（English-first，用户明确要求）。

---

## 6. 年龄分级（IARC 问卷）

纯离线写作工具：无账号、无联网、无广告、无 IAP、不收集数据 → **所有问题一律选「否 / 无」**。

| 问题（大意） | 选择 |
|---|---|
| 内容类别 | 非游戏（实用工具 / 生产力） |
| 暴力/血腥、性/裸露、粗俗语言、受管物质、赌博、恐怖 | 全部「否」 |
| 用户生成内容 / 社交 / 用户间交互 | 否（只编辑本地文件） |
| 位置共享 / 收集个人信息 | 否（清单未声明任何网络能力） |
| 应用内数字商品购买 / 广告 | 否 |
| 无限制网络访问 / 内置浏览器 | 否 |

预期：各区域最低分级。

---

## 7. Notes for certification（给审核员的说明，英文）

```
Rocktier Write is a fully offline writing app for long-form work. The package
declares no network capability at all — no telemetry, no analytics, no account,
no updater. Documents are ordinary .md files in user-chosen folders.

How to test:
1. Launch the app. It opens a welcome document; the left sidebar lists its
   chapters with word counts.
2. File > Open (or drag a .md file onto the window) to open an existing document.
   Any plain-text .md file works.
3. Click Focus in the toolbar to cycle paragraph / sentence focus mode.
4. Use the Export buttons in the toolbar for PDF, or Save As for .docx / plain text.
5. View > Toggle Theme switches dark / light.

Notes:
- No sign-in, licence key or purchase step is required to review the app.
- "Export to PDF" prints through the system print dialog; choose
  "Microsoft Print to PDF".
- No sample file is bundled; the welcome document ships inside the app.
- The interface language follows the system language and can be switched in the app.
```

---

## 8. MSIX 出包与验收

CI 推 `v*` tag 时由 `build-windows` job 产出（`tauri:windows:build` → `tauri-windows-bundle`）：

```bash
gh release download v1.1.7 -R <repo> -p "*msix*" -D ~/Downloads/Rocktier-Write-MSStore/package
```

验收（MD 家族流程）：

```bash
M=~/Downloads/Rocktier-Write-MSStore/package/*.msix
unzip -p "$M" AppxManifest.xml | grep -E 'Name=|Version=|Publisher=|Executable='
# 期望：Name="Rocktier.RocktierWrite" / Publisher="CN=4EA39D7A-..." / Version="1.1.7.0" / Executable="RocktierWrite.exe"

mkdir -p /tmp/wchk && unzip -o -q "$M" -d /tmp/wchk
python3 -c "
from PIL import Image; import pathlib
for p in sorted(pathlib.Path('/tmp/wchk/Assets').glob('*.png')):
    im = Image.open(p).convert('RGB'); c = im.getcolors(maxcolors=200000) or []
    print(f'{len(c):>5} 色  {im.size}  {p.name}' + ('   <-- 纯色占位块！' if len(c)==1 else ''))
"
# 每张必须 >1 色；另确认 AppxManifest 无 internetClient 能力
```

> 首次提交无「重名包」问题（那是重复提交同版本才会撞的，见 MD §7）。

---

## 9. 提交前总自检

- [ ] Partner Center 已预留应用名，`Identity/Name` = `Rocktier.RocktierWrite`
- [ ] MSIX 已下载且 AppxManifest 四项标识核对通过（Name/Publisher/Version/Executable）
- [ ] 包内 4 张磁贴颜色数 > 1
- [ ] 描述 + 关键词 + Release Notes **零字面 "free"**（含子串）
- [ ] 无任何平台名 / 其他产品名
- [ ] 定价 $4.99 买断 / 促销价 $2.99（首 14 天）/ 试用 7 天——且试用若启用，**包内必须有 Store 许可检测**
- [ ] 6 张截图已上传（英文界面，无 macOS 交通灯）
- [ ] 300×300 磁贴已上传
- [ ] 隐私政策 URL 可访问（200）
- [ ] IARC 全「否」
- [ ] 提交后不改 Identity/Name 与 Identity/Publisher

---

*配套：`store-assets/listing-en.md`（英文母版）、`store-assets/listing-zh.md`（中文第二语言）。*
