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
  if (typeof chrome === 'undefined' || !chrome.action) return;
  chrome.action.setBadgeText({ tabId, text: BADGE_TEXT_SAVED });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_SAVED });
  if (typeof chrome.action.setBadgeTextColor === 'function') {
    try {
      chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    } catch (e) {}
  }
  chrome.action.setTitle({ tabId, title: BADGE_TITLE_SAVED });
}

/**
 * Clear the badge from a tab
 */
function clearTabBadge(tabId) {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  chrome.action.setBadgeText({ tabId, text: '' });
  chrome.action.setTitle({ tabId, title: BADGE_TITLE_DEFAULT });
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

// 3. Listen for direct messages from popup (immediate badge update on save/delete)
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
    updateTabBadge,
    setTabBadge,
    clearTabBadge,
    BADGE_COLOR_SAVED,
    BADGE_TEXT_SAVED,
    BADGE_TITLE_SAVED,
    BADGE_TITLE_DEFAULT
  };
}
