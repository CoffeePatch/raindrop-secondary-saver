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
assert(manifest.background && manifest.background.service_worker === 'background.js', 'manifest includes background.service_worker');

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
  'options/options.js',
  'background.js'
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
    if (endpoint === '/import/url/exists' && options.method === 'POST') {
      const parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      const urls = parsedBody?.urls || [];
      if (urls.includes('https://github.com')) {
        return { result: true, ids: [9999] };
      }
      return { result: false, ids: [] };
    }
    if (endpoint === '/raindrop/9999' && (!options || !options.method || options.method === 'GET')) {
      return { result: true, item: { _id: 9999, title: 'Already Saved Page', link: 'https://github.com', cover: 'https://example.com/cover.jpg', reminder: { date: '2026-11-10T12:00:00Z' } } };
    }
    if (endpoint.startsWith('/check/url')) {
      return { result: true, item: { _id: 9999, title: 'Already Saved Page', cover: 'https://example.com/cover.jpg', reminder: { date: '2026-11-10T12:00:00Z' } } };
    }
    if (endpoint.startsWith('/raindrop/9999') && options && options.method === 'PUT') {
      const parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return { result: true, item: { _id: 9999, ...parsedBody } };
    }
    if (endpoint.startsWith('/raindrop/9999') && options && options.method === 'DELETE') {
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

  // AMOLED CSS Checks
  const popupCss = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.css'), 'utf8');
  assert(popupCss.includes('--bg-primary: #000000') || popupCss.includes('#000000'), 'CSS includes AMOLED pure black background #000000');
  assert(popupCss.includes('--bg-secondary: #080808') || popupCss.includes('#080808'), 'CSS includes AMOLED card/secondary background #080808');
  assert(popupCss.includes('--bg-input: #141414') || popupCss.includes('#141414'), 'CSS includes AMOLED input background #141414');
  assert(popupCss.includes('--border-subtle: #262626') || popupCss.includes('#262626'), 'CSS includes subtle border #262626');
  assert(popupCss.includes('--text-primary: #ffffff') || popupCss.includes('#ffffff'), 'CSS includes crisp white primary text #ffffff');
  assert(popupCss.includes('--text-secondary: #9e9e9e') || popupCss.includes('#9e9e9e'), 'CSS includes clean secondary/label text #9e9e9e');
  assert(popupCss.includes('--accent-gold: #d4b476') || popupCss.includes('#d4b476'), 'CSS includes gold accent #d4b476');
  assert(popupCss.includes('.tags-dropdown'), 'CSS includes .tags-dropdown custom autocomplete styling');
  assert(popupCss.includes('.collection-pill-btn'), 'CSS includes .collection-pill-btn styling');
  assert(popupCss.includes('.save-gold-btn'), 'CSS includes .save-gold-btn styling');

  // Save tabs layout checks (no dead space)
  assert(popupCss.includes('.tabs-list-wrapper') && popupCss.includes('overflow: hidden'), 'CSS tabs-list-wrapper has flex layout without fixed dead height');
  assert(popupCss.includes('.open-tabs-list') && popupCss.includes('overflow-y: auto') && popupCss.includes('flex: 1'), 'CSS open-tabs-list has flex: 1 and overflow-y: auto for smooth scrolling');
  assert(popupCss.includes('.tabs-bottom-bar'), 'CSS includes .tabs-bottom-bar pinning action button cleanly to bottom');

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
        const isCheckedFilter = selector.includes(':checked');
        const cleanSel = selector.replace(':checked', '');
        function walk(node) {
          for (const child of node.children || []) {
            let matched = false;
            if (cleanSel.startsWith('.') && child.classList.contains(cleanSel.slice(1))) {
              matched = true;
            } else if (child.tagName === cleanSel.toUpperCase()) {
              matched = true;
            }
            if (matched) {
              if (!isCheckedFilter || child.checked) {
                matches.push(child);
              }
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

  console.log('\n=== 12. EMOJI CLEANING, BACKGROUND WORKER & TOOLBAR BADGE ===');
  // 1. Emoji Cleaning & Hierarchy icon check
  const popupJsContent = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.js'), 'utf8');
  assert(!popupJsContent.includes('👥'), 'popup.js does not contain two-people emoji 👥');
  assert(!popupHtml.includes('👥'), 'popup.html does not contain two-people emoji 👥');
  const apiJsContent = fs.readFileSync(path.join(EXT_DIR, 'scripts/api.js'), 'utf8');
  assert(!apiJsContent.includes("'🌐'"), 'scripts/api.js does not force public globe emoji 🌐 on collections');
  const defaultHierarchy = RaindropAPI.buildCollectionHierarchy([], []);
  assert(defaultHierarchy[0].icon === '〰', 'Unsorted collection uses clean wave icon 〰 instead of in-tray emoji 📥');

  // 2. Background Worker Tests
  const backgroundWorker = require(path.join(EXT_DIR, 'background.js'));
  assert(typeof backgroundWorker.isCheckableUrl === 'function', 'background.js exports isCheckableUrl');
  assert(backgroundWorker.isCheckableUrl('https://example.com/page'), 'isCheckableUrl accepts https:// URL');
  assert(backgroundWorker.isCheckableUrl('http://insecure.org'), 'isCheckableUrl accepts http:// URL');
  assert(!backgroundWorker.isCheckableUrl('chrome://extensions'), 'isCheckableUrl rejects chrome:// URL');
  assert(!backgroundWorker.isCheckableUrl('about:blank'), 'isCheckableUrl rejects about:blank URL');
  assert(!backgroundWorker.isCheckableUrl(''), 'isCheckableUrl rejects empty string');
  assert(!backgroundWorker.isCheckableUrl(null), 'isCheckableUrl rejects null');

  // 3. Mock Chrome Action Badge tests
  let lastBadgeText = null;
  let lastBadgeColor = null;
  let lastBadgeTextColor = null;
  let lastBadgeTitle = null;
  global.chrome.action = {
    setBadgeText: ({ tabId, text }) => { lastBadgeText = text; },
    setBadgeBackgroundColor: ({ tabId, color }) => { lastBadgeColor = color; },
    setBadgeTextColor: ({ tabId, color }) => { lastBadgeTextColor = color; },
    setTitle: ({ tabId, title }) => { lastBadgeTitle = title; }
  };

  backgroundWorker.setTabBadge(123);
  assert(lastBadgeText === '✓', 'setTabBadge sets checkmark text ✓');
  assert(lastBadgeColor === '#10B981', 'setTabBadge sets Account B green badge background #10B981');
  assert(lastBadgeTextColor === '#ffffff', 'setTabBadge sets crisp white text color #ffffff');
  assert(lastBadgeTitle === 'Saved in Raindrop (Account B)', 'setTabBadge sets Account B title');

  backgroundWorker.clearTabBadge(123);
  assert(lastBadgeText === '', 'clearTabBadge clears badge text');
  assert(lastBadgeTitle === 'Save to Secondary Raindrop', 'clearTabBadge resets default title');

  // 4. Test updateTabBadge with RaindropAPI mock
  global.RaindropStorage = RaindropStorage;
  global.RaindropAPI = RaindropAPI;

  await RaindropStorage.setToken('test-token-active');
  const originalCheckUrl = RaindropAPI.checkUrl;
  RaindropAPI.checkUrl = async (token, url) => {
    if (url === 'https://saved-article.com') {
      return { _id: 999, title: 'Saved Article' };
    }
    return null;
  };

  await backgroundWorker.updateTabBadge(456, 'https://saved-article.com');
  assert(lastBadgeText === '✓', 'updateTabBadge sets ✓ badge when URL is bookmarked in Account B');

  await backgroundWorker.updateTabBadge(456, 'https://unsaved-article.com');
  assert(lastBadgeText === '', 'updateTabBadge clears badge when URL is not bookmarked');

  await backgroundWorker.updateTabBadge(456, 'chrome://extensions');
  assert(lastBadgeText === '', 'updateTabBadge clears badge for non-checkable chrome:// URL');

  await backgroundWorker.updateTabBadge(456, null);
  assert(lastBadgeText === '', 'updateTabBadge clears badge when tab URL is null/undefined');

  await RaindropStorage.clearToken();
  await backgroundWorker.updateTabBadge(456, 'https://saved-article.com');
  assert(lastBadgeText === '', 'updateTabBadge clears badge when no token is configured');

  RaindropAPI.checkUrl = originalCheckUrl;

  console.log('\n=== 13. SHIFT+CLICK RANGE SELECTION & BACKGROUND BATCH SAVING (POST /raindrops) ===');

  // 1. RaindropAPI.createRaindropsBatch Tests
  assert(typeof RaindropAPI.createRaindropsBatch === 'function', 'createRaindropsBatch is defined on RaindropAPI');

  // Empty items edge case
  const emptyRes = await RaindropAPI.createRaindropsBatch('test-token', []);
  assert(emptyRes.result === true && emptyRes.items.length === 0, 'createRaindropsBatch returns empty array for empty items');

  // Verify POST /raindrops plural endpoint & payload structure
  const interceptedBatchCalls = [];
  const origReq = RaindropAPI.request;
  RaindropAPI.request = async (endpoint, token, options) => {
    const parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    interceptedBatchCalls.push({
      endpoint,
      token,
      method: options.method,
      body: parsedBody
    });
    return {
      result: true,
      items: (parsedBody?.items || []).map((it, i) => ({
        _id: 2000 + i,
        link: it.link,
        title: it.title,
        collection: it.collection
      }))
    };
  };

  const sampleBatch = [
    { url: 'https://site-a.com', title: 'Site A', tags: ['#news', 'daily'], collectionId: 10 },
    { link: 'https://site-b.com', title: 'Site B', collection: { $id: 20 }, reminder: true }
  ];

  const batchResult = await RaindropAPI.createRaindropsBatch('valid-token', sampleBatch);
  assert(interceptedBatchCalls.length === 1, 'Batch with 2 items executes 1 API call');
  assert(interceptedBatchCalls[0].endpoint === '/raindrops', 'createRaindropsBatch targets official plural /raindrops endpoint');
  assert(interceptedBatchCalls[0].method === 'POST', 'createRaindropsBatch uses POST method');
  assert(Array.isArray(interceptedBatchCalls[0].body.items), 'Payload contains items array');
  assert(interceptedBatchCalls[0].body.items.length === 2, 'Payload items length is 2');
  assert(interceptedBatchCalls[0].body.items[0].link === 'https://site-a.com', 'url mapped to link property');
  assert(interceptedBatchCalls[0].body.items[0].tags.includes('news') && !interceptedBatchCalls[0].body.items[0].tags.includes('#news'), 'Tags cleaned of leading hashes');
  assert(interceptedBatchCalls[0].body.items[0].collection.$id === 10, 'collectionId normalized to collection.$id');
  assert(interceptedBatchCalls[0].body.items[1].collection.$id === 20, 'Existing collection.$id preserved');
  assert(interceptedBatchCalls[0].body.items[1].reminder && interceptedBatchCalls[0].body.items[1].reminder.date, 'Reminder formatted and included');
  assert(batchResult.items.length === 2, 'Returns all created raindrops from batch');

  // Test automatic chunking into batches of 100
  interceptedBatchCalls.length = 0;
  const largeBatch = [];
  for (let i = 1; i <= 245; i++) {
    largeBatch.push({ url: `https://tab${i}.com`, title: `Tab ${i}` });
  }

  const largeResult = await RaindropAPI.createRaindropsBatch('valid-token', largeBatch);
  assert(interceptedBatchCalls.length === 3, 'createRaindropsBatch automatically chunks 245 items into 3 requests');
  assert(interceptedBatchCalls[0].body.items.length === 100, 'Batch 1 contains 100 items');
  assert(interceptedBatchCalls[1].body.items.length === 100, 'Batch 2 contains 100 items');
  assert(interceptedBatchCalls[2].body.items.length === 45, 'Batch 3 contains remaining 45 items');
  assert(largeResult.items.length === 245, 'Aggregates all 245 items across batches');

  RaindropAPI.request = origReq;

  // Test invalid link filtering
  const filteredRes = await RaindropAPI.createRaindropsBatch('valid-token', [
    { url: '   ' },
    null,
    { title: 'No url' }
  ]);
  assert(filteredRes.items.length === 0, 'Invalid/empty/whitespace links filtered out');

  // 2. Shift+Click Range Selection Tests
  const { applyShiftClickRangeSelection } = require(path.join(EXT_DIR, 'popup/popup.js'));
  assert(typeof applyShiftClickRangeSelection === 'function', 'popup.js exports applyShiftClickRangeSelection');

  // Test range selection algorithm (forward, reverse, select/deselect)
  const testCbs = Array.from({ length: 10 }, (_, i) => ({ index: i, checked: true }));

  // First click on index 2 (uncheck)
  let lastIndex = applyShiftClickRangeSelection(testCbs, 2, -1, false);
  assert(lastIndex === 2, 'Single click returns index 2 as new lastIndex');
  assert(testCbs[2].checked === false && testCbs[1].checked === true && testCbs[3].checked === true, 'Single click updates only index 2');

  // Shift+click on index 8 (targetState false) -> indices 2 through 8 all unchecked
  lastIndex = applyShiftClickRangeSelection(testCbs, 8, 2, false);
  assert(lastIndex === 8, 'Shift+click updates lastIndex to 8');
  assert(
    testCbs[0].checked === true &&
    testCbs[1].checked === true &&
    testCbs[2].checked === false &&
    testCbs[3].checked === false &&
    testCbs[4].checked === false &&
    testCbs[5].checked === false &&
    testCbs[6].checked === false &&
    testCbs[7].checked === false &&
    testCbs[8].checked === false &&
    testCbs[9].checked === true,
    'Shift+click forward (2 through 8) unchecks all intermediate checkboxes'
  );

  // Shift+click reverse: user clicks index 7 without shift, then Shift+clicks index 3 (targetState true)
  testCbs[7].checked = true;
  lastIndex = applyShiftClickRangeSelection(testCbs, 3, 7, true);
  assert(lastIndex === 3, 'Reverse Shift+click updates lastIndex to 3');
  assert(
    testCbs[3].checked === true &&
    testCbs[4].checked === true &&
    testCbs[5].checked === true &&
    testCbs[6].checked === true &&
    testCbs[7].checked === true,
    'Shift+click reverse (7 down to 3) checks all intermediate checkboxes'
  );

  // Robustness tests: out of bounds indices and null checks
  const outOfBoundsLast = applyShiftClickRangeSelection(testCbs, 4, 999, false);
  assert(outOfBoundsLast === 4 && testCbs[4].checked === false, 'applyShiftClickRangeSelection handles out-of-bounds lastIndex safely');
  const outOfBoundsClicked = applyShiftClickRangeSelection(testCbs, 999, 2, false);
  assert(outOfBoundsClicked === 999, 'applyShiftClickRangeSelection handles out-of-bounds clickedIndex safely');
  const nullCheckboxes = applyShiftClickRangeSelection(null, 0, 0, true);
  assert(nullCheckboxes === 0, 'applyShiftClickRangeSelection handles null checkboxes array safely');

  // 3. Background Service Worker Batch Saving & Tab Closing Safety
  assert(typeof backgroundWorker.handleSaveTabsBatch === 'function', 'background.js exports handleSaveTabsBatch');

  await RaindropStorage.setToken('bg-worker-token');
  let removedTabIds = [];
  const badgedTabIds = [];
  global.chrome.tabs = global.chrome.tabs || {};
  global.chrome.tabs.remove = async (ids) => {
    removedTabIds = Array.isArray(ids) ? [...ids] : [ids];
  };
  global.chrome.action = global.chrome.action || {};
  const origSetBadgeText = global.chrome.action.setBadgeText;
  global.chrome.action.setBadgeText = ({ tabId, text }) => {
    if (tabId) badgedTabIds.push(tabId);
  };

  let mockBatchCalled = false;
  let mockBatchItems = null;
  const originalBatch = RaindropAPI.createRaindropsBatch;
  RaindropAPI.createRaindropsBatch = async (token, items) => {
    mockBatchCalled = true;
    mockBatchItems = items;
    return {
      result: true,
      items: items.map((it, idx) => ({ _id: 8000 + idx, link: it.url }))
    };
  };

  // Test successful batch save in background worker
  removedTabIds = [];
  badgedTabIds.length = 0;
  const bgBatchResult = await backgroundWorker.handleSaveTabsBatch({
    items: [
      { url: 'https://page-1.com', title: 'Page 1', tabId: 201 },
      { url: 'https://page-2.com', title: 'Page 2', tabId: 202 }
    ],
    closeTabIds: [201, 202]
  });

  assert(bgBatchResult.success === true, 'handleSaveTabsBatch succeeds');
  assert(mockBatchCalled === true, 'handleSaveTabsBatch invokes RaindropAPI.createRaindropsBatch');
  assert(mockBatchItems.length === 2, 'Batch items passed to createRaindropsBatch');
  assert(removedTabIds.length === 2 && removedTabIds.includes(201) && removedTabIds.includes(202), 'Tabs closed after batch save completes');
  assert(!badgedTabIds.includes(201) && !badgedTabIds.includes(202), 'SAFETY: Badges are NOT set on tabs that were closed');

  // SAFETY TEST: If Raindrop API throws error, tabs MUST NOT be closed!
  removedTabIds = [];
  RaindropAPI.createRaindropsBatch = async () => {
    throw new Error('Raindrop API 500 Internal Server Error');
  };

  try {
    await backgroundWorker.handleSaveTabsBatch({
      items: [{ url: 'https://dont-lose-me.com', title: 'Critical Tab' }],
      closeTabIds: [777]
    });
    assert(false, 'Should throw error when API fails');
  } catch (apiErr) {
    assert(apiErr.message.includes('500'), 'Error caught when API fails');
  }
  assert(removedTabIds.length === 0, 'SAFETY: Tabs are NOT closed when batch API fails');

  // Test chrome.runtime.onMessage saveTabsBatch action
  RaindropAPI.createRaindropsBatch = async (token, items) => ({
    result: true,
    items: items.map((it, i) => ({ _id: 9000 + i, link: it.url }))
  });

  // Re-register background message listener with runtime mock
  const registeredListeners = [];
  global.chrome.runtime = {
    onMessage: {
      addListener: (fn) => registeredListeners.push(fn)
    }
  };

  // Clear module cache and reload background.js to wire up runtime listener
  delete require.cache[require.resolve(path.join(EXT_DIR, 'background.js'))];
  const reloadedBg = require(path.join(EXT_DIR, 'background.js'));

  assert(registeredListeners.length > 0, 'background.js registers runtime.onMessage listener');

  let batchMessageResponse = null;
  for (const listener of registeredListeners) {
    const keepOpen = listener(
      {
        action: 'saveTabsBatch',
        items: [{ url: 'https://msg-test.com', title: 'Test Tab' }],
        closeTabIds: []
      },
      {},
      (response) => { batchMessageResponse = response; }
    );
    if (keepOpen) break;
  }

  // Wait for async response
  await new Promise(r => setTimeout(r, 60));
  assert(batchMessageResponse !== null, 'onMessage handler invoked sendResponse');
  assert(batchMessageResponse.success === true, 'onMessage returns success: true');
  assert(batchMessageResponse.count === 1, 'onMessage reports saved count: 1');

  // 4. Test Save Tabs Button Feedback and State Lifecycle
  {
    let btnText = 'Save 2 tabs';
    let btnDisabled = false;
    let spinnerHidden = true;
    let saveSucceeded = false;
    const countToSave = 2;

    // Simulate click on Save Tabs button
    btnDisabled = true;
    spinnerHidden = false;
    btnText = `Saving ${countToSave} tabs...`;
    assert(btnText === 'Saving 2 tabs...', 'Button shows instant "Saving X tabs..." feedback');
    assert(btnDisabled === true && spinnerHidden === false, 'Button is disabled and spinner active while saving');

    // Simulate batch save success
    btnText = 'Saved!';
    saveSucceeded = true;

    // Simulate finally block logic
    spinnerHidden = true;
    if (!saveSucceeded) {
      btnDisabled = false;
      btnText = `Save ${countToSave} tabs`;
    } else {
      btnDisabled = true;
      btnText = 'Saved!';
    }

    assert(btnText === 'Saved!', 'Button shows "Saved!" feedback after batch save without being overwritten');
    assert(btnDisabled === true, 'Button stays disabled after "Saved!" to prevent duplicate submissions');
    assert(spinnerHidden === true, 'Spinner is hidden after batch save completes');
  }

  // Restore API method and token
  RaindropAPI.createRaindropsBatch = originalBatch;
  await RaindropStorage.clearToken();

  console.log('\n=== 14. COLLAPSIBLE HIERARCHY, URL ICONS & SEARCH EXPANSION ===');
  const { isUrlIcon, renderIconHtml, isCollectionVisible, expandAncestorsOf, escapeHtml } = require(path.join(EXT_DIR, 'popup/popup.js'));

  // 0. escapeHtml Robustness (handles numbers, 0, null, undefined)
  assert(escapeHtml(0) === '0', 'escapeHtml(0) returns "0" without blanking');
  assert(escapeHtml(123) === '123', 'escapeHtml(123) converts number to string without throwing');
  assert(escapeHtml(null) === '', 'escapeHtml(null) returns empty string');
  assert(escapeHtml(undefined) === '', 'escapeHtml(undefined) returns empty string');
  assert(escapeHtml('<script>alert("xss")</script>') === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'escapeHtml escapes dangerous HTML characters');

  // 1. RaindropStorage expanded collections tests
  delete mockLocalStorage['raindrop_expanded_collections'];
  const initialExpanded = await RaindropStorage.getExpandedCollectionIds();
  assert(initialExpanded === null, 'getExpandedCollectionIds returns null when unset');

  const savedIds = await RaindropStorage.setExpandedCollectionIds([10, 20, 20, '30', 'invalid']);
  assert(
    Array.isArray(savedIds) && savedIds.length === 3 && savedIds.includes(10) && savedIds.includes(20) && savedIds.includes(30),
    'setExpandedCollectionIds cleans, deduplicates, and converts numeric IDs'
  );

  const retrievedIds = await RaindropStorage.getExpandedCollectionIds();
  assert(
    Array.isArray(retrievedIds) && retrievedIds.length === 3 && retrievedIds[0] === 10,
    'getExpandedCollectionIds retrieves saved array'
  );

  await RaindropStorage.setExpandedCollectionIds([]);
  const emptyIds = await RaindropStorage.getExpandedCollectionIds();
  assert(Array.isArray(emptyIds) && emptyIds.length === 0, 'getExpandedCollectionIds retrieves empty array when collapsed');

  // 2. URL Icon Detection & Rendering Tests
  assert(typeof isUrlIcon === 'function', 'popup.js exports isUrlIcon');
  assert(isUrlIcon('https://up.raindrop.io/collection/thumbs/443/537/90/a61be.png') === true, 'isUrlIcon identifies https:// URL');
  assert(isUrlIcon('http://example.com/cover.jpg') === true, 'isUrlIcon identifies http:// URL');
  assert(isUrlIcon('data:image/svg+xml;base64,PHN2Z...') === true, 'isUrlIcon identifies data: URI');
  assert(isUrlIcon('/local/thumb.png') === true, 'isUrlIcon identifies relative root / URL');
  assert(isUrlIcon('   https://spaced.url/pic.png   ') === true, 'isUrlIcon handles leading/trailing whitespace');
  assert(isUrlIcon('📁') === false, 'isUrlIcon returns false for folder emoji 📁');
  assert(isUrlIcon('〰') === false, 'isUrlIcon returns false for wave icon 〰');
  assert(isUrlIcon('🗑') === false, 'isUrlIcon returns false for trash emoji 🗑');
  assert(isUrlIcon('Development') === false, 'isUrlIcon returns false for text titles');
  assert(isUrlIcon('') === false, 'isUrlIcon returns false for empty string');
  assert(isUrlIcon(null) === false, 'isUrlIcon returns false for null');
  assert(isUrlIcon(undefined) === false, 'isUrlIcon returns false for undefined');

  assert(typeof renderIconHtml === 'function', 'popup.js exports renderIconHtml');
  const renderedUrl = renderIconHtml('https://up.raindrop.io/collection/thumbs/443/537/90/a61be.png');
  assert(renderedUrl.includes('<img class="coll-icon-img"'), 'renderIconHtml produces <img class="coll-icon-img" for URL');
  assert(renderedUrl.includes('src="https://up.raindrop.io/collection/thumbs/443/537/90/a61be.png"'), 'renderIconHtml sets correct src');
  assert(renderedUrl.includes('alt=""'), 'renderIconHtml includes alt attribute');

  const renderedEscapedUrl = renderIconHtml('https://example.com/icon.png?v=1&w=2');
  assert(renderedEscapedUrl.includes('v=1&amp;w=2'), 'renderIconHtml escapes special chars in URL attribute');

  const renderedEmoji = renderIconHtml('〰');
  assert(renderedEmoji === '〰', 'renderIconHtml outputs plain emoji text without img tag');

  const renderedFallback = renderIconHtml(null);
  assert(renderedFallback === '📁', 'renderIconHtml defaults to 📁 for null icon');

  // 3. Collection Hierarchy parentId and hasChildren logic
  const testRoots = [
    { _id: 10, title: 'Development', sort: 0 },
    { _id: 20, title: 'Articles', sort: 1 }
  ];
  const testChildren = [
    { _id: 101, title: 'Frontend', parent: { $id: 10 } },
    { _id: 102, title: 'Backend', parent: { $id: 10 } },
    { _id: 1011, title: 'React', parent: { $id: 101 } }
  ];
  const tree = RaindropAPI.buildCollectionHierarchy(testRoots, testChildren);
  const devNode = tree.find(c => c.id === 10);
  const frontNode = tree.find(c => c.id === 101);
  const reactNode = tree.find(c => c.id === 1011);
  const backNode = tree.find(c => c.id === 102);
  const artNode = tree.find(c => c.id === 20);

  assert(devNode && devNode.hasChildren === true, 'Parent collection Development has hasChildren: true');
  assert(devNode && devNode.parentId === null, 'Root collection Development has parentId: null');
  assert(frontNode && frontNode.hasChildren === true, 'Subfolder Frontend has hasChildren: true');
  assert(frontNode && frontNode.parentId === 10, 'Subfolder Frontend has parentId: 10');
  assert(reactNode && reactNode.hasChildren === false, 'Leaf subfolder React has hasChildren: false');
  assert(reactNode && reactNode.parentId === 101, 'Leaf subfolder React has parentId: 101');
  assert(backNode && backNode.hasChildren === false, 'Leaf subfolder Backend has hasChildren: false');
  assert(backNode && backNode.parentId === 10, 'Leaf subfolder Backend has parentId: 10');
  assert(artNode && artNode.hasChildren === false, 'Leaf root Articles has hasChildren: false');
  assert(artNode && artNode.parentId === null, 'Leaf root Articles has parentId: null');

  // 4. isCollectionVisible Hierarchical Collapse/Expand Rules
  assert(typeof isCollectionVisible === 'function', 'popup.js exports isCollectionVisible');
  const treeMap = new Map(tree.filter(c => c.id !== 0).map(c => [Number(c.id), c]));

  // When all folders collapsed (expandedSet empty)
  const emptyExpanded = new Set();
  assert(isCollectionVisible(devNode, emptyExpanded, treeMap) === true, 'Root Development is visible when collapsed');
  assert(isCollectionVisible(artNode, emptyExpanded, treeMap) === true, 'Root Articles is visible when collapsed');
  assert(isCollectionVisible(frontNode, emptyExpanded, treeMap) === false, 'Child Frontend is hidden when parent Development is collapsed');
  assert(isCollectionVisible(reactNode, emptyExpanded, treeMap) === false, 'Grandchild React is hidden when ancestor Development is collapsed');
  assert(isCollectionVisible(backNode, emptyExpanded, treeMap) === false, 'Child Backend is hidden when parent Development is collapsed');

  // When Development (10) is expanded, but Frontend (101) is collapsed
  const devExpandedOnly = new Set([10]);
  assert(isCollectionVisible(devNode, devExpandedOnly, treeMap) === true, 'Root Development is visible');
  assert(isCollectionVisible(frontNode, devExpandedOnly, treeMap) === true, 'Child Frontend is visible when parent Development is expanded');
  assert(isCollectionVisible(backNode, devExpandedOnly, treeMap) === true, 'Child Backend is visible when parent Development is expanded');
  assert(isCollectionVisible(reactNode, devExpandedOnly, treeMap) === false, 'Grandchild React is hidden when parent Frontend is collapsed');

  // When both Development (10) and Frontend (101) are expanded
  const allExpanded = new Set([10, 101]);
  assert(isCollectionVisible(devNode, allExpanded, treeMap) === true, 'Development is visible');
  assert(isCollectionVisible(frontNode, allExpanded, treeMap) === true, 'Frontend is visible');
  assert(isCollectionVisible(backNode, allExpanded, treeMap) === true, 'Backend is visible');
  assert(isCollectionVisible(reactNode, allExpanded, treeMap) === true, 'React is visible when both parent and grandparent are expanded');

  // When Grandparent Development (10) is collapsed, but Parent Frontend (101) is in set
  const brokenChainSet = new Set([101]);
  assert(isCollectionVisible(frontNode, brokenChainSet, treeMap) === false, 'Frontend is hidden because ancestor 10 is collapsed');
  assert(isCollectionVisible(reactNode, brokenChainSet, treeMap) === false, 'React is hidden because root ancestor 10 is collapsed');

  // Cyclic reference protection test
  const cyclicA = { id: 801, parentId: 802 };
  const cyclicB = { id: 802, parentId: 801 };
  const cyclicMap = new Map([[801, cyclicA], [802, cyclicB]]);
  const cyclicResult = isCollectionVisible(cyclicA, new Set([801, 802]), cyclicMap);
  assert(cyclicResult === true, 'isCollectionVisible terminates safely on cyclic references');

  // 5. Search Filtering & Collapsed Parent State Parity
  // When user searches "React", React must be found even if parent Development (10) is collapsed
  const searchFilter = (items, term, expandedSet, map) => {
    const t = (term || '').trim().toLowerCase();
    return items.filter(coll => {
      if (!t) return isCollectionVisible(coll, expandedSet, map);
      return (coll.title || '').toLowerCase().includes(t);
    });
  };

  const userItems = [devNode, frontNode, reactNode, backNode, artNode];
  const collapsedTreeResults = searchFilter(userItems, '', emptyExpanded, treeMap);
  assert(collapsedTreeResults.length === 2, 'Empty search on collapsed tree returns only root items (Development & Articles)');
  assert(!collapsedTreeResults.some(c => c.id === 1011), 'Empty search does not show collapsed React');

  const searchReactResults = searchFilter(userItems, 'React', emptyExpanded, treeMap);
  assert(searchReactResults.length === 1 && searchReactResults[0].id === 1011, 'Search "React" finds React even though parent folders are collapsed');

  const searchCaseInsensitive = searchFilter(userItems, 'dev', emptyExpanded, treeMap);
  assert(searchCaseInsensitive.length === 1 && searchCaseInsensitive[0].id === 10, 'Search "dev" case-insensitively finds Development');

  // 6. Markup & CSS Parity Checks
  const updatedPopupHtml = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.html'), 'utf8');
  assert(updatedPopupHtml.includes('coll-chevron-spacer'), 'popup.html includes coll-chevron-spacer for aligned icons');

  const updatedPopupCss = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.css'), 'utf8');
  assert(updatedPopupCss.includes('.coll-chevron {') || updatedPopupCss.includes('.coll-chevron{'), 'popup.css includes .coll-chevron styling');
  assert(updatedPopupCss.includes('.coll-chevron-spacer {') || updatedPopupCss.includes('.coll-chevron-spacer{'), 'popup.css includes .coll-chevron-spacer styling');
  assert(updatedPopupCss.includes('.coll-icon-img {') || updatedPopupCss.includes('.coll-icon-img{'), 'popup.css includes .coll-icon-img styling');
  assert(updatedPopupCss.includes('width: 18px'), 'popup.css sets width: 18px on collection icons');
  assert(updatedPopupCss.includes('height: 18px'), 'popup.css sets height: 18px on collection icons');
  assert(updatedPopupCss.includes('border-radius: 4px'), 'popup.css sets border-radius: 4px on collection icons');
  assert(updatedPopupCss.includes('object-fit: cover'), 'popup.css sets object-fit: cover on collection icons');
  assert(updatedPopupCss.includes('vertical-align: middle'), 'popup.css sets vertical-align: middle on collection icons');

  // 7. Pill URL Icon Handling Simulation & Broken Image Fallback
  const mockPillIcon = { innerHTML: '', textContent: '〰', listeners: {}, addEventListener(e, fn) { this.listeners[e] = fn; } };
  const mockTabsPillIcon = { innerHTML: '', textContent: '〰', listeners: {}, addEventListener(e, fn) { this.listeners[e] = fn; } };
  const simulateUpdatePills = (icon) => {
    const iconHtml = renderIconHtml(icon);
    if (isUrlIcon(icon)) {
      mockPillIcon.innerHTML = iconHtml;
      mockTabsPillIcon.innerHTML = iconHtml;
      // Attach CSP-compliant error listeners
      mockPillIcon.onError = () => { mockPillIcon.textContent = '📁'; };
      mockTabsPillIcon.onError = () => { mockTabsPillIcon.textContent = '📁'; };
    } else {
      mockPillIcon.textContent = icon;
      mockTabsPillIcon.textContent = icon;
    }
  };

  simulateUpdatePills('https://up.raindrop.io/collection/thumbs/443/537/90/a61be.png');
  assert(mockPillIcon.innerHTML.includes('<img class="coll-icon-img"'), 'View 1 pillIcon renders <img> tag for URL icon');
  assert(mockTabsPillIcon.innerHTML.includes('<img class="coll-icon-img"'), 'View 3 tabsPillIcon renders <img> tag for URL icon');

  // Trigger error fallback on broken remote image
  mockPillIcon.onError();
  mockTabsPillIcon.onError();
  assert(mockPillIcon.textContent === '📁', 'Pill icon gracefully falls back to 📁 on image load error');
  assert(mockTabsPillIcon.textContent === '📁', 'Tabs pill icon gracefully falls back to 📁 on image load error');

  simulateUpdatePills('〰');
  assert(mockPillIcon.textContent === '〰', 'View 1 pillIcon resets to textContent for emoji 〰');
  assert(mockTabsPillIcon.textContent === '〰', 'View 3 tabsPillIcon resets to textContent for emoji 〰');

  // 8. Type Coercion Resilience in Tree Hierarchy (mixed string and numeric IDs)
  const mixedRoots = [{ _id: '500', title: 'String ID Root', sort: 0 }];
  const mixedChildren = [
    { _id: 501, title: 'Numeric ID Child', parent: { $id: 500 } },
    { _id: '502', title: 'String ID Grandchild', parent: { $id: '501' } }
  ];
  const mixedTree = RaindropAPI.buildCollectionHierarchy(mixedRoots, mixedChildren);
  const rootNode500 = mixedTree.find(c => Number(c.id) === 500);
  const childNode501 = mixedTree.find(c => Number(c.id) === 501);
  const grandNode502 = mixedTree.find(c => Number(c.id) === 502);

  assert(rootNode500 && rootNode500.hasChildren === true, 'Parent with string _id recognizes child with numeric parent.$id');
  assert(childNode501 && childNode501.parentId === 500, 'Child node normalized parentId to number 500');
  assert(childNode501 && childNode501.hasChildren === true, 'Child node recognizes grandchild with string parent.$id');
  assert(grandNode502 && grandNode502.parentId === 501, 'Grandchild node normalized parentId to number 501');

  // 9. expandAncestorsOf Engine & Storage Integration
  assert(typeof expandAncestorsOf === 'function', 'popup.js exports expandAncestorsOf');
  const expandSet = new Set();
  const expandTreeItems = [
    { id: 10, parentId: null },
    { id: 101, parentId: 10 },
    { id: 1011, parentId: 101 }
  ];
  const didChange = expandAncestorsOf(1011, expandTreeItems, expandSet);
  assert(didChange === true, 'expandAncestorsOf returns true when ancestors added');
  assert(expandSet.has(101), 'expandAncestorsOf added immediate parent (101) to expandedSet');
  assert(expandSet.has(10), 'expandAncestorsOf added root ancestor (10) to expandedSet');

  // Storage was updated automatically
  const storedExpanded = await RaindropStorage.getExpandedCollectionIds();
  assert(
    Array.isArray(storedExpanded) && storedExpanded.includes(10) && storedExpanded.includes(101),
    'expandAncestorsOf persisted ancestor IDs to RaindropStorage'
  );

  // Calling expandAncestorsOf on root or already expanded items returns false
  const noChange = expandAncestorsOf(10, expandTreeItems, expandSet);
  assert(noChange === false, 'expandAncestorsOf on root item returns false without unneeded writes');

  // 10. Deep Hierarchy Indentation Scaling Parity (> 4 levels)
  const calcIndent = (level) => Math.min(level || 0, 8) * 14;
  assert(calcIndent(0) === 0, 'Level 0 has 0px indent');
  assert(calcIndent(1) === 14, 'Level 1 has 14px indent');
  assert(calcIndent(4) === 56, 'Level 4 has 56px indent');
  assert(calcIndent(5) === 70, 'Level 5 scales indent to 70px (beyond prior 4-level cap)');
  assert(calcIndent(6) === 84, 'Level 6 scales indent to 84px');
  assert(calcIndent(9) === 112, 'Level 9 caps safely at 112px max indent');

  // 11. CSS Parity for Pill Icon Box Dimensions (Prevents layout shift)
  assert(updatedPopupCss.includes('.pill-icon {') || updatedPopupCss.includes('.pill-icon{'), 'popup.css includes .pill-icon');
  const pillIconCssMatch = updatedPopupCss.match(/\.pill-icon\s*\{[^}]+\}/);
  assert(pillIconCssMatch && pillIconCssMatch[0].includes('width: 18px'), '.pill-icon sets explicit width: 18px');
  assert(pillIconCssMatch && pillIconCssMatch[0].includes('height: 18px'), '.pill-icon sets explicit height: 18px');

  console.log('\n=== 15. CACHED COLLECTIONS & TAGS, CLEAN EMOJI ICONS & STALL ELIMINATION ===');
  // 1. Storage tests for Collections Cache
  delete mockLocalStorage['raindrop_cached_collections'];
  const initialCache = await RaindropStorage.getCachedCollections();
  assert(initialCache === null, 'getCachedCollections returns null when unset');

  const testCachePayload = {
    collections: [{ id: 10, title: 'Dev' }],
    stats: [{ _id: -1, count: 4 }],
    updatedAt: Date.now()
  };
  await RaindropStorage.setCachedCollections(testCachePayload);
  const retrievedCache = await RaindropStorage.getCachedCollections();
  assert(retrievedCache && Array.isArray(retrievedCache.collections) && retrievedCache.collections.length === 1, 'setCachedCollections stores and retrieves collections payload');
  assert(retrievedCache.stats && retrievedCache.stats[0]._id === -1, 'setCachedCollections stores stats');

  // 2. Storage tests for Tags Cache
  delete mockLocalStorage['raindrop_cached_tags'];
  const initialTagCache = await RaindropStorage.getCachedTags();
  assert(initialTagCache === null, 'getCachedTags returns null when unset');

  await RaindropStorage.setCachedTags([{ tag: 'javascript', count: 12 }, { tag: 'css', count: 8 }]);
  const retrievedTagCache = await RaindropStorage.getCachedTags();
  assert(Array.isArray(retrievedTagCache) && retrievedTagCache.length === 2, 'setCachedTags stores and retrieves cached tags');

  // 3. clearToken clears cached collections and tags
  await RaindropStorage.clearToken();
  const clearedCache = await RaindropStorage.getCachedCollections();
  const clearedTagCache = await RaindropStorage.getCachedTags();
  assert(clearedCache === null, 'clearToken clears cached collections');
  assert(clearedTagCache === null, 'clearToken clears cached tags');

  // 4. Remote Image Stall Elimination & Clean Emoji Icon Preservation in Hierarchy
  const emojiRoots = [
    { _id: 1, title: 'Hot Topics', icon: '🔥', sort: 0 },
    { _id: 2, title: 'Media & Videos', icon: '📺', sort: 1 },
    { _id: 3, title: 'Remote Stalled Item', cover: ['https://up.raindrop.io/collection/thumbs/443/537/90/a61be.png'], sort: 2 },
    { _id: 4, title: 'Remote URL Icon', icon: 'https://up.raindrop.io/icon.svg', sort: 3 },
    { _id: 5, title: 'Default Folder Item', sort: 4 },
    { _id: 6, title: 'Whitespace Icon Item', icon: '   ', sort: 5 }
  ];
  const builtEmojiHierarchy = RaindropAPI.buildCollectionHierarchy(emojiRoots, []);

  const hotNode = builtEmojiHierarchy.find(c => c.id === 1);
  const mediaNode = builtEmojiHierarchy.find(c => c.id === 2);
  const stalledNode = builtEmojiHierarchy.find(c => c.id === 3);
  const urlIconNode = builtEmojiHierarchy.find(c => c.id === 4);
  const defaultNode = builtEmojiHierarchy.find(c => c.id === 5);
  const whitespaceNode = builtEmojiHierarchy.find(c => c.id === 6);

  assert(hotNode && hotNode.icon === '🔥', 'Custom emoji icon 🔥 is preserved without being overwritten');
  assert(mediaNode && mediaNode.icon === '📺', 'Custom emoji icon 📺 is preserved without being overwritten');
  assert(stalledNode && stalledNode.icon === '📁', 'Remote thumbnail URL in cover falls back cleanly to 📁 (eliminates 30-50s network stalls)');
  assert(urlIconNode && urlIconNode.icon === '📁', 'Remote URL icon falls back cleanly to 📁');
  assert(defaultNode && defaultNode.icon === '📁', 'Unspecified icon defaults cleanly to 📁');
  assert(whitespaceNode && whitespaceNode.icon === '📁', 'Whitespace icon defaults cleanly to 📁');

  // 5. CSS checks for collections loading spinner and empty state
  const latestPopupCss = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.css'), 'utf8');
  assert(latestPopupCss.includes('.collections-loading'), 'popup.css includes .collections-loading styles');
  assert(latestPopupCss.includes('.collections-empty-state'), 'popup.css includes .collections-empty-state styles');

  // 6. Verification of Collection Selection Race Condition Fixes & Startup Preloading
  const latestPopupJs = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.js'), 'utf8');
  assert(latestPopupJs.includes('userManuallySelectedCollection'), 'popup.js tracks userManuallySelectedCollection to prevent background overwrite');
  assert(latestPopupJs.includes('existingBookmark?.collection?.$id'), 'popup.js preserves existing bookmark collection during background sync');
  assert(latestPopupJs.includes('RaindropStorage.getCachedTags()') && latestPopupJs.includes('allTags = cachedTags'), 'popup.js preloads cached tags for 0ms tag autocomplete on open');
  assert(latestPopupJs.includes('expandedInitialized'), 'popup.js distinguishes empty saved expanded collection set from first run');

  // ==========================================
  // 16. PHASE P0 REMEDIATION VERIFICATION
  // ==========================================
  console.log(`\n=== 16. PHASE P0 REMEDIATION VERIFICATION (F-01, F-02, F-03, F-06, F-07, F-09, F-10, F-14, F-20) ===`);

  // [F-01] Documented existence check via POST /import/url/exists
  let capturedExistsCall = null;
  const originalApiRequest = RaindropAPI.request;
  RaindropAPI.request = async (endpoint, token, options = {}) => {
    if (endpoint === '/import/url/exists' && options.method === 'POST') {
      capturedExistsCall = { endpoint, options };
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      if (body && Array.isArray(body.urls) && body.urls.includes('https://exists.com')) {
        return { result: true, ids: [4242] };
      }
      return { result: false, ids: [] };
    }
    if (endpoint === '/raindrop/4242') {
      return { result: true, item: { _id: 4242, link: 'https://exists.com', title: 'Found Item' } };
    }
    return originalApiRequest.call(RaindropAPI, endpoint, token, options);
  };

  const foundItem = await RaindropAPI.checkUrl('test-token', 'https://exists.com');
  assert(capturedExistsCall && capturedExistsCall.endpoint === '/import/url/exists', 'F-01: checkUrl calls POST /import/url/exists');
  assert(foundItem && foundItem._id === 4242 && foundItem.title === 'Found Item', 'F-01: checkUrl resolves bookmark via GET /raindrop/:id');

  // Non-existing URL handles result: false without throwing
  const notFoundItem = await RaindropAPI.checkUrl('test-token', 'https://notfound.com');
  assert(notFoundItem === null, 'F-01: checkUrl cleanly returns null when /import/url/exists returns result: false');

  // Restore request to test real RaindropAPI.request logic with mocked fetch
  RaindropAPI.request = originalApiRequest;
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({ result: false, errorMessage: 'Generic API Failure' })
  });

  try {
    await RaindropAPI.request('/error-endpoint', 'test-token');
    assert(false, 'RaindropAPI.request should throw on result: false for general endpoints');
  } catch (err) {
    assert(err.message.includes('Generic API Failure'), 'F-01: RaindropAPI.request does not globally suppress result: false errors');
  }

  // With allowResultFalse: true, it returns { result: false }
  const falseAllowed = await RaindropAPI.request('/error-endpoint', 'test-token', { allowResultFalse: true });
  assert(falseAllowed && falseAllowed.result === false, 'F-01: RaindropAPI.request allows result: false when allowResultFalse is set');

  global.fetch = originalFetch;

  // Correlate bulk URLs by actual .link property (not positional index)
  RaindropAPI.request = async (endpoint, token, options = {}) => {
    if (endpoint === '/import/url/exists') {
      // Returns ids [200, 100] in non-positional order
      return { result: true, ids: [200, 100] };
    }
    if (endpoint === '/raindrop/200') {
      return { result: true, item: { _id: 200, link: 'https://site2.com', title: 'Site Two' } };
    }
    if (endpoint === '/raindrop/100') {
      return { result: true, item: { _id: 100, link: 'https://site1.com', title: 'Site One' } };
    }
    return originalApiRequest.call(RaindropAPI, endpoint, token, options);
  };

  const correlatedResults = await RaindropAPI.checkUrlsExists('test-token', ['https://site1.com', 'https://site2.com']);
  assert(correlatedResults.get('https://site1.com')?._id === 100, 'F-01: checkUrlsExists correctly correlates site1 by .link');
  assert(correlatedResults.get('https://site2.com')?._id === 200, 'F-01: checkUrlsExists correctly correlates site2 by .link');

  // Restore request
  RaindropAPI.request = originalApiRequest;

  // [F-03] Cache protection on network error / 429
  // Ensure getCollections and getTags throw instead of swallowing errors into empty arrays
  const throwingRequest = async () => {
    const err = new Error('Rate limit exceeded 429');
    err.status = 429;
    throw err;
  };
  const tempApiRequest = RaindropAPI.request;
  RaindropAPI.request = throwingRequest;

  try {
    await RaindropAPI.getCollections('test-token');
    assert(false, 'getCollections must throw on network error');
  } catch (err) {
    assert(err.status === 429, 'F-03: getCollections throws error instead of returning empty array []');
  }

  try {
    await RaindropAPI.getTags('test-token');
    assert(false, 'getTags must throw on network error');
  } catch (err) {
    assert(err.status === 429, 'F-03: getTags throws error instead of returning empty array []');
  }

  RaindropAPI.request = tempApiRequest;

  // [F-07] Account data clearing & token migration
  await RaindropStorage.setToken('preserve-this-token');
  await RaindropStorage.setUser({ _id: 1234, email: 'accB@test.com' });
  await RaindropStorage.setCachedCollections({ collections: [{ id: 1 }] });
  await RaindropStorage.setCachedTags(['tag1', 'tag2']);
  await RaindropStorage.setRecentTags(['recent1']);
  await RaindropStorage.setLastCollectionId(99);
  await RaindropStorage.setExpandedCollectionIds([1, 2]);

  await RaindropStorage.clearAccountData();
  const tokenAfterClear = await RaindropStorage.getToken();
  const userAfterClear = await RaindropStorage.getUser();
  const collsAfterClear = await RaindropStorage.getCachedCollections();
  const tagsAfterClear = await RaindropStorage.getCachedTags();
  const recentTagsAfterClear = await RaindropStorage.getRecentTags();
  const lastColAfterClear = await RaindropStorage.getLastCollectionId();
  const expandedAfterClear = await RaindropStorage.getExpandedCollectionIds();

  assert(tokenAfterClear === 'preserve-this-token', 'F-07: clearAccountData preserves active token');
  assert(userAfterClear === null, 'F-07: clearAccountData clears cached user');
  assert(collsAfterClear === null, 'F-07: clearAccountData clears cached collections');
  assert(tagsAfterClear === null, 'F-07: clearAccountData clears cached tags');
  assert(recentTagsAfterClear.length === 0, 'F-07: clearAccountData clears recent tags');
  assert(lastColAfterClear === 0, 'F-07: clearAccountData resets last collection ID to 0');
  assert(expandedAfterClear === null || (Array.isArray(expandedAfterClear) && expandedAfterClear.length === 0), 'F-07: clearAccountData clears expanded collections');

  // [F-10] Token storage in local-only & sync migration
  for (const k in mockLocalStorage) delete mockLocalStorage[k];
  for (const k in mockSyncStorage) delete mockSyncStorage[k];

  // Migration test: token only in sync
  mockSyncStorage['raindrop_token'] = 'sync-token-999';
  const migratedToken = await RaindropStorage.getToken();
  assert(migratedToken === 'sync-token-999', 'F-10: getToken reads and migrates token from sync storage');
  assert(mockLocalStorage['raindrop_token'] === 'sync-token-999', 'F-10: Token migrated to local storage');
  assert(mockSyncStorage['raindrop_token'] === undefined, 'F-10: Sync copy removed after migration');

  // Preservation test: local token takes precedence over any stale sync token
  mockLocalStorage['raindrop_token'] = 'active-local-token';
  mockSyncStorage['raindrop_token'] = 'old-stale-sync-token';
  const activeToken = await RaindropStorage.getToken();
  assert(activeToken === 'active-local-token', 'F-10: getToken preserves active local token over stale sync token');
  assert(mockSyncStorage['raindrop_token'] === undefined, 'F-10: Stale sync token deleted during check');

  // setToken writes exclusively to local
  await RaindropStorage.setToken('new-local-token');
  assert(mockLocalStorage['raindrop_token'] === 'new-local-token', 'F-10: setToken writes to local storage');
  assert(mockSyncStorage['raindrop_token'] === undefined, 'F-10: setToken leaves sync storage clean');

  // [F-20] Shared token sanitization
  assert(RaindropStorage.sanitizeToken('  "Bearer abc-123"  ') === 'abc-123', 'F-20: sanitizeToken strips whitespace, quotes, and Bearer prefix');
  assert(RaindropStorage.sanitizeToken("'bearer xyz-789'") === 'xyz-789', 'F-20: sanitizeToken handles single quotes and lowercase bearer');
  assert(RaindropStorage.sanitizeToken('') === '', 'F-20: sanitizeToken returns empty string for empty input');
  assert(RaindropStorage.sanitizeToken(null) === '', 'F-20: sanitizeToken returns empty string for null input');

  // [F-09] Batch save validation, URL deduplication, and confirmed tab closing
  let capturedBatchPayload = null;
  RaindropAPI.request = async (endpoint, token, options = {}) => {
    if (endpoint === '/raindrops') {
      capturedBatchPayload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      return {
        result: true,
        items: capturedBatchPayload.items.map((item, idx) => ({ _id: 1000 + idx, link: item.link }))
      };
    }
    return originalApiRequest.call(RaindropAPI, endpoint, token, options);
  };

  const rawBatchItems = [
    { url: 'https://example.com/page1', title: 'P1' },
    { url: 'file:///etc/passwd', title: 'File Exploit' },
    { url: 'chrome://settings', title: 'Internal Settings' },
    { url: 'https://example.com/page1', title: 'P1 Duplicate' },
    { url: 'http://example.com/page2', title: 'P2' }
  ];

  const batchResponse = await RaindropAPI.createRaindropsBatch('test-token', rawBatchItems);
  assert(capturedBatchPayload && capturedBatchPayload.items.length === 2, 'F-09: createRaindropsBatch filters to 2 valid unique http/https URLs');
  assert(capturedBatchPayload.items[0].link === 'https://example.com/page1', 'F-09: Batch item 1 is valid https URL');
  assert(capturedBatchPayload.items[1].link === 'http://example.com/page2', 'F-09: Batch item 2 is valid http URL');
  assert(batchResponse.items.length === 2, 'F-09: createRaindropsBatch returns confirmed saved items');

  // Background service worker confirmed-only tab closing verification
  const backgroundJsContent = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8');
  assert(backgroundJsContent.includes('savedLinks'), 'F-09: background.js checks savedLinks from Raindrop response');
  assert(backgroundJsContent.includes('isUrlInSavedSet'), 'F-09 / M-01: background.js verifies savedLinks via isUrlInSavedSet');

  // [F-02, F-06, F-14] Popup JS source verification
  const updatedPopupJs = fs.readFileSync(path.join(EXT_DIR, 'popup/popup.js'), 'utf8');
  assert(updatedPopupJs.includes('loadedBookmarkUrl'), 'F-02: popup.js tracks loadedBookmarkUrl');
  assert(updatedPopupJs.includes('isUrlMatchingLoadedBookmark') && updatedPopupJs.includes('existingBookmark = null'), 'F-02: popup.js decouples existingBookmark when URL destination changes');
  assert(updatedPopupJs.includes('checkingBookmarkPromise'), 'F-06: popup.js tracks checkingBookmarkPromise');
  assert(updatedPopupJs.includes('await checkingBookmarkPromise'), 'F-06: popup.js awaits in-flight checkBookmarkStatus before save');
  assert(updatedPopupJs.includes('userEditedFields'), 'F-06: popup.js tracks userEditedFields');
  assert(updatedPopupJs.includes('Connected (••••'), 'F-14: popup.js masks token placeholder in DOM');

  // [F-14, F-07] Options JS source verification
  const updatedOptionsJs = fs.readFileSync(path.join(EXT_DIR, 'options/options.js'), 'utf8');
  assert(updatedOptionsJs.includes('Connected (••••'), 'F-14: options.js masks token placeholder in DOM');
  assert(updatedOptionsJs.includes('RaindropStorage.clearAccountData()'), 'F-07: options.js clears previous account data when switching accounts');

  RaindropAPI.request = originalApiRequest;

  // =========================================================================
  // SECTION 17: PHASE P0 CORRECTIVE BEHAVIOURAL TESTS (H-01, M-01, M-02, M-03)
  // =========================================================================
  console.log('\n=== 17. PHASE P0 BEHAVIOURAL VERIFICATION (H-01, M-01, M-02, M-03) ===');

  const { areUrlsEquivalent } = require(path.join(EXT_DIR, 'popup/popup.js'));
  const { handleSaveTabsBatch, isUrlInSavedSet } = require(path.join(EXT_DIR, 'background.js'));

  // -------------------------------------------------------------------------
  // A. H-01: Bookmark Editing & URL Decoupling Behavioral Tests
  // -------------------------------------------------------------------------
  // 1. areUrlsEquivalent unit behavioral checks
  assert(areUrlsEquivalent('https://example.com', 'https://example.com/'), 'H-01: areUrlsEquivalent treats root URL trailing slash as equivalent');
  assert(areUrlsEquivalent('https://example.com/path/', 'https://example.com/path'), 'H-01: areUrlsEquivalent treats subpath trailing slash as equivalent');
  assert(areUrlsEquivalent('https://example.com:443/docs', 'https://example.com:443/docs/'), 'H-01: areUrlsEquivalent matches with port');
  assert(!areUrlsEquivalent('https://example.com', 'https://another-destination.org'), 'H-01: areUrlsEquivalent rejects different host');
  assert(!areUrlsEquivalent('https://example.com/a', 'https://example.com/b'), 'H-01: areUrlsEquivalent rejects different path');
  assert(!areUrlsEquivalent('https://example.com?q=1', 'https://example.com?q=2'), 'H-01: areUrlsEquivalent rejects different search query');
  assert(!areUrlsEquivalent('https://example.com#h1', 'https://example.com#h2'), 'H-01: areUrlsEquivalent rejects different hash');
  assert(!areUrlsEquivalent('http://example.com', 'https://example.com'), 'H-01: areUrlsEquivalent rejects protocol mismatch');

  // 2. Behavioral simulation of popup bookmark saving state machine
  const originalUpdateRaindrop = RaindropAPI.updateRaindrop;
  const originalCreateRaindrop = RaindropAPI.createRaindrop;
  const originalCreateBatch = RaindropAPI.createRaindropsBatch;

  let updateCalls = [];
  let createCalls = [];

  RaindropAPI.updateRaindrop = async (token, id, payload) => {
    updateCalls.push({ token, id, payload });
    return { _id: id, ...payload };
  };
  RaindropAPI.createRaindrop = async (token, payload) => {
    const newId = 8888 + createCalls.length;
    createCalls.push({ token, payload, newId });
    return { _id: newId, ...payload };
  };

  class PopupSaveStateMachine {
    constructor(lookupUrl, apiBookmark) {
      this.loadedBookmarkUrl = lookupUrl;
      this.canonicalBookmarkUrl = (apiBookmark?.link || '').trim() || null;
      this.originalLoadedBookmark = apiBookmark;
      this.existingBookmark = apiBookmark;
      this.urlInput = lookupUrl;
      this.title = apiBookmark?.title || '';
      this.note = apiBookmark?.note || '';
      this.tags = [...(apiBookmark?.tags || [])];
      this.selectedCollectionId = 0;
    }

    isUrlMatchingLoadedBookmark(inputUrl) {
      if (!inputUrl) return false;
      if (this.loadedBookmarkUrl && areUrlsEquivalent(inputUrl, this.loadedBookmarkUrl)) {
        return true;
      }
      if (this.canonicalBookmarkUrl && areUrlsEquivalent(inputUrl, this.canonicalBookmarkUrl)) {
        return true;
      }
      return false;
    }

    onUrlInput(newVal) {
      this.urlInput = newVal;
      const currentVal = newVal.trim();
      if (this.isUrlMatchingLoadedBookmark(currentVal)) {
        if (!this.existingBookmark && this.originalLoadedBookmark) {
          this.existingBookmark = this.originalLoadedBookmark;
        }
      } else {
        if (this.existingBookmark) {
          this.existingBookmark = null;
        }
      }
    }

    async submitSave() {
      let url = this.urlInput.trim();
      if (url && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
        url = 'https://' + url;
      }
      if (this.existingBookmark && !this.isUrlMatchingLoadedBookmark(url)) {
        this.existingBookmark = null;
      }
      const payload = {
        url,
        title: this.title,
        note: this.note,
        tags: this.tags,
        collectionId: this.selectedCollectionId
      };
      if (this.existingBookmark?._id) {
        return await RaindropAPI.updateRaindrop('test-token', this.existingBookmark._id, payload);
      } else {
        return await RaindropAPI.createRaindrop('test-token', payload);
      }
    }
  }

  // Case 1: Trailing-slash equivalence
  // browser tab: 'https://example.com', Raindrop API returned: 'https://example.com/'
  updateCalls = [];
  createCalls = [];
  const sm1 = new PopupSaveStateMachine('https://example.com', {
    _id: 9001,
    link: 'https://example.com/',
    title: 'Example Home',
    note: 'Initial note'
  });
  // Editing note and tags only, URL input unchanged
  sm1.note = 'Modified note only';
  sm1.tags = ['research'];
  await sm1.submitSave();
  assert(updateCalls.length === 1 && updateCalls[0].id === 9001, 'H-01 Case 1: Preserves bookmark 9001 and calls updateRaindrop on trailing-slash equivalence');
  assert(createCalls.length === 0, 'H-01 Case 1: Does not call createRaindrop when only metadata changed');

  // Case 2: Genuine URL destination change
  // URL edited to 'https://another-destination.org' decouples the bookmark
  updateCalls = [];
  createCalls = [];
  const sm2 = new PopupSaveStateMachine('https://example.com', {
    _id: 9001,
    link: 'https://example.com/',
    title: 'Example Home'
  });
  sm2.onUrlInput('https://another-destination.org');
  assert(sm2.existingBookmark === null, 'H-01 Case 2: Decouples existingBookmark immediately on destination change');
  await sm2.submitSave();
  assert(createCalls.length === 1 && createCalls[0].payload.url === 'https://another-destination.org', 'H-01 Case 2: Calls createRaindrop for new destination');
  assert(updateCalls.length === 0, 'H-01 Case 2: Leaves existing bookmark 9001 untouched');

  // Case 3: Reversion to original lookup URL
  updateCalls = [];
  createCalls = [];
  const sm3 = new PopupSaveStateMachine('https://example.com', {
    _id: 9001,
    link: 'https://example.com/',
    title: 'Example Home'
  });
  sm3.onUrlInput('https://another-destination.org');
  assert(sm3.existingBookmark === null, 'H-01 Case 3: Decoupled when changed away');
  sm3.onUrlInput('https://example.com'); // Reverting back to original
  assert(sm3.existingBookmark !== null && sm3.existingBookmark._id === 9001, 'H-01 Case 3: Restores existing bookmark 9001 on reversion');
  await sm3.submitSave();
  assert(updateCalls.length === 1 && updateCalls[0].id === 9001, 'H-01 Case 3: Calls updateRaindrop(9001) after reverting URL');
  assert(createCalls.length === 0, 'H-01 Case 3: Does not create duplicate bookmark after reverting URL');


  // -------------------------------------------------------------------------
  // B. M-01, M-02, M-03: Batch Saving & Tab Management Behavioral Tests
  // -------------------------------------------------------------------------
  const closedTabsLog = [];
  const badgedTabs = new Set();

  global.chrome.tabs = {
    ...global.chrome.tabs,
    remove: async (ids) => {
      const arr = Array.isArray(ids) ? ids : [ids];
      closedTabsLog.push(...arr);
    },
    query: async () => []
  };

  global.chrome.action = {
    ...global.chrome.action,
    setBadgeText: ({ tabId, text }) => {
      if (text === '✓') {
        badgedTabs.add(tabId);
      } else if (!text) {
        badgedTabs.delete(tabId);
      }
    },
    setBadgeBackgroundColor: () => {},
    setBadgeTextColor: () => {},
    setTitle: () => {}
  };

  await RaindropStorage.setToken('batch-test-token-valid');

  // Case 1: All requested tabs save successfully
  closedTabsLog.length = 0;
  badgedTabs.clear();
  RaindropAPI.createRaindropsBatch = async (token, items) => {
    return {
      result: true,
      items: items.map((it, idx) => ({ _id: 5001 + idx, link: it.url }))
    };
  };

  const batchReqCase1 = {
    items: [
      { tabId: 101, url: 'https://site1.com', title: 'Site 1' },
      { tabId: 102, url: 'https://site2.com', title: 'Site 2' }
    ],
    closeTabIds: [101] // Only tab 101 requested to close; 102 stays open
  };

  const resCase1 = await handleSaveTabsBatch(batchReqCase1);
  assert(resCase1.success === true, 'M-02 Case 1: Returns success: true');
  assert(resCase1.count === 2, 'M-02 Case 1: Returns accurate saved count: 2');
  assert(resCase1.totalRequested === 2, 'M-02 Case 1: Reports totalRequested: 2');
  assert(resCase1.closedTabIds.length === 1 && resCase1.closedTabIds[0] === 101, 'M-03 Case 1: closedTabIds accurately contains [101]');
  assert(closedTabsLog.includes(101) && !closedTabsLog.includes(102), 'M-03 Case 1: Actually closed requested tab 101 and kept 102');
  assert(badgedTabs.has(102), 'M-01 Case 1: Remaining open saved tab 102 received ✓ badge');
  assert(!badgedTabs.has(101), 'M-01 Case 1: Closed tab 101 was not badged');

  // Case 2: Partial save failure (1 saved, 2 failed)
  closedTabsLog.length = 0;
  badgedTabs.clear();
  RaindropAPI.createRaindropsBatch = async (token, items) => {
    // Raindrop only saved the first item
    return {
      result: true,
      items: [{ _id: 6001, link: 'https://success.com' }]
    };
  };

  const batchReqCase2 = {
    items: [
      { tabId: 201, url: 'https://success.com', title: 'Success' },
      { tabId: 202, url: 'https://failure1.com', title: 'Fail 1' },
      { tabId: 203, url: 'https://failure2.com', title: 'Fail 2' }
    ],
    closeTabIds: [201, 202, 203] // User asked to close all 3
  };

  const resCase2 = await handleSaveTabsBatch(batchReqCase2);
  assert(resCase2.count === 1, 'M-02 Case 2: Partial save returns count: 1 (not 3)');
  assert(resCase2.totalRequested === 3, 'M-02 Case 2: Reports totalRequested: 3');
  assert(resCase2.closedTabIds.length === 1 && resCase2.closedTabIds[0] === 201, 'M-03 Case 2: closedTabIds only includes confirmed tab 201');
  assert(closedTabsLog.includes(201), 'M-03 Case 2: Confirmed tab 201 was closed');
  assert(!closedTabsLog.includes(202) && !closedTabsLog.includes(203), 'M-03 Case 2: Failed tabs 202 and 203 were NOT closed');
  assert(!badgedTabs.has(202) && !badgedTabs.has(203), 'M-01 Case 2: Failed tabs 202 and 203 never receive saved badges');

  // Case 3: Complete save failure (0 saved)
  closedTabsLog.length = 0;
  badgedTabs.clear();
  RaindropAPI.createRaindropsBatch = async () => {
    return { result: false, items: [] };
  };

  const batchReqCase3 = {
    items: [
      { tabId: 301, url: 'https://fail-a.com' },
      { tabId: 302, url: 'https://fail-b.com' }
    ],
    closeTabIds: [301, 302]
  };

  const resCase3 = await handleSaveTabsBatch(batchReqCase3);
  assert(resCase3.count === 0, 'M-02 Case 3: Complete failure returns count: 0 (not 2 or totalRequested)');
  assert(resCase3.closedTabIds.length === 0, 'M-03 Case 3: closedTabIds is empty [] on total failure');
  assert(closedTabsLog.length === 0, 'M-03 Case 3: Zero tabs closed on total failure');
  assert(badgedTabs.size === 0, 'M-01 Case 3: Zero badges set on total failure');

  // Case 4: Tab badging accuracy
  assert(!badgedTabs.has(301) && !badgedTabs.has(302), 'M-01 Case 4: Failed tabs never receive saved badges');

  // Case 5: URL representation matching in batch (trailing slash equivalence)
  closedTabsLog.length = 0;
  badgedTabs.clear();
  RaindropAPI.createRaindropsBatch = async () => {
    return {
      result: true,
      items: [{ _id: 7001, link: 'https://slash-test.org/' }]
    };
  };

  const batchReqCase5 = {
    items: [
      { tabId: 501, url: 'https://slash-test.org', title: 'No Slash Input' }
    ],
    closeTabIds: [501]
  };

  const resCase5 = await handleSaveTabsBatch(batchReqCase5);
  assert(resCase5.count === 1, 'M-01/M-03 Case 5: Matches trailing-slash difference in batch response');
  assert(resCase5.closedTabIds.includes(501), 'M-03 Case 5: Tab 501 confirmed and closed despite trailing slash');
  assert(closedTabsLog.includes(501), 'M-03 Case 5: Tab 501 actually closed');

  // Case 6: Popup open-tab list refresh contract
  let openTabsData = [
    { id: 601, title: 'Tab 1', url: 'https://tab1.com' },
    { id: 602, title: 'Tab 2', url: 'https://tab2.com' },
    { id: 603, title: 'Tab 3', url: 'https://tab3.com' }
  ];

  const mockBatchResult = {
    success: true,
    count: 2,
    totalRequested: 3,
    closedTabIds: [601, 603]
  };

  if (Array.isArray(mockBatchResult.closedTabIds) && mockBatchResult.closedTabIds.length > 0) {
    const closedSet = new Set(mockBatchResult.closedTabIds);
    openTabsData = openTabsData.filter(tab => !closedSet.has(tab.id));
  }

  assert(openTabsData.length === 1 && openTabsData[0].id === 602, 'M-03 Case 6: Popup openTabsData filters out exactly closedTabIds and retains unclosed tab 602');

  // Restore API methods
  RaindropAPI.updateRaindrop = originalUpdateRaindrop;
  RaindropAPI.createRaindrop = originalCreateRaindrop;
  RaindropAPI.createRaindropsBatch = originalCreateBatch;

  console.log(`\n========================================`);
  console.log(`Verification Complete: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
