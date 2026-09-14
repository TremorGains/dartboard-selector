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
    updateControls();
  }
  if (dropped > 0) {
    toast(`The board holds ${MAX_ENTRIES} entries — ${dropped} picture${dropped === 1 ? '' : 's'} not added.`);
  }
  if (added.length > 0) setEntries([...state.entries, ...added]);
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
    restoreFocus();
  }
  if (choice === 'remove') {
    deleteEntry(winner.id);
    restoreFocus();
  }
}

/**
 * After a throw or a delete, focus can fall to the page — bring it back to something useful.
 * The native <dialog> restores focus to whatever was focused before showModal() asynchronously
 * (observed ~2 frames after close()), so the check is deferred past that before it runs.
 */
function restoreFocus() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (!throwButton.disabled) throwButton.focus();
    else document.getElementById('entry-text')?.focus();
  }));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

persist(); // saves the board minus any pictures that failed to load
relayout();
