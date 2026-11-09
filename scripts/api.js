/**
 * Raindrop.io REST API Client for Manifest V3 Extension
 */

const API_BASE = 'https://api.raindrop.io/rest/v1';

const RaindropStorage = {
  async getToken() {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    try {
      const data = await chrome.storage.sync.get(['raindrop_token']);
      if (data && data.raindrop_token) {
        return data.raindrop_token.trim();
      }
    } catch (e) {
      console.warn('Sync storage read failed, falling back to local:', e);
    }
    try {
      const localData = await chrome.storage.local.get(['raindrop_token']);
      return localData?.raindrop_token ? localData.raindrop_token.trim() : null;
    } catch (e) {
      return null;
    }
  },

  async setToken(token) {
    let cleanToken = (token || '').trim();
    cleanToken = cleanToken.replace(/^["']|["']$/g, '').trim();
    if (cleanToken.toLowerCase().startsWith('bearer ')) {
      cleanToken = cleanToken.slice(7).trim();
    }

    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      await chrome.storage.sync.set({ raindrop_token: cleanToken });
    } catch (e) {
      console.warn('Sync storage write failed, falling back to local:', e);
    }
    try {
      await chrome.storage.local.set({ raindrop_token: cleanToken });
    } catch (e) {
      // ignore
    }
  },

  async clearToken() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      await chrome.storage.sync.remove(['raindrop_token', 'raindrop_user']);
    } catch (e) {
      // ignore
    }
    try {
      await chrome.storage.local.remove(['raindrop_token', 'raindrop_user']);
    } catch (e) {
      // ignore
    }
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
      response = await fetch(url, { ...options, headers });
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

    if (data && data.result === false) {
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
   * Fetch root and child collections, ordered hierarchically
   */
  async getCollections(token) {
    // Parallel fetch of root collections and child collections
    const [rootRes, childrenRes] = await Promise.all([
      this.request('/collections', token).catch(err => {
        console.warn('Failed to fetch root collections:', err);
        return { items: [] };
      }),
      this.request('/collections/childrens', token).catch(err => {
        console.warn('Failed to fetch child collections:', err);
        return { items: [] };
      })
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
        icon: '📥',
        level: 0,
        count: 0
      }
    ];

    // Group child collections by parent ID
    const childrenByParent = new Map();
    for (const child of childItems) {
      const parentId = child.parent?.$id;
      if (parentId !== undefined && parentId !== null) {
        if (!childrenByParent.has(parentId)) {
          childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(child);
      }
    }

    const visited = new Set();

    // Recursive helper to traverse hierarchy
    function addCollection(coll, level = 0) {
      if (!coll || coll._id === undefined || visited.has(coll._id)) return;
      visited.add(coll._id);

      let icon = '📁';
      if (coll.cover && Array.isArray(coll.cover) && coll.cover[0]) {
        icon = coll.cover[0];
      } else if (typeof coll.cover === 'string' && coll.cover) {
        icon = coll.cover;
      } else if (coll.public) {
        icon = '🌐';
      }

      result.push({
        id: coll._id,
        title: coll.title || 'Untitled Collection',
        icon: icon,
        level: level,
        count: coll.count || 0,
        color: coll.color || null,
        shared: Boolean(coll.collaborators || (coll.access && coll.access.level > 1) || coll.public)
      });

      const children = childrenByParent.get(coll._id);
      if (children && children.length > 0) {
        // Sort children alphabetically
        children.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        for (const child of children) {
          addCollection(child, level + 1);
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
      addCollection(root, 0);
    }

    // Include any orphaned child collections at root level so they are not lost
    for (const child of childItems) {
      if (!visited.has(child._id)) {
        addCollection(child, 0);
      }
    }

    return result;
  },

  /**
   * Fetch all tags across all collections with counts for autocompletion
   * Calls GET /tags/0 to get all user tags
   */
  async getTags(token) {
    try {
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
    } catch (e) {
      console.warn('Failed to fetch tags:', e);
      return [];
    }
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
  async createRaindrop(token, { url, title, excerpt = '', note = '', tags = [], important = false, collectionId = 0 }) {
    if (!url) {
      throw new RaindropAPIError('URL is required to save bookmark.', 400);
    }

    const targetCollectionId = (collectionId !== undefined && collectionId !== null && !isNaN(Number(collectionId)))
      ? Number(collectionId)
      : 0;

    const cleanTags = Array.isArray(tags)
      ? Array.from(new Set(tags.map(t => String(t).trim()).filter(Boolean)))
      : [];

    const payload = {
      link: url,
      title: title || url,
      excerpt: excerpt || note || '',
      note: note || '',
      important: Boolean(important),
      tags: cleanTags,
      collection: {
        $id: targetCollectionId >= 0 ? targetCollectionId : 0
      },
      pleaseParse: {}
    };

    const res = await this.request('/raindrop', token, {
      method: 'POST',
      body: payload
    });

    return res?.item || null;
  },

  /**
   * Check if a URL is already bookmarked
   */
  async checkUrl(token, url) {
    if (!url) return null;
    try {
      const data = await this.request(`/check/url?url=${encodeURIComponent(url)}`, token);
      return data?.item || null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Update an existing bookmark
   */
  async updateRaindrop(token, id, { url, title, excerpt = '', note = '', tags = [], important = false, collectionId = 0 }) {
    if (!id) throw new RaindropAPIError('Bookmark ID required for update.', 400);

    const cleanTags = Array.isArray(tags)
      ? Array.from(new Set(tags.map(t => String(t).trim()).filter(Boolean)))
      : [];

    const payload = {
      link: url,
      title: title || url,
      excerpt: excerpt || note || '',
      note: note || '',
      important: Boolean(important),
      tags: cleanTags,
      collection: {
        $id: Number(collectionId) >= 0 ? Number(collectionId) : 0
      }
    };

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

// Export to window for extension contexts, and module for testing
if (typeof window !== 'undefined') {
  window.RaindropStorage = RaindropStorage;
  window.RaindropAPI = RaindropAPI;
  window.RaindropAPIError = RaindropAPIError;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RaindropStorage, RaindropAPI, RaindropAPIError };
}

