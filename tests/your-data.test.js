import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_VERSION, buildExport, deleteAllData } from '../src/your-data.js';
import { STORAGE_KEY, createMemoryStorage, saveState } from '../src/store.js';

const state = {
  entries: [
    { id: 'a', type: 'text', label: 'Ava', pos: { x: 1, y: 2, z: 1 } },
    { id: 'b', type: 'image', label: 'Team', imageId: 'img-1' },
  ],
  muted: true,
  layoutSeed: 7,
};

test('buildExport includes every entry, the settings, and pictures as data URLs', async () => {
  const images = new Map([['img-1', new Blob(['png-bytes'])]]);
  const toDataUrl = async (blob) => `data:test,${await blob.text()}`;
  const result = await buildExport(state, images, { toDataUrl, exportedAt: '2026-09-15T00:00:00.000Z' });
  assert.deepEqual(result, {
    app: 'DartPick',
    version: EXPORT_VERSION,
    exportedAt: '2026-09-15T00:00:00.000Z',
    settings: { muted: true, layoutSeed: 7 },
    entries: [
      { id: 'a', type: 'text', label: 'Ava', pos: { x: 1, y: 2, z: 1 } },
      { id: 'b', type: 'image', label: 'Team', image: 'data:test,png-bytes' },
    ],
  });
});

test('buildExport records a picture missing from storage as null instead of failing', async () => {
  const result = await buildExport(state, new Map(), { toDataUrl: async () => 'unused', exportedAt: 't' });
  assert.equal(result.entries[1].image, null);
});

test('deleteAllData removes the saved board and every stored picture', async () => {
  const storage = createMemoryStorage();
  saveState(storage, state);
  let cleared = false;
  await deleteAllData({ storage, blobStore: { clear: async () => { cleared = true; } } });
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(cleared, true);
});

test('deleteAllData still clears the saved board when there is no picture store', async () => {
  const storage = createMemoryStorage();
  saveState(storage, state);
  await deleteAllData({ storage, blobStore: null });
  assert.equal(storage.getItem(STORAGE_KEY), null);
});
