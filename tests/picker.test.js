import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickWinner, pickLandingPoint } from '../src/picker.js';
import { mulberry32 } from '../src/random.js';

const entries = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

test('pickWinner returns an index within range', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 500; i++) {
    const index = pickWinner(entries(5), rng);
    assert.ok(Number.isInteger(index) && index >= 0 && index < 5, `bad index ${index}`);
  }
});

test('pickWinner with one entry always picks it', () => {
  assert.equal(pickWinner(entries(1), mulberry32(9)), 0);
});

test('pickWinner throws on an empty list', () => {
  assert.throws(() => pickWinner([], mulberry32(1)), /no entries/);
});

test('pickWinner is uniform (chi-square, 10 entries, 10,000 picks)', () => {
  const n = 10;
  const picks = 10_000;
  const rng = mulberry32(12345);
  const counts = new Array(n).fill(0);
  for (let i = 0; i < picks; i++) counts[pickWinner(entries(n), rng)]++;
  const expected = picks / n;
  const chiSquare = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  // Critical value for 9 degrees of freedom at p = 0.001.
  assert.ok(chiSquare < 27.88, `chi-square ${chiSquare.toFixed(2)} suggests bias: ${counts}`);
});

test('pickWinner uses crypto randomness when no rng is given', () => {
  const index = pickWinner(entries(3));
  assert.ok(index >= 0 && index < 3);
});

test('pickLandingPoint stays within the central 60% of the rect', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };
  const rng = mulberry32(5);
  for (let i = 0; i < 1000; i++) {
    const { x, y } = pickLandingPoint(rect, rng);
    assert.ok(x >= 30 && x <= 90, `x out of range: ${x}`);
    assert.ok(y >= 30 && y <= 60, `y out of range: ${y}`);
  }
});

test('pickLandingPoint reaches both edges of the central region', () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };
  assert.deepEqual(pickLandingPoint(rect, () => 0), { x: 2, y: 2 });
  const far = pickLandingPoint(rect, () => 0xffffffff);
  assert.ok(far.x > 7.99 && far.x < 8, `x ${far.x}`);
  assert.ok(far.y > 7.99 && far.y < 8, `y ${far.y}`);
});
