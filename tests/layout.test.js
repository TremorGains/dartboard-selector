import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutEntries, clampToBoard, applyPins } from '../src/layout.js';

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

test('clampToBoard leaves a card that already fits where it is', () => {
  assert.deepEqual(clampToBoard({ x: 10, y: -20 }, 20, RADIUS), { x: 10, y: -20 });
});

test('clampToBoard pulls a card dragged off the board back inside, in the same direction', () => {
  const size = 20;
  const { x, y } = clampToBoard({ x: 300, y: -400 }, size, RADIUS);
  for (const tilt of [-8, 0, 8]) {
    for (const corner of corners({ x, y, size, tilt })) {
      assert.ok(Math.hypot(corner.x, corner.y) <= RADIUS + EPSILON, `corner outside the board at tilt ${tilt}`);
    }
  }
  assert.ok(Math.abs(Math.atan2(y, x) - Math.atan2(-400, 300)) < 1e-9, 'direction must be preserved');
});

test('applyPins moves pinned cards to their saved spot and leaves the rest alone', () => {
  const cards = layoutEntries(3, RADIUS, 5);
  const entries = [{ id: 'a' }, { id: 'b', pos: { x: 12, y: -7, z: 1 } }, { id: 'c' }];
  const placed = applyPins(cards, entries, RADIUS);
  assert.deepEqual(placed[0], cards[0]);
  assert.deepEqual(placed[1], { ...cards[1], x: 12, y: -7 });
  assert.deepEqual(placed[2], cards[2]);
});

test('applyPins keeps a pinned card inside the board when cards grow', () => {
  const cards = layoutEntries(2, RADIUS, 5); // few entries, so big cards
  const [pinned] = applyPins(cards, [{ id: 'a', pos: { x: 84, y: 0, z: 1 } }, { id: 'b' }], RADIUS);
  for (const corner of corners(pinned)) {
    assert.ok(Math.hypot(corner.x, corner.y) <= RADIUS + EPSILON, 'pinned card pokes out of the board');
  }
});

test('applyPins does not mutate the auto layout', () => {
  const cards = layoutEntries(1, RADIUS, 5);
  const before = structuredClone(cards);
  applyPins(cards, [{ id: 'a', pos: { x: 1, y: 1, z: 1 } }], RADIUS);
  assert.deepEqual(cards, before);
});

test('cards shrink as the board fills but stay readable', () => {
  const size = (count) => layoutEntries(count, RADIUS, 1)[0].size;
  assert.ok(size(5) > size(40), 'fewer entries should give bigger cards');
  assert.ok(size(20) >= 0.25 * RADIUS, `20-entry cards too small: ${size(20)}`);
  assert.ok(size(50) >= 0.16 * RADIUS, `50-entry cards too small: ${size(50)}`);
});
