/**
 * Raindrop Secondary Saver - 1:1 Pixel-Perfect Popup Controller
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Checks if a collection icon is a URL/cover image
 */
function isUrlIcon(icon) {
  if (typeof icon !== 'string') return false;
  const trimmed = icon.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/')
  );
}

/**
 * Renders collection icon as <img> tag if it is a URL, or escaped text if emoji/string
 */
function renderIconHtml(icon, defaultIcon = '📁') {
  const ic = (icon !== undefined && icon !== null && icon !== '') ? icon : defaultIcon;
  if (isUrlIcon(ic)) {
    return `<img class="coll-icon-img" src="${escapeHtml(ic.trim())}" alt="" loading="lazy" decoding="async" />`;
  }
  return escapeHtml(ic);
}

/**
 * Checks if a collection should be visible in the hierarchical tree given expanded collection IDs
 */
function isCollectionVisible(coll, expandedSet, collMap) {
  if (!coll) return false;
  let currentParentId = coll.parentId;
  const visited = new Set();
  while (currentParentId !== null && currentParentId !== undefined) {
    const pNum = Number(currentParentId);
    if (visited.has(pNum)) break;
    visited.add(pNum);
    if (!expandedSet || !expandedSet.has(pNum)) {
      return false;
    }
    const parent = collMap ? collMap.get(pNum) : null;
    if (!parent) break;
    currentParentId = parent.parentId;
  }
  return true;
}

/**
 * Recursively expands all ancestor folders of a collection so it is visible in the tree
 */
function expandAncestorsOf(collId, collList, expandedSet) {
  if (!collId || !Array.isArray(collList) || !expandedSet) return false;
  const map = new Map(collList.map(c => [Number(c.id), c]));
  let current = map.get(Number(collId));
  let changed = false;
  const visited = new Set();
  while (current && current.parentId !== null && current.parentId !== undefined) {
    const pId = Number(current.parentId);
    if (visited.has(pId)) break;
    visited.add(pId);
    if (!expandedSet.has(pId)) {
      expandedSet.add(pId);
      changed = true;
    }
    current = map.get(pId);
  }
  if (changed && typeof RaindropStorage !== 'undefined' && RaindropStorage.setExpandedCollectionIds) {
    RaindropStorage.setExpandedCollectionIds(Array.from(expandedSet));
  }
  return changed;
}

/**
 * Applies Shift+Click range selection across a list of checkboxes
 */
function applyShiftClickRangeSelection(checkboxes, clickedIndex, lastIndex, targetState) {
  if (!Array.isArray(checkboxes) || clickedIndex < 0 || clickedIndex >= checkboxes.length) {
    if (checkboxes && checkboxes[clickedIndex]) {
      checkboxes[clickedIndex].checked = targetState;
    }
    return clickedIndex;
  }
  if (
    lastIndex === null ||
    lastIndex === undefined ||
    lastIndex < 0 ||
    lastIndex >= checkboxes.length ||
    clickedIndex === lastIndex
  ) {
    if (checkboxes[clickedIndex]) {
      checkboxes[clickedIndex].checked = targetState;
    }
    return clickedIndex;
  }
  const start = Math.min(lastIndex, clickedIndex);
  const end = Math.max(lastIndex, clickedIndex);
  for (let i = start; i <= end; i++) {
    if (checkboxes[i]) {
      checkboxes[i].checked = targetState;
    }
  }
  return clickedIndex;
}

class TagChipsComponent {
  constructor({
    container,
    input,
    dropdown,
    dropdownList,
    placeholder = 'Add tags...',
    onChange = () => {},
    getAllTags = () => [],
    getRecentTags = () => [],
    doc = (typeof document !== 'undefined' ? document : null)
  }) {
    this.container = container;
    this.input = input;
    this.dropdown = dropdown;
    this.dropdownList = dropdownList;
    this.placeholder = placeholder;
    this.onChange = onChange;
    this.getAllTags = getAllTags;
    this.getRecentTags = getRecentTags;
    this.doc = doc;

    this.tags = [];
    this.activeAutocompleteIndex = -1;

    this.init();
  }

  init() {
    if (!this.container || !this.input) return;

    // Focus input and show dropdown when clicking anywhere in the container
    this.container.addEventListener('click', (e) => {
      if (!e.target.closest || !e.target.closest('.tag-chip')) {
        this.input.focus();
        this.renderDropdown();
      }
    });

    // Handle typing and pasting in the inline input
    this.input.addEventListener('input', () => {
      const val = this.input.value || '';
      if (val.includes(',')) {
        const parts = val.split(',');
        for (let i = 0; i < parts.length - 1; i++) {
          const t = parts[i].trim();
          if (t) this.addTag(t);
        }
        this.input.value = parts[parts.length - 1].trimStart();
      }
      this.renderDropdown();
    });

    this.input.addEventListener('focus', () => {
      this.renderDropdown();
    });

    this.input.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    if (this.doc) {
      this.doc.addEventListener('click', (e) => {
        if (
          this.container &&
          !this.container.contains(e.target) &&
          this.dropdown &&
          !this.dropdown.contains(e.target)
        ) {
          this.hideDropdown();
        }
      });
    }

    this.renderChips();
  }

  handleKeydown(e) {
    const items = this.dropdownList
      ? this.dropdownList.querySelectorAll('.tag-dropdown-item')
      : [];
    const isDropdownOpen =
      this.dropdown &&
      !this.dropdown.classList.contains('hidden') &&
      items.length > 0;

    if (e.key === 'ArrowDown') {
      if (isDropdownOpen) {
        e.preventDefault();
        this.activeAutocompleteIndex = (this.activeAutocompleteIndex + 1) % items.length;
        this.updateActiveItem(items);
      }
    } else if (e.key === 'ArrowUp') {
      if (isDropdownOpen) {
        e.preventDefault();
        this.activeAutocompleteIndex =
          (this.activeAutocompleteIndex - 1 + items.length) % items.length;
        this.updateActiveItem(items);
      }
    } else if (e.key === 'Enter') {
      if (isDropdownOpen && this.activeAutocompleteIndex >= 0 && items[this.activeAutocompleteIndex]) {
        e.preventDefault();
        items[this.activeAutocompleteIndex].click();
      } else if ((this.input.value || '').trim()) {
        e.preventDefault();
        if (isDropdownOpen && items.length > 0) {
          items[0].click();
        } else {
          this.addTag(this.input.value.trim());
        }
      }
    } else if (e.key === ',') {
      e.preventDefault();
      const text = (this.input.value || '').trim();
      if (text) {
        this.addTag(text);
      }
    } else if (e.key === 'Backspace') {
      if (
        this.input.value === '' &&
        (this.input.selectionStart === 0 || this.input.selectionStart === undefined) &&
        (this.input.selectionEnd === 0 || this.input.selectionEnd === undefined)
      ) {
        if (this.tags.length > 0) {
          if (e.preventDefault) e.preventDefault();
          this.removeLastTag();
        }
      }
    } else if (e.key === 'Tab') {
      if (isDropdownOpen && this.activeAutocompleteIndex >= 0 && items[this.activeAutocompleteIndex]) {
        e.preventDefault();
        items[this.activeAutocompleteIndex].click();
      } else if (isDropdownOpen && (this.input.value || '').trim() && items.length > 0) {
        e.preventDefault();
        items[0].click();
      } else {
        this.hideDropdown();
      }
    } else if (e.key === 'Escape') {
      this.hideDropdown();
    }
  }

  updateActiveItem(items) {
    items.forEach((it, idx) => {
      it.classList.toggle('active-item', idx === this.activeAutocompleteIndex);
      if (idx === this.activeAutocompleteIndex && it.scrollIntoView) {
        it.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  renderChips() {
    if (!this.container || !this.doc) return;

    const existingChips = this.container.querySelectorAll('.tag-chip');
    existingChips.forEach((el) => {
      if (el.remove) el.remove();
      else if (this.container.removeChild) this.container.removeChild(el);
    });

    this.tags.forEach((tag) => {
      const chip = this.doc.createElement('div');
      chip.className = 'tag-chip';
      if (chip.classList && chip.classList.add) chip.classList.add('tag-chip');
      chip.dataset.tag = tag;

      const removeBtn = this.doc.createElement('span');
      removeBtn.className = 'tag-chip-remove';
      if (removeBtn.classList && removeBtn.classList.add) removeBtn.classList.add('tag-chip-remove');
      removeBtn.title = 'Remove tag';
      removeBtn.textContent = '✕';

      const textSpan = this.doc.createElement('span');
      textSpan.className = 'tag-chip-text';
      if (textSpan.classList && textSpan.classList.add) textSpan.classList.add('tag-chip-text');
      textSpan.textContent = tag;

      chip.appendChild(removeBtn);
      chip.appendChild(textSpan);

      removeBtn.addEventListener('click', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        this.removeTag(tag);
        if (this.input && this.input.focus) this.input.focus();
      });

      chip.addEventListener('click', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        this.removeTag(tag);
        if (this.input && this.input.focus) this.input.focus();
      });

      this.container.insertBefore(chip, this.input);
    });

    if (this.input) {
      if (this.tags.length === 0) {
        this.input.placeholder = this.placeholder;
      } else {
        this.input.placeholder = '';
      }
    }
  }

  addTag(tag) {
    if (!tag) return;
    const parts = String(tag).split(',');
    let added = false;
    for (const part of parts) {
      const cleanTag = part.trim();
      if (!cleanTag) continue;

      const exists = this.tags.some(
        (t) => t.toLowerCase() === cleanTag.toLowerCase()
      );
      if (!exists) {
        this.tags.push(cleanTag);
        added = true;
      }
    }

    if (added) {
      this.renderChips();
      this.onChange(this.tags);
    }

    if (this.input) {
      this.input.value = '';
    }
    this.hideDropdown();
  }

  removeTag(tag) {
    const clean = String(tag).trim().toLowerCase();
    const prevLen = this.tags.length;
    this.tags = this.tags.filter((t) => t.toLowerCase() !== clean);
    if (this.tags.length !== prevLen) {
      this.renderChips();
      this.onChange(this.tags);
    }
    this.hideDropdown();
  }

  removeLastTag() {
    if (this.tags.length > 0) {
      this.tags.pop();
      this.renderChips();
      this.onChange(this.tags);
      this.renderDropdown();
    }
  }

  setTags(newTags) {
    const list = Array.isArray(newTags) ? newTags : [newTags];
    const seen = new Set();
    const clean = [];
    for (const t of list) {
      const parts = String(t).split(',');
      for (const p of parts) {
        const s = p.trim();
        const lower = s.toLowerCase();
        if (s && !seen.has(lower)) {
          seen.add(lower);
          clean.push(s);
        }
      }
    }
    this.tags = clean;
    this.renderChips();
    if (this.input) {
      this.input.value = '';
    }
    this.hideDropdown();
  }

  getTags() {
    return [...this.tags];
  }

  commitCurrentInput() {
    if (this.input && this.input.value && this.input.value.trim()) {
      this.addTag(this.input.value.trim());
    }
  }

  clear() {
    this.tags = [];
    this.renderChips();
    if (this.input) {
      this.input.value = '';
    }
    this.hideDropdown();
  }

  renderDropdown() {
    if (!this.dropdown || !this.dropdownList || !this.doc) return;

    const query = this.input ? (this.input.value || '').trim() : '';
    const allTags = this.getAllTags();
    const recentTags = this.getRecentTags();

    const grouped = (typeof RaindropAPI !== 'undefined' && RaindropAPI.groupTagsForDropdown)
      ? RaindropAPI.groupTagsForDropdown(query, this.tags, recentTags, allTags)
      : { addTagOption: query || null, recentMatches: [], otherMatches: [] };

    this.dropdownList.innerHTML = '';
    this.activeAutocompleteIndex = -1;

    let hasAnyItems = false;

    // 1. Add Tag option (if query typed and not already selected)
    if (grouped.addTagOption) {
      hasAnyItems = true;
      const addEl = this.doc.createElement('div');
      addEl.className = 'tag-dropdown-item tag-dropdown-add';
      addEl.innerHTML = `<span class="tag-item-name">+ Add tag "<strong>#${escapeHtml(grouped.addTagOption)}</strong>"</span>`;
      addEl.addEventListener('mouseenter', () => {
        const items = this.dropdownList.querySelectorAll('.tag-dropdown-item');
        items.forEach((it, idx) => {
          const isActive = it === addEl;
          it.classList.toggle('active-item', isActive);
          if (isActive) this.activeAutocompleteIndex = idx;
        });
      });
      addEl.addEventListener('mousedown', (e) => {
        if (e.preventDefault) e.preventDefault();
        this.addTag(grouped.addTagOption);
      });
      addEl.addEventListener('click', () => {
        this.addTag(grouped.addTagOption);
      });
      this.dropdownList.appendChild(addEl);
    }

    // 2. Recent Section
    if (grouped.recentMatches && grouped.recentMatches.length > 0) {
      hasAnyItems = true;
      const recentHeader = this.doc.createElement('div');
      recentHeader.className = 'tag-dropdown-header';
      recentHeader.textContent = 'Recent';
      this.dropdownList.appendChild(recentHeader);

      grouped.recentMatches.forEach((item) => {
        const row = this.doc.createElement('div');
        row.className = 'tag-dropdown-item';
        row.dataset.tag = item.tag;
        row.innerHTML = `
          <span class="tag-item-name"># ${escapeHtml(item.tag)}</span>
          ${item.count > 0 ? `<span class="tag-item-count">${item.count}</span>` : ''}
        `;
        row.addEventListener('mouseenter', () => {
          const items = this.dropdownList.querySelectorAll('.tag-dropdown-item');
          items.forEach((it, idx) => {
            const isActive = it === row;
            it.classList.toggle('active-item', isActive);
            if (isActive) this.activeAutocompleteIndex = idx;
          });
        });
        row.addEventListener('mousedown', (e) => {
          if (e.preventDefault) e.preventDefault();
          this.addTag(item.tag);
        });
        row.addEventListener('click', () => {
          this.addTag(item.tag);
        });
        this.dropdownList.appendChild(row);
      });
    }

    // 3. Other Section
    if (grouped.otherMatches && grouped.otherMatches.length > 0) {
      hasAnyItems = true;
      const otherHeader = this.doc.createElement('div');
      otherHeader.className = 'tag-dropdown-header';
      otherHeader.textContent = 'Other';
      this.dropdownList.appendChild(otherHeader);

      grouped.otherMatches.forEach((item) => {
        const row = this.doc.createElement('div');
        row.className = 'tag-dropdown-item';
        row.dataset.tag = item.tag;
        row.innerHTML = `
          <span class="tag-item-name"># ${escapeHtml(item.tag)}</span>
          ${item.count > 0 ? `<span class="tag-item-count">${item.count}</span>` : ''}
        `;
        row.addEventListener('mouseenter', () => {
          const items = this.dropdownList.querySelectorAll('.tag-dropdown-item');
          items.forEach((it, idx) => {
            const isActive = it === row;
            it.classList.toggle('active-item', isActive);
            if (isActive) this.activeAutocompleteIndex = idx;
          });
        });
        row.addEventListener('mousedown', (e) => {
          if (e.preventDefault) e.preventDefault();
          this.addTag(item.tag);
        });
        row.addEventListener('click', () => {
          this.addTag(item.tag);
        });
        this.dropdownList.appendChild(row);
      });
    }

    if (!hasAnyItems) {
      this.hideDropdown();
    } else {
      this.showDropdown();
    }
  }

  showDropdown() {
    if (this.dropdown) {
      this.dropdown.classList.remove('hidden');
    }
  }

  hideDropdown() {
    if (this.dropdown) {
      this.dropdown.classList.add('hidden');
    }
    this.activeAutocompleteIndex = -1;
  }
}

/**
 * Compares two URLs to determine whether they point to the same destination,
 * allowing for harmless representation differences (e.g. trailing slash differences)
 * without broad normalization that silently merges distinct destinations.
 */
function areUrlsEquivalent(urlA, urlB) {
  if (!urlA || !urlB) return false;
  if (urlA === urlB) return true;
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    if (a.protocol.toLowerCase() !== b.protocol.toLowerCase()) return false;
    if (a.hostname.toLowerCase() !== b.hostname.toLowerCase()) return false;
    if (a.port !== b.port) return false;
    if (a.search !== b.search) return false;
    if (a.hash !== b.hash) return false;

    const pathA = a.pathname.replace(/\/+$/, '');
    const pathB = b.pathname.replace(/\/+$/, '');
    return pathA === pathB;
  } catch (_) {
    const normA = urlA.trim().replace(/\/+$/, '');
    const normB = urlB.trim().replace(/\/+$/, '');
    return normA === normB;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
  // ==========================================
  // DOM Elements
  // ==========================================
  const appContainer = document.getElementById('app');
  const noticeBanner = document.getElementById('noticeBanner');

  // Subviews
  const viewMain = document.getElementById('viewMain');
  const viewCollection = document.getElementById('viewCollection');
  const viewTabs = document.getElementById('viewTabs');
  const viewSettings = document.getElementById('viewSettings');

  // Header Elements
  const headerStatusTitle = document.getElementById('headerStatusTitle');
  const aiSparkleBtn = document.getElementById('aiSparkleBtn');
  const headerSearchBtn = document.getElementById('headerSearchBtn');
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userAvatarCircle = document.getElementById('userAvatarCircle');
  const userDropdownMenu = document.getElementById('userDropdownMenu');
  const menuUserName = document.getElementById('menuUserName');
  const menuUserEmail = document.getElementById('menuUserEmail');
  const menuOpenWebBtn = document.getElementById('menuOpenWebBtn');
  const menuSwitchTokenBtn = document.getElementById('menuSwitchTokenBtn');
  const menuDisconnectBtn = document.getElementById('menuDisconnectBtn');

  // View 1 (Main Form) Elements
  const mainBookmarkForm = document.getElementById('mainBookmarkForm');
  const bookmarkThumbnail = document.getElementById('bookmarkThumbnail');
  const thumbFallback = document.getElementById('thumbFallback');
  const thumbnailWrapper = document.getElementById('thumbnailWrapper');
  const bookmarkTitle = document.getElementById('bookmarkTitle');
  const bookmarkExcerpt = document.getElementById('bookmarkExcerpt');
  const bookmarkNote = document.getElementById('bookmarkNote');
  const bookmarkUrl = document.getElementById('bookmarkUrl');
  const collectionPillBtn = document.getElementById('collectionPillBtn');
  const pillIcon = document.getElementById('pillIcon');
  const pillTitle = document.getElementById('pillTitle');
  const tagsInputContainer = document.getElementById('tagsInputContainer');
  const bookmarkTagsInput = document.getElementById('bookmarkTagsInput');
  const tagsAutocompleteDropdown = document.getElementById('tagsAutocompleteDropdown');
  const tagsDropdownList = document.getElementById('tagsDropdownList');
  const heartBtn = document.getElementById('heartBtn');
  const reminderBellBtn = document.getElementById('reminderBellBtn');
  const highlightsBtn = document.getElementById('highlightsBtn');
  const openTabsViewBtn = document.getElementById('openTabsViewBtn');
  const deleteBookmarkBtn = document.getElementById('deleteBookmarkBtn');
  const saveBookmarkBtn = document.getElementById('saveBookmarkBtn');
  const saveBtnSpinner = document.getElementById('saveBtnSpinner');
  const saveBtnText = document.getElementById('saveBtnText');

  // View 2 (Collection Subview) Elements
  const backFromCollectionBtn = document.getElementById('backFromCollectionBtn');
  const collectionSearchInput = document.getElementById('collectionSearchInput');
  const specialCollectionsGroup = document.getElementById('specialCollectionsGroup');
  const unsortedCountBadge = document.getElementById('unsortedCountBadge');
  const trashCountBadge = document.getElementById('trashCountBadge');
  const sectionLabelRow = document.getElementById('sectionLabelRow');
  const userCollectionsList = document.getElementById('userCollectionsList');
  const createNewCollectionItem = document.getElementById('createNewCollectionItem');
  const createCollectionText = document.getElementById('createCollectionText');

  // View 3 (Save Tabs Subview) Elements
  const backFromTabsBtn = document.getElementById('backFromTabsBtn');
  const selectAllTabsCheckbox = document.getElementById('selectAllTabsCheckbox');
  const selectedTabsCounter = document.getElementById('selectedTabsCounter');
  const openTabsList = document.getElementById('openTabsList');
  const tabsCollectionPillBtn = document.getElementById('tabsCollectionPillBtn');
  const tabsPillIcon = document.getElementById('tabsPillIcon');
  const tabsPillTitle = document.getElementById('tabsPillTitle');
  const tabsTagsInputContainer = document.getElementById('tabsTagsInputContainer');
  const tabsTagsInput = document.getElementById('tabsTagsInput');
  const tabsTagsAutocompleteDropdown = document.getElementById('tabsTagsAutocompleteDropdown');
  const tabsTagsDropdownList = document.getElementById('tabsTagsDropdownList');
  const closeTabsCheckbox = document.getElementById('closeTabsCheckbox');
  const executeSaveTabsBtn = document.getElementById('executeSaveTabsBtn');
  const saveTabsSpinner = document.getElementById('saveTabsSpinner');
  const saveTabsBtnText = document.getElementById('saveTabsBtnText');

  // View 4 (Settings / Token View) Elements
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const tokenConfigForm = document.getElementById('tokenConfigForm');
  const settingsTokenInput = document.getElementById('settingsTokenInput');
  const toggleTokenViewBtn = document.getElementById('toggleTokenViewBtn');
  const submitTokenBtn = document.getElementById('submitTokenBtn');
  const settingsSpinner = document.getElementById('settingsSpinner');
  const settingsBtnText = document.getElementById('settingsBtnText');
  const linkIntegrations = document.getElementById('linkIntegrations');
  const linkAdvancedOptions = document.getElementById('linkAdvancedOptions');

  // ==========================================
  // State
  // ==========================================
  let currentToken = null;
  let currentUser = null;
  let currentTab = null;
  let existingBookmark = null; // item if URL is already saved
  let originalLoadedBookmark = null; // cached original bookmark item for clean URL revert
  let loadedBookmarkUrl = null; // original lookup URL
  let canonicalBookmarkUrl = null; // canonical URL returned by Raindrop
  let checkingBookmarkPromise = null; // In-flight checkBookmarkStatus promise (F-06)
  const userEditedFields = new Set(); // Track fields modified by user (F-06)
  let isFavorite = false;
  let isReminder = false;
  let selectedCollectionId = 0;
  let selectedCollectionTitle = 'Unsorted';
  let selectedCollectionIcon = '〰';
  let userManuallySelectedCollection = false;
  let expandedInitialized = false;

  let rawCollections = [];
  let userCollections = [];
  let expandedCollectionIds = new Set();
  let allTags = []; // Array of { tag: string, count: number }
  let activeAutocompleteIndex = -1;
  let previousView = 'main'; // For returning from Collection View to Tabs View or Main View
  let openTabsData = [];

  // ==========================================
  // Helper Utilities
  // ==========================================
  function isUrlMatchingLoadedBookmark(inputUrl) {
    if (!loadedBookmarkUrl && !canonicalBookmarkUrl) return false;
    return areUrlsEquivalent(inputUrl, loadedBookmarkUrl) ||
           areUrlsEquivalent(inputUrl, canonicalBookmarkUrl);
  }

  function openUrl(url) {
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function showBanner(message, type = 'error', autoHideMs = 5000) {
    noticeBanner.textContent = message;
    noticeBanner.className = `notice-banner ${type}`;
    noticeBanner.classList.remove('hidden');

    if (autoHideMs > 0) {
      setTimeout(() => {
        if (noticeBanner.textContent === message) {
          noticeBanner.classList.add('hidden');
        }
      }, autoHideMs);
    }
  }

  function hideBanner() {
    noticeBanner.classList.add('hidden');
    noticeBanner.textContent = '';
  }

  function markAsEdited() {
    if (headerStatusTitle.textContent !== 'Edit') {
      headerStatusTitle.textContent = 'Edit';
    }
    if (saveBtnText.textContent !== 'Save') {
      saveBtnText.textContent = 'Save';
    }
  }

  // Monitor form input changes to update status to "Edit" and track user edits (F-02, F-06)
  bookmarkTitle.addEventListener('input', () => { userEditedFields.add('title'); markAsEdited(); });
  bookmarkExcerpt.addEventListener('input', () => { userEditedFields.add('excerpt'); markAsEdited(); });
  bookmarkNote.addEventListener('input', () => { userEditedFields.add('note'); markAsEdited(); });
  bookmarkTagsInput.addEventListener('input', () => { userEditedFields.add('tags'); markAsEdited(); });
  bookmarkUrl.addEventListener('input', () => {
    userEditedFields.add('url');
    markAsEdited();
    const currentVal = bookmarkUrl.value.trim();
    if (isUrlMatchingLoadedBookmark(currentVal)) {
      if (originalLoadedBookmark) {
        existingBookmark = originalLoadedBookmark;
        deleteBookmarkBtn.classList.remove('hidden');
        if (headerStatusTitle.textContent === 'Edit' && !userEditedFields.has('title') && !userEditedFields.has('note')) {
          headerStatusTitle.textContent = 'Saved';
          saveBtnText.textContent = 'Saved ✓';
        }
      }
    } else {
      existingBookmark = null;
      deleteBookmarkBtn.classList.add('hidden');
      if (headerStatusTitle.textContent === 'Saved') {
        headerStatusTitle.textContent = 'Edit';
        saveBtnText.textContent = 'Save';
      }
    }
  });

  function switchView(targetView) {
    hideBanner();
    userDropdownMenu.classList.add('hidden');

    const returningFromCollectionToTabs = (targetView === 'tabs' && previousView === 'tabs');

    // Manage history for back navigation
    if (targetView === 'collection') {
      // previousView remains whatever view triggered it (main or tabs)
    } else if (targetView === 'tabs') {
      previousView = 'tabs';
    } else if (targetView === 'main') {
      previousView = 'main';
    }

    [viewMain, viewCollection, viewTabs, viewSettings].forEach(v => {
      v.classList.remove('active');
      v.classList.add('hidden');
    });

    if (targetView === 'collection') {
      viewCollection.classList.remove('hidden');
      viewCollection.classList.add('active');
      collectionSearchInput.value = '';
      if (selectedCollectionId && selectedCollectionId !== 0 && selectedCollectionId !== -99) {
        expandAncestorsOf(selectedCollectionId, userCollections, expandedCollectionIds);
      }
      renderCollectionsList('');
      setTimeout(() => collectionSearchInput.focus(), 50);
    } else if (targetView === 'tabs') {
      viewTabs.classList.remove('hidden');
      viewTabs.classList.add('active');
      // If returning from collection picker, preserve existing tab list & user checkbox selections!
      if (!returningFromCollectionToTabs || openTabsData.length === 0) {
        initSaveTabsView();
      }
    } else if (targetView === 'settings') {
      viewSettings.classList.remove('hidden');
      viewSettings.classList.add('active');
      settingsTokenInput.value = '';
      if (currentToken) {
        settingsTokenInput.placeholder = `Connected (••••${currentToken.slice(-4)})`;
      } else {
        settingsTokenInput.placeholder = 'Paste Personal Access Token...';
      }
      setTimeout(() => settingsTokenInput.focus(), 50);
    } else {
      // main
      viewMain.classList.remove('hidden');
      viewMain.classList.add('active');
    }
  }

  function updateCollectionPills(id, title, icon) {
    selectedCollectionId = Number(id);
    selectedCollectionTitle = title;
    selectedCollectionIcon = icon || '📁';

    const iconHtml = renderIconHtml(selectedCollectionIcon);
    if (pillIcon) {
      if (isUrlIcon(selectedCollectionIcon)) {
        pillIcon.innerHTML = iconHtml;
        const img = pillIcon.querySelector('img');
        if (img) {
          img.addEventListener('error', () => {
            pillIcon.textContent = '📁';
          });
        }
      } else {
        pillIcon.textContent = selectedCollectionIcon;
      }
    }
    if (pillTitle) pillTitle.textContent = selectedCollectionTitle;

    if (tabsPillIcon) {
      if (isUrlIcon(selectedCollectionIcon)) {
        tabsPillIcon.innerHTML = iconHtml;
        const img = tabsPillIcon.querySelector('img');
        if (img) {
          img.addEventListener('error', () => {
            tabsPillIcon.textContent = '📁';
          });
        }
      } else {
        tabsPillIcon.textContent = selectedCollectionIcon;
      }
    }
    if (tabsPillTitle) tabsPillTitle.textContent = selectedCollectionTitle;
  }

  function updateUserProfileUI(user) {
    if (!user) return;
    currentUser = user;
    const name = user.fullName || user.email || 'Account B';
    const firstLetter = name.trim().charAt(0).toUpperCase() || 'B';

    if (user.avatar) {
      userAvatarCircle.innerHTML = `<img src="${escapeHtml(user.avatar)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="${escapeHtml(name)}" />`;
    } else {
      userAvatarCircle.textContent = firstLetter;
    }

    menuUserName.textContent = name;
    menuUserEmail.textContent = user.email ? `${user.email} (Account B)` : 'Raindrop Account B';
  }

  // ==========================================
  // Autocomplete Tags Engine & Tag Chips
  // ==========================================
  async function loadTags() {
    if (!currentToken) return;
    try {
      if (allTags.length === 0) {
        const cached = await RaindropStorage.getCachedTags();
        if (Array.isArray(cached) && cached.length > 0 && allTags.length === 0) {
          allTags = cached;
        }
      }
      const freshTags = await RaindropAPI.getTags(currentToken);
      allTags = freshTags;
      await RaindropStorage.setCachedTags(allTags);
    } catch (e) {
      console.warn('Failed to load tags:', e);
      if (allTags.length === 0) {
        const cached = await RaindropStorage.getCachedTags();
        if (Array.isArray(cached) && cached.length > 0) {
          allTags = cached;
        } else {
          allTags = [];
        }
      }
    }
  }

  async function loadRecentTags() {
    try {
      recentTags = await RaindropStorage.getRecentTags();
    } catch (e) {
      console.warn('Failed to load recent tags:', e);
      recentTags = [];
    }
  }

  const bookmarkTagsComponent = new TagChipsComponent({
    container: tagsInputContainer,
    input: bookmarkTagsInput,
    dropdown: tagsAutocompleteDropdown,
    dropdownList: tagsDropdownList,
    placeholder: 'Add tags...',
    onChange: () => {
      userEditedFields.add('tags');
      markAsEdited();
    },
    getAllTags: () => allTags,
    getRecentTags: () => recentTags
  });

  const tabsTagsComponent = new TagChipsComponent({
    container: tabsTagsInputContainer,
    input: tabsTagsInput,
    dropdown: tabsTagsAutocompleteDropdown,
    dropdownList: tabsTagsDropdownList,
    placeholder: 'Add tags...',
    onChange: () => {},
    getAllTags: () => allTags,
    getRecentTags: () => recentTags
  });

  // Close user menu on outside click
  document.addEventListener('click', (e) => {
    if (!userMenuBtn.contains(e.target) && !userDropdownMenu.contains(e.target)) {
      userDropdownMenu.classList.add('hidden');
    }
  });

  // ==========================================
  // VIEW 2: Collections Engine & Hierarchy
  // ==========================================
  let isLoadingCollections = false;

  function applyCollectionsData(colls, stats = [], preloadedLastId = null) {
    if (!Array.isArray(colls)) return;
    rawCollections = colls.map(c => {
      let icon = c.icon || '📁';
      if (isUrlIcon(icon)) {
        icon = '📁';
      }
      return { ...c, icon };
    });
    userCollections = rawCollections.filter(c => c.id !== 0 && c.id !== -99);

    // Populate special collection counts from stats
    const unsortedStat = (stats || []).find(s => s._id === -1 || s._id === 0);
    const trashStat = (stats || []).find(s => s._id === -99);
    const unsortedCount = unsortedStat ? unsortedStat.count || 0 : 0;
    const trashCount = trashStat ? trashStat.count || 0 : 0;

    const unsortedObj = rawCollections.find(c => c.id === 0);
    if (unsortedObj) {
      unsortedObj.count = unsortedCount;
    }
    if (unsortedCountBadge) unsortedCountBadge.textContent = unsortedCount;
    if (trashCountBadge) trashCountBadge.textContent = trashCount;

    // Resolve active collection pill without overwriting existing bookmark or manual selection
    const updateActivePill = async () => {
      let targetId;
      if (userManuallySelectedCollection) {
        targetId = selectedCollectionId;
      } else if (existingBookmark?.collection?.$id !== undefined) {
        targetId = Number(existingBookmark.collection.$id);
      } else {
        targetId = (preloadedLastId !== null && preloadedLastId !== undefined)
          ? Number(preloadedLastId)
          : Number(await RaindropStorage.getLastCollectionId());
      }

      const match = rawCollections.find(c => Number(c.id) === Number(targetId));
      if (match) {
        updateCollectionPills(match.id, match.title, match.icon);
      } else if (Number(targetId) === 0) {
        updateCollectionPills(0, 'Unsorted', '〰');
      } else if (Number(targetId) === -99) {
        updateCollectionPills(-99, 'Trash', '🗑');
      } else {
        updateCollectionPills(targetId, 'Collection', '📁');
      }
    };
    updateActivePill();

    // Default expandedCollectionIds if empty AND not yet initialized from storage
    if (!expandedInitialized && userCollections.some(c => c.hasChildren)) {
      expandedCollectionIds = new Set(
        userCollections.filter(c => c.hasChildren).map(c => Number(c.id))
      );
      expandedInitialized = true;
      RaindropStorage.setExpandedCollectionIds(Array.from(expandedCollectionIds));
    }

    // If currently viewing collection picker, re-render immediately!
    if (viewCollection && viewCollection.classList.contains('active')) {
      if (selectedCollectionId && selectedCollectionId !== 0 && selectedCollectionId !== -99) {
        expandAncestorsOf(selectedCollectionId, userCollections, expandedCollectionIds);
      }
      renderCollectionsList(collectionSearchInput ? collectionSearchInput.value : '');
    }
  }

  async function loadCollections() {
    if (!currentToken) return;
    isLoadingCollections = true;

    // If collections list is currently active and empty, show loader immediately
    if (viewCollection && viewCollection.classList.contains('active') && userCollections.length === 0) {
      renderCollectionsList(collectionSearchInput ? collectionSearchInput.value : '');
    }

    try {
      const [colls, stats] = await Promise.all([
        RaindropAPI.getCollections(currentToken),
        RaindropAPI.getUserStats(currentToken).catch(() => [])
      ]);

      // Cache fresh collections & stats immediately
      await RaindropStorage.setCachedCollections({
        collections: colls,
        stats: stats,
        updatedAt: Date.now()
      });

      isLoadingCollections = false;
      applyCollectionsData(colls, stats);
    } catch (e) {
      console.warn('Failed to load collections:', e);
      if (e.status === 401) {
        switchView('settings');
      } else if (userCollections.length > 0) {
        showBanner('Unable to refresh collections; showing cached data.', 'info', 4000);
      }
    } finally {
      isLoadingCollections = false;
      // Re-render if viewCollection is active and list is empty to clear spinner if error occurred
      if (viewCollection && viewCollection.classList.contains('active') && userCollections.length === 0) {
        renderCollectionsList(collectionSearchInput ? collectionSearchInput.value : '');
      }
    }
  }

  function toggleCollectionExpanded(id) {
    const numId = Number(id);
    if (expandedCollectionIds.has(numId)) {
      expandedCollectionIds.delete(numId);
    } else {
      expandedCollectionIds.add(numId);
    }
    expandedInitialized = true;
    RaindropStorage.setExpandedCollectionIds(Array.from(expandedCollectionIds));
    renderCollectionsList(collectionSearchInput ? collectionSearchInput.value : '');
  }

  function renderCollectionsList(searchTerm = '') {
    userCollectionsList.innerHTML = '';
    const term = (searchTerm || '').trim().toLowerCase();

    // Toggle special collections (Unsorted and Trash) and divider row based on search
    const unsortedMatch = !term || 'unsorted'.includes(term);
    const trashMatch = !term || 'trash'.includes(term);

    const unsortedEl = viewCollection.querySelector('.special-item[data-id="0"]');
    const trashEl = viewCollection.querySelector('.special-item[data-id="-99"]');

    if (unsortedEl) {
      unsortedEl.style.display = unsortedMatch ? 'flex' : 'none';
      unsortedEl.classList.toggle('active-selected', selectedCollectionId === 0);
    }
    if (trashEl) {
      trashEl.style.display = trashMatch ? 'flex' : 'none';
      trashEl.classList.toggle('active-selected', selectedCollectionId === -99);
    }

    if (specialCollectionsGroup) {
      specialCollectionsGroup.style.display = (unsortedMatch || trashMatch) ? 'flex' : 'none';
    }
    if (sectionLabelRow) {
      sectionLabelRow.style.display = term ? 'none' : 'block';
    }

    // If still loading and no collections cached yet:
    if (isLoadingCollections && userCollections.length === 0) {
      const loadingEl = document.createElement('div');
      loadingEl.className = 'collections-loading';
      loadingEl.innerHTML = `<span class="spinner"></span> <span>Loading collections...</span>`;
      userCollectionsList.appendChild(loadingEl);
      return;
    }

    const collMap = new Map(userCollections.map(c => [Number(c.id), c]));

    // Filter user collections
    const filtered = userCollections.filter(coll => {
      if (!term) {
        // When not searching, respect collapsed/expanded parent state
        return isCollectionVisible(coll, expandedCollectionIds, collMap);
      }
      // When searching, all matching collections must be visible regardless of collapsed parent state
      return (coll.title || '').toLowerCase().includes(term);
    });

    if (term) {
      // Check if term matches exact collection title
      const exactMatch = userCollections.some(c => (c.title || '').toLowerCase() === term);
      if (!exactMatch) {
        createNewCollectionItem.classList.remove('hidden');
        createCollectionText.textContent = `Create collection "${term}"`;
      } else {
        createNewCollectionItem.classList.add('hidden');
      }
    } else {
      createNewCollectionItem.classList.add('hidden');
    }

    if (filtered.length === 0 && !term && userCollections.length === 0 && !isLoadingCollections) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'collections-empty-state';
      emptyEl.textContent = 'No custom collections';
      userCollectionsList.appendChild(emptyEl);
      return;
    }

    filtered.forEach(coll => {
      const itemEl = document.createElement('div');
      itemEl.className = 'collection-item';
      itemEl.dataset.id = String(coll.id);
      if (Number(coll.id) === Number(selectedCollectionId)) {
        itemEl.classList.add('active-selected');
      }

      // Hierarchy Indent (supports deep nesting up to 8 levels)
      const indentPx = Math.min(coll.level || 0, 8) * 14;
      if (indentPx > 0) {
        itemEl.style.paddingLeft = `${10 + indentPx}px`;
      }

      const iconDisplay = coll.icon || '📁';
      const isExpanded = expandedCollectionIds.has(Number(coll.id));

      let chevronHtml = '';
      if (coll.hasChildren) {
        chevronHtml = `<span class="coll-chevron" data-id="${coll.id}" role="button" tabindex="0" title="${isExpanded ? 'Collapse' : 'Expand'}">${isExpanded ? '▼' : '▶'}</span>`;
      } else {
        chevronHtml = `<span class="coll-chevron-spacer"></span>`;
      }

      const iconHtml = renderIconHtml(iconDisplay);

      itemEl.setAttribute('tabindex', '0');
      itemEl.setAttribute('role', 'button');
      itemEl.innerHTML = `
        <div class="coll-left">
          ${chevronHtml}
          <span class="coll-icon">${iconHtml}</span>
          <span class="coll-title">${escapeHtml(coll.title || 'Untitled Collection')}</span>
        </div>
        <span class="coll-count">${coll.count || 0}</span>
      `;

      // Fallback on broken image cover without inline event handler (MV3 CSP safe)
      const collImg = itemEl.querySelector('.coll-icon-img');
      if (collImg) {
        collImg.addEventListener('error', () => {
          collImg.replaceWith(document.createTextNode('📁'));
        });
      }

      const chevronEl = itemEl.querySelector('.coll-chevron');
      if (chevronEl) {
        chevronEl.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleCollectionExpanded(coll.id);
        });
        chevronEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            toggleCollectionExpanded(coll.id);
          }
        });
      }

      itemEl.addEventListener('click', () => {
        selectCollectionAndReturn(coll.id, coll.title, iconDisplay);
      });
      itemEl.addEventListener('keydown', (e) => {
        if (e.target === itemEl && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          selectCollectionAndReturn(coll.id, coll.title, iconDisplay);
        }
      });

      userCollectionsList.appendChild(itemEl);
    });
  }

  function selectCollectionAndReturn(id, title, icon) {
    userManuallySelectedCollection = true;
    userEditedFields.add('collection');
    updateCollectionPills(id, title, icon);
    RaindropStorage.setLastCollectionId(id);
    switchView(previousView === 'tabs' ? 'tabs' : 'main');
  }

  // Collection click on Unsorted and Trash
  viewCollection.querySelectorAll('.special-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.id);
      const title = item.dataset.title;
      const icon = item.dataset.icon;
      selectCollectionAndReturn(id, title, icon);
    });
  });

  // Search filter collections
  collectionSearchInput.addEventListener('input', () => {
    renderCollectionsList(collectionSearchInput.value);
  });

  // Enter key in collection search to create or select
  collectionSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const term = collectionSearchInput.value.trim();
      if (!term) return;

      if (!createNewCollectionItem.classList.contains('hidden')) {
        createNewCollectionItem.click();
      } else {
        const firstMatch = userCollectionsList.querySelector('.collection-item');
        if (firstMatch) firstMatch.click();
      }
    }
  });

  // Create new collection
  createNewCollectionItem.addEventListener('click', async () => {
    const title = collectionSearchInput.value.trim();
    if (!title || !currentToken) return;

    createCollectionText.textContent = `Creating "${title}"...`;
    try {
      const created = await RaindropAPI.createCollection(currentToken, title);
      const newId = created?._id || created?.id;
      await loadCollections();
      selectCollectionAndReturn(newId, title, '📁');
      showBanner(`Collection "${title}" created!`, 'info', 3000);
    } catch (err) {
      console.error('Failed to create collection:', err);
      showBanner(`Could not create collection: ${err.message}`, 'error');
      createCollectionText.textContent = `Create collection "${title}"`;
    }
  });

  backFromCollectionBtn.addEventListener('click', () => {
    switchView(previousView === 'tabs' ? 'tabs' : 'main');
  });

  // Collection pill triggers
  collectionPillBtn.addEventListener('click', () => {
    previousView = 'main';
    switchView('collection');
  });

  tabsCollectionPillBtn.addEventListener('click', () => {
    previousView = 'tabs';
    switchView('collection');
  });

  // ==========================================
  // VIEW 3: Save Tabs Subview
  // ==========================================
  async function initSaveTabsView() {
    openTabsList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">Loading tabs...</div>';

    // Set prefilled date tag as a removable chip: e.g. #11/9/2026
    const now = new Date();
    const dateTag = `#${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    if (tabsTagsComponent.getTags().length === 0) {
      tabsTagsComponent.setTags([dateTag]);
    }

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      openTabsData = tabs.filter(t => t.url && /^https?:\/\//i.test(t.url));

      renderOpenTabsList();
    } catch (e) {
      console.warn('Could not query tabs:', e);
      openTabsList.innerHTML = '<div style="padding: 12px; color: var(--accent-red);">Unable to read window tabs.</div>';
    }
  }

  let lastCheckedTabIndex = -1;

  function handleTabCheckboxClick(e, cb) {
    const checkboxes = Array.from(openTabsList.querySelectorAll('.tab-checkbox'));
    const currentIndex = checkboxes.indexOf(cb);
    if (currentIndex === -1) return;

    const targetState = cb.checked;

    if (e.shiftKey && lastCheckedTabIndex >= 0 && lastCheckedTabIndex < checkboxes.length) {
      lastCheckedTabIndex = applyShiftClickRangeSelection(
        checkboxes,
        currentIndex,
        lastCheckedTabIndex,
        targetState
      );
    } else {
      lastCheckedTabIndex = currentIndex;
    }

    updateTabsCounter();
  }

  function renderOpenTabsList() {
    lastCheckedTabIndex = -1;
    openTabsList.innerHTML = '';
    if (openTabsData.length === 0) {
      openTabsList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">No saveable web tabs found.</div>';
      updateTabsCounter();
      return;
    }

    openTabsData.forEach((tab, index) => {
      const row = document.createElement('label');
      row.className = 'tab-row-item';

      const faviconSrc = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236b7280"><circle cx="12" cy="12" r="10"/></svg>';

      row.innerHTML = `
        <input type="checkbox" class="tab-checkbox" data-tab-id="${tab.id}" data-index="${index}" checked />
        <img class="tab-favicon" src="${escapeHtml(faviconSrc)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%236b7280%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'" />
        <div class="tab-info-text">
          <div class="tab-title" title="${escapeHtml(tab.title || tab.url)}">${escapeHtml(tab.title || tab.url)}</div>
        </div>
      `;

      const cb = row.querySelector('.tab-checkbox');
      cb.addEventListener('click', (e) => handleTabCheckboxClick(e, cb));
      cb.addEventListener('change', updateTabsCounter);
      openTabsList.appendChild(row);
    });

    updateTabsCounter();
  }

  function getSelectedTabIds() {
    const checkboxes = openTabsList.querySelectorAll('.tab-checkbox:checked');
    return Array.from(checkboxes).map(cb => Number(cb.dataset.tabId));
  }

  function updateTabsCounter() {
    const total = openTabsData.length;
    const selectedIds = getSelectedTabIds();
    const count = selectedIds.length;
    const label = `${count} ${count === 1 ? 'tab' : 'tabs'}`;

    selectedTabsCounter.textContent = label;
    saveTabsBtnText.textContent = `Save ${label}`;
    executeSaveTabsBtn.disabled = count === 0;

    if (selectAllTabsCheckbox) {
      selectAllTabsCheckbox.checked = total > 0 && count === total;
      selectAllTabsCheckbox.indeterminate = count > 0 && count < total;
    }
  }

  selectAllTabsCheckbox.addEventListener('change', () => {
    const checked = selectAllTabsCheckbox.checked;
    openTabsList.querySelectorAll('.tab-checkbox').forEach(cb => {
      cb.checked = checked;
    });
    lastCheckedTabIndex = -1;
    updateTabsCounter();
  });

  backFromTabsBtn.addEventListener('click', () => {
    switchView('main');
  });

  // Execute Save Tabs via background batch saving
  executeSaveTabsBtn.addEventListener('click', async () => {
    const selectedIds = getSelectedTabIds();
    if (selectedIds.length === 0 || !currentToken) return;

    executeSaveTabsBtn.disabled = true;
    saveTabsSpinner.classList.remove('hidden');

    tabsTagsComponent.commitCurrentInput();
    const rawTags = tabsTagsComponent.getTags();
    const tags = Array.from(new Set(rawTags.map(t => t.trim().replace(/^#+/, '')).filter(Boolean)));

    const tabsToSave = openTabsData.filter(t => selectedIds.includes(t.id));
    const shouldClose = closeTabsCheckbox.checked;
    const countToSave = tabsToSave.length;

    saveTabsBtnText.textContent = `Saving ${countToSave} tabs...`;

    // Prepare batch items
    const items = tabsToSave.map(tab => ({
      url: tab.url,
      title: tab.title || tab.url,
      tags: tags,
      collectionId: selectedCollectionId,
      tabId: tab.id
    }));

    const closeTabIds = shouldClose ? selectedIds : [];

    let saveSucceeded = false;
    try {
      // Offload to background service worker for reliable batch saving
      const batchResult = await new Promise((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
          // Fallback if background worker messaging not available
          RaindropAPI.createRaindropsBatch(currentToken, items)
            .then(async res => {
              const savedItems = Array.isArray(res?.items) ? res.items : [];
              const savedUrls = new Set(savedItems.map(it => (it?.link || it?.url || '').trim()).filter(Boolean));
              const actuallyClosedTabIds = [];
              if (shouldClose && chrome?.tabs?.remove) {
                const confirmedTabIds = tabsToSave
                  .filter(t => t.url && (savedUrls.has(t.url.trim()) || savedUrls.has(t.url.trim() + '/') || (t.url.trim().endsWith('/') && savedUrls.has(t.url.trim().slice(0, -1)))))
                  .map(t => t.id);
                if (confirmedTabIds.length > 0) {
                  try {
                    await chrome.tabs.remove(confirmedTabIds);
                    actuallyClosedTabIds.push(...confirmedTabIds);
                  } catch (err) {
                    for (const id of confirmedTabIds) {
                      try {
                        await chrome.tabs.remove(id);
                        actuallyClosedTabIds.push(id);
                      } catch (_) {}
                    }
                  }
                }
              }
              resolve({
                success: true,
                count: savedItems.length,
                totalRequested: items.length,
                items: savedItems,
                closedTabIds: actuallyClosedTabIds
              });
            })
            .catch(reject);
          return;
        }

        chrome.runtime.sendMessage({
          action: 'saveTabsBatch',
          items,
          closeTabIds
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res && res.success === false) {
            reject(new Error(res.error || 'Failed to save tabs batch'));
          } else {
            resolve(res || {});
          }
        });
      });

      if (tags.length > 0) {
        await RaindropStorage.addRecentTags(tags);
        await loadRecentTags();
      }

      const savedCount = typeof batchResult?.count === 'number' ? batchResult.count : 0;
      const totalRequested = countToSave;

      if (savedCount === 0) {
        showBanner('No tabs were saved. Please check collection and tab URLs.', 'warning', 5000);
        saveTabsBtnText.textContent = `Save ${countToSave} tabs`;
        saveSucceeded = false;
        return;
      }

      saveTabsBtnText.textContent = 'Saved!';
      saveSucceeded = true;

      if (savedCount === totalRequested) {
        showBanner(`Saved ${savedCount} tabs to ${selectedCollectionTitle}!`, 'info', 4000);
      } else {
        showBanner(`Saved ${savedCount} of ${totalRequested} tabs to ${selectedCollectionTitle}.`, 'warning', 5000);
      }
      tabsTagsComponent.clear();

      if (shouldClose && Array.isArray(batchResult?.closedTabIds) && batchResult.closedTabIds.length > 0) {
        openTabsData = openTabsData.filter(t => !batchResult.closedTabIds.includes(t.id));
        renderOpenTabsList();
      }

      setTimeout(() => {
        switchView('main');
      }, 500);
    } catch (err) {
      console.error('Failed while saving tabs batch:', err);
      showBanner(`Failed to save tabs: ${err.message}`, 'error', 6000);
      saveTabsBtnText.textContent = `Save ${countToSave} tabs`;
    } finally {
      saveTabsSpinner.classList.add('hidden');
      if (!saveSucceeded) {
        executeSaveTabsBtn.disabled = false;
        updateTabsCounter();
      } else {
        executeSaveTabsBtn.disabled = true;
        saveTabsBtnText.textContent = 'Saved!';
      }
    }
  });

  // ==========================================
  // VIEW 1: Active Tab & Main Bookmark Form
  // ==========================================
  async function loadActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentTab = tab;
        const isInternal = tab.url && /^(chrome|brave|edge|about|devtools):/i.test(tab.url);
        bookmarkTitle.value = isInternal ? '' : (tab.title || '');
        bookmarkUrl.value = isInternal ? '' : (tab.url || '');

        if (tab.favIconUrl) {
          bookmarkThumbnail.src = tab.favIconUrl;
          bookmarkThumbnail.classList.remove('hidden');
          thumbFallback.classList.add('hidden');
        }

        if (isInternal) {
          showBanner('Internal browser tab. Enter a web URL to bookmark.', 'warning', 4000);
          updateToolbarBadge(false);
        } else if (currentToken && tab.url) {
          // Check if already bookmarked
          checkBookmarkStatus(tab.url);
        } else if (!currentToken) {
          updateToolbarBadge(false);
        }
      }
    } catch (e) {
      console.warn('Active tab query failed:', e);
    }
  }

  function updateToolbarBadge(saved) {
    if (!currentTab?.id) return;
    if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
      if (saved) {
        chrome.action.setBadgeText({ tabId: currentTab.id, text: '✓' });
        chrome.action.setBadgeBackgroundColor({ tabId: currentTab.id, color: '#10B981' });
        if (typeof chrome.action.setBadgeTextColor === 'function') {
          try { chrome.action.setBadgeTextColor({ tabId: currentTab.id, color: '#ffffff' }); } catch (e) {}
        }
        chrome.action.setTitle({ tabId: currentTab.id, title: 'Saved in Raindrop (Account B)' });
      } else {
        chrome.action.setBadgeText({ tabId: currentTab.id, text: '' });
        chrome.action.setTitle({ tabId: currentTab.id, title: 'Save to Secondary Raindrop' });
      }
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: saved ? 'setTabBadge' : 'clearTabBadge',
        tabId: currentTab.id
      }).catch(() => {});
    }
  }

  async function checkBookmarkStatus(url) {
    checkingBookmarkPromise = (async () => {
      try {
        loadedBookmarkUrl = url;
        const item = await RaindropAPI.checkUrl(currentToken, url);
        if (item) {
          canonicalBookmarkUrl = (item.link || '').trim() || null;
          originalLoadedBookmark = item;

          // If the URL in the input field has already been changed away by the user to a different destination, do not link to old bookmark
          const currentInputUrl = bookmarkUrl.value.trim();
          if (userEditedFields.has('url') && !isUrlMatchingLoadedBookmark(currentInputUrl)) {
            existingBookmark = null;
            return;
          }

          existingBookmark = item;
          headerStatusTitle.textContent = 'Saved';
          saveBtnText.textContent = 'Saved ✓';
          deleteBookmarkBtn.classList.remove('hidden');
          updateToolbarBadge(true);

          if (!userEditedFields.has('title') && item.title) bookmarkTitle.value = item.title;
          if (!userEditedFields.has('excerpt') && item.excerpt) bookmarkExcerpt.value = item.excerpt;
          if (!userEditedFields.has('note') && item.note) bookmarkNote.value = item.note;
          if (!userEditedFields.has('tags')) {
            if (Array.isArray(item.tags) && item.tags.length > 0) {
              bookmarkTagsComponent.setTags(item.tags);
            } else {
              bookmarkTagsComponent.clear();
            }
          }
          if (!userEditedFields.has('favorite') && item.important) {
            setFavorite(true);
          }
          if (item.reminder?.date) {
            isReminder = true;
            reminderBellBtn.classList.add('active');
          }
          if (item.cover || (Array.isArray(item.media) && item.media[0]?.link)) {
            const coverUrl = item.cover || item.media[0].link;
            bookmarkThumbnail.src = coverUrl;
            bookmarkThumbnail.classList.remove('hidden');
            thumbFallback.classList.add('hidden');
          }
          if (!userEditedFields.has('collection') && item.collection?.$id !== undefined) {
            const targetId = Number(item.collection.$id);
            const matched = rawCollections.find(c => Number(c.id) === targetId);
            if (matched) {
              updateCollectionPills(matched.id, matched.title, matched.icon);
            } else if (targetId === 0) {
              updateCollectionPills(0, 'Unsorted', '〰');
            } else if (targetId === -99) {
              updateCollectionPills(-99, 'Trash', '🗑');
            } else {
              updateCollectionPills(targetId, 'Collection', '📁');
            }
          }
        } else {
          existingBookmark = null;
          originalLoadedBookmark = null;
          canonicalBookmarkUrl = null;
          loadedBookmarkUrl = url;
          headerStatusTitle.textContent = 'Edit';
          saveBtnText.textContent = 'Save';
          deleteBookmarkBtn.classList.add('hidden');
          updateToolbarBadge(false);
        }
      } catch (e) {
        // Non-fatal
      }
    })();
    return checkingBookmarkPromise;
  }

  function setFavorite(active) {
    isFavorite = active;
    heartBtn.classList.toggle('active', isFavorite);
    markAsEdited();
  }

  heartBtn.addEventListener('click', () => {
    setFavorite(!isFavorite);
  });

  reminderBellBtn.addEventListener('click', () => {
    isReminder = !isReminder;
    reminderBellBtn.classList.toggle('active', isReminder);
    markAsEdited();
    showBanner(isReminder ? 'Reminder scheduled' : 'Reminder disabled', 'info', 2000);
  });

  thumbnailWrapper.addEventListener('click', () => {
    if (bookmarkThumbnail.src && !bookmarkThumbnail.classList.contains('hidden')) {
      showBanner('Preview thumbnail loaded from page cover/favicon.', 'info', 2000);
    } else {
      showBanner('Thumbnail will be automatically extracted upon saving.', 'info', 2000);
    }
  });

  highlightsBtn.addEventListener('click', () => {
    if (existingBookmark?._id) {
      openUrl(`https://app.raindrop.io/my/${selectedCollectionId}/item/${existingBookmark._id}`);
    } else {
      showBanner('Highlights are available once bookmark is saved.', 'info', 3000);
    }
  });

  openTabsViewBtn.addEventListener('click', () => {
    switchView('tabs');
  });

  // Delete Bookmark
  deleteBookmarkBtn.addEventListener('click', async () => {
    if (!existingBookmark?._id || !currentToken) return;

    deleteBookmarkBtn.disabled = true;
    deleteBookmarkBtn.textContent = 'Deleting...';

    try {
      await RaindropAPI.deleteRaindrop(currentToken, existingBookmark._id);
      existingBookmark = null;
      originalLoadedBookmark = null;
      loadedBookmarkUrl = null;
      canonicalBookmarkUrl = null;
      headerStatusTitle.textContent = 'Edit';
      saveBtnText.textContent = 'Save';
      deleteBookmarkBtn.classList.add('hidden');
      updateToolbarBadge(false);
      showBanner('Bookmark removed from Raindrop.', 'info', 3000);
      if (typeof window !== 'undefined' && window.close) {
        setTimeout(() => window.close(), 1200);
      }
    } catch (err) {
      console.error('Failed to delete bookmark:', err);
      showBanner(`Delete failed: ${err.message}`, 'error');
    } finally {
      deleteBookmarkBtn.disabled = false;
      deleteBookmarkBtn.textContent = 'Delete';
    }
  });

  // Save Bookmark Form Submission
  mainBookmarkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner();

    if (!currentToken) {
      switchView('settings');
      return;
    }

    // Await any in-flight existence check to avoid race condition (F-06)
    if (checkingBookmarkPromise) {
      try {
        await checkingBookmarkPromise;
      } catch (_) {}
    }

    let url = bookmarkUrl.value.trim();
    if (url && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      url = 'https://' + url;
      bookmarkUrl.value = url;
    }

    if (!url || !/^https?:\/\//i.test(url)) {
      showBanner('Please enter a valid web URL.', 'warning');
      return;
    }

    // F-02 / H-01: Decouple loaded bookmark if URL field was changed away to a different destination
    if (existingBookmark && !isUrlMatchingLoadedBookmark(url)) {
      existingBookmark = null;
    }

    const title = bookmarkTitle.value.trim();
    const excerpt = bookmarkExcerpt.value.trim();
    const note = bookmarkNote.value.trim();
    bookmarkTagsComponent.commitCurrentInput();
    const rawTags = bookmarkTagsComponent.getTags();
    const tags = Array.from(new Set(rawTags.map(t => t.trim().replace(/^#+/, '')).filter(Boolean)));

    saveBookmarkBtn.disabled = true;
    saveBtnSpinner.classList.remove('hidden');
    saveBtnText.textContent = 'Saving...';

    try {
      let savedItem;
      const bookmarkPayload = {
        url,
        title,
        excerpt,
        note,
        tags,
        important: isFavorite,
        reminder: isReminder ? true : null,
        collectionId: selectedCollectionId
      };

      if (existingBookmark?._id) {
        // Update existing bookmark
        savedItem = await RaindropAPI.updateRaindrop(currentToken, existingBookmark._id, bookmarkPayload);
      } else {
        // Create new bookmark
        savedItem = await RaindropAPI.createRaindrop(currentToken, bookmarkPayload);
      }

      existingBookmark = savedItem;
      originalLoadedBookmark = savedItem;
      loadedBookmarkUrl = url;
      canonicalBookmarkUrl = (savedItem?.link || url).trim();
      await RaindropStorage.setLastCollectionId(selectedCollectionId);

      if (tags.length > 0) {
        await RaindropStorage.addRecentTags(tags);
        await loadRecentTags();
      }

      headerStatusTitle.textContent = 'Saved';
      saveBtnText.textContent = 'Saved ✓';
      deleteBookmarkBtn.classList.remove('hidden');
      updateToolbarBadge(true);
      showBanner('Bookmark saved to Account B!', 'info', 2500);

      // Reload tags in background to update counts
      loadTags();
    } catch (err) {
      console.error('Failed to save bookmark:', err);
      if (err.status === 401) {
        showBanner('Invalid or expired token. Please verify in settings.', 'error', 0);
        switchView('settings');
      } else {
        showBanner(`Failed to save: ${err.message}`, 'error', 6000);
      }
      saveBtnText.textContent = 'Save';
    } finally {
      saveBookmarkBtn.disabled = false;
      saveBtnSpinner.classList.add('hidden');
    }
  });

  // AI Sparkle button
  aiSparkleBtn.addEventListener('click', () => {
    const title = bookmarkTitle.value.trim();
    if (!title) return;
    const words = title.split(/\s+/).filter(w => w.length > 3 && !/^(with|that|this|from|have|your|about|what|when|where)$/i.test(w));
    if (words.length > 0) {
      const suggested = words.slice(0, 2).map(w => w.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
      suggested.forEach(t => bookmarkTagsComponent.addTag(t));
      markAsEdited();
      showBanner(`Suggested tags added: ${suggested.join(', ')}`, 'info', 2000);
    }
  });

  // Search Button
  headerSearchBtn.addEventListener('click', () => {
    openUrl('https://app.raindrop.io/my/0');
  });

  // User Avatar Dropdown
  userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdownMenu.classList.toggle('hidden');
  });

  menuOpenWebBtn.addEventListener('click', () => {
    openUrl('https://app.raindrop.io');
  });

  menuSwitchTokenBtn.addEventListener('click', () => {
    switchView('settings');
  });

  menuDisconnectBtn.addEventListener('click', async () => {
    await RaindropStorage.clearToken();
    currentToken = null;
    currentUser = null;
    rawCollections = [];
    userCollections = [];
    allTags = [];
    expandedCollectionIds = new Set();
    existingBookmark = null;
    originalLoadedBookmark = null;
    loadedBookmarkUrl = null;
    canonicalBookmarkUrl = null;
    updateToolbarBadge(false);
    updateUserProfileUI({ fullName: 'Raindrop Account B', email: '' });
    showBanner('Disconnected from Account B.', 'info', 3000);
    switchView('settings');
  });

  // ==========================================
  // VIEW 4: Token Settings & Modal
  // ==========================================
  closeSettingsBtn.addEventListener('click', () => {
    if (currentToken) {
      switchView('main');
    } else {
      showBanner('Please connect your token first.', 'warning');
    }
  });

  toggleTokenViewBtn.addEventListener('click', () => {
    if (settingsTokenInput.type === 'password') {
      settingsTokenInput.type = 'text';
      toggleTokenViewBtn.textContent = '🔒';
    } else {
      settingsTokenInput.type = 'password';
      toggleTokenViewBtn.textContent = '👁';
    }
  });

  linkIntegrations.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl('https://app.raindrop.io/settings/integrations');
  });

  linkAdvancedOptions.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      openUrl(chrome.runtime.getURL('options/options.html'));
    }
  });

  tokenConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner();

    const rawInput = settingsTokenInput.value;
    const tokenVal = RaindropStorage.sanitizeToken(rawInput);
    if (!tokenVal) {
      if (currentToken) {
        showBanner('Token unchanged.', 'info', 2000);
        switchView('main');
        return;
      }
      showBanner('Please paste your Personal Access Token.', 'warning');
      return;
    }

    submitTokenBtn.disabled = true;
    settingsSpinner.classList.remove('hidden');
    settingsBtnText.textContent = 'Verifying...';

    try {
      const user = await RaindropAPI.verifyToken(tokenVal);

      // F-07: If replacing token or switching user account, purge previous account caches first
      if (currentToken && (currentToken !== tokenVal || (currentUser && currentUser._id !== user._id))) {
        await RaindropStorage.clearAccountData();
        rawCollections = [];
        userCollections = [];
        allTags = [];
        expandedCollectionIds = new Set();
        existingBookmark = null;
        originalLoadedBookmark = null;
        loadedBookmarkUrl = null;
        canonicalBookmarkUrl = null;
      }

      currentToken = tokenVal;
      currentUser = user;
      await RaindropStorage.setToken(tokenVal);
      await RaindropStorage.setUser(user);

      // F-14: Mask token in UI
      settingsTokenInput.value = '';
      settingsTokenInput.placeholder = `Connected (••••${tokenVal.slice(-4)})`;

      updateUserProfileUI(user);
      showBanner(`Connected as ${user.fullName || user.email || 'Account B'}!`, 'info', 3000);

      // Load collections, tags, and recent tags
      await Promise.all([loadCollections(), loadTags(), loadRecentTags()]);

      // If active tab exists, check if already saved
      if (currentTab?.url) {
        await checkBookmarkStatus(currentTab.url);
      }

      switchView('main');
    } catch (err) {
      console.error('Token verification error:', err);
      showBanner(`Verification failed: ${err.message}`, 'error', 0);
    } finally {
      submitTokenBtn.disabled = false;
      settingsSpinner.classList.add('hidden');
      settingsBtnText.textContent = 'Verify & Connect';
    }
  });

  // Global Keyboard Shortcut: Ctrl/Cmd + Enter
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (viewMain.classList.contains('active') && !saveBookmarkBtn.disabled) {
        mainBookmarkForm.requestSubmit();
      } else if (viewTabs.classList.contains('active') && !executeSaveTabsBtn.disabled) {
        executeSaveTabsBtn.click();
      }
    }
    if (e.key === 'Escape') {
      if (viewCollection.classList.contains('active')) {
        switchView(previousView === 'tabs' ? 'tabs' : 'main');
      } else if (viewTabs.classList.contains('active')) {
        switchView('main');
      } else if (viewSettings.classList.contains('active') && currentToken) {
        switchView('main');
      }
    }
  });

  // ==========================================
  // Initialization Lifecycle
  // ==========================================
  currentToken = await RaindropStorage.getToken();
  const cachedUser = await RaindropStorage.getUser();
  if (cachedUser) {
    updateUserProfileUI(cachedUser);
  }

  // Preload cached collections, tags, and expanded states for instant 0ms display
  const [cachedData, savedExpanded, lastId, cachedTags] = await Promise.all([
    RaindropStorage.getCachedCollections(),
    RaindropStorage.getExpandedCollectionIds(),
    RaindropStorage.getLastCollectionId(),
    RaindropStorage.getCachedTags()
  ]);

  if (Array.isArray(savedExpanded)) {
    expandedCollectionIds = new Set(savedExpanded.map(Number));
    expandedInitialized = true;
  }

  if (Array.isArray(cachedTags) && cachedTags.length > 0) {
    allTags = cachedTags;
  }

  if (cachedData && Array.isArray(cachedData.collections) && cachedData.collections.length > 0) {
    applyCollectionsData(cachedData.collections, cachedData.stats || [], lastId);
  } else if (lastId !== undefined && lastId !== null) {
    updateCollectionPills(lastId, lastId === 0 ? 'Unsorted' : 'Collection', lastId === 0 ? '〰' : '📁');
  }

  await loadActiveTab();

  if (!currentToken) {
    switchView('settings');
  } else {
    // Parallel data loading & background refresh
    Promise.all([loadCollections(), loadTags(), loadRecentTags()]).catch(e => console.warn(e));

    // Verify token & sync user in background
    RaindropAPI.verifyToken(currentToken)
      .then(user => {
        RaindropStorage.setUser(user);
        updateUserProfileUI(user);
      })
      .catch(err => {
        if (err.status === 401) {
          showBanner('Token is invalid or revoked. Please update token.', 'error', 0);
          switchView('settings');
        }
      });
  }
});
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TagChipsComponent,
    escapeHtml,
    applyShiftClickRangeSelection,
    isUrlIcon,
    renderIconHtml,
    isCollectionVisible,
    expandAncestorsOf,
    areUrlsEquivalent
  };
}
