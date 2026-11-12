/**
 * Raindrop Secondary Saver - Background Service Worker
 * Manages badge checkmark status for active and updated tabs
 */

// Import API library for Manifest V3 service worker
try {
  if (typeof importScripts === 'function') {
    importScripts('scripts/api.js');
  }
} catch (e) {
  console.warn('[Background] Failed to importScripts api.js:', e);
}

const BADGE_COLOR_SAVED = '#10B981'; // Account B Emerald Green
const BADGE_TEXT_SAVED = '✓';
const BADGE_TITLE_SAVED = 'Saved in Raindrop (Account B)';
const BADGE_TITLE_DEFAULT = 'Save to Secondary Raindrop';

/**
 * Checks if a URL is valid for bookmark checking
 */
function isCheckableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Updates badge for a specific tab by checking if its URL is saved in Account B
 */
async function updateTabBadge(tabId, url) {
  if (!tabId) return;

  if (!isCheckableUrl(url)) {
    clearTabBadge(tabId);
    return;
  }

  try {
    const storageObj = typeof RaindropStorage !== 'undefined' ? RaindropStorage : (typeof globalThis !== 'undefined' ? globalThis.RaindropStorage : null);
    const apiObj = typeof RaindropAPI !== 'undefined' ? RaindropAPI : (typeof globalThis !== 'undefined' ? globalThis.RaindropAPI : null);

    if (!storageObj || !apiObj) {
      return;
    }

    const token = await storageObj.getToken();
    if (!token) {
      clearTabBadge(tabId);
      return;
    }

    const item = await apiObj.checkUrl(token, url);
    if (item) {
      setTabBadge(tabId);
    } else {
      clearTabBadge(tabId);
    }
  } catch (err) {
    console.warn(`[Background] Failed to check URL for tab ${tabId}:`, err);
  }
}

/**
 * Set the saved checkmark badge on a tab
 */
function setTabBadge(tabId) {
  if (typeof chrome === 'undefined' || !chrome.action || !tabId) return;
  try {
    chrome.action.setBadgeText({ tabId, text: BADGE_TEXT_SAVED });
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_SAVED });
    if (typeof chrome.action.setBadgeTextColor === 'function') {
      try {
        chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
      } catch (e) {}
    }
    chrome.action.setTitle({ tabId, title: BADGE_TITLE_SAVED });
  } catch (e) {
    // Tab may be closed or unavailable
  }
}

/**
 * Clear the badge from a tab
 */
function clearTabBadge(tabId) {
  if (typeof chrome === 'undefined' || !chrome.action || !tabId) return;
  try {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setTitle({ tabId, title: BADGE_TITLE_DEFAULT });
  } catch (e) {
    // Tab may be closed or unavailable
  }
}

/**
 * Checks if a URL is in the set of saved links, allowing for harmless
 * trailing-slash representation differences without broad normalization.
 */
function isUrlInSavedSet(url, savedSet) {
  if (!url || !savedSet || savedSet.size === 0) return false;
  const trimmed = url.trim();
  if (savedSet.has(trimmed)) return true;
  if (trimmed.endsWith('/')) {
    if (savedSet.has(trimmed.slice(0, -1))) return true;
  } else {
    if (savedSet.has(trimmed + '/')) return true;
  }
  return false;
}

/**
 * Handle batch tab saving in the background service worker
 * Executes batch save via POST /raindrops, guarantees tab closing only on success
 */
async function handleSaveTabsBatch({ items = [], closeTabIds = [] } = {}) {
  const storageObj = typeof RaindropStorage !== 'undefined' ? RaindropStorage : (typeof globalThis !== 'undefined' ? globalThis.RaindropStorage : null);
  const apiObj = typeof RaindropAPI !== 'undefined' ? RaindropAPI : (typeof globalThis !== 'undefined' ? globalThis.RaindropAPI : null);

  if (!storageObj || !apiObj) {
    throw new Error('Raindrop storage or API not available');
  }

  const token = await storageObj.getToken();
  if (!token) {
    throw new Error('API token is required. Please set up your token in extension options.');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: true, count: 0, totalRequested: 0, items: [], closedTabIds: [] };
  }

  // 1. Execute batch save via official batch endpoint POST /raindrops
  const result = await apiObj.createRaindropsBatch(token, items);

  const savedLinks = new Set(
    (result?.items || [])
      .map(it => (it?.link || it?.url || '').trim())
      .filter(Boolean)
  );

  // Map each tab to its clean URL
  const tabUrlMap = new Map();
  for (const it of items) {
    const rawUrl = (it.link || it.url || '').trim();
    if (it.tabId && rawUrl) {
      tabUrlMap.set(Number(it.tabId), rawUrl);
    }
  }

  // 2. Close ONLY tabs whose URL is confirmed in savedLinks to prevent data loss.
  // If a tab's save status is uncertain, DO NOT CLOSE IT.
  const requestedCloseIds = Array.isArray(closeTabIds)
    ? closeTabIds.map(Number).filter(id => !isNaN(id) && id > 0)
    : [];

  const eligibleCloseTabIds = requestedCloseIds.filter(id => {
    const url = tabUrlMap.get(id);
    return url && isUrlInSavedSet(url, savedLinks);
  });

  const actuallyClosedTabIds = [];
  if (eligibleCloseTabIds.length > 0 && typeof chrome !== 'undefined' && chrome.tabs?.remove) {
    try {
      await chrome.tabs.remove(eligibleCloseTabIds);
      actuallyClosedTabIds.push(...eligibleCloseTabIds);
    } catch (closeErr) {
      console.warn('[Background] Failed to close tabs batch, trying individually:', closeErr);
      for (const id of eligibleCloseTabIds) {
        try {
          await chrome.tabs.remove(id);
          actuallyClosedTabIds.push(id);
        } catch (_) {}
      }
    }
  }

  // 3. Update toolbar icon badge ONLY for tabs positively confirmed saved by API on remaining open tabs (M-01)
  try {
    const closedSet = new Set(actuallyClosedTabIds);
    if (savedLinks.size > 0) {
      for (const it of items) {
        const rawUrl = (it.link || it.url || '').trim();
        const tabId = Number(it.tabId);
        if (tabId && !closedSet.has(tabId) && isUrlInSavedSet(rawUrl, savedLinks)) {
          setTabBadge(tabId);
        }
      }
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const openTabs = await chrome.tabs.query({});
        for (const tab of openTabs) {
          if (tab?.id && tab.url && !closedSet.has(tab.id) && isUrlInSavedSet(tab.url, savedLinks)) {
            setTabBadge(tab.id);
          }
        }
      }
    }
  } catch (badgeErr) {
    console.warn('[Background] Failed to update badges after batch save:', badgeErr);
  }

  // 4. Save tags to recent tags
  try {
    const allTags = [];
    for (const it of items) {
      if (Array.isArray(it.tags)) {
        allTags.push(...it.tags);
      }
    }
    if (allTags.length > 0 && storageObj.addRecentTags) {
      await storageObj.addRecentTags(allTags);
    }
  } catch (tagErr) {
    console.warn('[Background] Failed to save recent tags after batch save:', tagErr);
  }

  const savedCount = Array.isArray(result?.items) ? result.items.length : 0;
  return {
    success: true,
    count: savedCount,
    totalRequested: items.length,
    items: result?.items || [],
    closedTabIds: actuallyClosedTabIds
  };
}

// 1. Listen for active tab switches
if (typeof chrome !== 'undefined' && chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      await updateTabBadge(activeInfo.tabId, tab?.url);
    } catch (e) {
      clearTabBadge(activeInfo.tabId);
    }
  });
}

// 2. Listen for tab updates (URL change or complete load)
if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      updateTabBadge(tabId, tab?.url);
    }
  });
}

// 3. Listen for direct messages from popup (immediate badge update on save/delete & background batch saving)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === 'setTabBadge' && message.tabId) {
      setTabBadge(message.tabId);
      sendResponse?.({ success: true });
    } else if (message?.action === 'clearTabBadge' && message.tabId) {
      clearTabBadge(message.tabId);
      sendResponse?.({ success: true });
    } else if (message?.action === 'updateTabBadge' && message.tabId && message.url) {
      updateTabBadge(message.tabId, message.url).then(() => {
        sendResponse?.({ success: true });
      });
      return true; // Keep message channel open for async response
    } else if (message?.action === 'saveTabsBatch') {
      handleSaveTabsBatch(message).then((result) => {
        try {
          sendResponse?.(result);
        } catch (_) {}
      }).catch((err) => {
        try {
          sendResponse?.({ success: false, error: err?.message || String(err) });
        } catch (_) {}
      });
      return true; // Keep message channel open for async response
    }
  });
}

// 4. Listen for window focus changes
if (typeof chrome !== 'undefined' && chrome.windows?.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab?.id) {
        await updateTabBadge(tab.id, tab.url);
      }
    } catch (e) {}
  });
}

// 5. Check active tab on startup/initialization
if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
    if (tab?.id) {
      updateTabBadge(tab.id, tab.url);
    }
  }).catch(() => {});
}

// 6. Listen for credential updates/disconnect to refresh badge
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.raindrop_token) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
        if (tab?.id) {
          updateTabBadge(tab.id, tab.url);
        }
      }).catch(() => {});
    }
  });
}

// Export for unit tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isCheckableUrl,
    isUrlInSavedSet,
    updateTabBadge,
    setTabBadge,
    clearTabBadge,
    handleSaveTabsBatch,
    BADGE_COLOR_SAVED,
    BADGE_TEXT_SAVED,
    BADGE_TITLE_SAVED,
    BADGE_TITLE_DEFAULT
  };
}
