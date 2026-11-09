# Raindrop.io Secondary Saver (Account B)

A lightweight, pixel-perfect **Manifest V3** Chrome and Brave browser extension specifically designed to save bookmarks to a **secondary Raindrop.io account (Account B)** while keeping your primary account active in the official Raindrop extension—**in the very same browser profile with zero cookie or session conflicts**.

---

## 🌟 Why This Extension?

The official Raindrop extension relies on active browser session cookies. If you have two Raindrop accounts (e.g. Personal vs. Work, or Primary vs. Curated archive), logging into Account B logs you out of Account A.

This extension solves that problem cleanly:
- **Zero Cookie Conflicts**: Communicates directly with the Raindrop REST API (`https://api.raindrop.io/rest/v1`) using a dedicated **Personal Access Token**.
- **Run Side-by-Side**: Keep the official Raindrop extension pinned for Account A, and pin this extension (with its green **"B" badge**) for Account B.
- **1:1 Native Raindrop UI/UX**: Matches Raindrop's exact dark-themed interface, typography, rounded preview card, gold accent buttons (`#d4b476`), and layout.
- **Collection Picker Subview**: Dedicated search & browse view for all collections and nested sub-collections, plus special `〰 Unsorted` and `🗑 Trash`, with real-time filtering and on-the-fly collection creation.
- **Save Tabs Subview**: Batch-save all open tabs in your current window with date tags (e.g. `#11/9/2026`), target collection selection, and optional tab closing.
- **Enhanced Tags Autocomplete**: Fetches all user tags across collections (`GET /tags/0`) and provides a polished floating dropdown displaying matching tags with count badges.
- **Existing Bookmark Detection**: Automatically recognizes if the current tab is already bookmarked, displaying "Saved" status and allowing quick updates or deletion.
- **Fast Keyboard Workflow**: Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>⌘</kbd> + <kbd>Enter</kbd>) to instantly save the active tab or tabs.

---

## 🔑 Step 1: Obtain Your Account B Personal Access Token

To connect Account B:

1. Open a **Private / Incognito window** and log into **Account B** at [Raindrop.io](https://app.raindrop.io).
2. Go to **Settings → Integrations**:
   👉 [https://app.raindrop.io/settings/integrations](https://app.raindrop.io/settings/integrations)
3. Scroll down to the **"For Developers"** section.
4. Click **Create new app**.
5. Give your app any name (e.g., `Secondary Saver` or `Account B Saver`) and accept terms.
6. Once created, click on your app name.
7. Click **"Create test token"**.
8. Copy the generated token string (e.g., `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

> [!NOTE]
> Test tokens do not expire unless revoked, making them ideal for personal browser extensions.

---

## 🚀 Step 2: Install in Brave Browser (or Chrome)

1. Open Brave and navigate to the Extensions management page:
   ```text
   brave://extensions
   ```
   *(For Google Chrome, navigate to `chrome://extensions`)*
2. In the top-right corner, switch the **Developer mode** toggle to **ON**.
3. In the top-left toolbar, click **Load unpacked**.
4. Browse to and select this project directory:
   ```text
   /home/hello/Projects/raindrop-secondary-saver
   ```
5. The extension will appear in your extensions list as **"Raindrop.io - Secondary Saver"**.
6. Pin it to your Brave toolbar:
   - Click the Extensions puzzle piece icon on your toolbar.
   - Click the **Pin** icon next to **Raindrop.io - Secondary Saver**.

---

## ⚙️ Step 3: Configure Token

1. Click the extension icon in your toolbar.
2. If this is your first time, the setup screen will open automatically.
3. Paste your Account B token and click **Verify & Connect**.
4. Once verified, the extension immediately connects to Account B and loads all your collections and tags.
5. You can switch tokens or manage settings anytime via the top-right avatar menu or the dedicated Options page.

---

## 📋 Views & Features

### 1. Main Bookmark View
- **Header**: Raindrop blue cloud icon, "Saved" / "Raindrop" status, AI sparkle suggestions button, search icon, and user avatar dropdown menu (Switch Token, Disconnect, Open Raindrop Web).
- **Preview Section**: Page thumbnail preview with cover dropdown arrow, editable bold Title, and editable Excerpt.
- **Note Field**: Rounded dark input with `M↓` (markdown support badge) and gold focus border.
- **Collection Pill**: Displays collection icon/emoji, title, and down arrow (e.g. `🔥 HOT Check ▾`). Clicking it opens the Collection Subview.
- **Tags Autocomplete**: Powered by `GET /tags/0`, suggestions appear in a custom dark floating dropdown showing tag names and bookmark count badges.
- **URL & Quick Actions**: Editable URL field, Heart favorite toggle, and Reminder bell toggle.
- **Bottom Bar**: `✏ Highlights` button, `⊞ Tabs` button, "Delete" button (if already saved), and Gold "Save" button.

### 2. Select Collection Subview
- Triggered by clicking the Collection pill button.
- Real-time search filter: `🔍 Find or create new collection...`.
- Special collections: `〰 Unsorted` (id: 0) and `🗑 Trash` (id: -99) with live counts.
- User collections: Hierarchically indented tree with custom collection icons and count badges (clutter-free without collaborator emojis).
- One-click creation: If typed collection does not exist, click `+ Create collection "[query]"` to create and select it instantly.

### 3. Save Tabs Subview
- Triggered by clicking `⊞ Tabs` in the bottom action bar.
- Scans and lists all open web tabs in the current window with favicons and page titles.
- "Select all" toggle and live tab counter.
- Target collection picker pill.
- Prefilled date tag input (e.g. `#11/9/2026`).
- `☑ Close tabs` option to automatically close tabs after saving.
- Gold `Save X tabs` action button.

---

## 📁 File Structure

```text
raindrop-secondary-saver/
├── manifest.json              # Manifest V3 configuration & permissions
├── popup/
│   ├── popup.html             # Multi-view popup (Main, Collection, Tabs, Setup)
│   ├── popup.css              # 1:1 Pixel-perfect Raindrop dark theme styling
│   └── popup.js               # Reactive controller for views, tabs & tags
├── options/
│   ├── options.html           # Dedicated options & account status page
│   ├── options.css            # Options page styling
│   └── options.js             # Token verification and connection tester
├── scripts/
│   └── api.js                 # Raindrop REST API client (GET /tags/0, collections, CRUD)
├── icons/
│   ├── icon-16.png            # 16x16 toolbar icon
│   ├── icon-32.png            # 32x32 retina icon
│   ├── icon-48.png            # 48x48 extension list icon
│   ├── icon-128.png           # 128x128 store/web icon
│   └── icon.svg               # Scalable source vector icon
├── test_verification.js       # Comprehensive automated test suite
├── .gitignore                 # Standard git ignores
└── README.md                  # Documentation
```

---

## 🧪 Automated Verification Suite

Run the full automated test suite anytime using Node.js:

```bash
node test_verification.js
```

The test suite validates:
- Manifest V3 structure and permissions (`activeTab`, `storage`, `tabs`, `host_permissions`).
- Icon existence and exact dimensions (16, 32, 48, 128) via Pillow.
- JavaScript syntax integrity across all JS files.
- HTML resource references for styles and scripts.
- Collection hierarchy building, child collection nesting, and orphaned recovery.
- `GET /tags/0` tag count parsing and sanitization.
- Storage helpers and token bearer/quote sanitization.
- Bookmark creation, URL checking, update, and deletion edge cases.
- 1:1 UI element parity with Raindrop screenshots.

---

## 🔒 Security & Privacy

- Operates **100% locally** in your browser.
- Stores your Personal Access Token in secure `chrome.storage.sync` with local fallback.
- No analytics, tracking, intermediate servers, or telemetry; all requests go directly to `https://api.raindrop.io/rest/v1`.
