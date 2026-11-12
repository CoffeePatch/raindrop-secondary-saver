/**
 * Raindrop.io REST API Client for Manifest V3 Extension
 */

const API_BASE = 'https://api.raindrop.io/rest/v1';

const RaindropStorage = {
  /**
   * Sanitizes token string by trimming whitespace, quotes, and leading 'Bearer '
   */
  sanitizeToken(token) {
    if (!token || typeof token !== 'string') return '';
    let clean = token.trim();
    clean = clean.replace(/^["']|["']$/g, '').trim();
    if (clean.toLowerCase().startsWith('bearer ')) {
      clean = clean.slice(7).trim();
    }
    return clean;
  },

  async getToken() {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    let localToken = null;
    try {
      const localData = await chrome.storage.local.get(['raindrop_token']);
      if (localData?.raindrop_token) {
        localToken = this.sanitizeToken(localData.raindrop_token);
      }
    } catch (e) {
      console.warn('Local storage read failed:', e);
    }

    if (localToken) {
      if (chrome.storage.sync) {
        chrome.storage.sync.remove(['raindrop_token']).catch(() => {});
      }
      return localToken;
    }

    // Migration fallback: check sync storage if local is empty
    let syncToken = null;
    try {
      if (chrome.storage.sync) {
        const syncData = await chrome.storage.sync.get(['raindrop_token']);
        if (syncData?.raindrop_token) {
          syncToken = this.sanitizeToken(syncData.raindrop_token);
        }
      }
    } catch (e) {
      console.warn('Sync storage read failed:', e);
    }

    if (syncToken) {
      // Migrate syncToken into local storage and clean up sync storage
      try {
        await chrome.storage.local.set({ raindrop_token: syncToken });
        if (chrome.storage.sync) {
          await chrome.storage.sync.remove(['raindrop_token']);
        }
      } catch (e) {
        console.warn('Migration from sync to local storage had warning:', e);
      }
      return syncToken;
    }

    return null;
  },

  async setToken(token) {
    const cleanToken = this.sanitizeToken(token);
    if (!cleanToken) {
      throw new Error('Token cannot be empty.');
    }
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    // Save exclusively to chrome.storage.local
    await chrome.storage.local.set({ raindrop_token: cleanToken });

    // Ensure sync storage is cleared of any legacy token copy
    try {
      if (chrome.storage.sync) {
        await chrome.storage.sync.remove(['raindrop_token']);
      }
    } catch (e) {
      // ignore
    }
  },

  async clearToken() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const keys = [
      'raindrop_token',
      'raindrop_user',
      'raindrop_last_collection',
      'raindrop_expanded_collections',
      'raindrop_recent_tags',
      'raindrop_cached_collections',
      'raindrop_cached_tags'
    ];
    await chrome.storage.local.remove(keys);
    try {
      if (chrome.storage.sync) {
        await chrome.storage.sync.remove(keys);
      }
    } catch (e) {
      // ignore
    }
  },

  async clearAccountData() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const accountKeys = [
      'raindrop_user',
      'raindrop_last_collection',
      'raindrop_expanded_collections',
      'raindrop_recent_tags',
      'raindrop_cached_collections',
      'raindrop_cached_tags'
    ];
    await chrome.storage.local.remove(accountKeys);
  },

  async getLastCollectionId() {
    if (typeof chrome === 'undefined' || !chrome.storage) return 0;
    try {
      const data = await chrome.storage.local.get(['raindrop_last_collection']);
      const id = data?.raindrop_last_collection;
      return (id !== undefined && id !== null && !isNaN(Number(id))) ? Number(id) : 0;
    } catch (e) {
      return 0;
    }
  },

  async setLastCollectionId(collectionId) {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const numId = (collectionId !== undefined && collectionId !== null && !isNaN(Number(collectionId)))
      ? Number(collectionId)
      : 0;
    try {
      await chrome.storage.local.set({ raindrop_last_collection: numId });
    } catch (e) {
      // ignore
    }
  },

  async getExpandedCollectionIds() {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      const data = await chrome.storage.local.get(['raindrop_expanded_collections']);
      if (Array.isArray(data?.raindrop_expanded_collections)) {
        return data.raindrop_expanded_collections.map(id => Number(id));
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  async setExpandedCollectionIds(ids) {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    try {
      const clean = Array.isArray(ids)
        ? Array.from(new Set(ids.map(id => Number(id)).filter(id => !isNaN(id))))
        : [];
      await chrome.storage.local.set({ raindrop_expanded_collections: clean });
      return clean;
    } catch (e) {
      return [];
    }
  },

  async getUser() {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      const data = await chrome.storage.local.get(['raindrop_user']);
      return data?.raindrop_user ?? null;
    } catch (e) {
      return null;
    }
  },

  async setUser(user) {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      await chrome.storage.local.set({ raindrop_user: user });
    } catch (e) {
      // ignore
    }
  },

  async getRecentTags() {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    try {
      const data = await chrome.storage.local.get(['raindrop_recent_tags']);
      if (Array.isArray(data?.raindrop_recent_tags)) {
        return data.raindrop_recent_tags;
      }
      return [];
    } catch (e) {
      return [];
    }
  },

  async setRecentTags(tags) {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    try {
      const clean = Array.isArray(tags)
        ? Array.from(new Set(tags.map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean))).slice(0, 30)
        : [];
      await chrome.storage.local.set({ raindrop_recent_tags: clean });
      return clean;
    } catch (e) {
      return [];
    }
  },

  async addRecentTags(newTags) {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    try {
      const current = await this.getRecentTags();
      const rawList = Array.isArray(newTags) ? newTags : [newTags];
      const cleanNew = rawList
        .map(t => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);

      const seen = new Set();
      const combined = [];
      for (const t of cleanNew) {
        const lower = t.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          combined.push(t);
        }
      }
      for (const t of current) {
        const lower = t.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          combined.push(t);
        }
      }
      const finalRecent = combined.slice(0, 30);
      await chrome.storage.local.set({ raindrop_recent_tags: finalRecent });
      return finalRecent;
    } catch (e) {
      return [];
    }
  },

  async getCachedCollections() {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      const data = await chrome.storage.local.get(['raindrop_cached_collections']);
      return data?.raindrop_cached_collections ?? null;
    } catch (e) {
      return null;
    }
  },

  async setCachedCollections(payload) {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      await chrome.storage.local.set({ raindrop_cached_collections: payload });
      return payload;
    } catch (e) {
      return null;
    }
  },

  async getCachedTags() {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      const data = await chrome.storage.local.get(['raindrop_cached_tags']);
      return data?.raindrop_cached_tags ?? null;
    } catch (e) {
      return null;
    }
  },

  async setCachedTags(tags) {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      await chrome.storage.local.set({ raindrop_cached_tags: tags });
      return tags;
    } catch (e) {
      return null;
    }
  }
};

class RaindropAPIError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'RaindropAPIError';
    this.status = status;
    this.details = details;
  }
}

const RaindropAPI = {
  /**
   * Performs an authenticated fetch to Raindrop.io REST API
   */
  async request(endpoint, token, options = {}) {
    if (!token) {
      throw new RaindropAPIError('API token is required. Please set up your token in extension options.', 401);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      ...options.headers
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, { credentials: 'omit', ...options, headers });
    } catch (netErr) {
      throw new RaindropAPIError(`Network error: Unable to reach Raindrop.io (${netErr.message})`, 0);
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonErr) {
      data = null;
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new RaindropAPIError('Invalid or expired Personal Access Token. Please verify in Settings.', 401, data);
      }
      const errorMsg = data?.errorMessage || data?.message || `Raindrop API Error (${response.status} ${response.statusText})`;
      throw new RaindropAPIError(errorMsg, response.status, data);
    }

    if (data && data.result === false && !options.allowResultFalse) {
      throw new RaindropAPIError(data.errorMessage || 'Raindrop request failed.', response.status, data);
    }

    return data;
  },

  /**
   * Verify token by fetching user profile
   */
  async verifyToken(token) {
    const data = await this.request('/user', token);
    return data?.user || null;
  },

  /**
   * Fetch user statistics (collection counts, including Unsorted -1 and Trash -99)
   * Calls GET /user/stats
   */
  async getUserStats(token) {
    try {
      const data = await this.request('/user/stats', token);
      return data?.items || [];
    } catch (e) {
      console.warn('Failed to fetch user stats:', e);
      return [];
    }
  },

  /**
   * Fetch root and child collections, ordered hierarchically
   */
  async getCollections(token) {
    // Parallel fetch of root collections and child collections
    const [rootRes, childrenRes] = await Promise.all([
      this.request('/collections', token),
      this.request('/collections/childrens', token)
    ]);

    const rootItems = rootRes?.items || [];
    const childItems = childrenRes?.items || [];

    return this.buildCollectionHierarchy(rootItems, childItems);
  },

  /**
   * Organizes collections into a structured tree list for dropdowns
   */
  buildCollectionHierarchy(rootItems, childItems) {
    const result = [
      {
        id: 0,
        title: 'Unsorted',
        icon: '〰',
        level: 0,
        count: 0,
        parentId: null,
        hasChildren: false
      }
    ];

    // Group child collections by parent ID (normalizing numeric/string IDs)
    const childrenByParent = new Map();
    for (const child of childItems) {
      const rawPid = child.parent?.$id;
      if (rawPid !== undefined && rawPid !== null) {
        const parentId = !isNaN(Number(rawPid)) ? Number(rawPid) : rawPid;
        if (!childrenByParent.has(parentId)) {
          childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(child);
      }
    }

    const visited = new Set();

    // Recursive helper to traverse hierarchy
    function addCollection(coll, level = 0, parentId = null) {
      if (!coll || coll._id === undefined) return;
      const lookupId = !isNaN(Number(coll._id)) ? Number(coll._id) : coll._id;
      if (visited.has(lookupId)) return;
      visited.add(lookupId);

      let icon = '📁';
      if (coll.icon && typeof coll.icon === 'string') {
        const trimmed = coll.icon.trim();
        // Use clean emoji or non-URL string icon. External image URLs stall network, so fall back cleanly to 📁
        if (
          trimmed &&
          !trimmed.startsWith('http://') &&
          !trimmed.startsWith('https://') &&
          !trimmed.startsWith('data:') &&
          !trimmed.startsWith('blob:') &&
          !trimmed.startsWith('/')
        ) {
          icon = trimmed;
        }
      }

      const children = childrenByParent.get(lookupId) || [];
      const hasChildren = children.length > 0;

      const normParentId = (parentId !== null && parentId !== undefined && !isNaN(Number(parentId)))
        ? Number(parentId)
        : parentId;

      result.push({
        id: lookupId,
        title: coll.title || 'Untitled Collection',
        icon: icon,
        level: level,
        count: coll.count || 0,
        color: coll.color || null,
        shared: Boolean(coll.collaborators || (coll.access && coll.access.level > 1) || coll.public),
        parentId: normParentId,
        hasChildren: hasChildren
      });

      if (hasChildren) {
        // Sort children alphabetically
        const sortedChildren = [...children].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        for (const child of sortedChildren) {
          addCollection(child, level + 1, lookupId);
        }
      }
    }

    // Sort root collections by sort index or title
    const sortedRoots = [...rootItems].sort((a, b) => {
      if (a.sort !== undefined && b.sort !== undefined && a.sort !== b.sort) {
        return a.sort - b.sort;
      }
      return (a.title || '').localeCompare(b.title || '');
    });

    for (const root of sortedRoots) {
      addCollection(root, 0, null);
    }

    // Include any orphaned child collections at root level so they are not lost
    for (const child of childItems) {
      const childLookupId = !isNaN(Number(child._id)) ? Number(child._id) : child._id;
      if (!visited.has(childLookupId)) {
        addCollection(child, 0, null);
      }
    }

    return result;
  },

  /**
   * Fetch all tags across all collections with counts for autocompletion
   * Calls GET /tags/0 to get all user tags
   */
  async getTags(token) {
    const data = await this.request('/tags/0', token);
    const items = data?.items || [];
    return items.map(item => {
      if (typeof item === 'string') {
        return { tag: item, count: 0 };
      }
      return {
        tag: item._id || item.tag || '',
        count: typeof item.count === 'number' ? item.count : 0
      };
    }).filter(t => Boolean(t.tag));
  },

  /**
   * Group and filter tags into 'Recent' and 'Other' sections for the dropdown
   */
  groupTagsForDropdown(query = '', selectedTags = [], recentTags = [], allTags = []) {
    const selectedSet = new Set(
      (selectedTags || [])
        .map(t => String(t).trim().replace(/^#+/, '').toLowerCase())
        .filter(Boolean)
    );
    const q = (query || '').trim().replace(/^#+/, '').toLowerCase();

    // Fast count lookup map from allTags
    const countMap = new Map();
    for (const item of allTags || []) {
      const rawName = typeof item === 'string' ? item : item?.tag;
      const count = typeof item === 'object' && typeof item?.count === 'number' ? item.count : 0;
      if (rawName) {
        const cleanName = String(rawName).trim().replace(/^#+/, '');
        if (cleanName) {
          countMap.set(cleanName.toLowerCase(), { tag: cleanName, count });
        }
      }
    }

    // 1. Add Tag Option if query is non-empty and not already selected
    let addTagOption = null;
    if (q.length > 0 && !selectedSet.has(q)) {
      addTagOption = (query || '').trim().replace(/^#+/, '');
    }

    // 2. Recent tags matching query
    const recentMatches = [];
    const recentSeen = new Set();
    for (const rTag of recentTags || []) {
      const cleanR = String(rTag).trim().replace(/^#+/, '');
      const lowerR = cleanR.toLowerCase();
      if (!cleanR || selectedSet.has(lowerR) || recentSeen.has(lowerR)) continue;
      if (!q || lowerR.includes(q)) {
        recentSeen.add(lowerR);
        const count = countMap.has(lowerR) ? countMap.get(lowerR).count : 0;
        recentMatches.push({ tag: cleanR, count });
      }
    }

    // 3. Other tags matching query (sorted by count descending, then alphabetical)
    const sortedAll = [...(allTags || [])].sort((a, b) => {
      const countA = typeof a === 'object' && typeof a?.count === 'number' ? a.count : 0;
      const countB = typeof b === 'object' && typeof b?.count === 'number' ? b.count : 0;
      if (countB !== countA) return countB - countA;
      const nameA = typeof a === 'string' ? a : (a?.tag || '');
      const nameB = typeof b === 'string' ? b : (b?.tag || '');
      const cleanA = String(nameA).trim().replace(/^#+/, '');
      const cleanB = String(nameB).trim().replace(/^#+/, '');
      return cleanA.localeCompare(cleanB);
    });

    const otherMatches = [];
    for (const item of sortedAll) {
      const rawName = typeof item === 'string' ? item : item?.tag;
      const count = typeof item === 'object' && typeof item?.count === 'number' ? item.count : 0;
      if (!rawName) continue;
      const cleanName = String(rawName).trim().replace(/^#+/, '');
      const lower = cleanName.toLowerCase();
      if (!cleanName || selectedSet.has(lower) || recentSeen.has(lower)) continue;
      if (!q || lower.includes(q)) {
        otherMatches.push({ tag: cleanName, count });
      }
    }

    return {
      addTagOption,
      recentMatches: recentMatches.slice(0, 10),
      otherMatches: otherMatches.slice(0, 30)
    };
  },

  /**
   * Create a new collection
   */
  async createCollection(token, title) {
    if (!title || !title.trim()) {
      throw new RaindropAPIError('Collection title is required.', 400);
    }
    const res = await this.request('/collection', token, {
      method: 'POST',
      body: {
        title: title.trim(),
        view: 'list'
      }
    });
    return res?.item || null;
  },

  /**
   * Create a new bookmark (Raindrop)
   */
  async createRaindrop(token, { url, title, excerpt = '', note = '', tags = [], important = false, reminder = null, collectionId = 0 }) {
    if (!url) {
      throw new RaindropAPIError('URL is required to save bookmark.', 400);
    }

    const targetCollectionId = (collectionId !== undefined && collectionId !== null && !isNaN(Number(collectionId)))
      ? Number(collectionId)
      : 0;

    const cleanTags = Array.isArray(tags)
      ? Array.from(new Set(tags.map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean)))
      : [];

    const payload = {
      link: url,
      title: title || url,
      excerpt: excerpt || note || '',
      note: note || '',
      important: Boolean(important),
      tags: cleanTags,
      collection: {
        $id: targetCollectionId
      },
      pleaseParse: {}
    };

    if (reminder) {
      payload.reminder = typeof reminder === 'object' && reminder?.date
        ? reminder
        : { date: new Date(Date.now() + 86400000).toISOString() };
    }

    const res = await this.request('/raindrop', token, {
      method: 'POST',
      body: payload
    });

    return res?.item || null;
  },

  /**
   * Create multiple bookmarks in batch using POST /raindrops (plural)
   * Automatically chunks into batches of 100 if > 100 items.
   * Strictly filters to http(s) URLs and deduplicates within the batch.
   */
  async createRaindropsBatch(token, items) {
    if (!token) throw new RaindropAPIError('API token required.', 401);
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { result: true, items: [] };
    }

    const seenLinks = new Set();
    const formattedItems = [];

    for (const item of items) {
      if (!item) continue;
      const rawLink = item.link || item.url;
      if (!rawLink || typeof rawLink !== 'string') continue;
      const cleanLink = rawLink.trim();
      if (!cleanLink.startsWith('http://') && !cleanLink.startsWith('https://')) {
        continue; // Only valid web URLs
      }
      if (seenLinks.has(cleanLink)) {
        continue; // Deduplicate within batch
      }
      seenLinks.add(cleanLink);

      const targetCollectionId = item.collection?.$id !== undefined
        ? Number(item.collection.$id)
        : ((item.collectionId !== undefined && item.collectionId !== null && !isNaN(Number(item.collectionId))) ? Number(item.collectionId) : 0);

      const cleanTags = Array.isArray(item.tags)
        ? Array.from(new Set(item.tags.map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean)))
        : [];

      const payload = {
        link: cleanLink,
        title: item.title || cleanLink,
        excerpt: item.excerpt || '',
        note: item.note || '',
        important: Boolean(item.important),
        tags: cleanTags,
        collection: {
          $id: targetCollectionId
        },
        pleaseParse: item.pleaseParse || {}
      };

      if (item.reminder) {
        payload.reminder = typeof item.reminder === 'object' && item.reminder?.date
          ? item.reminder
          : { date: new Date(Date.now() + 86400000).toISOString() };
      }

      formattedItems.push(payload);
    }

    if (formattedItems.length === 0) {
      return { result: true, items: [] };
    }

    const BATCH_SIZE = 100;
    const allSavedItems = [];

    for (let i = 0; i < formattedItems.length; i += BATCH_SIZE) {
      const chunk = formattedItems.slice(i, i + BATCH_SIZE);
      const res = await this.request('/raindrops', token, {
        method: 'POST',
        body: { items: chunk }
      });
      if (res?.items && Array.isArray(res.items)) {
        allSavedItems.push(...res.items);
      } else {
        allSavedItems.push(...chunk);
      }
    }

    return { result: true, items: allSavedItems };
  },

  /**
   * Check if a URL is already bookmarked using official POST /import/url/exists
   * and GET /raindrop/{id}.
   * Handles result: false as a valid "not found" response specifically for this endpoint.
   */
  async checkUrl(token, url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return null;
    }

    try {
      const res = await this.request('/import/url/exists', token, {
        method: 'POST',
        body: { urls: [cleanUrl] },
        allowResultFalse: true
      });

      const ids = Array.isArray(res?.ids) ? res.ids : [];
      if (ids.length === 0 || !ids[0]) {
        return null;
      }

      const raindropRes = await this.request(`/raindrop/${ids[0]}`, token);
      return raindropRes?.item || null;
    } catch (e) {
      if (e.status === 401) throw e;
      console.warn('checkUrl error:', e);
      return null;
    }
  },

  /**
   * Bulk check existence of multiple URLs using official POST /import/url/exists.
   * Correlates returned bookmarks by their actual .link property (not positionally).
   */
  async checkUrlsExists(token, urls = []) {
    if (!token || !Array.isArray(urls) || urls.length === 0) {
      return new Map();
    }

    const validUrls = Array.from(new Set(
      urls
        .map(u => (typeof u === 'string' ? u.trim() : ''))
        .filter(u => u.startsWith('http://') || u.startsWith('https://'))
    ));

    if (validUrls.length === 0) {
      return new Map();
    }

    try {
      const res = await this.request('/import/url/exists', token, {
        method: 'POST',
        body: { urls: validUrls },
        allowResultFalse: true
      });

      const ids = Array.isArray(res?.ids) ? res.ids : [];
      const linkMap = new Map();
      if (ids.length === 0) {
        return linkMap;
      }

      const BATCH = 20;
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const fetched = await Promise.all(
          slice.map(id => this.request(`/raindrop/${id}`, token).catch(() => null))
        );
        for (const itemRes of fetched) {
          const item = itemRes?.item;
          if (item && item.link) {
            linkMap.set(item.link.trim(), item);
          }
        }
      }

      return linkMap;
    } catch (e) {
      console.warn('checkUrlsExists error:', e);
      return new Map();
    }
  },

  /**
   * Update an existing bookmark
   */
  async updateRaindrop(token, id, { url, title, excerpt = '', note = '', tags = [], important = false, reminder = null, collectionId = 0 }) {
    if (!id) throw new RaindropAPIError('Bookmark ID required for update.', 400);

    const cleanTags = Array.isArray(tags)
      ? Array.from(new Set(tags.map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean)))
      : [];

    const targetCollectionId = (collectionId !== undefined && collectionId !== null && !isNaN(Number(collectionId)))
      ? Number(collectionId)
      : 0;

    const payload = {
      link: url,
      title: title || url,
      excerpt: excerpt || note || '',
      note: note || '',
      important: Boolean(important),
      tags: cleanTags,
      collection: {
        $id: targetCollectionId
      }
    };

    if (reminder !== undefined) {
      if (reminder && typeof reminder === 'object' && reminder.date) {
        payload.reminder = reminder;
      } else if (reminder) {
        payload.reminder = { date: new Date(Date.now() + 86400000).toISOString() };
      } else {
        payload.reminder = null;
      }
    }

    const res = await this.request(`/raindrop/${id}`, token, {
      method: 'PUT',
      body: payload
    });

    return res?.item || null;
  },

  /**
   * Delete a bookmark
   */
  async deleteRaindrop(token, id) {
    if (!id) return false;
    await this.request(`/raindrop/${id}`, token, { method: 'DELETE' });
    return true;
  }
};

// Export to global scope for extension contexts (window, self, worker), and module for testing
const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
globalScope.RaindropStorage = RaindropStorage;
globalScope.RaindropAPI = RaindropAPI;
globalScope.RaindropAPIError = RaindropAPIError;

if (typeof window !== 'undefined') {
  window.RaindropStorage = RaindropStorage;
  window.RaindropAPI = RaindropAPI;
  window.RaindropAPIError = RaindropAPIError;
}
if (typeof self !== 'undefined') {
  self.RaindropStorage = RaindropStorage;
  self.RaindropAPI = RaindropAPI;
  self.RaindropAPIError = RaindropAPIError;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RaindropStorage, RaindropAPI, RaindropAPIError };
}

