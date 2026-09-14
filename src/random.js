// Random helpers. An "rng" in this app is a function that returns a
// uniformly distributed unsigned 32-bit integer (0 .. 2^32 - 1).

const TWO_POW_32 = 0x100000000;

/** Cryptographically secure rng, used for real throws and shuffles. */
export function cryptoUint32() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** Deterministic seeded rng (mulberry32), used for layouts and tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Uniform integer in [0, n). Rejection sampling avoids modulo bias. */
export function randomInt(n, rng) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`randomInt: n must be a positive integer, got ${n}`);
  }
  const limit = Math.floor(TWO_POW_32 / n) * n;
  let x;
  do {
    x = rng();
  } while (x >= limit);
  return x % n;
}

/** Uniform float in [0, 1). */
export function randomFloat(rng) {
  return rng() / TWO_POW_32;
}

/** Random id. crypto.randomUUID only exists in secure contexts, so fall back. */
export function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
