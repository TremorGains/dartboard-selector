import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_VERSION, buildExport, deleteAllData } from '../src/your-data.js';
import { STORAGE_KEY, STORAGE_KEY_V2, createMemoryStorage } from '../src/store.js';
import { DEFAULT_THEME } from '../src/themes.js';

const appState = {
  boards: [
    {
      id: 'b1',
      name: 'Team',
      layoutSeed: 7,
      entries: [
        { id: 'a', type: 'text', label: 'Ava', pos: { x: 1, y: 2, z: 1 } },
        { id: 'b', type: 'image', label: 'Pic', imageId: 'img-1' },
      ],
    },
    { id: 'b2', name: 'Raffle', layoutSeed: 3, entries: [] },
  ],
  activeBoardId: 'b1',
  settings: { muted: true, theme: { ...DEFAULT_THEME, dart: 'blue' } },
};

test('buildExport includes every board, the settings, and pictures as data URLs', async () => {
  const images = new Map([['img-1', new Blob(['png-bytes'])]]);
  const toDataUrl = async (blob) => `data:test,${await blob.text()}`;
  const result = await buildExport(appState, images, { toDataUrl, exportedAt: '2026-09-19T00:00:00.000Z' });
  assert.equal(EXPORT_VERSION, 2);
  assert.deepEqual(result, {
    app: 'DartPick',
    version: EXPORT_VERSION,
    exportedAt: '2026-09-19T00:00:00.000Z',
    settings: { muted: true, theme: { ...DEFAULT_THEME, dart: 'blue' } },
    boards: [
      {
        name: 'Team',
        entries: [
          { id: 'a', type: 'text', label: 'Ava', pos: { x: 1, y: 2, z: 1 } },
          { id: 'b', type: 'image', label: 'Pic', image: 'data:test,png-bytes' },
        ],
      },
      { name: 'Raffle', entries: [] },
    ],
  });
});

test('buildExport records a picture missing from storage as null instead of failing', async () => {
  const result = await buildExport(appState, new Map(), { toDataUrl: async () => 'unused', exportedAt: 't' });
  assert.equal(result.boards[0].entries[1].image, null);
});

test('deleteAllData removes the current and the old saved data, and every stored picture', async () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY, '{}');
  storage.setItem(STORAGE_KEY_V2, '{}');
  let cleared = false;
  await deleteAllData({ storage, blobStore: { clear: async () => { cleared = true; } } });
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem(STORAGE_KEY_V2), null);
  assert.equal(cleared, true);
});

test('deleteAllData still clears saved data when there is no picture store', async () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY_V2, '{}');
  await deleteAllData({ storage, blobStore: null });
  assert.equal(storage.getItem(STORAGE_KEY_V2), null);
});
