import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, cryptoUint32, randomInt, randomFloat, newId } from '../src/random.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('mulberry32 differs across seeds', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notDeepEqual(Array.from({ length: 5 }, a), Array.from({ length: 5 }, b));
});

test('mulberry32 yields unsigned 32-bit integers', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const x = rng();
    assert.ok(Number.isInteger(x) && x >= 0 && x <= 0xffffffff, `bad value ${x}`);
  }
});

test('cryptoUint32 yields unsigned 32-bit integers', () => {
  for (let i = 0; i < 100; i++) {
    const x = cryptoUint32();
    assert.ok(Number.isInteger(x) && x >= 0 && x <= 0xffffffff, `bad value ${x}`);
  }
});

test('randomInt stays in [0, n)', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 1000; i++) {
    const x = randomInt(7, rng);
    assert.ok(Number.isInteger(x) && x >= 0 && x < 7, `bad value ${x}`);
  }
});

test('randomInt redraws values that would cause modulo bias', () => {
  // For n = 3 the largest accepted draw is 0xFFFFFFFE, so 0xFFFFFFFF must be redrawn.
  const draws = [0xffffffff, 4];
  const rng = () => draws.shift();
  assert.equal(randomInt(3, rng), 1);
  assert.equal(draws.length, 0);
});

test('randomInt rejects a non-positive or fractional n', () => {
  assert.throws(() => randomInt(0, mulberry32(1)), RangeError);
  assert.throws(() => randomInt(2.5, mulberry32(1)), RangeError);
});

test('randomFloat maps draws into [0, 1)', () => {
  assert.equal(randomFloat(() => 0), 0);
  const top = randomFloat(() => 0xffffffff);
  assert.ok(top < 1 && top > 0.9999999, `bad value ${top}`);
});

test('newId returns distinct non-empty strings', () => {
  const ids = new Set(Array.from({ length: 100 }, () => newId()));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.ok(typeof id === 'string' && id.length > 0);
});
