import { test } from 'node:test';
import assert from 'node:assert/strict';

// Browser modules must at least load in Node: this catches syntax errors and
// broken import/export names. main.js is excluded because it touches the DOM on load.
const MODULES = {
  '../src/board.js': ['createBoard', 'toPercent', 'PLAYABLE_RADIUS'],
  '../src/panel.js': ['createPanel'],
  '../src/toast.js': ['toast'],
  '../src/dart.js': ['throwDart', 'clearDarts', 'FLIGHT_MS'],
  '../src/sound.js': ['createSound'],
  '../src/reveal.js': ['createReveal'],
  '../src/images.js': ['isImageFile', 'resizeImage'],
  '../src/image-store.js': ['openImageStore'],
  '../src/board-menu.js': ['createBoardMenu'],
  '../src/customise.js': ['createCustomise'],
};

for (const [path, names] of Object.entries(MODULES)) {
  test(`${path} loads and exports ${names.join(', ')}`, async () => {
    const mod = await import(path);
    for (const name of names) assert.ok(name in mod, `missing export ${name}`);
  });
}

test('toPercent maps board units to CSS percent', async () => {
  const { toPercent } = await import('../src/board.js');
  assert.equal(toPercent(-100), 0);
  assert.equal(toPercent(0), 50);
  assert.equal(toPercent(100), 100);
});

test('sound is a silent no-op without Web Audio', async () => {
  const { createSound } = await import('../src/sound.js');
  const sound = createSound();
  assert.doesNotThrow(() => {
    sound.unlock();
    sound.whoosh();
    sound.thunk();
  });
  sound.setMuted(true);
  assert.equal(sound.muted, true);
});

test('isImageFile accepts only image MIME types', async () => {
  const { isImageFile } = await import('../src/images.js');
  assert.equal(isImageFile({ type: 'image/png' }), true);
  assert.equal(isImageFile({ type: 'image/jpeg' }), true);
  assert.equal(isImageFile({ type: 'text/plain' }), false);
  assert.equal(isImageFile({ type: '' }), false);
});

test('openImageStore resolves null where IndexedDB is unavailable', async () => {
  const { openImageStore } = await import('../src/image-store.js');
  assert.equal(await openImageStore(), null);
});

test('openImageStore resolves null when the open request never fires a callback', async () => {
  const { openImageStore } = await import('../src/image-store.js');
  globalThis.indexedDB = { open: () => ({}) };
  try {
    assert.equal(await openImageStore({ timeoutMs: 20 }), null);
  } finally {
    delete globalThis.indexedDB;
  }
});

test('openImageStore resolves null when the open request is blocked', async () => {
  const { openImageStore } = await import('../src/image-store.js');
  globalThis.indexedDB = {
    open: () => {
      const request = {};
      setTimeout(() => request.onblocked?.(), 0);
      return request;
    },
  };
  try {
    assert.equal(await openImageStore({ timeoutMs: 1000 }), null);
  } finally {
    delete globalThis.indexedDB;
  }
});
