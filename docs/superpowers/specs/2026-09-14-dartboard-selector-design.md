# Dartboard Selector — Design

**Date:** 2026-09-14
**Status:** Approved design, pending implementation plan

## Purpose

A static web app that serves as an alternative to "wheel of names" spinners. Users pin
text entries and/or uploaded pictures onto a dartboard, press **Throw**, and a dart flies
in and sticks into one entry, selecting it.

## Decisions

| Topic | Decision |
|---|---|
| Hosting | Static site, no backend. Public repo `TremorGains/dartboard-selector`, served by GitHub Pages from `main` at the repo root (`https://tremorgains.github.io/dartboard-selector/`). All asset paths are relative so the `/dartboard-selector/` subpath works. Locally via `npx serve` / `python -m http.server` (ES modules do not load from `file://`). |
| Selection fairness | Winner chosen uniformly at random first; the dart then animates to a point on that entry's card. Position and size never affect odds. |
| Board style | Classic round dartboard (rings and segments) drawn in SVG, with entries shown as small cards/photos pinned on top. |
| Placement | Auto-arranged, non-overlapping; a **Shuffle** button re-scatters. No drag-to-place. |
| After a hit | Winner reveal overlay; option to remove the winner; synthesized sound effects with mute. No history list. |
| Stack | Plain HTML/CSS/JS, ES modules, no build step, no runtime or dev dependencies. |
| Tests | Node's built-in `node --test` for pure logic modules. |

## Architecture

```
index.html
styles.css
src/
  main.js     app state + wiring between modules
  picker.js   pickWinner(entries, rng), pickLandingPoint(rect, rng)   — pure
  layout.js   layoutEntries(count, radius, seed) → [{x, y, size, tilt}] — pure
  store.js    save/load entries + settings; storage backends injected
  images.js   resize uploaded file to ≤400px (longest side) WebP, JPEG fallback, via canvas
  board.js    renders SVG dartboard and pinned entry cards
  dart.js     throwDart(point) → Promise, Web Animations API
  sound.js    Web Audio synthesized whoosh + thunk, mute state
  reveal.js   winner <dialog> overlay
  panel.js    entry management UI
tests/
  picker.test.js
  layout.test.js
  store.test.js
```

`picker.js` and `layout.js` have no DOM or browser dependencies. `store.js` receives its
storage backends as parameters so tests can pass in fakes. `main.js` is the only module
that holds app state; UI modules take data and callbacks and do not reach into each other.

## Data model

```js
Entry = {
  id: string,              // crypto.randomUUID()
  type: 'text' | 'image',
  label: string,           // text entry, or image caption (defaults to filename without extension)
  imageId?: string         // IndexedDB key, only when type === 'image'
}
```

- `localStorage['dartboard.v1']` holds `{ entries: Entry[], muted: boolean, layoutSeed: number }`.
- IndexedDB database `dartboard`, object store `images`, key `imageId`, value `Blob`.
- Deleting an entry deletes its blob. "Clear all" empties both stores.
- Maximum 50 entries. Adding past the cap shows a toast and adds only up to the cap.
- Text labels are trimmed; blank lines are ignored; labels are capped at 80 characters.

## Layout

- Entries are square cards on a square grid clipped to a circle of 85% of the board
  radius. (A Vogel sunflower spiral was the first idea; prototyping showed it made cards
  about 1.5× smaller — e.g. 48px vs 71px per card for 20 entries on a 600px board.)
- Card size is the largest for which the grid has enough cells inside that circle, capped
  at half its radius, so neighbouring cards never overlap.
- The seed deterministically controls: which grid cells are used and which entry goes
  where, small positional jitter (bounded so no overlap is introduced), and card tilt (±8°).
- **Shuffle** generates a new seed and persists it, so reloads keep the same arrangement.
- Adding or removing entries re-runs layout with the current seed.

## UI

- **Board area** (left on desktop, top on mobile): SVG dartboard with pinned cards; controls
  **Throw** (primary), **Shuffle**, **Mute** toggle.
- **Panel** (right on desktop, below on mobile):
  - Textarea "one entry per line" + **Add** button.
  - **Add pictures** button (file input, multiple, `accept="image/*"`).
  - Entry list: thumbnail or text, × to delete each.
  - **Clear all** behind a confirmation.
- Text cards truncate with an ellipsis; full text appears in the reveal.
- All user text rendered via `textContent`, never `innerHTML`.

## Throw sequence

1. **Throw** is disabled when there are 0 entries and while a throw is in progress.
2. `pickWinner` selects an index uniformly using `crypto.getRandomValues` with rejection
   sampling (no modulo bias).
3. `pickLandingPoint` picks a random point within the central 60% of the winner card's rect.
4. Whoosh plays; the dart flies in from off-screen bottom-right on a slight arc, scaling
   down to suggest depth (~700ms, ease-in).
5. Impact: thunk plays, dart wobbles, board shakes slightly, winner card highlights.
6. After ~600ms the reveal `<dialog>` opens: large text or image, CSS confetti, buttons
   **Remove & close** and **Close**. Esc closes (native dialog behaviour).
7. The dart remains stuck in the board until the next throw or a shuffle.
8. `prefers-reduced-motion: reduce` — the dart appears at the landing point with no flight,
   shake, or confetti; the reveal still opens.

## Sound

- Whoosh: filtered white-noise sweep. Thunk: short low-frequency decaying pulse.
- The `AudioContext` is created on the first **Throw** click (autoplay policies).
- Mute state persists in `localStorage`.

## Error handling

| Situation | Behaviour |
|---|---|
| Non-image file selected | Skipped, toast names the file. |
| Image fails to decode/resize | Skipped, toast. |
| IndexedDB quota exceeded | Toast: "Storage full — remove some pictures". Entry not added. |
| IndexedDB unavailable | Images work for the session; one-time warning that they won't be saved. |
| Corrupt `localStorage` JSON | Start with an empty board; do not crash. |
| Entry's image blob missing on load | Entry dropped. |
| Web Audio unavailable | Throws proceed silently. |

## Testing

`node --test` (no dependencies):

- **picker:** returns an index within range; throws on an empty list; chi-square uniformity
  check over 10,000 seeded picks; landing point always inside the central 60% of the rect.
- **layout:** for counts 1–50 — no two cards overlap, every card lies inside the board;
  same seed gives identical output; different seeds give different output.
- **store:** round-trip save/load with fake backends; corrupt JSON returns an empty state;
  entries with missing blobs are dropped.

Animation, sound, and UI are verified manually in a real browser.

## Out of scope

Accounts, shareable links, drag-to-place, throw history, multiple boards, bulk import/export.
