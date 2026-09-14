import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutEntries } from '../src/layout.js';

const RADIUS = 85;
const SEEDS = [1, 7, 42, 0xdeadbeef];
const EPSILON = 1e-9;

function corners({ x, y, size, tilt }) {
  const t = (tilt * Math.PI) / 180;
  const h = size / 2;
  return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dy]) => ({
    x: x + dx * Math.cos(t) - dy * Math.sin(t),
    y: y + dx * Math.sin(t) + dy * Math.cos(t),
  }));
}

// Half-width of the axis-aligned box around a tilted card.
function halfExtent({ size, tilt }) {
  const t = (tilt * Math.PI) / 180;
  return (size / 2) * (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)));
}

test('no entries gives an empty layout', () => {
  assert.deepEqual(layoutEntries(0, RADIUS, 1), []);
});

test('returns one card per entry with sane fields', () => {
  for (const count of [1, 2, 13, 50]) {
    const cards = layoutEntries(count, RADIUS, 42);
    assert.equal(cards.length, count);
    for (const card of cards) {
      assert.ok(card.size > 0, 'size must be positive');
      assert.ok(Math.abs(card.tilt) <= 8, `tilt ${card.tilt} out of range`);
    }
  }
});

test('every card corner lies inside the board (1–50 entries)', () => {
  for (const seed of SEEDS) {
    for (let count = 1; count <= 50; count++) {
      for (const card of layoutEntries(count, RADIUS, seed)) {
        for (const corner of corners(card)) {
          const distance = Math.hypot(corner.x, corner.y);
          assert.ok(distance <= RADIUS + EPSILON, `count ${count} seed ${seed}: corner at ${distance}`);
        }
      }
    }
  }
});

test('no two cards overlap (1–50 entries)', () => {
  for (const seed of SEEDS) {
    for (let count = 2; count <= 50; count++) {
      const cards = layoutEntries(count, RADIUS, seed);
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          // Disjoint bounding boxes guarantee the tilted cards are disjoint.
          const gap = halfExtent(cards[i]) + halfExtent(cards[j]) - EPSILON;
          const apart =
            Math.abs(cards[i].x - cards[j].x) >= gap || Math.abs(cards[i].y - cards[j].y) >= gap;
          assert.ok(apart, `count ${count} seed ${seed}: cards ${i} and ${j} overlap`);
        }
      }
    }
  }
});

test('the same seed gives the same layout', () => {
  assert.deepEqual(layoutEntries(20, RADIUS, 99), layoutEntries(20, RADIUS, 99));
});

test('different seeds give different layouts', () => {
  assert.notDeepEqual(layoutEntries(10, RADIUS, 1), layoutEntries(10, RADIUS, 2));
});

test('cards shrink as the board fills but stay readable', () => {
  const size = (count) => layoutEntries(count, RADIUS, 1)[0].size;
  assert.ok(size(5) > size(40), 'fewer entries should give bigger cards');
  assert.ok(size(20) >= 0.25 * RADIUS, `20-entry cards too small: ${size(20)}`);
  assert.ok(size(50) >= 0.16 * RADIUS, `50-entry cards too small: ${size(50)}`);
});
