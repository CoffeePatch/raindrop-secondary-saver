const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXT_DIR = __dirname;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('=== 1. MANIFEST V3 VALIDATION ===');
const manifestPath = path.join(EXT_DIR, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert(manifest.manifest_version === 3, 'manifest_version is 3');
assert(manifest.name && manifest.version && manifest.description, 'manifest has name, version, description');
assert(Array.isArray(manifest.permissions), 'permissions is array');
assert(manifest.permissions.includes('activeTab'), 'permissions includes activeTab');
assert(manifest.permissions.includes('storage'), 'permissions includes storage');
assert(manifest.permissions.includes('tabs'), 'permissions includes tabs');
assert(manifest.host_permissions && manifest.host_permissions.includes('https://api.raindrop.io/*'), 'host_permissions includes api.raindrop.io');
assert(manifest.action && manifest.action.default_popup === 'popup/popup.html', 'action.default_popup is set');
assert(manifest.options_ui && manifest.options_ui.page === 'options/options.html', 'options_ui.page is set');

console.log('\n=== 2. ICON CHECKS ===');
for (const size of ['16', '32', '48', '128']) {
  const iconRel = manifest.icons[size];
  const iconFull = path.join(EXT_DIR, iconRel);
  assert(fs.existsSync(iconFull), `Icon ${size} exists at ${iconRel}`);
  const stats = fs.statSync(iconFull);
  assert(stats.size > 0, `Icon ${size} has non-zero size (${stats.size} bytes)`);
}

console.log('\n=== 3. JAVASCRIPT SYNTAX VERIFICATION ===');
const jsFiles = [
  'scripts/api.js',
  'popup/popup.js',
  'options/options.js'
];

for (const rel of jsFiles) {
  const fullPath = path.join(EXT_DIR, rel);
  try {
    execSync(`node --check "${fullPath}"`);
    assert(true, `Syntax OK: ${rel}`);
  } catch (err) {
    assert(false, `Syntax ERROR in ${rel}: ${err.message}`);
  }
}

console.log('\n=== 4. HTML RESOURCE REFERENCE CHECKS ===');
const htmlFiles = [
  'popup/popup.html',
  'options/options.html'
];

for (const htmlRel of htmlFiles) {
  const fullHtml = path.join(EXT_DIR, htmlRel);
  assert(fs.existsSync(fullHtml), `${htmlRel} exists`);
  const content = fs.readFileSync(fullHtml, 'utf8');

  // Check stylesheet links
  const cssMatches = [...content.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)];
  for (const m of cssMatches) {
    const cssPath = path.resolve(path.dirname(fullHtml), m[1]);
    assert(fs.existsSync(cssPath), `${htmlRel} references existing CSS: ${m[1]}`);
  }

  // Check script src
  const scriptMatches = [...content.matchAll(/<script[^>]+src=["']([^"']+)["']/g)];
  for (const m of scriptMatches) {
    const scriptPath = path.resolve(path.dirname(fullHtml), m[1]);
    assert(fs.existsSync(scriptPath), `${htmlRel} references existing JS: ${m[1]}`);
  }
}

console.log('\n=== 5. UNIT TESTING COLLECTION HIERARCHY LOGIC ===');
// Mock window/chrome in-memory storage for testing
const mockSyncStorage = {};
const mockLocalStorage = {};

global.window = {};
global.chrome = {
  storage: {
    sync: {
      get: async (keys) => {
        const res = {};
        for (const k of keys) res[k] = mockSyncStorage[k];
        return res;
      },
      set: async (obj) => Object.assign(mockSyncStorage, obj),
      remove: async (keys) => {
        for (const k of keys) delete mockSyncStorage[k];
      }
    },
    local: {
      get: async (keys) => {
        const res = {};
        for (const k of keys) res[k] = mockLocalStorage[k];
        return res;
      },
      set: async (obj) => Object.assign(mockLocalStorage, obj),
      remove: async (keys) => {
        for (const k of keys) delete mockLocalStorage[k];
      }
    }
  }
};

const { RaindropAPI, RaindropStorage } = require(path.join(EXT_DIR, 'scripts/api.js'));

const mockRoots = [
  { _id: 10, title: 'Development', count: 5, sort: 1 },
  { _id: 20, title: 'Articles', count: 12, sort: 0 }
];
const mockChildren = [
  { _id: 101, title: 'Frontend', parent: { $id: 10 } },
  { _id: 102, title: 'Backend', parent: { $id: 10 } },
  { _id: 1011, title: 'React', parent: { $id: 101 } },
  { _id: 999, title: 'Orphaned Topic', parent: { $id: 7777 } } // Parent not in root/child list
];

const hierarchy = RaindropAPI.buildCollectionHierarchy(mockRoots, mockChildren);

assert(hierarchy[0].id === 0 && hierarchy[0].title === 'Unsorted', 'First item is Unsorted collection with id: 0');
assert(hierarchy.some(h => h.id === 20 && h.title === 'Articles' && h.level === 0), 'Root Articles is level 0');
assert(hierarchy.some(h => h.id === 10 && h.title === 'Development' && h.level === 0), 'Root Development is level 0');
assert(hierarchy.some(h => h.id === 101 && h.title === 'Frontend' && h.level === 1), 'Child Frontend is level 1');
assert(hierarchy.some(h => h.id === 1011 && h.title === 'React' && h.level === 2), 'Nested React is level 2');
assert(hierarchy.some(h => h.id === 999 && h.title === 'Orphaned Topic'), 'Orphaned child collection is preserved');

console.log('\n=== 6. IMAGE DIMENSION VERIFICATION ===');
try {
  const result = execSync(`python3 -c "
from PIL import Image
import os
for s in [16, 32, 48, 128]:
    im = Image.open('${EXT_DIR}/icons/icon-' + str(s) + '.png')
    assert im.size == (s, s), f'Wrong size {im.size} for {s}'
print('All image dimensions validated')
"`).toString().trim();
  assert(result === 'All image dimensions validated', 'Icon dimensions verified with Pillow');
} catch (e) {
  assert(false, `Icon dimension check failed: ${e.message}`);
}

console.log('\n=== 7. STORAGE & TOKEN SANITIZATION TESTS ===');
(async () => {
  // Test storage default collection id is 0
  const defaultCol = await RaindropStorage.getLastCollectionId();
  assert(defaultCol === 0, `Default last collection ID is 0 (got ${defaultCol})`);

  // Test setLastCollectionId
  await RaindropStorage.setLastCollectionId(101);
  const savedCol = await RaindropStorage.getLastCollectionId();
  assert(savedCol === 101, 'setLastCollectionId saves and retrieves collection 101');

  // Test token cleaning (strips quotes, leading Bearer, whitespace)
  await RaindropStorage.setToken('  "Bearer secret-token-12345"  ');
  const storedToken = await RaindropStorage.getToken();
  assert(storedToken === 'secret-token-12345', `setToken sanitizes quotes and Bearer prefix (got '${storedToken}')`);

  // Test clearToken
  await RaindropStorage.clearToken();
  const clearedToken = await RaindropStorage.getToken();
  assert(clearedToken === null, 'clearToken clears stored token');

  console.log('\n=== 8. API CLIENT EDGE CASES & VALIDATION ===');
  // Test missing URL in createRaindrop
  try {
    await RaindropAPI.createRaindrop('fake-token', { url: '' });
    assert(false, 'createRaindrop should reject empty URL');
  } catch (err) {
    assert(err.message.includes('URL is required'), 'createRaindrop correctly rejects empty URL');
  }

  // Test missing token in request
  try {
    await RaindropAPI.request('/user', null);
    assert(false, 'request should reject missing token');
  } catch (err) {
    assert(err.status === 401, 'request rejects missing token with status 401');
  }

  // Test tag parsing and deduplication
  const sampleInput = " tech, coding , , javascript , tech ";
  const parsed = Array.from(new Set(sampleInput.split(/[,]+/).map(t => t.trim()).filter(Boolean)));
  assert(parsed.length === 3 && parsed[0] === 'tech' && parsed[1] === 'coding' && parsed[2] === 'javascript', 'Tag parsing handles whitespace, empty items, and deduplication cleanly');

  // Test mock createRaindrop collection id normalization
  // Intercept request to check payload
  let interceptedPayload = null;
  const originalRequest = RaindropAPI.request;
  RaindropAPI.request = async (endpoint, token, options) => {
    interceptedPayload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    return { result: true, item: { _id: 12345 } };
  };

  // Test fallback when collectionId is 0 (Unsorted)
  await RaindropAPI.createRaindrop('token', { url: 'https://example.com', collectionId: 0 });
  assert(interceptedPayload.collection.$id === 0, 'createRaindrop with collectionId 0 sends collection.$id: 0');

  // Test collectionId -1 for Raindrop system unsorted
  await RaindropAPI.createRaindrop('token', { url: 'https://example.com', collectionId: -1 });
  assert(interceptedPayload.collection.$id === -1, 'createRaindrop with collectionId -1 sends collection.$id: -1 (Raindrop system unsorted)');

  // Test tag deduplication and leading hash stripping in createRaindrop
  await RaindropAPI.createRaindrop('token', {
    url: 'https://example.com',
    tags: ['#reading', 'web', 'reading', '#web', '   '],
    reminder: true
  });
  assert(
    interceptedPayload.tags.length === 2 &&
    interceptedPayload.tags.includes('reading') &&
    interceptedPayload.tags.includes('web'),
    'createRaindrop automatically deduplicates, strips hashes, and cleans tags'
  );
  assert(interceptedPayload.reminder && interceptedPayload.reminder.date, 'createRaindrop formats and attaches reminder payload');

  RaindropAPI.request = originalRequest;

  console.log('\n=== 9. NEW FEATURES & REVIEWS: TAGS /0, COLLECTIONS & API METHODS ===');
  // Test getTags calls /tags/0 and parses objects with count
  let requestedEndpoint = null;
  RaindropAPI.request = async (endpoint, token, options) => {
    requestedEndpoint = endpoint;
    if (endpoint === '/tags/0') {
      return {
        result: true,
        items: [
          { _id: 'javascript', count: 18 },
          { _id: 'reading', count: 5 },
          'legacy-tag',
          { _id: '', count: 0 }
        ]
      };
    }
    if (endpoint === '/user/stats') {
      return {
        result: true,
        items: [
          { _id: 0, count: 120 },
          { _id: -1, count: 42 },
          { _id: -99, count: 8 }
        ]
      };
    }
    if (endpoint === '/collection') {
      const parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return { result: true, item: { _id: 888, title: parsedBody ? parsedBody.title : '' } };
    }
    if (endpoint.startsWith('/check/url')) {
      return { result: true, item: { _id: 9999, title: 'Already Saved Page', cover: 'https://example.com/cover.jpg', reminder: { date: '2026-11-10T12:00:00Z' } } };
    }
    if (endpoint.startsWith('/raindrop/9999') && options.method === 'PUT') {
      const parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return { result: true, item: { _id: 9999, ...parsedBody } };
    }
    if (endpoint.startsWith('/raindrop/9999') && options.method === 'DELETE') {
      return { result: true };
    }
    return { result: true };
  };

  const fetchedTags = await RaindropAPI.getTags('test-token');
  assert(requestedEndpoint === '/tags/0', 'getTags calls GET /tags/0 to fetch all user tags');
  assert(fetchedTags.length === 3, 'getTags filters out empty tags');
  assert(fetchedTags[0].tag === 'javascript' && fetchedTags[0].count === 18, 'getTags parses tag name and count badge correctly');
  assert(fetchedTags[1].tag === 'reading' && fetchedTags[1].count === 5, 'getTags parses count 5 for reading');
  assert(fetchedTags[2].tag === 'legacy-tag' && fetchedTags[2].count === 0, 'getTags safely handles plain string tags');

  // Test getUserStats
  const stats = await RaindropAPI.getUserStats('test-token');
  assert(Array.isArray(stats) && stats.length === 3, 'getUserStats calls GET /user/stats and returns items');
  const unsortedStat = stats.find(s => s._id === -1);
  const trashStat = stats.find(s => s._id === -99);
  assert(unsortedStat && unsortedStat.count === 42, 'getUserStats returns accurate Unsorted count (_id: -1)');
  assert(trashStat && trashStat.count === 8, 'getUserStats returns accurate Trash count (_id: -99)');

  // Test Tag Autocomplete Helper logic (handling of # and multiple tags without overwrite)
  function testTagInsertion(existingValue, tagToAdd) {
    const cleanTag = tagToAdd.trim().replace(/^#+/, '');
    const raw = existingValue;
    const parts = raw.split(',');
    if (parts.length > 0 && parts[parts.length - 1].trim().length > 0) {
      parts[parts.length - 1] = cleanTag;
    } else {
      parts.push(cleanTag);
    }
    return parts.map(p => p.trim().replace(/^#+/, '')).filter(Boolean).join(', ') + ', ';
  }

  const tagResult1 = testTagInsertion('design, ', 'web');
  assert(tagResult1 === 'design, web, ', 'Tag insertion appends when input ends with comma without overwriting prior tags');

  const tagResult2 = testTagInsertion('design, we', 'web');
  assert(tagResult2 === 'design, web, ', 'Tag insertion replaces partial token being typed');

  const tagResult3 = testTagInsertion('#code, #java', '#javascript');
  assert(tagResult3 === 'code, javascript, ', 'Tag insertion cleanly strips leading hashes and replaces partial word');

  // Test createCollection
  const newCol = await RaindropAPI.createCollection('test-token', 'Design System');
  assert(newCol._id === 888 && newCol.title === 'Design System', 'createCollection sends POST /collection and returns new collection');

  try {
    await RaindropAPI.createCollection('test-token', '   ');
    assert(false, 'createCollection should reject blank title');
  } catch (e) {
    assert(e.message.includes('title is required'), 'createCollection correctly validates non-empty title');
  }

  // Test checkUrl
  const existing = await RaindropAPI.checkUrl('test-token', 'https://github.com');
  assert(existing && existing._id === 9999, 'checkUrl correctly returns existing raindrop item');
  const nullCheck = await RaindropAPI.checkUrl('test-token', null);
  assert(nullCheck === null, 'checkUrl with null returns null safely');

  // Test updateRaindrop
  const updated = await RaindropAPI.updateRaindrop('test-token', 9999, {
    url: 'https://github.com',
    title: 'Updated Title',
    collectionId: 456
  });
  assert(updated && updated.title === 'Updated Title', 'updateRaindrop updates existing raindrop');

  // Test deleteRaindrop
  const deleted = await RaindropAPI.deleteRaindrop('test-token', 9999);
  assert(deleted === true, 'deleteRaindrop successfully calls DELETE /raindrop/:id');

  RaindropAPI.request = originalRequest;

  console.log('\n=== 10. POPUP UI STRUCTURE VALIDATION (Screenshots 1-4 parity) ===');
  const popupHtml = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.html'), 'utf8');

  // View 1 checks
  assert(popupHtml.includes('id="viewMain"'), 'popup.html contains View 1 (#viewMain)');
  assert(popupHtml.includes('class="brand-cloud"'), 'popup.html contains blue cloud brand icon');
  assert(popupHtml.includes('id="headerStatusTitle"'), 'popup.html contains header status title');
  assert(popupHtml.includes('Edit</span>') || popupHtml.includes('Saved</span>'), 'popup.html header status displays Edit/Saved');
  assert(popupHtml.includes('id="aiSparkleBtn"'), 'popup.html contains AI sparkle button');
  assert(popupHtml.includes('id="headerSearchBtn"'), 'popup.html contains search icon button');
  assert(popupHtml.includes('id="userDropdownMenu"'), 'popup.html contains user avatar dropdown menu');
  assert(popupHtml.includes('id="thumbnailWrapper"'), 'popup.html contains page thumbnail wrapper');
  assert(popupHtml.includes('id="bookmarkTitle"'), 'popup.html contains editable title textarea');
  assert(popupHtml.includes('id="bookmarkExcerpt"'), 'popup.html contains editable excerpt textarea');
  assert(popupHtml.includes('id="bookmarkNote"'), 'popup.html contains note textarea');
  assert(popupHtml.includes('class="markdown-badge"'), 'popup.html contains markdown badge (M↓)');
  assert(popupHtml.includes('id="collectionPillBtn"'), 'popup.html contains collection selector pill');
  assert(popupHtml.includes('id="pillIcon"') && popupHtml.includes('〰</span>'), 'popup.html collection pill defaults to Unsorted icon 〰');
  assert(popupHtml.includes('id="bookmarkTagsInput"'), 'popup.html contains tags input');
  assert(popupHtml.includes('id="tagsAutocompleteDropdown"'), 'popup.html contains custom autocomplete dropdown (not datalist)');
  assert(popupHtml.includes('id="bookmarkUrl"'), 'popup.html contains URL row');
  assert(popupHtml.includes('id="heartBtn"'), 'popup.html contains heart favorite toggle');
  assert(popupHtml.includes('id="reminderBellBtn"'), 'popup.html contains reminder bell toggle');
  assert(popupHtml.includes('id="highlightsBtn"'), 'popup.html contains Highlights button');
  assert(popupHtml.includes('id="openTabsViewBtn"'), 'popup.html contains Tabs button');
  assert(popupHtml.includes('id="deleteBookmarkBtn"'), 'popup.html contains Delete button');
  assert(popupHtml.includes('id="saveBookmarkBtn"'), 'popup.html contains Gold Save button');

  // View 2 checks
  assert(popupHtml.includes('id="viewCollection"'), 'popup.html contains View 2 (#viewCollection)');
  assert(popupHtml.includes('id="backFromCollectionBtn"'), 'popup.html contains back button in collection view');
  assert(popupHtml.includes('id="collectionSearchInput"'), 'popup.html contains collection search input');
  assert(popupHtml.includes('id="specialCollectionsGroup"'), 'popup.html contains specialCollectionsGroup wrapper for search filtering');
  assert(popupHtml.includes('data-id="0"') && popupHtml.includes('Unsorted'), 'popup.html contains special collection Unsorted (id 0)');
  assert(popupHtml.includes('data-id="-99"') && popupHtml.includes('Trash'), 'popup.html contains special collection Trash (id -99)');
  assert(popupHtml.includes('id="sectionLabelRow"'), 'popup.html contains sectionLabelRow divider');
  assert(popupHtml.includes('id="userCollectionsList"'), 'popup.html contains user collections list container');
  assert(popupHtml.includes('id="createNewCollectionItem"'), 'popup.html contains create new collection item');

  // View 3 checks
  assert(popupHtml.includes('id="viewTabs"'), 'popup.html contains View 3 (#viewTabs)');
  assert(popupHtml.includes('id="backFromTabsBtn"'), 'popup.html contains back button in save tabs view');
  assert(popupHtml.includes('id="selectAllTabsCheckbox"'), 'popup.html contains select all tabs checkbox');
  assert(popupHtml.includes('id="openTabsList"'), 'popup.html contains scrollable open tabs list');
  assert(popupHtml.includes('id="tabsCollectionPillBtn"'), 'popup.html contains collection pill in tabs view');
  assert(popupHtml.includes('id="tabsTagsInput"'), 'popup.html contains date-prefilled tags input');
  assert(popupHtml.includes('id="closeTabsCheckbox"'), 'popup.html contains Close tabs checkbox');
  assert(popupHtml.includes('id="executeSaveTabsBtn"'), 'popup.html contains gold Save tabs action button');

  // Tabs pluralization logic check
  const formatTabCount = (count) => `${count} ${count === 1 ? 'tab' : 'tabs'}`;
  assert(formatTabCount(1) === '1 tab', 'Tab count formatter handles singular 1 tab');
  assert(formatTabCount(4) === '4 tabs', 'Tab count formatter handles plural 4 tabs');

  // View 4 checks
  assert(popupHtml.includes('id="viewSettings"'), 'popup.html contains View 4 (#viewSettings modal)');
  assert(popupHtml.includes('id="settingsTokenInput"'), 'popup.html contains personal access token input');
  assert(popupHtml.includes('id="submitTokenBtn"'), 'popup.html contains token verify & connect button');

  // CSS Checks
  const popupCss = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.css'), 'utf8');
  assert(popupCss.includes('--bg-primary: #1e2022') || popupCss.includes('#1e2022'), 'CSS includes primary background #1e2022');
  assert(popupCss.includes('--bg-secondary: #232528') || popupCss.includes('#232528'), 'CSS includes card background #232528');
  assert(popupCss.includes('--bg-input: #2a2c30') || popupCss.includes('#2a2c30'), 'CSS includes input background #2a2c30');
  assert(popupCss.includes('--accent-gold: #d4b476') || popupCss.includes('#d4b476'), 'CSS includes gold accent #d4b476');
  assert(popupCss.includes('.tags-dropdown'), 'CSS includes .tags-dropdown custom autocomplete styling');
  assert(popupCss.includes('.collection-pill-btn'), 'CSS includes .collection-pill-btn styling');
  assert(popupCss.includes('.save-gold-btn'), 'CSS includes .save-gold-btn styling');

  console.log('\n=== 11. TAG CHIPS COMPONENT, RECENT TAGS PERSISTENCE & DROPDOWN GROUPING ===');
  // 1. Test Recent Tags Persistence in RaindropStorage
  const initialRecent = await RaindropStorage.getRecentTags();
  assert(Array.isArray(initialRecent) && initialRecent.length === 0, 'RaindropStorage.getRecentTags defaults to empty array');

  await RaindropStorage.setRecentTags(['IFTTT', 'YouTube', 'reading']);
  const savedRecent = await RaindropStorage.getRecentTags();
  assert(savedRecent.length === 3 && savedRecent[0] === 'IFTTT', 'RaindropStorage.setRecentTags saves recent tags');

  // Test addRecentTags puts new tag first, strips #, and deduplicates case-insensitively
  await RaindropStorage.addRecentTags(['#10/30/2026', 'YOUTUBE', 'towatch']);
  const updatedRecent = await RaindropStorage.getRecentTags();
  assert(updatedRecent[0] === '10/30/2026', 'addRecentTags places newest tags at front and strips #');
  assert(updatedRecent.includes('towatch'), 'addRecentTags includes new towatch tag');
  assert(updatedRecent.filter(t => t.toLowerCase() === 'youtube').length === 1, 'addRecentTags deduplicates existing tags case-insensitively');

  // 2. Test Dropdown Grouping (RaindropAPI.groupTagsForDropdown)
  const mockAllTags = [
    { tag: 'javascript', count: 18 },
    { tag: '2/8/2025', count: 7 },
    { tag: '4/6/2025', count: 5 },
    { tag: 'IFTTT', count: 12 },
    { tag: 'archive', count: 1 }
  ];
  const mockRecentTags = ['IFTTT', 'YouTube', '10/30/2026', 'towatch', 'today'];

  // Test grouping when query is empty: shows Recent and Other sections, no Add tag option
  const groupedEmpty = RaindropAPI.groupTagsForDropdown('', [], mockRecentTags, mockAllTags);
  assert(groupedEmpty.addTagOption === null, 'Dropdown with empty query has no addTagOption');
  assert(groupedEmpty.recentMatches.length === 5, 'Dropdown includes all recent tags under Recent group');
  assert(groupedEmpty.recentMatches[0].tag === 'IFTTT' && groupedEmpty.recentMatches[0].count === 12, 'Recent tags map usage counts from allTags if available');
  assert(groupedEmpty.otherMatches.every(o => !mockRecentTags.map(r => r.toLowerCase()).includes(o.tag.toLowerCase())), 'Other group excludes tags already present in Recent group');
  assert(groupedEmpty.otherMatches[0].tag === 'javascript' && groupedEmpty.otherMatches[0].count === 18, 'Other group is sorted by usage count descending');

  // Test grouping when typing a query
  const groupedQuery = RaindropAPI.groupTagsForDropdown('jav', [], mockRecentTags, mockAllTags);
  assert(groupedQuery.addTagOption === 'jav', 'Dropdown displays + Add tag option matching query');
  assert(groupedQuery.otherMatches.length === 1 && groupedQuery.otherMatches[0].tag === 'javascript', 'Dropdown filters Other group matching query');

  // Test exclusion of already-selected chips
  const groupedSelected = RaindropAPI.groupTagsForDropdown('', ['IFTTT', 'javascript'], mockRecentTags, mockAllTags);
  assert(!groupedSelected.recentMatches.some(r => r.tag.toLowerCase() === 'ifttt'), 'Dropdown excludes already selected chips from Recent');
  assert(!groupedSelected.otherMatches.some(o => o.tag.toLowerCase() === 'javascript'), 'Dropdown excludes already selected chips from Other');

  // Test Add tag option omitted when query exactly matches an already-selected chip
  const groupedExact = RaindropAPI.groupTagsForDropdown('ifttt', ['IFTTT'], mockRecentTags, mockAllTags);
  assert(groupedExact.addTagOption === null, 'Add tag option omitted when query is already selected as a chip');

  // 3. Test Interactive Tag Chips Component (Creation, Deletion, Date tag prefill)
  function createMockElement(tag = 'div') {
    let _className = '';
    const classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); _className = Array.from(this._classes).join(' '); },
      remove(c) { this._classes.delete(c); _className = Array.from(this._classes).join(' '); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) {
          this._classes.add(c);
        } else {
          this._classes.delete(c);
        }
        _className = Array.from(this._classes).join(' ');
      }
    };
    const el = {
      tagName: tag.toUpperCase(),
      classList,
      dataset: {},
      children: [],
      childNodes: [],
      value: '',
      placeholder: '',
      textContent: '',
      innerHTML: '',
      listeners: {},
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      dispatchEvent(event) {
        const list = this.listeners[event.type] || [];
        for (const fn of list) fn(event);
      },
      click() {
        if (this.listeners['click']) {
          for (const fn of this.listeners['click']) fn({ type: 'click', target: this, stopPropagation: () => {} });
        }
      },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        this.childNodes.push(child);
        return child;
      },
      insertBefore(child, ref) {
        child.parentElement = this;
        const idx = this.children.indexOf(ref);
        if (idx === -1) {
          this.children.push(child);
        } else {
          this.children.splice(idx, 0, child);
        }
        this.childNodes = [...this.children];
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          this.children.splice(idx, 1);
          child.parentElement = null;
        }
        this.childNodes = [...this.children];
        return child;
      },
      remove() {
        if (this.parentElement) {
          this.parentElement.removeChild(this);
        }
      },
      querySelectorAll(selector) {
        const matches = [];
        function walk(node) {
          for (const child of node.children || []) {
            if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
              matches.push(child);
            }
            walk(child);
          }
        }
        walk(this);
        return matches;
      },
      closest(sel) {
        if (sel.startsWith('.') && this.classList.contains(sel.slice(1))) return this;
        return null;
      },
      contains(other) {
        if (this === other) return true;
        for (const ch of this.children || []) {
          if (ch === other || (ch.contains && ch.contains(other))) return true;
        }
        return false;
      },
      focus() { this.focused = true; },
      blur() { this.focused = false; }
    };
    Object.defineProperty(el, 'className', {
      get() { return _className; },
      set(val) {
        _className = val || '';
        classList._classes = new Set(_className.split(/\s+/).filter(Boolean));
      }
    });
    return el;
  }

  const mockDoc = {
    createElement(t) { return createMockElement(t); },
    addEventListener() {}
  };

  const { TagChipsComponent } = require(path.join(EXT_DIR, 'popup/popup.js'));
  assert(typeof TagChipsComponent === 'function', 'TagChipsComponent is exported and defined');

  // Setup mock container and input
  const mockContainer = createMockElement('div');
  const mockInput = createMockElement('input');
  mockContainer.appendChild(mockInput);
  const mockDropdown = createMockElement('div');
  mockDropdown.classList.add('hidden');
  const mockDropdownList = createMockElement('div');

  let changeFired = false;
  const chipComponent = new TagChipsComponent({
    container: mockContainer,
    input: mockInput,
    dropdown: mockDropdown,
    dropdownList: mockDropdownList,
    placeholder: 'Add tags...',
    onChange: () => { changeFired = true; },
    getAllTags: () => mockAllTags,
    getRecentTags: () => mockRecentTags,
    doc: mockDoc
  });

  // Verify initial state
  assert(chipComponent.getTags().length === 0, 'TagChipsComponent starts with empty tags');
  assert(mockInput.placeholder === 'Add tags...', 'TagChipsComponent starts with Add tags... placeholder');

  // Test chip creation
  chipComponent.addTag('IFTTT');
  assert(chipComponent.getTags().length === 1 && chipComponent.getTags()[0] === 'IFTTT', 'addTag adds IFTTT chip');
  assert(changeFired === true, 'addTag triggers onChange callback');
  changeFired = false;

  const renderedChips = mockContainer.querySelectorAll('.tag-chip');
  assert(renderedChips.length === 1, 'tag-chip DOM element is rendered inside container');
  assert(renderedChips[0].dataset.tag === 'IFTTT', 'rendered chip has dataset.tag set to IFTTT');
  assert(mockInput.placeholder === '', 'placeholder is cleared when chips are present');

  // Verify chip internal structure (✕ remove button and text)
  const removeButtons = renderedChips[0].querySelectorAll('.tag-chip-remove');
  const textSpans = renderedChips[0].querySelectorAll('.tag-chip-text');
  assert(removeButtons.length === 1 && removeButtons[0].textContent === '✕', 'tag chip contains ✕ remove button');
  assert(textSpans.length === 1 && textSpans[0].textContent === 'IFTTT', 'tag chip contains tag name text');

  // Test deduplication: adding existing tag does nothing
  chipComponent.addTag('ifttt');
  assert(chipComponent.getTags().length === 1, 'addTag ignores case-insensitive duplicate');

  // Test Save Tabs View requirement: Date tag as a removable chip (#11/9/2026)
  chipComponent.clear();
  assert(chipComponent.getTags().length === 0, 'clear empties all chips');
  assert(mockContainer.querySelectorAll('.tag-chip').length === 0, 'clear removes all chip elements from DOM');

  chipComponent.setTags(['#11/9/2026']);
  const dateChips = mockContainer.querySelectorAll('.tag-chip');
  assert(dateChips.length === 1 && dateChips[0].dataset.tag === '#11/9/2026', 'Save Tabs: date tag is created as a removable chip (#11/9/2026)');

  // Test 1-click chip deletion via chip click
  dateChips[0].click();
  assert(chipComponent.getTags().length === 0, '1-click removal: clicking tag chip deletes it');
  assert(mockContainer.querySelectorAll('.tag-chip').length === 0, '1-click removal: chip element removed from DOM');

  // Test 1-click chip deletion via direct remove button click
  chipComponent.setTags(['direct-remove-test']);
  const directChip = mockContainer.querySelectorAll('.tag-chip')[0];
  const directRemoveBtn = directChip.querySelectorAll('.tag-chip-remove')[0];
  directRemoveBtn.click();
  assert(chipComponent.getTags().length === 0, '1-click removal: clicking ✕ remove button directly deletes it');

  // Test comma-separated addTag
  chipComponent.addTag('tag-a, tag-b');
  assert(chipComponent.getTags().length === 2 && chipComponent.getTags()[1] === 'tag-b', 'addTag handles comma-separated string');

  // Test keyboard Enter on empty input does not add random recent tag
  chipComponent.clear();
  chipComponent.renderDropdown();
  const enterOnEmptyEvent = { key: 'Enter', preventDefault() {} };
  mockInput.value = '';
  chipComponent.handleKeydown(enterOnEmptyEvent);
  assert(chipComponent.getTags().length === 0, 'Enter key on empty input does not select first dropdown item');

  // Test keyboard Tab on empty input does not select tag and closes dropdown
  mockInput.value = '';
  let tabPrevented = false;
  const tabOnEmptyEvent = { key: 'Tab', preventDefault() { tabPrevented = true; } };
  chipComponent.handleKeydown(tabOnEmptyEvent);
  assert(!tabPrevented, 'Tab key on empty input allows default tab navigation');
  assert(chipComponent.getTags().length === 0, 'Tab key on empty input does not add a tag');
  assert(mockDropdown.classList.contains('hidden'), 'Tab key on empty input closes dropdown');

  // Test keyboard Enter with typed text adds tag
  mockInput.value = 'typed-enter-tag';
  const enterWithTextEvent = { key: 'Enter', preventDefault() {} };
  chipComponent.handleKeydown(enterWithTextEvent);
  assert(chipComponent.getTags().includes('typed-enter-tag'), 'Enter key with typed text adds tag');

  // Test count mapping in groupTagsForDropdown with leading # in allTags
  const allTagsWithHash = [{ tag: '#special', count: 42 }];
  const recentTagsWithHash = ['special'];
  const ddHashResult = RaindropAPI.groupTagsForDropdown('', [], recentTagsWithHash, allTagsWithHash);
  assert(ddHashResult.recentMatches.length === 1 && ddHashResult.recentMatches[0].count === 42, 'groupTagsForDropdown maps count even when allTags item has leading #');

  // Test Backspace chip deletion
  chipComponent.setTags(['alpha', 'beta', 'gamma']);
  assert(chipComponent.getTags().length === 3, 'setTags populates 3 chips');
  chipComponent.removeLastTag();
  assert(chipComponent.getTags().length === 2 && chipComponent.getTags()[1] === 'beta', 'removeLastTag removes last chip on Backspace');

  // Test commitCurrentInput when saving
  mockInput.value = 'typed-tag';
  chipComponent.commitCurrentInput();
  assert(chipComponent.getTags().includes('typed-tag'), 'commitCurrentInput converts in-progress typed text to chip before saving');

  // 4. HTML & CSS Parity Checks for Tag Chips Component
  assert(popupHtml.includes('id="tagsInputContainer"') && popupHtml.includes('class="tags-input-container"'), 'popup.html contains #tagsInputContainer with class tags-input-container');
  assert(popupHtml.includes('id="tabsTagsInputContainer"') && popupHtml.includes('class="tags-input-container"'), 'popup.html contains #tabsTagsInputContainer with class tags-input-container in View 3');
  assert(popupHtml.includes('id="tabsTagsAutocompleteDropdown"'), 'popup.html contains #tabsTagsAutocompleteDropdown for View 3');
  assert(popupHtml.includes('class="tag-inline-input input-tags"'), 'popup.html uses .tag-inline-input for inline input');

  // CSS Checks for tag chips and dropdown grouping
  assert(popupCss.includes('.tag-chip'), 'CSS includes .tag-chip styling');
  assert(popupCss.includes('.tag-chip-remove'), 'CSS includes .tag-chip-remove styling');
  assert(popupCss.includes('.tag-chip:hover .tag-chip-remove') || popupCss.includes('.tag-chip-remove:hover'), 'CSS includes hover visibility for red ✕ remove button');
  assert(popupCss.includes('.tag-inline-input'), 'CSS includes .tag-inline-input styling');
  assert(popupCss.includes('.tag-dropdown-header'), 'CSS includes .tag-dropdown-header styling for Recent/Other grouping');
  assert(popupCss.includes('.tag-dropdown-add'), 'CSS includes .tag-dropdown-add styling for + Add tag option');

  console.log(`\n========================================`);
  console.log(`Verification Complete: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
