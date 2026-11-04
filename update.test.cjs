const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');

function fixture({ dirty = false, playing = false, hidden = false, online = true, servedVersion = 'small-room-v14' } = {}) {
  const records = new Map([['journal-2026-11-01', 'test saved entry'], ['unrelated', 'keep']]);
  const before = [...records];
  const elements = new Map();
  const handlers = {};
  for (const id of ['audio-player', 'journal-entry', 'btn-restore-journal-for-update', 'app-update-notice', 'app-update-message']) {
    elements.set(id, { value: 'test draft', hidden: true, classList: { contains: () => !playing, remove() {}, add() {} } });
  }
  let resolveFetch;
  const context = vm.createContext({
    console, URL, Date, Map, Set, Promise, Math, JSON, String, Number,
    setTimeout: () => 1, clearTimeout() {},
    document: { hidden, addEventListener: (type, fn) => { handlers[type] = fn; },
      getElementById: id => elements.get(id), querySelector: () => ({ classList: { remove() {} } }) },
    window: { location: { href: 'https://example.test/app/', replace: url => navigations.push(url) }, addEventListener() {} },
    navigator: {},
    localStorage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) },
    fetch: async () => { if (!online) throw Error('offline'); if (resolveFetch === 'pending') await new Promise(r => { resolveFetch = r; }); return { ok: true, text: async () => '<html></html>' }; },
    DOMParser: class { parseFromString() { return { querySelector: () => ({ content: servedVersion }) }; } },
  });
  const navigations = [];
  vm.runInContext(source, context);
  vm.runInContext(`appUpdateState.ready = true; appUpdateState.targetVersion = 'small-room-v14'; journalSessionEdited = ${dirty};`, context);
  return { context, records, before, elements, navigations, run: s => vm.runInContext(s, context),
    pending: () => { resolveFetch = 'pending'; }, release: () => resolveFetch(),
    unchanged: () => assert.deepEqual([...records], before) };
}

test('safe stale shell automatically navigates using a cache-busting version; records untouched', async () => {
  const f = fixture(); await f.run('applyAppUpdate()');
  assert.deepEqual(f.navigations, ['https://example.test/app/index.html?app-shell=small-room-v14']); f.unchanged();
  await f.run('applyAppUpdate()'); assert.equal(f.navigations.length, 1);
});
test('unsaved text, including deletion to empty, prevents replacement', async () => {
  for (const value of ['draft', '']) { const f = fixture({ dirty: true }); f.elements.get('journal-entry').value = value;
    await f.run('applyAppUpdate()'); assert.equal(f.navigations.length, 0); assert.equal(f.elements.get('journal-entry').value, value); f.unchanged(); }
});
test('playing audio and background pages defer replacement', async () => {
  for (const options of [{ playing: true }, { hidden: true }]) { const f = fixture(options); await f.run('applyAppUpdate()'); assert.equal(f.navigations.length, 0); f.unchanged(); }
});
test('offline and not-yet-deployed HTML never reload into a loop', async () => {
  for (const options of [{ online: false }, { servedVersion: 'small-room-v13' }]) { const f = fixture(options); await f.run('applyAppUpdate()'); assert.equal(f.navigations.length, 0); f.unchanged(); }
});
test('typing during network fetch prevents navigation', async () => {
  const f = fixture(); f.pending(); const task = f.run('applyAppUpdate()');
  f.run('journalSessionEdited = true'); f.release(); await task; assert.equal(f.navigations.length, 0); f.unchanged();
});
test('audio starting during network fetch prevents navigation', async () => {
  const f = fixture(); f.pending(); const task = f.run('applyAppUpdate()');
  f.elements.get('audio-player').classList.contains = () => false; f.release(); await task;
  assert.equal(f.navigations.length, 0); f.unchanged();
});
test('closing player retries pending update', async () => {
  const f = fixture({ playing: true }); f.elements.get('audio-player').classList.add = () => { f.elements.get('audio-player').classList.contains = () => true; };
  f.run('closeAudio()'); await f.run('appUpdateState.applying'); assert.equal(f.navigations.length, 1); f.unchanged();
});
test('saving preserves other dates and then allows automatic replacement', async () => {
  const f = fixture({ dirty: true }); f.elements.set('toast', { classList: { add() {}, remove() {} } });
  f.run('saveJournal()'); await f.run('appUpdateState.applying');
  assert.equal(f.records.get('journal-2026-11-01'), 'test saved entry'); assert.equal(f.records.get('unrelated'), 'keep');
  assert.equal(f.navigations.length, 1);
});
test('shell assets and SW use one version and only application caches are removed', () => {
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8'); const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8');
  assert.match(html, /app-shell-version" content="small-room-v14"/); assert.match(html, /app.js\?v=14/); assert.match(html, /styles.css\?v=14/);
  assert.match(sw, /app.js\?v=14/); assert.match(sw, /styles.css\?v=14/); assert.match(sw, /key.startsWith\('small-room-'\)/);
  assert.doesNotMatch(sw, /localStorage|indexedDB|Clear-Site-Data/);
});
test('old worker messages cannot downgrade a new screen', () => {
  const f = fixture(); f.run("appUpdateState.ready = false; appUpdateState.targetVersion = null; receiveAppVersion({ data: { type: 'SELF_CARE_APP_VERSION', version: 'small-room-v13' } })");
  assert.equal(f.run('appUpdateState.ready'), false); assert.equal(f.navigations.length, 0); f.unchanged();
});

