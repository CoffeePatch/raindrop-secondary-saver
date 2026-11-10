# 💧 Raindrop.io Secondary Saver (Account B)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success?style=flat-square&color=34d399)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tested on Brave & Chrome](https://img.shields.io/badge/Browser-Brave%20%7C%20Chrome-6366f1?style=flat-square)](https://brave.com/)
[![Tests: 357 Passed](https://img.shields.io/badge/Tests-357%20Passed-10b981?style=flat-square)](./test_verification.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

A high-performance, lightweight, pixel-perfect **Manifest V3** browser extension specifically engineered to save bookmarks directly to a **secondary Raindrop.io account (Account B)** while keeping your primary account active in the official Raindrop extension—**in the very same browser profile with zero cookie or session conflicts**.

---

## 🌟 Why This Extension?

The official Raindrop browser extension authenticates strictly via active browser session cookies. If you maintain two separate Raindrop workspaces (e.g. **Personal vs. Work**, **Reading vs. Research Archive**, or **Primary vs. Curated Second Brain**), logging into Account B kicks you out of Account A across all tabs.

**Raindrop Secondary Saver** solves this limitation with a clean, decoupled design:
- **Zero Cookie Conflicts**: Direct REST API integration (`https://api.raindrop.io/rest/v1`) using a dedicated **Personal Access Token**.
- **Run Side-by-Side**: Keep the official Raindrop extension pinned for Account A, and pin this extension (with its distinct **"B" badge**) for Account B.
- **Instant 0ms Display**: Collections and tags are cached locally in `chrome.storage.local`. Opening the popup displays your full folder tree and tags instantly without waiting on network calls.
- **Eliminated Network Stalls**: Uses clean native emojis and folder glyphs (`📁`, `〰`, `🗑`, `🔥`, `📺`) rather than firing unauthenticated external image requests to remote CDNs that stall popup loading.

---

## ✨ Features Overview

### 🖤 1. AMOLED Pure Black UI (1:1 Native Parity)
- Pixel-perfect reproduction of Raindrop's native dark interface.
- Pure `#000000` AMOLED background, `#141517` rounded preview cards, and gold accent buttons (`#d4b476`).
- Markdown badge (`M↓`), editable Title and Excerpt fields, Notes, Heart favorite toggle, and Reminder bell.

### 🏷️ 2. Interactive Tag Chips with 1-Click Removal
- Real-time Tag Chips with smooth hover states.
- **1-Click Delete**: Click the red `✕` on hover or press <kbd>Backspace</kbd> on an empty input to remove chips one by one.
- Comma `,` or <kbd>Enter</kbd> instantly creates new tags.

### 🔍 3. Smart "Recent vs. Other" Tag Autocomplete
- Powered by `GET /tags/0` to retrieve your full tag library with item count badges.
- Intelligent two-section dropdown:
  - **Recent Tags**: Up to 10 of your most recently saved tags for rapid repeated tagging.
  - **Other Tags**: Alphabetical and frequency-sorted tags matching your query.
  - **`+ Add tag "[name]"`**: Dedicated quick-creation row if the tag does not exist.

### 📁 4. Collapsible Folder Hierarchy with Instant Chevron Toggles
- Complete multi-level folder tree supporting deep nesting.
- **Fast Collapsing/Expanding**: Smooth chevron toggles (`▶` collapsed, `▼` expanded) update immediately without lag.
- Remembers collapsed/expanded state across browser restarts.
- Auto-expands parent folders to reveal your currently selected collection.
- Quick-search filter filters folders in real-time, plus one-click folder creation.
- Preserves special system folders: `〰 Unsorted` (id: 0) and `🗑 Trash` (id: -99) with live bookmark counts.

### ⊞ 5. Bulk "Save Tabs" with Shift+Click Range Selection
- Dedicated **Tabs Subview** lists all open web tabs in the current window with real-time favicons.
- **Range Selection**: <kbd>Shift</kbd> + Click to select or deselect a range of 20+ tabs in a single click.
- **1-2 Second Fast Batch Saving**: Uses Raindrop's batch API (`POST /raindrops`) with automatic chunking.
- Auto-applies date tags (e.g. `#11/10/2026`) and target collection.
- Optional `"Close tabs after saving"` checkbox to declutter your workspace.

### ⚡ 6. Toolbar Saved Checkmark Badge
- Background service worker listens to tab changes and verifies URL bookmark status against Account B.
- Displays a clean green checkmark badge (`✓`) in your browser toolbar whenever you browse a page already saved to your secondary account.

### ⌨️ 7. Keyboard Power Workflow
- Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>⌘</kbd> + <kbd>Enter</kbd>) to instantly save the active bookmark or batch-save selected tabs.
- Press <kbd>Esc</kbd> to return to previous views or dismiss modal dropdowns.

---

## 🔑 Step 1: Generate Your Account B Personal Access Token

To connect Account B without touching Account A's session:

1. Open a **Private / Incognito Window** and log into **Account B** at [Raindrop.io](https://app.raindrop.io).
2. Navigate to **Settings → Integrations**:
   👉 [https://app.raindrop.io/settings/integrations](https://app.raindrop.io/settings/integrations)
3. Scroll down to the **"For Developers"** section.
4. Click **Create new app**.
5. Give your app a name (e.g., `Secondary Saver` or `Account B`) and accept the terms.
6. Once created, click on the application name.
7. Click **"Create test token"**.
8. Copy the generated token string (e.g., `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

> [!TIP]
> Test tokens do not expire unless revoked, making them permanent and secure for personal extension usage.

---

## 🚀 Step 2: Install in Brave or Chrome

### In Brave Browser
1. Open Brave and navigate to:
   ```text
   brave://extensions
   ```
2. In the top-right corner, switch the **Developer mode** toggle to **ON**.
3. In the top-left toolbar, click **Load unpacked**.
4. Select the repository root folder (`/path/to/raindrop-secondary-saver`).
5. The extension will appear as **"Raindrop.io - Secondary Saver"**.
6. Pin it to your toolbar via the Extensions puzzle icon.

### In Google Chrome
1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. In the top-right corner, switch the **Developer mode** toggle to **ON**.
3. Click **Load unpacked**.
4. Select the repository root folder (`/path/to/raindrop-secondary-saver`).
5. Pin the extension to your toolbar.

---

## ⚙️ Step 3: Connect & Configure

1. Click the **Raindrop Secondary Saver** icon in your toolbar.
2. If this is your first run, the Setup screen will open automatically.
3. Paste your Personal Access Token and click **Verify & Connect**.
4. The extension will verify the token, fetch your user profile, cache your collections and tags, and open the Main Bookmark view.
5. You can switch tokens or disconnect anytime via the top-right avatar menu or the dedicated Options page (`chrome://extensions` → Details → Extension options).

---

## 📁 Repository Structure

```text
raindrop-secondary-saver/
├── manifest.json              # Manifest V3 manifest, permissions & CSP
├── background.js              # Service worker: toolbar checkmark badge & URL checker
├── popup/
│   ├── popup.html             # Multi-view interface (Main, Collection, Tabs, Settings)
│   ├── popup.css              # AMOLED pure black styling, animations & responsive rules
│   └── popup.js               # Reactive controller: tag chips, batch tabs, collection tree
├── options/
│   ├── options.html           # Standalone settings & connection management page
│   ├── options.css            # Options UI dark styles
│   └── options.js             # Token tester & status controller
├── scripts/
│   └── api.js                 # Raindrop REST API client, local caching & tree builder
├── icons/
│   ├── icon-16.png            # 16x16 toolbar icon (with "B" badge)
│   ├── icon-32.png            # 32x32 retina icon
│   ├── icon-48.png            # 48x48 extension manager icon
│   ├── icon-128.png           # 128x128 store icon
│   └── icon.svg               # Scalable SVG master
├── test_verification.js       # Comprehensive automated test suite (357 assertions)
├── .gitignore                 # Clean repository git rules
└── README.md                  # Documentation & usage guide
```

---

## 🧪 Automated Test Suite

The repository includes a comprehensive zero-dependency test suite running on Node.js:

```bash
node test_verification.js
```

### Verification Coverage (357 Automated Assertions):
- **Manifest V3 Structure**: Validates MV3 permissions (`activeTab`, `storage`, `tabs`, `host_permissions`).
- **Icon Dimensions**: Pillow-verified 16x16, 32x32, 48x48, 128x128 icons.
- **REST Client & Storage**: Bearer token sanitation, quota handling, quote stripping, cache serialization.
- **Local Cache & 0ms Startup**: `chrome.storage.local` cache operations for instant display and clean cache invalidation on disconnect.
- **Hierarchical Tree & Collapse Logic**: Parent-child relationship tracking, orphan adoption, cyclic reference resilience, deep indent scaling.
- **Icon Rendering & Stall Elimination**: URL icon detection, lazy decoding fallback, non-URL clean emoji preservation (`🔥`, `📺`, `📁`, `〰`, `🗑`).
- **Tag Chips & Keyboard Input**: Autocomplete grouping, tag parsing, comma/backspace chip manipulation.
- **Shift+Click Range Selection**: Multi-tab range toggling and batch payload formation (`POST /raindrops`).

---

## 🔒 Architecture & Privacy

- **100% Client-Side**: Operates entirely in your local browser sandbox.
- **Zero Third-Party Servers**: Requests go directly from your browser to `https://api.raindrop.io/rest/v1`.
- **Zero Cookies / Session Contamination**: Does not read, touch, or overwrite any cookies in your browser profile. Account A remains completely unaffected.
- **Storage**: Tokens and preferences are stored in secure `chrome.storage.sync` with local fallback.
- **Content Security Policy (CSP)**: Compliant with strict Manifest V3 CSP (no inline scripts, no `eval()`, sanitized DOM output).

---

## 📄 License

MIT License. Designed and built for seamless multi-account bookmark management.
