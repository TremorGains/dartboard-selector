import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  emptyState,
  parseState,
  loadState,
  saveState,
  hydrateImages,
  createMemoryStorage,
} from '../src/store.js';

const text = (id, label = id) => ({ id, type: 'text', label });
const image = (id, imageId) => ({ id, type: 'image', label: id, imageId });

function fakeBlobStore(blobs) {
  const map = new Map(Object.entries(blobs));
  return {
    get: async (id) => map.get(id),
    put: async (id, blob) => {
      map.set(id, blob);
    },
    delete: async (id) => {
      map.delete(id);
    },
    clear: async () => {
      map.clear();
    },
  };
}

test('save then load round-trips the state', () => {
  const storage = createMemoryStorage();
  const state = { entries: [text('a'), image('b', 'img-b')], muted: true, layoutSeed: 1234 };
  saveState(storage, state);
  assert.deepEqual(loadState(storage), state);
});

test('saveState writes only the persistent fields under STORAGE_KEY', () => {
  const storage = createMemoryStorage();
  saveState(storage, { entries: [], muted: false, layoutSeed: 5, busy: true });
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { entries: [], muted: false, layoutSeed: 5 });
});

test('nothing saved yet gives an empty board', () => {
  assert.deepEqual(loadState(createMemoryStorage()), emptyState());
});

test('corrupt JSON gives an empty board', () => {
  assert.deepEqual(parseState('{nope'), emptyState());
});

test('wrong shapes give an empty board', () => {
  for (const json of ['null', '42', '[]', '{"entries": 5}', '"hi"']) {
    assert.deepEqual(parseState(json), emptyState(), json);
  }
});

test('invalid entries are dropped, valid ones kept', () => {
  const json = JSON.stringify({
    entries: [
      text('ok'),
      { id: 'bad-type', type: 'video', label: 'x' },
      { type: 'text', label: 'no id' },
      { id: 'empty', type: 'text', label: '' },
      { id: 'img-no-blob-id', type: 'image', label: 'x' },
      image('pic', 'img-1'),
      null,
    ],
    muted: false,
    layoutSeed: 3,
  });
  assert.deepEqual(parseState(json).entries, [text('ok'), image('pic', 'img-1')]);
});

test('unknown entry fields are stripped', () => {
  const json = JSON.stringify({ entries: [{ ...text('a'), extra: 1 }], muted: false, layoutSeed: 1 });
  assert.deepEqual(parseState(json).entries, [text('a')]);
});

test('a dragged position round-trips with its entry', () => {
  const storage = createMemoryStorage();
  const state = { entries: [{ ...text('a'), pos: { x: 12.5, y: -30, z: 3 } }, text('b')], muted: false, layoutSeed: 7 };
  saveState(storage, state);
  assert.deepEqual(loadState(storage), state);
});

test('an invalid position is dropped but its entry is kept', () => {
  const bad = [null, 'x', { x: 1, y: 2 }, { x: '1', y: 2, z: 1 }, { x: 1, y: null, z: 1 }, { x: 1, y: 2, z: 0 }, { x: 1, y: 2, z: 1.5 }];
  const json = JSON.stringify({ entries: bad.map((pos, i) => ({ ...text(`e${i}`), pos })), muted: false, layoutSeed: 1 });
  assert.deepEqual(parseState(json).entries, bad.map((_, i) => text(`e${i}`)));
});

test('unknown position fields are stripped', () => {
  const json = JSON.stringify({ entries: [{ ...text('a'), pos: { x: 1, y: 2, z: 1, extra: true } }], muted: false, layoutSeed: 1 });
  assert.deepEqual(parseState(json).entries, [{ ...text('a'), pos: { x: 1, y: 2, z: 1 } }]);
});

test('bad settings fall back to defaults', () => {
  for (const layoutSeed of [-1, 1.5, '3', 2 ** 32, null]) {
    const state = parseState(JSON.stringify({ entries: [], muted: 'yes', layoutSeed }));
    assert.equal(state.muted, false);
    assert.equal(state.layoutSeed, 1, `seed ${layoutSeed}`);
  }
});

test('loading caps entries at 50', () => {
  const entries = Array.from({ length: 60 }, (_, i) => text(`e${i}`));
  assert.equal(parseState(JSON.stringify({ entries, muted: false, layoutSeed: 1 })).entries.length, 50);
});

test('hydrateImages loads blobs and drops entries whose blob is missing', async () => {
  const blob = new Blob(['png-bytes']);
  const state = { entries: [text('a'), image('b', 'img-b'), image('c', 'img-missing')], muted: false, layoutSeed: 1 };
  const result = await hydrateImages(state, fakeBlobStore({ 'img-b': blob }));
  assert.deepEqual(result.state.entries, [text('a'), image('b', 'img-b')]);
  assert.equal(result.images.get('img-b'), blob);
  assert.equal(result.images.size, 1);
});

test('hydrateImages without a blob store drops every image entry', async () => {
  const state = { entries: [text('a'), image('b', 'img-b')], muted: false, layoutSeed: 1 };
  const result = await hydrateImages(state, null);
  assert.deepEqual(result.state.entries, [text('a')]);
  assert.equal(result.images.size, 0);
});

test('hydrateImages treats a failing blob read as missing', async () => {
  const failing = { get: async () => { throw new Error('boom'); } };
  const state = { entries: [image('b', 'img-b')], muted: false, layoutSeed: 1 };
  const result = await hydrateImages(state, failing);
  assert.deepEqual(result.state.entries, []);
});
