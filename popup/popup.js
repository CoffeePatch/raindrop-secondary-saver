/**
 * Raindrop Secondary Saver - 1:1 Pixel-Perfect Popup Controller
 */

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
  const unsortedCountBadge = document.getElementById('unsortedCountBadge');
  const trashCountBadge = document.getElementById('trashCountBadge');
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
  const tabsTagsInput = document.getElementById('tabsTagsInput');
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
  let isFavorite = false;
  let isReminder = false;
  let selectedCollectionId = 0;
  let selectedCollectionTitle = 'Unsorted';
  let selectedCollectionIcon = '〰';

  let rawCollections = [];
  let userCollections = [];
  let allTags = []; // Array of { tag: string, count: number }
  let activeAutocompleteIndex = -1;
  let previousView = 'main'; // For returning from Collection View to Tabs View or Main View
  let openTabsData = [];

  // ==========================================
  // Helper Utilities
  // ==========================================
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

  function switchView(targetView) {
    hideBanner();
    userDropdownMenu.classList.add('hidden');

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
      renderCollectionsList('');
      setTimeout(() => collectionSearchInput.focus(), 50);
    } else if (targetView === 'tabs') {
      viewTabs.classList.remove('hidden');
      viewTabs.classList.add('active');
      initSaveTabsView();
    } else if (targetView === 'settings') {
      viewSettings.classList.remove('hidden');
      viewSettings.classList.add('active');
      settingsTokenInput.value = currentToken || '';
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

    pillIcon.textContent = selectedCollectionIcon;
    pillTitle.textContent = selectedCollectionTitle;

    tabsPillIcon.textContent = selectedCollectionIcon;
    tabsPillTitle.textContent = selectedCollectionTitle;
  }

  function updateUserProfileUI(user) {
    if (!user) return;
    currentUser = user;
    const name = user.fullName || user.email || 'Account B';
    const firstLetter = name.trim().charAt(0).toUpperCase() || 'B';
    userAvatarCircle.textContent = firstLetter;
    menuUserName.textContent = name;
    menuUserEmail.textContent = user.email ? `${user.email} (Account B)` : 'Raindrop Account B';
  }

  // ==========================================
  // Autocomplete Tags Engine (GET /tags/0)
  // ==========================================
  async function loadTags() {
    if (!currentToken) return;
    try {
      allTags = await RaindropAPI.getTags(currentToken);
    } catch (e) {
      console.warn('Failed to load tags:', e);
      allTags = [];
    }
  }

  function getCurrentTagQuery() {
    const text = bookmarkTagsInput.value;
    const parts = text.split(',');
    return parts[parts.length - 1].trim();
  }

  function insertTag(tagToAdd) {
    const raw = bookmarkTagsInput.value;
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Replace the current partial word with chosen tag
      parts[parts.length - 1] = tagToAdd;
    } else {
      parts.push(tagToAdd);
    }
    bookmarkTagsInput.value = parts.join(', ') + ', ';
    bookmarkTagsInput.focus();
    hideTagsDropdown();
  }

  function renderTagsAutocomplete() {
    const query = getCurrentTagQuery().toLowerCase();
    const existingTags = new Set(
      bookmarkTagsInput.value
        .split(',')
        .slice(0, -1)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
    );

    tagsDropdownList.innerHTML = '';
    activeAutocompleteIndex = -1;

    // Filter matching tags from allTags
    const matches = allTags.filter(item => {
      const lower = item.tag.toLowerCase();
      if (existingTags.has(lower)) return false;
      return !query || lower.includes(query);
    }).slice(0, 20);

    if (matches.length === 0 && !query) {
      hideTagsDropdown();
      return;
    }

    if (matches.length === 0 && query) {
      // Option to add new tag
      const createItem = document.createElement('div');
      createItem.className = 'tag-dropdown-item';
      createItem.innerHTML = `<span class="tag-item-name">+ Add tag "<strong>${escapeHtml(query)}</strong>"</span>`;
      createItem.addEventListener('click', () => insertTag(query));
      tagsDropdownList.appendChild(createItem);
      showTagsDropdown();
      return;
    }

    matches.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'tag-dropdown-item';
      row.dataset.index = index;
      row.innerHTML = `
        <span class="tag-item-name"># ${escapeHtml(item.tag)}</span>
        <span class="tag-item-count">${item.count}</span>
      `;
      row.addEventListener('click', () => insertTag(item.tag));
      tagsDropdownList.appendChild(row);
    });

    showTagsDropdown();
  }

  function showTagsDropdown() {
    tagsAutocompleteDropdown.classList.remove('hidden');
  }

  function hideTagsDropdown() {
    tagsAutocompleteDropdown.classList.add('hidden');
    activeAutocompleteIndex = -1;
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Tags input events
  bookmarkTagsInput.addEventListener('input', () => {
    renderTagsAutocomplete();
  });

  bookmarkTagsInput.addEventListener('focus', () => {
    renderTagsAutocomplete();
  });

  bookmarkTagsInput.addEventListener('keydown', (e) => {
    const items = tagsDropdownList.querySelectorAll('.tag-dropdown-item');
    if (tagsAutocompleteDropdown.classList.contains('hidden') || items.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeAutocompleteIndex = (activeAutocompleteIndex + 1) % items.length;
      updateActiveAutocompleteItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeAutocompleteIndex = (activeAutocompleteIndex - 1 + items.length) % items.length;
      updateActiveAutocompleteItem(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeAutocompleteIndex >= 0 && items[activeAutocompleteIndex]) {
        e.preventDefault();
        items[activeAutocompleteIndex].click();
      }
    } else if (e.key === 'Escape') {
      hideTagsDropdown();
    }
  });

  function updateActiveAutocompleteItem(items) {
    items.forEach((it, idx) => {
      it.classList.toggle('active-item', idx === activeAutocompleteIndex);
      if (idx === activeAutocompleteIndex) {
        it.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // Close tags dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!bookmarkTagsInput.contains(e.target) && !tagsAutocompleteDropdown.contains(e.target)) {
      hideTagsDropdown();
    }
    if (!userMenuBtn.contains(e.target) && !userDropdownMenu.contains(e.target)) {
      userDropdownMenu.classList.add('hidden');
    }
  });

  // ==========================================
  // VIEW 2: Collections Engine & Hierarchy
  // ==========================================
  async function loadCollections() {
    if (!currentToken) return;
    try {
      rawCollections = await RaindropAPI.getCollections(currentToken);
      // rawCollections[0] is Unsorted (id: 0)
      userCollections = rawCollections.filter(c => c.id !== 0 && c.id !== -99);

      // Check last used collection
      const lastId = await RaindropStorage.getLastCollectionId();
      const match = rawCollections.find(c => Number(c.id) === Number(lastId));
      if (match) {
        updateCollectionPills(match.id, match.title, match.icon);
      } else {
        updateCollectionPills(0, 'Unsorted', '〰');
      }
    } catch (e) {
      console.warn('Failed to load collections:', e);
      if (e.status === 401) {
        switchView('settings');
      }
    }
  }

  function renderCollectionsList(searchTerm = '') {
    userCollectionsList.innerHTML = '';
    const term = (searchTerm || '').trim().toLowerCase();

    // Check special collections counts
    const unsortedObj = rawCollections.find(c => c.id === 0);
    unsortedCountBadge.textContent = unsortedObj ? unsortedObj.count || 0 : 0;
    trashCountBadge.textContent = 0;

    // Filter user collections
    const filtered = userCollections.filter(coll => {
      if (!term) return true;
      return (coll.title || '').toLowerCase().includes(term);
    });

    if (term) {
      // Check if term matches exact collection title
      const exactMatch = userCollections.some(c => c.title.toLowerCase() === term);
      if (!exactMatch) {
        createNewCollectionItem.classList.remove('hidden');
        createCollectionText.textContent = `Create collection "${term}"`;
      } else {
        createNewCollectionItem.classList.add('hidden');
      }
    } else {
      createNewCollectionItem.classList.add('hidden');
    }

    filtered.forEach(coll => {
      const itemEl = document.createElement('div');
      itemEl.className = 'collection-item';
      if (Number(coll.id) === Number(selectedCollectionId)) {
        itemEl.classList.add('active-selected');
      }

      // Hierarchy Indent
      const indentPx = Math.min(coll.level || 0, 4) * 14;
      if (indentPx > 0) {
        itemEl.style.paddingLeft = `${10 + indentPx}px`;
      }

      const iconDisplay = coll.icon || '📁';
      const sharedIcon = coll.shared ? `<span class="coll-shared-icon" title="Shared collection">👥</span>` : '';

      itemEl.innerHTML = `
        <div class="coll-left">
          <span class="coll-icon">${escapeHtml(iconDisplay)}</span>
          <span class="coll-title">${escapeHtml(coll.title)}</span>
          ${sharedIcon}
        </div>
        <span class="coll-count">${coll.count || 0}</span>
      `;

      itemEl.addEventListener('click', () => {
        selectCollectionAndReturn(coll.id, coll.title, iconDisplay);
      });

      userCollectionsList.appendChild(itemEl);
    });
  }

  function selectCollectionAndReturn(id, title, icon) {
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

    // Set prefilled date tag: e.g. #11/9/2026
    const now = new Date();
    const dateTag = `#${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    tabsTagsInput.value = dateTag;

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      openTabsData = tabs.filter(t => t.url && !/^(chrome|brave|edge|about|devtools):/i.test(t.url));

      renderOpenTabsList();
    } catch (e) {
      console.warn('Could not query tabs:', e);
      openTabsList.innerHTML = '<div style="padding: 12px; color: var(--accent-red);">Unable to read window tabs.</div>';
    }
  }

  function renderOpenTabsList() {
    openTabsList.innerHTML = '';
    if (openTabsData.length === 0) {
      openTabsList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">No saveable web tabs found.</div>';
      updateTabsCounter();
      return;
    }

    openTabsData.forEach((tab, i) => {
      const row = document.createElement('label');
      row.className = 'tab-row-item';

      const faviconSrc = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236b7280"><circle cx="12" cy="12" r="10"/></svg>';

      row.innerHTML = `
        <input type="checkbox" class="tab-checkbox" data-tab-id="${tab.id}" checked />
        <img class="tab-favicon" src="${escapeHtml(faviconSrc)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%236b7280%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'" />
        <div class="tab-info-text">
          <div class="tab-title" title="${escapeHtml(tab.title || tab.url)}">${escapeHtml(tab.title || tab.url)}</div>
        </div>
      `;

      row.querySelector('.tab-checkbox').addEventListener('change', updateTabsCounter);
      openTabsList.appendChild(row);
    });

    updateTabsCounter();
  }

  function getSelectedTabIds() {
    const checkboxes = openTabsList.querySelectorAll('.tab-checkbox:checked');
    return Array.from(checkboxes).map(cb => Number(cb.dataset.tabId));
  }

  function updateTabsCounter() {
    const selectedIds = getSelectedTabIds();
    const count = selectedIds.length;
    selectedTabsCounter.textContent = `${count} tabs`;
    saveTabsBtnText.textContent = `Save ${count} tabs`;
    executeSaveTabsBtn.disabled = count === 0;
  }

  selectAllTabsCheckbox.addEventListener('change', () => {
    const checked = selectAllTabsCheckbox.checked;
    openTabsList.querySelectorAll('.tab-checkbox').forEach(cb => {
      cb.checked = checked;
    });
    updateTabsCounter();
  });

  backFromTabsBtn.addEventListener('click', () => {
    switchView('main');
  });

  // Execute Save Tabs
  executeSaveTabsBtn.addEventListener('click', async () => {
    const selectedIds = getSelectedTabIds();
    if (selectedIds.length === 0 || !currentToken) return;

    executeSaveTabsBtn.disabled = true;
    saveTabsSpinner.classList.remove('hidden');

    const rawTags = tabsTagsInput.value.replace(/#/g, '').trim();
    const tags = rawTags
      ? Array.from(new Set(rawTags.split(/[,]+/).map(t => t.trim()).filter(Boolean)))
      : [];

    const tabsToSave = openTabsData.filter(t => selectedIds.includes(t.id));
    const shouldClose = closeTabsCheckbox.checked;

    let savedCount = 0;
    try {
      for (let i = 0; i < tabsToSave.length; i++) {
        const tab = tabsToSave[i];
        saveTabsBtnText.textContent = `Saving ${i + 1}/${tabsToSave.length}...`;
        await RaindropAPI.createRaindrop(currentToken, {
          url: tab.url,
          title: tab.title,
          tags: tags,
          collectionId: selectedCollectionId
        });
        savedCount++;
      }

      if (shouldClose && chrome?.tabs?.remove) {
        await chrome.tabs.remove(selectedIds);
      }

      showBanner(`Saved ${savedCount} tabs to ${selectedCollectionTitle}!`, 'info', 4000);
      switchView('main');
    } catch (err) {
      console.error('Failed while saving tabs:', err);
      showBanner(`Saved ${savedCount}/${tabsToSave.length} tabs. Error: ${err.message}`, 'error', 6000);
    } finally {
      executeSaveTabsBtn.disabled = false;
      saveTabsSpinner.classList.add('hidden');
      updateTabsCounter();
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
        } else if (currentToken && tab.url) {
          // Check if already bookmarked
          checkBookmarkStatus(tab.url);
        }
      }
    } catch (e) {
      console.warn('Active tab query failed:', e);
    }
  }

  async function checkBookmarkStatus(url) {
    try {
      const item = await RaindropAPI.checkUrl(currentToken, url);
      if (item) {
        existingBookmark = item;
        headerStatusTitle.textContent = 'Saved';
        saveBtnText.textContent = 'Save';
        deleteBookmarkBtn.classList.remove('hidden');

        if (item.title) bookmarkTitle.value = item.title;
        if (item.excerpt) bookmarkExcerpt.value = item.excerpt;
        if (item.note) bookmarkNote.value = item.note;
        if (Array.isArray(item.tags) && item.tags.length > 0) {
          bookmarkTagsInput.value = item.tags.join(', ') + ', ';
        }
        if (item.important) {
          setFavorite(true);
        }
        if (item.collection?.$id !== undefined) {
          const matched = rawCollections.find(c => Number(c.id) === Number(item.collection.$id));
          if (matched) {
            updateCollectionPills(matched.id, matched.title, matched.icon);
          }
        }
      } else {
        headerStatusTitle.textContent = 'Raindrop';
        saveBtnText.textContent = 'Save';
        deleteBookmarkBtn.classList.add('hidden');
      }
    } catch (e) {
      // Non-fatal
    }
  }

  function setFavorite(active) {
    isFavorite = active;
    heartBtn.classList.toggle('active', isFavorite);
  }

  heartBtn.addEventListener('click', () => {
    setFavorite(!isFavorite);
  });

  reminderBellBtn.addEventListener('click', () => {
    isReminder = !isReminder;
    reminderBellBtn.classList.toggle('active', isReminder);
    showBanner(isReminder ? 'Reminder active' : 'Reminder disabled', 'info', 2000);
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
      headerStatusTitle.textContent = 'Raindrop';
      deleteBookmarkBtn.classList.add('hidden');
      showBanner('Bookmark removed from Raindrop.', 'info', 3000);
      setTimeout(() => window.close(), 1200);
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

    let url = bookmarkUrl.value.trim();
    if (url && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      url = 'https://' + url;
      bookmarkUrl.value = url;
    }

    if (!url || !/^https?:\/\//i.test(url)) {
      showBanner('Please enter a valid web URL.', 'warning');
      return;
    }

    const title = bookmarkTitle.value.trim();
    const excerpt = bookmarkExcerpt.value.trim();
    const note = bookmarkNote.value.trim();
    const rawTags = bookmarkTagsInput.value.trim();
    const tags = rawTags
      ? Array.from(new Set(rawTags.split(/[,]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean)))
      : [];

    saveBookmarkBtn.disabled = true;
    saveBtnSpinner.classList.remove('hidden');
    saveBtnText.textContent = 'Saving...';

    try {
      let savedItem;
      if (existingBookmark?._id) {
        // Update existing bookmark
        savedItem = await RaindropAPI.updateRaindrop(currentToken, existingBookmark._id, {
          url,
          title,
          excerpt,
          note,
          tags,
          important: isFavorite,
          collectionId: selectedCollectionId
        });
      } else {
        // Create new bookmark
        savedItem = await RaindropAPI.createRaindrop(currentToken, {
          url,
          title,
          excerpt,
          note,
          tags,
          important: isFavorite,
          collectionId: selectedCollectionId
        });
      }

      existingBookmark = savedItem;
      await RaindropStorage.setLastCollectionId(selectedCollectionId);

      headerStatusTitle.textContent = 'Saved';
      saveBtnText.textContent = 'Saved ✓';
      deleteBookmarkBtn.classList.remove('hidden');
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
    // Generate helpful tags from title words
    const title = bookmarkTitle.value.trim();
    if (!title) return;
    const words = title.split(/\s+/).filter(w => w.length > 3 && !/^(with|that|this|from|have|your|about)$/i.test(w));
    if (words.length > 0) {
      const suggested = words.slice(0, 2).map(w => w.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
      const current = bookmarkTagsInput.value.trim();
      const combined = current ? `${current}, ${suggested.join(', ')}` : suggested.join(', ');
      bookmarkTagsInput.value = combined + ', ';
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

    const tokenVal = settingsTokenInput.value.trim();
    if (!tokenVal) {
      showBanner('Please paste your Personal Access Token.', 'warning');
      return;
    }

    submitTokenBtn.disabled = true;
    settingsSpinner.classList.remove('hidden');
    settingsBtnText.textContent = 'Verifying...';

    try {
      const user = await RaindropAPI.verifyToken(tokenVal);
      currentToken = tokenVal;
      await RaindropStorage.setToken(tokenVal);
      await RaindropStorage.setUser(user);

      updateUserProfileUI(user);
      showBanner(`Connected as ${user.fullName || user.email || 'Account B'}!`, 'info', 3000);

      // Load collections and tags
      await Promise.all([loadCollections(), loadTags()]);

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

  await loadActiveTab();

  if (!currentToken) {
    switchView('settings');
  } else {
    // Parallel data loading
    Promise.all([loadCollections(), loadTags()]).catch(e => console.warn(e));

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
