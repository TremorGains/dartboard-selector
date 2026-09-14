import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ENTRIES,
  MAX_LABEL_LENGTH,
  normalizeLabel,
  parseTextEntries,
  makeTextEntry,
  makeImageEntry,
  labelFromFilename,
  addEntries,
  pinEntry,
  clearPins,
} from '../src/entries.js';

test('parseTextEntries trims lines and skips blanks', () => {
  assert.deepEqual(parseTextEntries('  Alice \n\nBob\r\n   \nCharlie'), ['Alice', 'Bob', 'Charlie']);
});

test('parseTextEntries returns nothing for blank input', () => {
  assert.deepEqual(parseTextEntries(' \n \n'), []);
});

test('labels are capped at MAX_LABEL_LENGTH characters', () => {
  assert.equal(MAX_LABEL_LENGTH, 80);
  assert.equal(normalizeLabel('x'.repeat(100)).length, 80);
});

test('capping never splits an emoji', () => {
  assert.equal(normalizeLabel('😀'.repeat(81)), '😀'.repeat(80));
});

test('makeTextEntry builds a text entry with a fresh id', () => {
  const a = makeTextEntry('  Alice ');
  const b = makeTextEntry('Alice');
  assert.equal(a.type, 'text');
  assert.equal(a.label, 'Alice');
  assert.ok(typeof a.id === 'string' && a.id.length > 0);
  assert.notEqual(a.id, b.id);
  assert.equal('imageId' in a, false);
});

test('makeImageEntry keeps the image id', () => {
  const entry = makeImageEntry('Team photo', 'img-1');
  assert.deepEqual({ ...entry, id: 'x' }, { id: 'x', type: 'image', label: 'Team photo', imageId: 'img-1' });
});

test('labelFromFilename drops only the last extension', () => {
  assert.equal(labelFromFilename('Team photo.final.JPG'), 'Team photo.final');
  assert.equal(labelFromFilename('cat'), 'cat');
});

test('labelFromFilename falls back when nothing is left', () => {
  assert.equal(labelFromFilename('.png'), 'Picture');
});

test('addEntries appends when there is room', () => {
  const existing = [makeTextEntry('a')];
  const additions = [makeTextEntry('b'), makeTextEntry('c')];
  const result = addEntries(existing, additions);
  assert.deepEqual(result.entries, [...existing, ...additions]);
  assert.equal(result.dropped, 0);
});

test('addEntries stops at MAX_ENTRIES and reports the rest', () => {
  assert.equal(MAX_ENTRIES, 50);
  const existing = Array.from({ length: 48 }, (_, i) => makeTextEntry(`e${i}`));
  const additions = Array.from({ length: 5 }, (_, i) => makeTextEntry(`n${i}`));
  const result = addEntries(existing, additions);
  assert.equal(result.entries.length, 50);
  assert.equal(result.dropped, 3);
  assert.equal(existing.length, 48, 'must not mutate the input');
});

test('pinEntry places the entry where it was dropped, above every other pinned entry', () => {
  const entries = [{ ...makeTextEntry('a'), pos: { x: 0, y: 0, z: 4 } }, makeTextEntry('b'), makeTextEntry('c')];
  const result = pinEntry(entries, entries[1].id, { x: 10, y: -5 });
  assert.deepEqual(result[1], { ...entries[1], pos: { x: 10, y: -5, z: 5 } });
  assert.equal(result[0], entries[0]);
  assert.equal(result[2], entries[2]);
  assert.equal('pos' in entries[1], false, 'must not mutate the input');
});

test('pinEntry starts stacking at 1 when nothing is pinned yet', () => {
  const entries = [makeTextEntry('a')];
  assert.deepEqual(pinEntry(entries, entries[0].id, { x: 1, y: 2 })[0].pos, { x: 1, y: 2, z: 1 });
});

test('clearPins removes every saved position and keeps the entries', () => {
  const entries = [{ ...makeTextEntry('a'), pos: { x: 1, y: 2, z: 1 } }, makeTextEntry('b')];
  const result = clearPins(entries);
  assert.deepEqual(result, [{ id: entries[0].id, type: 'text', label: 'a' }, entries[1]]);
  assert.ok('pos' in entries[0], 'must not mutate the input');
});

test('addEntries on a full board drops everything', () => {
  const full = Array.from({ length: 50 }, (_, i) => makeTextEntry(`e${i}`));
  const result = addEntries(full, [makeTextEntry('late')]);
  assert.equal(result.entries.length, 50);
  assert.equal(result.dropped, 1);
});
