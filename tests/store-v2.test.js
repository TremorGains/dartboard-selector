import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  STORAGE_KEY_V2,
  createMemoryStorage,
  saveState,
  loadAppState,
  saveAppState,
  parseAppState,
  hydrateAppImages,
} from '../src/store.js';
import { DEFAULT_THEME } from '../src/themes.js';
import { MAX_BOARDS } from '../src/boards.js';

const text = (id, label = id) => ({ id, type: 'text', label });
const image = (id, imageId) => ({ id, type: 'image', label: id, imageId });
const board = (id, entries = [], extra = {}) => ({ id, name: `Board ${id}`, entries, layoutSeed: 1, ...extra });
const saved = (appState) => JSON.stringify({ version: 2, ...appState });

test('with nothing saved, the app starts with one empty "My board" and default settings', () => {
  const state = loadAppState(createMemoryStorage());
  assert.equal(state.boards.length, 1);
  assert.equal(state.boards[0].name, 'My board');
  assert.deepEqual(state.boards[0].entries, []);
  assert.equal(state.activeBoardId, state.boards[0].id);
  assert.deepEqual(state.settings, { muted: false, theme: DEFAULT_THEME });
});

test('an existing single-board save moves into "My board" with its entries, layout and sound setting', () => {
  const storage = createMemoryStorage();
  const pinned = { ...text('b'), pos: { x: 1, y: 2, z: 1 } };
  saveState(storage, { entries: [text('a'), pinned], muted: true, layoutSeed: 99 });
  const state = loadAppState(storage);
  assert.equal(state.boards.length, 1);
  const [only] = state.boards;
  assert.equal(only.name, 'My board');
  assert.deepEqual(only.entries, [text('a'), pinned]);
  assert.equal(only.layoutSeed, 99);
  assert.equal(state.activeBoardId, only.id);
  assert.deepEqual(state.settings, { muted: true, theme: DEFAULT_THEME });
});

test('save then load round-trips every board and setting, and retires the old save', () => {
  const storage = createMemoryStorage();
  saveState(storage, { entries: [text('old')], muted: false, layoutSeed: 1 });
  const state = {
    boards: [board('b1', [text('a')]), board('b2', [image('p', 'img-1')], { layoutSeed: 5 })],
    activeBoardId: 'b2',
    settings: { muted: true, theme: { ...DEFAULT_THEME, notes: 'mint' } },
  };
  saveAppState(storage, state);
  assert.deepEqual(loadAppState(storage), state);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('the new save wins over a leftover old one', () => {
  const storage = createMemoryStorage();
  storage.setItem(
    STORAGE_KEY_V2,
    saved({ boards: [board('b1', [text('new')])], activeBoardId: 'b1', settings: { muted: false, theme: DEFAULT_THEME } }),
  );
  saveState(storage, { entries: [text('old')], muted: false, layoutSeed: 1 });
  assert.deepEqual(loadAppState(storage).boards[0].entries, [text('new')]);
});

test('a corrupt save falls back to the old save if there is one, otherwise to a fresh board', () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY_V2, '{nope');
  assert.deepEqual(loadAppState(storage).boards[0].entries, []);
  saveState(storage, { entries: [text('old')], muted: false, layoutSeed: 1 });
  assert.deepEqual(loadAppState(storage).boards[0].entries, [text('old')]);
});

test('parseAppState repairs bad boards, entries, names, ids and settings', () => {
  const json = saved({
    boards: [
      board('b1', [text('ok'), { id: 'x', type: 'video', label: 'no' }]),
      { name: 'no id', entries: [] },
      { ...board('b2'), name: '   ', layoutSeed: -5 },
    ],
    activeBoardId: 'missing',
    settings: { muted: 'yes', theme: { board: 'neon', dart: 'nope' } },
  });
  const state = parseAppState(json);
  assert.deepEqual(state.boards.map((b) => b.id), ['b1', 'b2']);
  assert.deepEqual(state.boards[0].entries, [text('ok')]);
  assert.equal(state.boards[1].name, 'Board 2');
  assert.equal(state.boards[1].layoutSeed, 1);
  assert.equal(state.activeBoardId, 'b1');
  assert.deepEqual(state.settings, { muted: false, theme: { ...DEFAULT_THEME, board: 'neon' } });
});

test('parseAppState keeps at most MAX_BOARDS boards and 50 entries per board', () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    board(`b${i}`, Array.from({ length: 60 }, (_, j) => text(`e${i}-${j}`))),
  );
  const state = parseAppState(saved({ boards: many, activeBoardId: 'b0', settings: {} }));
  assert.equal(state.boards.length, MAX_BOARDS);
  assert.ok(state.boards.every((b) => b.entries.length === 50));
});

test('parseAppState returns null for a save it cannot use', () => {
  for (const json of [null, '{nope', 'null', '[]', '{"boards": []}', '{"boards": 5}']) {
    assert.equal(parseAppState(json), null, String(json));
  }
});

test('hydrateAppImages loads pictures for every board and drops entries whose picture is missing', async () => {
  const blob = new Blob(['png']);
  const state = {
    boards: [board('b1', [image('p1', 'img-1')]), board('b2', [text('t'), image('p2', 'img-missing')])],
    activeBoardId: 'b1',
    settings: { muted: false, theme: DEFAULT_THEME },
  };
  const blobStore = { get: async (id) => (id === 'img-1' ? blob : undefined) };
  const result = await hydrateAppImages(state, blobStore);
  assert.deepEqual(result.state.boards[0].entries, [image('p1', 'img-1')]);
  assert.deepEqual(result.state.boards[1].entries, [text('t')]);
  assert.equal(result.images.get('img-1'), blob);
  assert.equal(result.images.size, 1);
});
