# Dartboard Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page where users pin text entries and pictures onto a dartboard, press **Throw dart**, and a dart flies in and sticks into one uniformly chosen entry.

**Architecture:** Plain HTML/CSS/JS with ES modules and no build step. Pure logic modules (`random`, `picker`, `layout`, `entries`, `store`) have no DOM access and are unit-tested with `node --test`. Thin browser modules (`board`, `panel`, `dart`, `sound`, `reveal`, `images`, `image-store`, `toast`) render and animate; `main.js` owns all app state and wires them together. Served by GitHub Pages from the `main` branch root.

**Tech Stack:** HTML, CSS (container query units, `<dialog>`), vanilla JS ES modules, SVG, Web Animations API, Web Audio API, IndexedDB, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-14-dartboard-selector-design.md`

## Global Constraints

- No build step and no npm dependencies (runtime or dev). `package.json` exists only for `"type": "module"` and `npm test`.
- Tests run with `npm test` (`node --test`); Node 18+ (this machine has Node 24).
- All asset paths are relative — the live site is served under `/dartboard-selector/`.
- User-supplied text is rendered with `textContent`, never `innerHTML`. The only `innerHTML` allowed is the constant dart SVG markup in `dart.js`.
- `MAX_ENTRIES = 50`; `MAX_LABEL_LENGTH = 80` characters.
- `localStorage['dartboard.v1']` holds `{ entries, muted, layoutSeed }`.
- IndexedDB database `dartboard`, object store `images`, key `imageId`, value `Blob`.
- Uploaded pictures are resized to ≤400px on the longest side, WebP with JPEG fallback.
- The winner is chosen with `crypto.getRandomValues` + rejection sampling; the dart lands in the central 60% of the winner's card.
- Board units: SVG viewBox `-100 -100 200 200`; cards live inside radius `PLAYABLE_RADIUS = 85`.
- Dart flight ≈700ms (`FLIGHT_MS`); reveal opens ≈600ms after impact.
- `prefers-reduced-motion: reduce` → no flight, shake, or confetti; the dart just appears.
- Commit **and push** at the end of every task (user preference). Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- The repo is public: never commit secrets.

## File Structure

```
package.json            "type": "module", "test": "node --test"
.gitattributes          normalise line endings to LF
.nojekyll               tell GitHub Pages to serve files as-is
README.md               what it is, run locally, tests, deploy
index.html              page shell: board, controls, panel, reveal dialog, toast region
styles.css              all styling
src/
  random.js             rng helpers: cryptoUint32, mulberry32, randomInt, randomFloat, newId   (pure)
  picker.js             pickWinner, pickLandingPoint                                          (pure)
  layout.js             layoutEntries → [{ x, y, size, tilt }]                                (pure)
  entries.js            entry factories, label rules, 50-entry cap                            (pure)
  store.js              localStorage state + picture hydration, injected backends             (pure)
  image-store.js        IndexedDB blob store
  images.js             isImageFile, resizeImage (canvas)
  board.js              SVG dartboard, pinned cards, highlight, shake
  dart.js               dart element + flight/wobble animation
  sound.js              synthesized whoosh/thunk, mute
  reveal.js             winner <dialog> + confetti
  panel.js              entry management UI
  toast.js              transient messages
  main.js               app state and wiring (browser entry point)
tests/
  random.test.js  picker.test.js  layout.test.js  entries.test.js  store.test.js
  modules.test.js       every browser module loads in Node with the expected exports
```

## How to check the page in a browser (Tasks 6–9)

1. Serve the repo root in the background: `python -m http.server 8000` (or `npx serve -l 8000`).
2. Open `http://localhost:8000/` in Orca's browser — use the **orca-cli** skill for exact flags:
   `orca tab create --url http://localhost:8000/`, then `orca eval --expression "<js>"`,
   `orca screenshot`, `orca reload`. If Orca isn't available, ask the user to open the URL and report.
3. Look at the screenshot yourself — layout, readability, nothing overlapping — not just the eval results.
4. Fallback if Orca is unavailable (during planning, `orca screenshot` crashed the Orca runtime): start Chrome with
   `chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch dir> about:blank` in the background and drive it
   with a short Node script over the DevTools protocol (Node 24 has `fetch` and `WebSocket` built in): `PUT /json/new?<url>`,
   then `Runtime.evaluate` with `awaitPromise: true` for checks and `Page.captureScreenshot` for images. Don't use
   `--virtual-time-budget` — it stalls the IndexedDB open that `main.js` awaits on startup.

---

### Task 1: Project scaffold and random helpers

**Files:**
- Create: `package.json`, `.gitattributes`, `src/random.js`
- Test: `tests/random.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`src/random.js`) — an *rng* is `() => number` returning a uniform unsigned 32-bit integer:
  - `cryptoUint32(): number` — secure rng.
  - `mulberry32(seed: number): () => number` — deterministic rng.
  - `randomInt(n: number, rng): number` — uniform integer in `[0, n)`; throws `RangeError` unless `n` is a positive integer.
  - `randomFloat(rng): number` — uniform float in `[0, 1)`.
  - `newId(): string` — unique id.

- [ ] **Step 1: Create `package.json` and `.gitattributes`**

```json package.json
{
  "name": "dartboard-selector",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

```text .gitattributes
* text=auto eol=lf
```

- [ ] **Step 2: Write the failing test**

```js tests/random.test.js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/random.js'`.

- [ ] **Step 4: Implement `src/random.js`**

```js src/random.js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 6: Commit and push**

```bash
git add package.json .gitattributes src/random.js tests/random.test.js
git commit -m "$(cat <<'EOF'
feat: add project scaffold and random helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 2: Fair winner picker

**Files:**
- Create: `src/picker.js`
- Test: `tests/picker.test.js`

**Interfaces:**
- Consumes: `cryptoUint32`, `randomInt`, `randomFloat` from `src/random.js`.
- Produces (`src/picker.js`):
  - `pickWinner(entries: any[], rng = cryptoUint32): number` — index of the winner; throws `Error` containing `no entries` on an empty array.
  - `pickLandingPoint(rect: { x, y, width, height }, rng = cryptoUint32): { x, y }` — point in the central 60% of `rect` (top-left origin).

- [ ] **Step 1: Write the failing test**

```js tests/picker.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/picker.js'`.

- [ ] **Step 3: Implement `src/picker.js`**

```js src/picker.js
import { cryptoUint32, randomInt, randomFloat } from './random.js';

// Fraction trimmed from each side of the card when choosing where the dart
// lands, so it always lands in the central 60%.
const LANDING_INSET = 0.2;

/** Index of the winning entry, chosen uniformly. */
export function pickWinner(entries, rng = cryptoUint32) {
  if (entries.length === 0) throw new Error('pickWinner: no entries to pick from');
  return randomInt(entries.length, rng);
}

/** Random point in the central 60% of rect ({ x, y, width, height }, top-left origin). */
export function pickLandingPoint(rect, rng = cryptoUint32) {
  const span = 1 - 2 * LANDING_INSET;
  return {
    x: rect.x + rect.width * (LANDING_INSET + randomFloat(rng) * span),
    y: rect.y + rect.height * (LANDING_INSET + randomFloat(rng) * span),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 16 tests, 0 failures.

- [ ] **Step 5: Commit and push**

```bash
git add src/picker.js tests/picker.test.js
git commit -m "$(cat <<'EOF'
feat: add uniform winner picker and landing point

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 3: Card layout

**Files:**
- Create: `src/layout.js`
- Test: `tests/layout.test.js`

**Interfaces:**
- Consumes: `mulberry32`, `randomInt`, `randomFloat` from `src/random.js`.
- Produces (`src/layout.js`):
  - `layoutEntries(count: number, radius: number, seed: number): Array<{ x: number, y: number, size: number, tilt: number }>` — one card per entry in entry order. `x`/`y` are the card centre relative to the board centre, in the same units as `radius`; `size` is the square card's side; `tilt` is degrees in `[-8, 8]`. All cards share one `size`. Same arguments → identical output.

- [ ] **Step 1: Write the failing test**

```js tests/layout.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/layout.js'`.

- [ ] **Step 3: Implement `src/layout.js`**

```js src/layout.js
import { mulberry32, randomInt, randomFloat } from './random.js';

// Card positions in board units: (0, 0) is the board centre and every card
// lies entirely inside a circle of `radius`. Cards are squares of side
// `size`, rotated by `tilt` degrees, placed on a square grid clipped to the
// circle and then nudged by a little jitter so the board looks hand-pinned.
//
// Why cards can't overlap: two grid cells differ by at least one pitch on
// some axis. After jitter they still differ by pitch − 2·jitter on that axis,
// which is at least the width of two tilted cards' bounding boxes.

const MAX_TILT_DEG = 8;
const MAX_TILT_RAD = (MAX_TILT_DEG * Math.PI) / 180;
const TILT_SPREAD = Math.cos(MAX_TILT_RAD) + Math.sin(MAX_TILT_RAD); // tilted bounding box / card side ≈ 1.129
const PITCH_PER_SIZE = 1.25; // grid pitch / card side
const JITTER = ((PITCH_PER_SIZE - TILT_SPREAD) / 2) * 0.95; // max per-axis jitter / card side
const MAX_SIZE_FRACTION = 0.5; // largest card side, as a fraction of radius
const SHRINK_STEP = 0.98;

/** Returns [{ x, y, size, tilt }], one per entry, in entry order. */
export function layoutEntries(count, radius, seed) {
  if (count === 0) return [];
  const rng = mulberry32(seed);
  const { cells, size } = fitGrid(count, radius);

  // Partial Fisher–Yates: a random subset of cells, in random order.
  const pool = cells.slice();
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(pool.length - i, rng);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count).map((cell) => ({
    x: cell.x + (randomFloat(rng) * 2 - 1) * JITTER * size,
    y: cell.y + (randomFloat(rng) * 2 - 1) * JITTER * size,
    size,
    tilt: (randomFloat(rng) * 2 - 1) * MAX_TILT_DEG,
  }));
}

/** Largest card size whose grid has at least `count` cells inside the board. */
function fitGrid(count, radius) {
  let size = radius * MAX_SIZE_FRACTION;
  for (;;) {
    const cells = gridCells(size, radius);
    if (cells.length >= count) return { cells, size };
    size *= SHRINK_STEP;
  }
}

/** Grid cell centres far enough from the edge for a tilted, jittered card. */
function gridCells(size, radius) {
  const pitch = size * PITCH_PER_SIZE;
  const reach = radius - size * (Math.SQRT1_2 + JITTER * Math.SQRT2);
  if (reach < 0) return [];
  const steps = Math.ceil(reach / pitch) + 1;
  let best = [];
  // A cell on the centre suits odd counts, a grid line on the centre suits even ones.
  for (const offset of [0, 0.5]) {
    const cells = [];
    for (let i = -steps; i <= steps; i++) {
      for (let j = -steps; j <= steps; j++) {
        const x = (i + offset) * pitch;
        const y = (j + offset) * pitch;
        if (Math.hypot(x, y) <= reach) cells.push({ x, y });
      }
    }
    if (cells.length > best.length) best = cells;
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 23 tests, 0 failures.

- [ ] **Step 5: Commit and push**

```bash
git add src/layout.js tests/layout.test.js
git commit -m "$(cat <<'EOF'
feat: add non-overlapping seeded card layout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 4: Entry rules

**Files:**
- Create: `src/entries.js`
- Test: `tests/entries.test.js`

**Interfaces:**
- Consumes: `newId` from `src/random.js`.
- Produces (`src/entries.js`). An *Entry* is `{ id: string, type: 'text', label: string }` or `{ id: string, type: 'image', label: string, imageId: string }`.
  - `MAX_ENTRIES = 50`, `MAX_LABEL_LENGTH = 80`
  - `normalizeLabel(text): string` — trimmed, capped at 80 code points.
  - `parseTextEntries(text: string): string[]` — one label per non-blank line.
  - `makeTextEntry(label: string): Entry`
  - `makeImageEntry(label: string, imageId: string): Entry`
  - `labelFromFilename(filename: string): string` — drops the last extension; `'Picture'` if nothing is left.
  - `addEntries(existing: Entry[], additions: Entry[]): { entries: Entry[], dropped: number }` — appends up to the cap, never mutates input.

- [ ] **Step 1: Write the failing test**

```js tests/entries.test.js
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

test('addEntries on a full board drops everything', () => {
  const full = Array.from({ length: 50 }, (_, i) => makeTextEntry(`e${i}`));
  const result = addEntries(full, [makeTextEntry('late')]);
  assert.equal(result.entries.length, 50);
  assert.equal(result.dropped, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/entries.js'`.

- [ ] **Step 3: Implement `src/entries.js`**

```js src/entries.js
import { newId } from './random.js';

export const MAX_ENTRIES = 50;
export const MAX_LABEL_LENGTH = 80;

/** Trims and caps a label at MAX_LABEL_LENGTH characters (never splits an emoji). */
export function normalizeLabel(text) {
  return Array.from(String(text).trim()).slice(0, MAX_LABEL_LENGTH).join('');
}

/** One label per non-blank line. */
export function parseTextEntries(text) {
  return text
    .split(/\r?\n/)
    .map(normalizeLabel)
    .filter((label) => label.length > 0);
}

export function makeTextEntry(label) {
  return { id: newId(), type: 'text', label: normalizeLabel(label) };
}

export function makeImageEntry(label, imageId) {
  return { id: newId(), type: 'image', label: normalizeLabel(label), imageId };
}

/** Filename without its extension, used as a picture's caption. */
export function labelFromFilename(filename) {
  return normalizeLabel(filename.replace(/\.[^.]*$/, '')) || 'Picture';
}

/** Appends additions up to MAX_ENTRIES; reports how many didn't fit. */
export function addEntries(existing, additions) {
  const room = Math.max(0, MAX_ENTRIES - existing.length);
  const accepted = additions.slice(0, room);
  return { entries: [...existing, ...accepted], dropped: additions.length - accepted.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 34 tests, 0 failures.

- [ ] **Step 5: Commit and push**

```bash
git add src/entries.js tests/entries.test.js
git commit -m "$(cat <<'EOF'
feat: add entry factories, label rules and 50-entry cap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 5: Persistence

**Files:**
- Create: `src/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `MAX_ENTRIES` from `src/entries.js`.
- Produces (`src/store.js`). *State* is `{ entries: Entry[], muted: boolean, layoutSeed: number }` (seed is a uint32). A *storage* is `{ getItem, setItem, removeItem }`. A *BlobStore* is `{ get(id): Promise<Blob|undefined>, put(id, blob): Promise<void>, delete(id): Promise<void>, clear(): Promise<void> }`.
  - `STORAGE_KEY = 'dartboard.v1'`
  - `emptyState(): State` — `{ entries: [], muted: false, layoutSeed: 1 }`
  - `parseState(json: string | null): State` — never throws; invalid input → empty state; invalid entries filtered; capped at 50.
  - `loadState(storage): State`, `saveState(storage, state): void` (writes only the three fields; may throw on quota).
  - `hydrateImages(state, blobStore | null): Promise<{ state: State, images: Map<string, Blob> }>` — drops image entries whose blob is missing or unreadable.
  - `createMemoryStorage(): storage`, `browserStorage(): storage` (localStorage, or memory fallback when it's unusable).

- [ ] **Step 1: Write the failing test**

```js tests/store.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/store.js'`.

- [ ] **Step 3: Implement `src/store.js`**

```js src/store.js
import { MAX_ENTRIES } from './entries.js';

// Persistence. `storage` is anything with getItem/setItem/removeItem
// (localStorage in the browser). `blobStore` holds picture blobs:
// { get(id), put(id, blob), delete(id), clear() }, all returning promises.

export const STORAGE_KEY = 'dartboard.v1';

export function emptyState() {
  return { entries: [], muted: false, layoutSeed: 1 };
}

function isValidEntry(entry) {
  if (entry === null || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return false;
  if (typeof entry.label !== 'string') return false;
  if (entry.type === 'text') return entry.label.length > 0;
  if (entry.type === 'image') return typeof entry.imageId === 'string' && entry.imageId.length > 0;
  return false;
}

function cleanEntry({ id, type, label, imageId }) {
  return type === 'image' ? { id, type, label, imageId } : { id, type, label };
}

function isValidSeed(seed) {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

/** Parses saved JSON; anything unreadable becomes an empty board. */
export function parseState(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptyState();
  }
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.entries)) return emptyState();
  return {
    entries: raw.entries.filter(isValidEntry).slice(0, MAX_ENTRIES).map(cleanEntry),
    muted: raw.muted === true,
    layoutSeed: isValidSeed(raw.layoutSeed) ? raw.layoutSeed : 1,
  };
}

export function loadState(storage) {
  return parseState(storage.getItem(STORAGE_KEY));
}

export function saveState(storage, { entries, muted, layoutSeed }) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ entries, muted, layoutSeed }));
}

/**
 * Loads picture blobs for image entries. Entries whose blob is missing (or
 * when there is no blob store at all) are dropped.
 * Returns { state, images: Map<imageId, Blob> }.
 */
export async function hydrateImages(state, blobStore) {
  const images = new Map();
  const entries = [];
  for (const entry of state.entries) {
    if (entry.type !== 'image') {
      entries.push(entry);
      continue;
    }
    const blob = blobStore ? await blobStore.get(entry.imageId).catch(() => undefined) : undefined;
    if (blob) {
      images.set(entry.imageId, blob);
      entries.push(entry);
    }
  }
  return { state: { ...state, entries }, images };
}

/** In-memory stand-in for localStorage. */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** localStorage if it works here, otherwise an in-memory fallback. */
export function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = '__dartboard_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 46 tests, 0 failures.

- [ ] **Step 5: Commit and push**

```bash
git add src/store.js tests/store.test.js
git commit -m "$(cat <<'EOF'
feat: add state persistence with validation and picture hydration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 6: Page shell, board and text entries

Deliverable: the page loads; you can add names (one per line), see them pinned as cards on an SVG dartboard, delete one, clear all, shuffle, and everything survives a reload. **Throw** stays disabled and **Add pictures** shows a "later step" toast until Tasks 7–8.

**Files:**
- Create: `index.html`, `styles.css`, `src/board.js`, `src/panel.js`, `src/toast.js`, `src/main.js`
- Test: `tests/modules.test.js`

**Interfaces:**
- Consumes: `cryptoUint32` (random), `layoutEntries` (layout), `MAX_ENTRIES`, `parseTextEntries`, `makeTextEntry`, `addEntries` (entries), `loadState`, `saveState`, `browserStorage` (store).
- Produces:
  - `src/board.js`: `PLAYABLE_RADIUS = 85`; `toPercent(u: number): number` (board unit → CSS %); `createBoard(container: HTMLElement): { dartLayer: HTMLElement, render(entries, layout, imageUrlFor: (entry) => string | undefined): void, highlight(index: number | null): void, shake(): void }`.
  - `src/panel.js`: `createPanel(handlers: { onAddText(text: string), onAddFiles(files: File[]), onDelete(id: string), onClearAll() }): { render(entries, imageUrlFor): void, clearText(): void, setBusy(busy: boolean): void }`.
  - `src/toast.js`: `toast(message: string): void`.
  - DOM ids used by later tasks: `#board`, `#throw`, `#shuffle`, `#mute`, `#reveal`, `#reveal-content`, `#toasts`.

- [ ] **Step 1: Write the failing module test**

```js tests/modules.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Browser modules must at least load in Node: this catches syntax errors and
// broken import/export names. main.js is excluded because it touches the DOM on load.
const MODULES = {
  '../src/board.js': ['createBoard', 'toPercent', 'PLAYABLE_RADIUS'],
  '../src/panel.js': ['createPanel'],
  '../src/toast.js': ['toast'],
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — 4 failures, `Cannot find module '.../src/board.js'` (and panel/toast).

- [ ] **Step 3: Create `index.html`**

The page already contains every element later tasks need (throw/mute buttons, reveal dialog), so later tasks only add JS.

```html index.html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dartboard Selector</title>
  <meta name="description" content="Pin names or pictures to a dartboard and throw a dart to pick one.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8E%AF%3C/text%3E%3C/svg%3E">
  <link rel="stylesheet" href="styles.css">
  <script type="module" src="src/main.js"></script>
</head>
<body>
  <main class="app">
    <section class="stage" aria-label="Dartboard">
      <div class="board-wrap" id="board"></div>
      <div class="controls">
        <button id="throw" class="btn btn-primary btn-throw" type="button" disabled>Throw dart</button>
        <button id="shuffle" class="btn" type="button" disabled>Shuffle</button>
        <button id="mute" class="btn" type="button" aria-pressed="false">Mute</button>
      </div>
    </section>

    <aside class="panel" aria-labelledby="app-title">
      <h1 id="app-title">Dartboard <span>Selector</span></h1>
      <p class="hint">Pin names or pictures, then throw a dart to pick one.</p>
      <div id="panel-controls" class="panel-controls">
        <label class="field-label" for="entry-text">Add entries — one per line</label>
        <textarea id="entry-text" rows="4" placeholder="Alice&#10;Bob&#10;Charlie"></textarea>
        <div class="row">
          <button id="add-text" class="btn btn-primary" type="button">Add</button>
          <button id="pick-pictures" class="btn" type="button">Add pictures</button>
          <input id="add-pictures" type="file" accept="image/*" multiple hidden>
        </div>
        <p class="hint">Tip: Ctrl + Enter adds the list.</p>
        <div class="list-header">
          <span id="entry-count">0 / 50</span>
          <button id="clear-all" class="link-btn" type="button">Clear all</button>
        </div>
        <ul id="entry-list" class="entry-list" aria-label="Entries on the board"></ul>
      </div>
    </aside>
  </main>

  <dialog id="reveal" class="reveal" aria-labelledby="reveal-title">
    <div class="confetti" aria-hidden="true"></div>
    <form method="dialog" class="reveal-card">
      <p id="reveal-title" class="reveal-kicker">The dart landed on</p>
      <div id="reveal-content"></div>
      <div class="row">
        <button class="btn" value="remove">Remove &amp; close</button>
        <button class="btn btn-primary" value="close" autofocus>Close</button>
      </div>
    </form>
  </dialog>

  <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
</body>
</html>
```

- [ ] **Step 4: Create `styles.css`**

Card sizes use container query units: `.board-wrap` is the container, so `1cqw` = 1% of the board's width. A card's `--s` is its side as a percentage of the board width.

```css styles.css
:root {
  color-scheme: dark;
  --bg: #121a16;
  --bg-2: #1b2620;
  --panel: #1f2c25;
  --line: #2f3f36;
  --text: #f3ede0;
  --muted: #a9b3ab;
  --accent: #e0442f;
  --accent-2: #b92f1f;
  --gold: #f2c14e;
  --paper: #f7f0de;
  --ink: #2a2118;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
html, body { margin: 0; overflow-x: clip; }
body {
  min-height: 100dvh;
  background: radial-gradient(ellipse at 35% 40%, #213128 0%, var(--bg) 60%) fixed, var(--bg);
  color: var(--text);
}
[hidden] { display: none !important; }

/* ---------- Layout ---------- */
.app {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 32px;
  align-items: center;
  max-width: 1280px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: 24px;
}
.stage { display: flex; flex-direction: column; align-items: center; gap: 20px; }

/* ---------- Board ---------- */
.board-wrap {
  position: relative;
  width: min(100%, calc(100dvh - 140px));
  aspect-ratio: 1;
  container-type: inline-size;
  border-radius: 50%;
  box-shadow: 0 30px 60px rgb(0 0 0 / 0.55), 0 0 0 10px #3a2a1c, 0 0 0 14px #24190f;
}
.dartboard { display: block; width: 100%; height: 100%; }
.board-number {
  font: 700 8px system-ui, sans-serif;
  fill: #f4f1ea;
  text-anchor: middle;
  dominant-baseline: central;
}
.cards, .dart-layer { position: absolute; inset: 0; }
.dart-layer { pointer-events: none; z-index: 3; }
.board-empty {
  position: absolute; inset: 0; margin: auto;
  width: 60%; height: fit-content;
  padding: 0.8em 1em; border-radius: 10px;
  background: rgb(18 26 22 / 0.85);
  font-size: 3.6cqw; line-height: 1.3; text-align: center;
}

/* ---------- Cards ---------- */
.card {
  position: absolute;
  width: calc(var(--s) * 1%);
  aspect-ratio: 1;
  transform: translate(-50%, -50%) rotate(var(--tilt));
  display: grid;
  place-items: center;
  padding: calc(var(--s) * 0.1cqw) calc(var(--s) * 0.08cqw) calc(var(--s) * 0.06cqw); /* extra top room for the pin */
  background: var(--paper);
  color: var(--ink);
  border-radius: 4%;
  box-shadow: 0 0.6cqw 1.2cqw rgb(0 0 0 / 0.45);
  font-size: calc(var(--s) * 0.17cqw); /* 4 lines × 1.15 line-height still fit */
  font-weight: 650;
  line-height: 1.15;
  text-align: center;
  transition: box-shadow 200ms;
}
.card::before { /* push pin */
  content: "";
  position: absolute; top: -4%; left: 50%;
  width: 14%; aspect-ratio: 1;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ff8a7a, var(--accent) 45%, #7d1a10);
  box-shadow: 0 0.2cqw 0.4cqw rgb(0 0 0 / 0.5);
  z-index: 1;
}
.card-label {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.card-image { padding: calc(var(--s) * 0.05cqw); background: #fff; }
.card-image img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 2%; }
.card.is-hit {
  z-index: 2;
  box-shadow: 0 0 0 0.5cqw var(--gold), 0 0 4cqw rgb(242 193 78 / 0.8);
}

/* ---------- Dart ---------- */
.dart { position: absolute; width: 0; height: 0; }
.dart-body { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.dart-svg {
  position: absolute; left: 0; top: 0;
  width: 24cqw; height: 4.8cqw;
  overflow: visible;
  transform-origin: 0 50%;
  transform: translateY(-50%) rotate(35deg); /* puts the tip on the landing point */
  filter: drop-shadow(0.6cqw 0.9cqw 0.5cqw rgb(0 0 0 / 0.5));
}

/* ---------- Buttons ---------- */
.controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.btn {
  font: inherit; font-size: 15px; font-weight: 600;
  padding: 10px 18px;
  border: 1px solid var(--line); border-radius: 999px;
  background: var(--bg-2); color: var(--text);
  cursor: pointer;
  transition: background 150ms, border-color 150ms, transform 100ms;
}
.btn:hover:not(:disabled) { background: #243229; border-color: #4b6155; }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-2); border-color: var(--accent-2); }
.btn-throw { padding: 14px 40px; font-size: 18px; letter-spacing: 0.02em; }
#mute::before { content: "🔊" / ""; margin-right: 6px; }
#mute[aria-pressed="true"]::before { content: "🔇" / ""; }

/* ---------- Panel ---------- */
.panel {
  display: flex; flex-direction: column; gap: 14px;
  max-height: calc(100dvh - 48px); min-height: 0;
  padding: 20px;
  background: var(--panel);
  border: 1px solid var(--line); border-radius: 16px;
}
.panel h1 { margin: 0; font-size: 22px; letter-spacing: -0.01em; }
.panel h1 span { color: var(--accent); }
.panel-controls {
  display: flex; flex-direction: column; gap: 12px;
  flex: 1; min-height: 0;
}
.panel-controls[inert] { opacity: 0.6; }
.field-label, .hint { font-size: 13px; color: var(--muted); }
.hint { margin: -4px 0 0; }
textarea {
  width: 100%; min-height: 96px; resize: vertical;
  padding: 10px 12px;
  font: inherit; font-size: 15px;
  color: var(--text); background: var(--bg);
  border: 1px solid var(--line); border-radius: 10px;
}
textarea:focus-visible { outline: 3px solid var(--gold); outline-offset: 1px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; }
.row .btn { flex: 1; }
.list-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--muted); }
.link-btn {
  padding: 4px; border: 0; background: none;
  font: inherit; font-size: 13px; color: var(--muted);
  text-decoration: underline; cursor: pointer;
}
.link-btn:hover:not(:disabled) { color: var(--accent); }
.link-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.entry-list {
  display: flex; flex-direction: column; gap: 6px;
  flex: 1; min-height: 80px; overflow-y: auto;
  margin: 0; padding: 0; list-style: none;
}
.entry {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 6px 6px 12px;
  background: var(--bg-2); border-radius: 8px;
}
.entry-thumb { flex: none; width: 32px; height: 32px; object-fit: cover; border-radius: 4px; }
.entry-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-delete {
  flex: none; width: 30px; height: 30px;
  border: 0; border-radius: 6px; background: transparent;
  color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer;
}
.entry-delete:hover:not(:disabled) { background: #3a2320; color: #ff8a7a; }
.entry-delete:focus-visible, .link-btn:focus-visible { outline: 2px solid var(--gold); }

/* ---------- Reveal ---------- */
.reveal {
  width: 100%; max-width: min(92vw, 520px);
  padding: 0; border: 0; overflow: visible;
  background: transparent; color: var(--text);
}
.reveal::backdrop { background: rgb(8 12 10 / 0.72); backdrop-filter: blur(3px); }
.reveal-card {
  position: relative; z-index: 1;
  padding: 28px 24px 22px;
  background: var(--panel);
  border: 1px solid var(--line); border-radius: 20px;
  box-shadow: 0 30px 80px rgb(0 0 0 / 0.6);
  text-align: center;
  animation: pop-in 380ms cubic-bezier(0.2, 1.4, 0.4, 1);
}
.reveal-kicker { margin: 0 0 12px; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
.reveal-text { margin: 0; font-size: clamp(28px, 7vw, 48px); font-weight: 800; line-height: 1.1; overflow-wrap: anywhere; }
.reveal-winner img { display: block; max-width: 100%; max-height: 50vh; margin: 0 auto; padding: 8px; background: #fff; border-radius: 10px; }
.reveal-caption { margin: 12px 0 0; font-size: 20px; font-weight: 700; }
.reveal .row { margin-top: 24px; }
@keyframes pop-in { from { transform: scale(0.85); opacity: 0; } }

.confetti { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.confetti span {
  position: absolute; top: -12px;
  width: 10px; height: 14px; border-radius: 2px;
  animation: confetti-fall linear forwards;
}
@keyframes confetti-fall { to { transform: translate(var(--drift), 105vh) rotate(var(--spin)); } }

/* ---------- Toasts ---------- */
.toasts {
  position: fixed; left: 50%; bottom: 20px; z-index: 10;
  display: flex; flex-direction: column; gap: 8px;
  width: min(92vw, 420px);
  translate: -50% 0;
  pointer-events: none;
}
.toast {
  padding: 10px 14px;
  background: #0d130f; color: var(--text);
  border: 1px solid var(--line); border-left: 4px solid var(--gold); border-radius: 8px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
  font-size: 14px;
  animation: toast-in 200ms ease-out;
}
@keyframes toast-in { from { opacity: 0; translate: 0 8px; } }

/* ---------- Small screens & reduced motion ---------- */
@media (max-width: 860px) {
  .app { grid-template-columns: 1fr; align-items: start; gap: 20px; padding: 16px; }
  .board-wrap { width: 100%; }
  .btn-throw { padding-inline: 24px; }
  .panel { max-height: none; }
  .entry-list { max-height: 320px; }
}
@media (prefers-reduced-motion: reduce) {
  .confetti { display: none; }
  .reveal-card, .toast { animation: none; }
  .card, .btn { transition: none; }
}
```

- [ ] **Step 5: Create `src/toast.js`**

```js src/toast.js
const TOAST_MS = 4000;

/** Shows a short message in the #toasts live region. */
export function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  document.getElementById('toasts').append(item);
  setTimeout(() => item.remove(), TOAST_MS);
}
```

- [ ] **Step 6: Create `src/board.js`**

```js src/board.js
// The SVG dartboard and the entry cards pinned to it.
// Board units: the SVG viewBox spans -100..100 on both axes, so a board-unit
// coordinate u sits at CSS percentage (u + 100) / 2 of the board's width.

export const PLAYABLE_RADIUS = 85;

const SVG_NS = 'http://www.w3.org/2000/svg';
const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Regulation proportions, scaled so the outer double wire sits at 80.
const R = { bull: 3, outerBull: 7.5, trebleIn: 46.6, trebleOut: 50.4, doubleIn: 76.2, doubleOut: 80, numbers: 90, edge: 100 };
const COLORS = { dark: '#1b1b1b', light: '#efe3c2', red: '#c8243a', green: '#12804a', wire: '#b9bcc0', surround: '#101010' };
const SEGMENT = (2 * Math.PI) / 20;

export function toPercent(u) {
  return (u + 100) / 2;
}

export function createBoard(container) {
  const cardsLayer = el('div', 'cards');
  const empty = el('p', 'board-empty');
  empty.textContent = 'Add names or pictures to pin them here';
  const dartLayer = el('div', 'dart-layer');
  container.append(buildDartboardSvg(), cardsLayer, empty, dartLayer);
  let cardEls = [];

  return {
    dartLayer,
    render(entries, layout, imageUrlFor) {
      cardEls = entries.map((entry, i) => buildCard(entry, layout[i], imageUrlFor(entry)));
      cardsLayer.replaceChildren(...cardEls);
      empty.hidden = entries.length > 0;
    },
    highlight(index) {
      cardEls.forEach((card, i) => card.classList.toggle('is-hit', i === index));
    },
    shake() {
      container.animate(
        [
          { translate: '0 0' },
          { translate: '-4px 3px' },
          { translate: '3px -2px' },
          { translate: '-2px 1px' },
          { translate: '0 0' },
        ],
        { duration: 260, easing: 'ease-out' },
      );
    },
  };
}

function buildCard(entry, slot, imageUrl) {
  const card = el('div', `card card-${entry.type}`);
  card.style.left = `${toPercent(slot.x)}%`;
  card.style.top = `${toPercent(slot.y)}%`;
  card.style.setProperty('--s', String(slot.size / 2)); // side as % of board width
  card.style.setProperty('--tilt', `${slot.tilt}deg`);
  card.title = entry.label;
  if (entry.type === 'image' && imageUrl) {
    const img = el('img');
    img.src = imageUrl;
    img.alt = entry.label;
    img.draggable = false;
    card.append(img);
  } else {
    const text = el('span', 'card-label');
    text.textContent = entry.label;
    card.append(text);
  }
  return card;
}

function buildDartboardSvg() {
  const svg = svgEl('svg', { viewBox: '-100 -100 200 200', class: 'dartboard', 'aria-hidden': 'true' });
  svg.append(svgEl('circle', { r: R.edge, fill: COLORS.surround }));

  NUMBERS.forEach((number, i) => {
    const mid = -Math.PI / 2 + i * SEGMENT; // 20 at the top, clockwise
    const a1 = mid - SEGMENT / 2;
    const a2 = mid + SEGMENT / 2;
    const single = i % 2 === 0 ? COLORS.dark : COLORS.light;
    const ring = i % 2 === 0 ? COLORS.red : COLORS.green;
    svg.append(
      sector(R.outerBull, R.trebleIn, a1, a2, single),
      sector(R.trebleIn, R.trebleOut, a1, a2, ring),
      sector(R.trebleOut, R.doubleIn, a1, a2, single),
      sector(R.doubleIn, R.doubleOut, a1, a2, ring),
    );
    const label = svgEl('text', {
      x: (R.numbers * Math.cos(mid)).toFixed(2),
      y: (R.numbers * Math.sin(mid)).toFixed(2),
      class: 'board-number',
    });
    label.textContent = String(number);
    svg.append(label);
  });

  svg.append(
    svgEl('circle', { r: R.outerBull, fill: COLORS.green }),
    svgEl('circle', { r: R.bull, fill: COLORS.red }),
  );

  const wires = svgEl('g', { fill: 'none', stroke: COLORS.wire, 'stroke-width': 0.35 });
  for (const r of [R.bull, R.outerBull, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut]) {
    wires.append(svgEl('circle', { r }));
  }
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * SEGMENT;
    wires.append(
      svgEl('line', {
        x1: (R.outerBull * Math.cos(a)).toFixed(3),
        y1: (R.outerBull * Math.sin(a)).toFixed(3),
        x2: (R.doubleOut * Math.cos(a)).toFixed(3),
        y2: (R.doubleOut * Math.sin(a)).toFixed(3),
      }),
    );
  }
  svg.append(wires);
  return svg;
}

/** Annular sector between radii r1 < r2 and angles a1 < a2 (radians, clockwise). */
function sector(r1, r2, a1, a2, fill) {
  const pt = (r, a) => `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`;
  const d = `M ${pt(r2, a1)} A ${r2} ${r2} 0 0 1 ${pt(r2, a2)} L ${pt(r1, a2)} A ${r1} ${r1} 0 0 0 ${pt(r1, a1)} Z`;
  return svgEl('path', { d, fill });
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
```

- [ ] **Step 7: Create `src/panel.js`**

```js src/panel.js
import { MAX_ENTRIES } from './entries.js';

/** Wires the entry panel in index.html. Handlers receive plain values. */
export function createPanel({ onAddText, onAddFiles, onDelete, onClearAll }) {
  const controls = document.getElementById('panel-controls');
  const textarea = document.getElementById('entry-text');
  const addText = document.getElementById('add-text');
  const pickPictures = document.getElementById('pick-pictures');
  const fileInput = document.getElementById('add-pictures');
  const count = document.getElementById('entry-count');
  const clearAll = document.getElementById('clear-all');
  const list = document.getElementById('entry-list');

  const submitText = () => {
    if (textarea.value.trim()) onAddText(textarea.value);
  };
  addText.addEventListener('click', submitText);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitText();
    }
  });
  pickPictures.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = ''; // allow picking the same file again
    if (files.length > 0) onAddFiles(files);
  });
  clearAll.addEventListener('click', () => {
    if (confirm('Remove every entry from the board?')) onClearAll();
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (button) onDelete(button.dataset.id);
  });

  return {
    render(entries, imageUrlFor) {
      list.replaceChildren(...entries.map((entry) => renderItem(entry, imageUrlFor(entry))));
      count.textContent = `${entries.length} / ${MAX_ENTRIES}`;
      clearAll.disabled = entries.length === 0;
      const full = entries.length >= MAX_ENTRIES;
      addText.disabled = full;
      pickPictures.disabled = full;
    },
    clearText() {
      textarea.value = '';
    },
    setBusy(busy) {
      controls.inert = busy; // blocks clicks, typing and focus while a throw or upload runs
    },
  };
}

function renderItem(entry, imageUrl) {
  const item = document.createElement('li');
  item.className = 'entry';
  if (entry.type === 'image' && imageUrl) {
    const thumb = document.createElement('img');
    thumb.className = 'entry-thumb';
    thumb.src = imageUrl;
    thumb.alt = '';
    item.append(thumb);
  }
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = entry.label;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'entry-delete';
  remove.dataset.id = entry.id;
  remove.setAttribute('aria-label', `Remove ${entry.label}`);
  remove.textContent = '×';
  item.append(label, remove);
  return item;
}
```

- [ ] **Step 8: Create `src/main.js` (text entries only)**

```js src/main.js
import { cryptoUint32 } from './random.js';
import { layoutEntries } from './layout.js';
import { MAX_ENTRIES, parseTextEntries, makeTextEntry, addEntries } from './entries.js';
import { loadState, saveState, browserStorage } from './store.js';
import { createBoard, PLAYABLE_RADIUS } from './board.js';
import { createPanel } from './panel.js';
import { toast } from './toast.js';

const storage = browserStorage();
let state = loadState(storage);
let layout = [];

const board = createBoard(document.getElementById('board'));
const panel = createPanel({
  onAddText: addText,
  onAddFiles: () => toast('Pictures arrive in a later step.'),
  onDelete: deleteEntry,
  onClearAll: clearAll,
});
const shuffleButton = document.getElementById('shuffle');
shuffleButton.addEventListener('click', shuffle);

function imageUrlFor() {
  return undefined;
}

function persist() {
  try {
    saveState(storage, state);
  } catch {
    toast('Couldn’t save your board in this browser.');
  }
}

/** Lays the cards out again after the entries or the seed change. */
function relayout() {
  layout = layoutEntries(state.entries.length, PLAYABLE_RADIUS, state.layoutSeed);
  board.render(state.entries, layout, imageUrlFor);
  panel.render(state.entries, imageUrlFor);
  updateControls();
}

function updateControls() {
  shuffleButton.disabled = state.entries.length === 0;
}

function setEntries(entries) {
  state = { ...state, entries };
  persist();
  relayout();
}

function addText(text) {
  const { entries, dropped } = addEntries(state.entries, parseTextEntries(text).map(makeTextEntry));
  panel.clearText();
  if (dropped > 0) toast(`The board holds ${MAX_ENTRIES} entries — ${dropped} not added.`);
  setEntries(entries);
}

function deleteEntry(id) {
  setEntries(state.entries.filter((entry) => entry.id !== id));
}

function clearAll() {
  setEntries([]);
}

function shuffle() {
  state = { ...state, layoutSeed: cryptoUint32() };
  persist();
  relayout();
}

relayout();
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 50 tests, 0 failures.

- [ ] **Step 10: Check it in the browser**

Serve and open the page (see "How to check the page in a browser"). Then:

1. `orca eval --expression "document.querySelectorAll('.card').length"` → `0`, and the screenshot shows the dartboard with "Add names or pictures to pin them here".
2. Add entries: `orca eval --expression "document.getElementById('entry-text').value = Array.from({length: 12}, (_, i) => 'Person ' + (i + 1)).join('\n'); document.getElementById('add-text').click(); document.querySelectorAll('.card').length"` → `12`. Screenshot: 12 tilted paper cards with red pins, none overlapping, all inside the board, text readable; the panel lists 12 entries and shows `12 / 50`.
3. `orca reload`, then count `.card` again → `12` (persisted).
4. Shuffle moves cards: `orca eval --expression "const before = document.querySelector('.card').style.left; document.getElementById('shuffle').click(); before !== document.querySelector('.card').style.left"` → `true`.
5. Delete one: `orca eval --expression "document.querySelector('.entry-delete').click(); document.querySelectorAll('.card').length"` → `11`.
6. Fill to the cap: add 60 lines → count is `50`, a toast says entries weren't added, **Add** is disabled. Screenshot: 50 cards still don't overlap.
7. Narrow the window (or check at mobile width) — the panel stacks under the board, with no horizontal scrollbar.
8. Clear all (accept the confirm with `orca dialog accept`) → `0` cards.

If anything looks wrong, fix it before committing.

- [ ] **Step 11: Commit and push**

```bash
git add index.html styles.css src/board.js src/panel.js src/toast.js src/main.js tests/modules.test.js
git commit -m "$(cat <<'EOF'
feat: add page shell, SVG dartboard and text entries

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 7: Throwing the dart

Deliverable: **Throw dart** picks a winner uniformly, the dart flies in with a whoosh and sticks with a thunk, the board shakes, the card lights up, and the reveal dialog opens with **Remove & close** / **Close**. **Mute** works and persists. Reduced motion skips the animation.

**Files:**
- Create: `src/dart.js`, `src/sound.js`, `src/reveal.js`
- Modify: `src/main.js` (full replacement below), `tests/modules.test.js` (full replacement below)

**Interfaces:**
- Consumes: everything from Task 6, plus `pickWinner`, `pickLandingPoint` (picker) and `toPercent` (board).
- Produces:
  - `src/dart.js`: `FLIGHT_MS = 700`; `throwDart(layer: HTMLElement, point: { x, y } /* board units */, options?: { reducedMotion?: boolean }): Promise<void>` — resolves at impact; `clearDarts(layer: HTMLElement): void`.
  - `src/sound.js`: `createSound(): { muted: boolean (getter), setMuted(value: boolean), unlock(), whoosh(seconds?: number), thunk() }` — silent no-op when Web Audio is unavailable or muted.
  - `src/reveal.js`: `createReveal(dialog: HTMLDialogElement): { show(entry, imageUrl?: string): Promise<'remove' | 'close'> }`.

- [ ] **Step 1: Extend the module test (failing)**

Replace `tests/modules.test.js` with:

```js tests/modules.test.js
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
```

Run: `npm test`
Expected: FAIL — `Cannot find module` for dart.js, sound.js and reveal.js (4 failures).

- [ ] **Step 2: Create `src/dart.js`**

```js src/dart.js
import { toPercent } from './board.js';

export const FLIGHT_MS = 700;

const WOBBLE_MS = 450;
const FLIGHT_STEPS = 10;

// Constant markup only — never put user text in here.
const DART_SVG = `
<svg class="dart-svg" viewBox="0 -12 120 24" aria-hidden="true">
  <path d="M0 0 L18 -1.4 L18 1.4 Z" fill="#cfd4db"/>
  <rect x="18" y="-3.4" width="30" height="6.8" rx="2.4" fill="#3b4048"/>
  <path d="M24 -3.4v6.8M29 -3.4v6.8M34 -3.4v6.8M39 -3.4v6.8M44 -3.4v6.8" stroke="#6b727d" stroke-width="1"/>
  <rect x="48" y="-1.7" width="28" height="3.4" rx="1" fill="#1e1f22"/>
  <path d="M72 0 L94 -11 L118 -11 L104 0 L118 11 L94 11 Z" fill="#e0442f" stroke="#8e1f12" stroke-width="1"/>
  <path d="M72 0 H112" stroke="#8e1f12" stroke-width="1.2"/>
</svg>`;

export function clearDarts(layer) {
  layer.replaceChildren();
}

/**
 * Sticks a dart into the board at `point` (board units). Resolves on impact;
 * the wobble afterwards runs on its own.
 */
export function throwDart(layer, point, { reducedMotion = false } = {}) {
  clearDarts(layer);
  const dart = document.createElement('div');
  dart.className = 'dart';
  dart.style.left = `${toPercent(point.x)}%`;
  dart.style.top = `${toPercent(point.y)}%`;
  const body = document.createElement('div');
  body.className = 'dart-body';
  body.innerHTML = DART_SVG;
  dart.append(body);
  layer.append(dart);

  if (reducedMotion) return Promise.resolve();

  const flight = dart.animate(flightKeyframes(layer.clientWidth), { duration: FLIGHT_MS, easing: 'ease-in' });
  return flight.finished.then(() => {
    body.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-7deg)' },
        { transform: 'rotate(5deg)' },
        { transform: 'rotate(-3deg)' },
        { transform: 'rotate(1.5deg)' },
        { transform: 'rotate(0deg)' },
      ],
      { duration: WOBBLE_MS, easing: 'ease-out' },
    );
  });
}

/** A curved path in from the bottom right, shrinking as it "moves away" into the board. */
function flightKeyframes(boardWidth) {
  const start = { x: 0.95 * boardWidth, y: 1.1 * boardWidth };
  const control = { x: 0.55 * boardWidth, y: 0.05 * boardWidth };
  const frames = [];
  for (let i = 0; i <= FLIGHT_STEPS; i++) {
    const t = i / FLIGHT_STEPS;
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x; // quadratic Bézier ending at (0, 0)
    const y = u * u * start.y + 2 * u * t * control.y;
    frames.push({
      offset: t,
      opacity: Math.min(1, t / 0.15),
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(2.6 - 1.6 * t).toFixed(3)}) rotate(${(-14 * u).toFixed(2)}deg)`,
    });
  }
  return frames;
}
```

- [ ] **Step 3: Create `src/sound.js`**

```js src/sound.js
// Synthesized sound effects — no audio files. Every method is a silent no-op
// when muted or when the browser has no Web Audio.

export function createSound() {
  let ctx = null;
  let muted = false;

  function context() {
    if (muted) return null;
    try {
      if (!ctx) {
        const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function noise(ac, seconds) {
    const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  return {
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
    },
    /** Call from a click handler: browsers only allow audio after a user gesture. */
    unlock() {
      context();
    },
    whoosh(seconds = 0.7) {
      const ac = context();
      if (!ac) return;
      const t = ac.currentTime;
      const source = noise(ac, seconds);
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(350, t);
      filter.frequency.exponentialRampToValueAtTime(2800, t + seconds);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + seconds * 0.85);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      source.connect(filter).connect(gain).connect(ac.destination);
      source.start(t);
      source.stop(t + seconds);
    },
    thunk() {
      const ac = context();
      if (!ac) return;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const body = ac.createGain();
      body.gain.setValueAtTime(0.9, t);
      body.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(body).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.26);

      const click = noise(ac, 0.03);
      const lowpass = ac.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1800;
      const clickGain = ac.createGain();
      clickGain.gain.setValueAtTime(0.5, t);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      click.connect(lowpass).connect(clickGain).connect(ac.destination);
      click.start(t);
      click.stop(t + 0.03);
    },
  };
}
```

- [ ] **Step 4: Create `src/reveal.js`**

```js src/reveal.js
const CONFETTI_COLORS = ['#e0442f', '#f2c14e', '#12804a', '#f7f0de', '#4ea8de'];
const CONFETTI_PIECES = 40;

export function createReveal(dialog) {
  const content = dialog.querySelector('#reveal-content');
  const confetti = dialog.querySelector('.confetti');

  // A click on the backdrop lands on the <dialog> itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('close');
  });

  return {
    /** Shows the winner. Resolves 'remove' or 'close' (Esc and backdrop count as close). */
    show(entry, imageUrl) {
      content.replaceChildren(renderWinner(entry, imageUrl));
      confetti.replaceChildren(...makeConfetti());
      dialog.returnValue = '';
      dialog.showModal();
      return new Promise((resolve) => {
        dialog.addEventListener(
          'close',
          () => resolve(dialog.returnValue === 'remove' ? 'remove' : 'close'),
          { once: true },
        );
      });
    },
  };
}

function renderWinner(entry, imageUrl) {
  const wrap = document.createElement('div');
  wrap.className = `reveal-winner reveal-${entry.type}`;
  if (entry.type === 'image' && imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = entry.label;
    const caption = document.createElement('p');
    caption.className = 'reveal-caption';
    caption.textContent = entry.label;
    wrap.append(img, caption);
  } else {
    const text = document.createElement('p');
    text.className = 'reveal-text';
    text.textContent = entry.label;
    wrap.append(text);
  }
  return wrap;
}

// Cosmetic only, so Math.random is fine here.
function makeConfetti() {
  return Array.from({ length: CONFETTI_PIECES }, () => {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
    piece.style.animationDuration = `${(1.6 + Math.random() * 1.2).toFixed(2)}s`;
    piece.style.setProperty('--drift', `${Math.round((Math.random() * 2 - 1) * 60)}px`);
    piece.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
    return piece;
  });
}
```

- [ ] **Step 5: Replace `src/main.js` (text entries + throw)**

```js src/main.js
import { cryptoUint32 } from './random.js';
import { pickWinner, pickLandingPoint } from './picker.js';
import { layoutEntries } from './layout.js';
import { MAX_ENTRIES, parseTextEntries, makeTextEntry, addEntries } from './entries.js';
import { loadState, saveState, browserStorage } from './store.js';
import { createBoard, PLAYABLE_RADIUS } from './board.js';
import { throwDart, clearDarts, FLIGHT_MS } from './dart.js';
import { createSound } from './sound.js';
import { createReveal } from './reveal.js';
import { createPanel } from './panel.js';
import { toast } from './toast.js';

const REVEAL_DELAY_MS = 600;

const storage = browserStorage();
let state = loadState(storage);
let layout = [];
let busy = false; // true while a dart is in flight or the reveal is open

const board = createBoard(document.getElementById('board'));
const panel = createPanel({
  onAddText: addText,
  onAddFiles: () => toast('Pictures arrive in the next step.'),
  onDelete: deleteEntry,
  onClearAll: clearAll,
});
const reveal = createReveal(document.getElementById('reveal'));
const sound = createSound();
sound.setMuted(state.muted);

const throwButton = document.getElementById('throw');
const shuffleButton = document.getElementById('shuffle');
const muteButton = document.getElementById('mute');
throwButton.addEventListener('click', throwAtBoard);
shuffleButton.addEventListener('click', shuffle);
muteButton.addEventListener('click', toggleMute);

function imageUrlFor() {
  return undefined;
}

function persist() {
  try {
    saveState(storage, state);
  } catch {
    toast('Couldn’t save your board in this browser.');
  }
}

/** Lays the cards out again after the entries or the seed change. */
function relayout() {
  clearDarts(board.dartLayer);
  layout = layoutEntries(state.entries.length, PLAYABLE_RADIUS, state.layoutSeed);
  board.render(state.entries, layout, imageUrlFor);
  panel.render(state.entries, imageUrlFor);
  updateControls();
}

function updateControls() {
  const empty = state.entries.length === 0;
  throwButton.disabled = busy || empty;
  shuffleButton.disabled = busy || empty;
  panel.setBusy(busy);
  muteButton.setAttribute('aria-pressed', String(state.muted));
}

function setEntries(entries) {
  state = { ...state, entries };
  persist();
  relayout();
}

function addText(text) {
  const { entries, dropped } = addEntries(state.entries, parseTextEntries(text).map(makeTextEntry));
  panel.clearText();
  if (dropped > 0) toast(`The board holds ${MAX_ENTRIES} entries — ${dropped} not added.`);
  setEntries(entries);
}

function deleteEntry(id) {
  setEntries(state.entries.filter((entry) => entry.id !== id));
}

function clearAll() {
  setEntries([]);
}

function shuffle() {
  state = { ...state, layoutSeed: cryptoUint32() };
  persist();
  relayout();
}

function toggleMute() {
  state = { ...state, muted: !state.muted };
  sound.setMuted(state.muted);
  persist();
  updateControls();
}

async function throwAtBoard() {
  if (busy || state.entries.length === 0) return;
  busy = true;
  updateControls();
  sound.unlock();
  clearDarts(board.dartLayer);
  board.highlight(null);

  const index = pickWinner(state.entries);
  const winner = state.entries[index];
  const slot = layout[index];
  const half = slot.size / 2;
  const point = pickLandingPoint({ x: slot.x - half, y: slot.y - half, width: slot.size, height: slot.size });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let choice = 'close';
  try {
    if (!reducedMotion) sound.whoosh(FLIGHT_MS / 1000);
    await throwDart(board.dartLayer, point, { reducedMotion });
    sound.thunk();
    board.highlight(index);
    if (!reducedMotion) board.shake();
    await delay(REVEAL_DELAY_MS);
    choice = await reveal.show(winner, imageUrlFor(winner));
  } finally {
    busy = false;
    updateControls();
  }
  if (choice === 'remove') deleteEntry(winner.id);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

relayout();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 54 tests, 0 failures.

- [ ] **Step 7: Check it in the browser**

Serve and open the page. With 5 entries on the board:

1. Click **Throw dart** (`orca eval --expression "document.getElementById('throw').click()"`), and take a screenshot about 0.3s in if you can: the dart is mid-flight on a curve from the bottom right.
2. About 1.5s after the click: `orca eval --expression "[document.getElementById('reveal').open, document.querySelector('.reveal-text')?.textContent, document.querySelectorAll('.dart').length, document.querySelector('.card.is-hit')?.textContent]"` → `[true, <label>, 1, <same label>]`. Screenshot: the dart's tip sits on the highlighted card and the reveal shows the same name with confetti.
3. Click **Close** (`document.querySelector('#reveal button[value=close]').click()`) → the dialog closes, the dart stays stuck, and **Throw dart** is enabled again.
4. Throw again, then **Remove & close** → 4 cards remain and the dart is cleared.
5. Esc closes the reveal (keyboard check, by hand or `orca exec`).
6. **Mute** toggles `aria-pressed`, the icon changes, and it survives a reload (`JSON.parse(localStorage['dartboard.v1']).muted`).
7. Listen for the whoosh and thunk if audio is available, or ask the user to confirm.
8. Reduced motion: emulate `prefers-reduced-motion: reduce` (e.g. `orca exec` with agent-browser's media emulation, or the OS setting) → the dart appears instantly, with no shake or confetti, and the reveal still opens.
9. Fairness sanity check: throw 30 times with 3 entries, clicking Close each time, and tally the reveal text. All three should be hit (a rough check; the unit tests prove uniformity).

- [ ] **Step 8: Commit and push**

```bash
git add src/dart.js src/sound.js src/reveal.js src/main.js tests/modules.test.js
git commit -m "$(cat <<'EOF'
feat: throw the dart with flight animation, sound and winner reveal

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 8: Pictures

Deliverable: **Add pictures** accepts several images, which are resized, stored in IndexedDB, pinned as photo cards, shown as thumbnails in the list, and shown large in the reveal. They survive a reload; deleting an entry deletes its blob; errors show toasts.

**Files:**
- Create: `src/images.js`, `src/image-store.js`
- Modify: `src/main.js` (full replacement below — final version), `tests/modules.test.js` (full replacement below)

**Interfaces:**
- Consumes: everything from Tasks 6–7, plus `newId` (random), `makeImageEntry`, `labelFromFilename` (entries) and `hydrateImages` (store).
- Produces:
  - `src/images.js`: `isImageFile(file: { type: string }): boolean`; `resizeImage(file: Blob, maxSide = 400): Promise<Blob>` — rejects if the file can't be decoded.
  - `src/image-store.js`: `openImageStore(): Promise<BlobStore | null>` — `null` when IndexedDB is unavailable; `put` rejects with a `DOMException` named `QuotaExceededError` when storage is full.

- [ ] **Step 1: Extend the module test (failing)**

Replace `tests/modules.test.js` with:

```js tests/modules.test.js
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
```

Run: `npm test`
Expected: FAIL — `Cannot find module` for images.js and image-store.js (4 failures).

- [ ] **Step 2: Create `src/images.js`**

```js src/images.js
const MAX_SIDE = 400;
const QUALITY = 0.85;

export function isImageFile(file) {
  return typeof file.type === 'string' && file.type.startsWith('image/');
}

/** Scales an image down to fit maxSide × maxSide. WebP if the browser can encode it, else JPEG. */
export async function resizeImage(file, maxSide = MAX_SIDE) {
  const bitmap = await createImageBitmap(file); // rejects if the file can't be decoded
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // flatten transparency: JPEG has no alpha, and cards are white
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const webp = await toBlob(canvas, 'image/webp');
    if (webp && webp.type === 'image/webp') return webp; // Safari silently returns PNG instead
    const jpeg = await toBlob(canvas, 'image/jpeg');
    if (!jpeg) throw new Error('Could not encode the image');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}
```

- [ ] **Step 3: Create `src/image-store.js`**

```js src/image-store.js
// IndexedDB-backed blob store for pictures: { get, put, delete, clear }.

const DB_NAME = 'dartboard';
const STORE_NAME = 'images';

/** Opens the store, or resolves null when IndexedDB isn't usable here. */
export function openImageStore() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(wrap(request.result));
    request.onerror = () => resolve(null);
  });
}

function wrap(db) {
  const run = (mode, action) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error); // e.g. QuotaExceededError
    });

  return {
    get: (id) => run('readonly', (store) => store.get(id)),
    put: (id, blob) => run('readwrite', (store) => store.put(blob, id)).then(() => undefined),
    delete: (id) => run('readwrite', (store) => store.delete(id)).then(() => undefined),
    clear: () => run('readwrite', (store) => store.clear()).then(() => undefined),
  };
}
```

- [ ] **Step 4: Replace `src/main.js` (final version)**

```js src/main.js
import { cryptoUint32, newId } from './random.js';
import { pickWinner, pickLandingPoint } from './picker.js';
import { layoutEntries } from './layout.js';
import {
  MAX_ENTRIES,
  parseTextEntries,
  makeTextEntry,
  makeImageEntry,
  labelFromFilename,
  addEntries,
} from './entries.js';
import { loadState, saveState, hydrateImages, browserStorage } from './store.js';
import { openImageStore } from './image-store.js';
import { isImageFile, resizeImage } from './images.js';
import { createBoard, PLAYABLE_RADIUS } from './board.js';
import { throwDart, clearDarts, FLIGHT_MS } from './dart.js';
import { createSound } from './sound.js';
import { createReveal } from './reveal.js';
import { createPanel } from './panel.js';
import { toast } from './toast.js';

const REVEAL_DELAY_MS = 600;

const storage = browserStorage();
const blobStore = await openImageStore();
const loaded = await hydrateImages(loadState(storage), blobStore);
let state = loaded.state;
const imageUrls = new Map(); // imageId → object URL
for (const [imageId, blob] of loaded.images) imageUrls.set(imageId, URL.createObjectURL(blob));

let layout = [];
let busy = false; // true while a dart is in flight, the reveal is open, or pictures are processing
let warnedNoImageStore = false;

const board = createBoard(document.getElementById('board'));
const panel = createPanel({
  onAddText: addText,
  onAddFiles: addFiles,
  onDelete: deleteEntry,
  onClearAll: clearAll,
});
const reveal = createReveal(document.getElementById('reveal'));
const sound = createSound();
sound.setMuted(state.muted);

const throwButton = document.getElementById('throw');
const shuffleButton = document.getElementById('shuffle');
const muteButton = document.getElementById('mute');
throwButton.addEventListener('click', throwAtBoard);
shuffleButton.addEventListener('click', shuffle);
muteButton.addEventListener('click', toggleMute);

function imageUrlFor(entry) {
  return entry.type === 'image' ? imageUrls.get(entry.imageId) : undefined;
}

function persist() {
  try {
    saveState(storage, state);
  } catch {
    toast('Couldn’t save your board in this browser.');
  }
}

/** Lays the cards out again after the entries or the seed change. */
function relayout() {
  clearDarts(board.dartLayer);
  layout = layoutEntries(state.entries.length, PLAYABLE_RADIUS, state.layoutSeed);
  board.render(state.entries, layout, imageUrlFor);
  panel.render(state.entries, imageUrlFor);
  updateControls();
}

function updateControls() {
  const empty = state.entries.length === 0;
  throwButton.disabled = busy || empty;
  shuffleButton.disabled = busy || empty;
  panel.setBusy(busy);
  muteButton.setAttribute('aria-pressed', String(state.muted));
}

function setEntries(entries) {
  state = { ...state, entries };
  persist();
  relayout();
}

function addText(text) {
  const { entries, dropped } = addEntries(state.entries, parseTextEntries(text).map(makeTextEntry));
  panel.clearText();
  if (dropped > 0) toast(`The board holds ${MAX_ENTRIES} entries — ${dropped} not added.`);
  setEntries(entries);
}

async function addFiles(files) {
  busy = true;
  updateControls();
  const added = [];
  let dropped = 0;
  try {
    for (const file of files) {
      if (state.entries.length + added.length >= MAX_ENTRIES) {
        dropped++;
        continue;
      }
      if (!isImageFile(file)) {
        toast(`“${file.name}” isn’t an image — skipped.`);
        continue;
      }
      let blob;
      try {
        blob = await resizeImage(file);
      } catch {
        toast(`Couldn’t read “${file.name}” — skipped.`);
        continue;
      }
      const imageId = newId();
      if (blobStore) {
        try {
          await blobStore.put(imageId, blob);
        } catch (err) {
          if (err?.name === 'QuotaExceededError') {
            toast('Storage full — remove some pictures.');
            break;
          }
          toast(`Couldn’t save “${file.name}” — skipped.`);
          continue;
        }
      } else if (!warnedNoImageStore) {
        warnedNoImageStore = true;
        toast('This browser can’t store pictures — they’ll be gone after a reload.');
      }
      imageUrls.set(imageId, URL.createObjectURL(blob));
      added.push(makeImageEntry(labelFromFilename(file.name), imageId));
    }
  } finally {
    busy = false;
  }
  if (dropped > 0) {
    toast(`The board holds ${MAX_ENTRIES} entries — ${dropped} picture${dropped === 1 ? '' : 's'} not added.`);
  }
  if (added.length > 0) setEntries([...state.entries, ...added]);
  else updateControls();
}

function deleteEntry(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  if (entry.type === 'image') forgetImage(entry.imageId);
  setEntries(state.entries.filter((e) => e.id !== id));
}

function forgetImage(imageId) {
  const url = imageUrls.get(imageId);
  if (url) URL.revokeObjectURL(url);
  imageUrls.delete(imageId);
  blobStore?.delete(imageId).catch(() => {});
}

function clearAll() {
  for (const url of imageUrls.values()) URL.revokeObjectURL(url);
  imageUrls.clear();
  blobStore?.clear().catch(() => {});
  setEntries([]);
}

function shuffle() {
  state = { ...state, layoutSeed: cryptoUint32() };
  persist();
  relayout();
}

function toggleMute() {
  state = { ...state, muted: !state.muted };
  sound.setMuted(state.muted);
  persist();
  updateControls();
}

async function throwAtBoard() {
  if (busy || state.entries.length === 0) return;
  busy = true;
  updateControls();
  sound.unlock();
  clearDarts(board.dartLayer);
  board.highlight(null);

  const index = pickWinner(state.entries);
  const winner = state.entries[index];
  const slot = layout[index];
  const half = slot.size / 2;
  const point = pickLandingPoint({ x: slot.x - half, y: slot.y - half, width: slot.size, height: slot.size });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let choice = 'close';
  try {
    if (!reducedMotion) sound.whoosh(FLIGHT_MS / 1000);
    await throwDart(board.dartLayer, point, { reducedMotion });
    sound.thunk();
    board.highlight(index);
    if (!reducedMotion) board.shake();
    await delay(REVEAL_DELAY_MS);
    choice = await reveal.show(winner, imageUrlFor(winner));
  } finally {
    busy = false;
    updateControls();
  }
  if (choice === 'remove') deleteEntry(winner.id);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

persist(); // saves the board minus any pictures that failed to load
relayout();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 58 tests, 0 failures.

- [ ] **Step 6: Check it in the browser**

Serve and open the page. Simulate a picture upload (a real file picker can't be driven by eval):

```js
const canvas = document.createElement('canvas');
canvas.width = 1200; canvas.height = 600;
const g = canvas.getContext('2d');
g.fillStyle = 'teal'; g.fillRect(0, 0, 1200, 600);
g.fillStyle = 'white'; g.font = 'bold 200px sans-serif'; g.fillText('HI', 450, 380);
const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
const dt = new DataTransfer();
dt.items.add(new File([blob], 'teal-banner.png', { type: 'image/png' }));
dt.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
const input = document.getElementById('add-pictures');
input.files = dt.files;
input.dispatchEvent(new Event('change'));
```

1. After about 1s, `document.querySelectorAll('.card-image img').length` → `1`. A toast says `“notes.txt” isn’t an image — skipped.`, and the list shows a thumbnail labelled `teal-banner`.
2. Stored size: `(await (await fetch(document.querySelector('.card-image img').src)).blob()).size` is well under 100 KB, and the type is `image/webp` (or `image/jpeg` on Safari).
3. `orca reload` → the photo card is still there (IndexedDB + localStorage).
4. Throw until the photo wins, or temporarily have only the photo on the board → the reveal shows the image with the caption `teal-banner`.
5. Delete the photo entry → `indexedDB` no longer has its blob (`await new Promise(r => { const q = indexedDB.open('dartboard'); q.onsuccess = () => { const c = q.result.transaction('images').objectStore('images').count(); c.onsuccess = () => r(c.result); }; })` → `0`).
6. Mixed board: 8 names + 3 pictures, screenshot — photo cards and text cards line up the same and don't overlap.

- [ ] **Step 7: Commit and push**

```bash
git add src/images.js src/image-store.js src/main.js tests/modules.test.js
git commit -m "$(cat <<'EOF'
feat: add picture entries with resizing and IndexedDB storage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 9: README and GitHub Pages deploy

Deliverable: the live site at https://tremorgains.github.io/dartboard-selector/ works end to end.

**Files:**
- Create: `README.md`, `.nojekyll` (empty file)

**Interfaces:**
- Consumes: the finished app.
- Produces: documentation and the live deployment. GitHub Pages is already enabled for `main` at `/` (done during brainstorming).

- [ ] **Step 1: Create `README.md` and `.nojekyll`**

````markdown README.md
# Dartboard Selector

Pin names or pictures to a dartboard, throw a dart, and it picks one — an alternative to wheel-of-names spinners.

**Live:** https://tremorgains.github.io/dartboard-selector/

## Using it

- Type entries (one per line) and press **Add**, or use **Add pictures**. Up to 50 entries.
- **Throw dart** — every entry has exactly the same chance, wherever its card sits.
- **Shuffle** re-scatters the cards. **Mute** turns the sound effects off.
- In the reveal, **Remove & close** takes the winner off the board, which is handy for drawing an order.

Everything stays in your browser (localStorage and IndexedDB). Nothing is uploaded anywhere.

## Running locally

Browsers won't load ES modules from `file://`, so serve the folder:

```bash
python -m http.server 8000   # or: npx serve
```

Then open http://localhost:8000.

## Tests

```bash
npm test
```

Uses Node's built-in test runner (Node 18+). No dependencies to install.

## Deploying

GitHub Pages serves the `main` branch root. Pushing to `main` redeploys the site.
````

Create `.nojekyll` as an empty file (`touch .nojekyll`) so Pages serves the files as-is, without running Jekyll.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — 58 tests, 0 failures.

- [ ] **Step 3: Commit and push**

```bash
git add README.md .nojekyll
git commit -m "$(cat <<'EOF'
docs: add README and serve Pages without Jekyll

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 4: Wait for the Pages build and check the live site**

1. `gh api repos/TremorGains/dartboard-selector/pages/builds/latest --jq '.status'` → repeat until it says `built` (usually under 2 minutes). If it says `errored`, read `gh api repos/TremorGains/dartboard-selector/pages/builds/latest --jq '.error'`.
2. `curl -sI https://tremorgains.github.io/dartboard-selector/ | head -1` → `HTTP/2 200`.
3. `curl -sI https://tremorgains.github.io/dartboard-selector/src/main.js | grep -i content-type` → a JavaScript MIME type.
4. Open the live URL in Orca's browser: add 5 names, throw, confirm the reveal, reload, confirm the names persisted. Take a screenshot for the final report.
