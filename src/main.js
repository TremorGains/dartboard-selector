import { cryptoUint32, newId } from './random.js';
import { pickWinner, pickLandingPoint } from './picker.js';
import { layoutEntries, applyPins } from './layout.js';
import {
  MAX_ENTRIES,
  parseTextEntries,
  makeTextEntry,
  makeImageEntry,
  labelFromFilename,
  addEntries,
  pinEntry,
  clearPins,
} from './entries.js';
import { applyTheme } from './themes.js';
import { loadAppState, saveAppState, hydrateAppImages, browserStorage, emptyAppState } from './store.js';
import { buildExport, deleteAllData } from './your-data.js';
import { openImageStore } from './image-store.js';
import { isImageFile, resizeImage } from './images.js';
import { createBoard, PLAYABLE_RADIUS } from './board.js';
import { throwDart, clearDarts, FLIGHT_MS } from './dart.js';
import { createSound } from './sound.js';
import { createReveal } from './reveal.js';
import { createPanel } from './panel.js';
import { createCustomise } from './customise.js';
import { toast } from './toast.js';
import { setupAds } from './site.js';

const REVEAL_DELAY_MS = 600;

const storage = browserStorage();
const blobStore = await openImageStore();
const loaded = await hydrateAppImages(loadAppState(storage), blobStore);
let app = loaded.state; // { boards, activeBoardId, settings: { muted, theme } }
const imageUrls = new Map(); // imageId → object URL, for pictures on every board
for (const [imageId, blob] of loaded.images) imageUrls.set(imageId, URL.createObjectURL(blob));
applyTheme(document.documentElement, app.settings.theme);

let layout = [];
let busy = false; // true while a dart is in flight, the reveal is open, or pictures are processing
let warnedNoImageStore = false;

const board = createBoard(document.getElementById('board'), {
  canDrag: () => !busy,
  onMove: moveEntry,
});
const panel = createPanel({
  onAddText: addText,
  onAddFiles: addFiles,
  onDelete: deleteEntry,
  onClearAll: clearAll,
});
const reveal = createReveal(document.getElementById('reveal'));
const customise = createCustomise(document.getElementById('customise-dialog'), { onChange: changeTheme });
const sound = createSound();
sound.setMuted(app.settings.muted);

const throwButton = document.getElementById('throw');
const shuffleButton = document.getElementById('shuffle');
const muteButton = document.getElementById('mute');
throwButton.addEventListener('click', throwAtBoard);
shuffleButton.addEventListener('click', shuffle);
muteButton.addEventListener('click', toggleMute);
document.getElementById('customise').addEventListener('click', () => customise.open(app.settings.theme));

const yourData = document.getElementById('your-data');
document.getElementById('open-your-data').addEventListener('click', () => yourData.showModal());
document.getElementById('export-data').addEventListener('click', exportData);
document.getElementById('delete-data').addEventListener('click', deleteEverything);
yourData.addEventListener('click', (event) => {
  if (event.target === yourData) yourData.close(); // a click on the backdrop
});

/** The board on screen. The saved shape keeps a list of boards, but only this one is shown. */
function active() {
  return app.boards.find((b) => b.id === app.activeBoardId);
}

/** Changes fields of the board on screen. */
function updateActive(changes) {
  app = { ...app, boards: app.boards.map((b) => (b.id === app.activeBoardId ? { ...b, ...changes } : b)) };
}

function imageUrlFor(entry) {
  return entry.type === 'image' ? imageUrls.get(entry.imageId) : undefined;
}

function persist() {
  try {
    saveAppState(storage, app);
  } catch {
    toast('Couldn’t save your board in this browser.');
  }
}

/** Lays the cards out again after the entries or the seed change. */
function relayout() {
  clearDarts(board.dartLayer);
  const { entries, layoutSeed } = active();
  const auto = layoutEntries(entries.length, PLAYABLE_RADIUS, layoutSeed);
  layout = applyPins(auto, entries, PLAYABLE_RADIUS);
  board.render(entries, layout, imageUrlFor);
  panel.render(entries, imageUrlFor);
  updateControls();
}

function updateControls() {
  const empty = active().entries.length === 0;
  throwButton.disabled = busy || empty;
  shuffleButton.disabled = busy || empty;
  panel.setBusy(busy);
  muteButton.setAttribute('aria-pressed', String(app.settings.muted));
}

function setEntries(entries) {
  updateActive({ entries });
  persist();
  relayout();
}

function addText(text) {
  const { entries, dropped } = addEntries(active().entries, parseTextEntries(text).map(makeTextEntry));
  panel.clearText();
  if (dropped > 0) toast(`A board holds ${MAX_ENTRIES} entries — ${dropped} not added.`);
  setEntries(entries);
}

async function addFiles(files) {
  busy = true;
  updateControls();
  const added = [];
  let dropped = 0;
  try {
    for (const file of files) {
      if (active().entries.length + added.length >= MAX_ENTRIES) {
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
    toast(`A board holds ${MAX_ENTRIES} entries — ${dropped} picture${dropped === 1 ? '' : 's'} not added.`);
  }
  if (added.length > 0) setEntries([...active().entries, ...added]);
}

function deleteEntry(id) {
  const entry = active().entries.find((e) => e.id === id);
  if (!entry) return;
  if (entry.type === 'image') forgetImage(entry.imageId);
  setEntries(active().entries.filter((e) => e.id !== id));
}

function forgetImage(imageId) {
  const url = imageUrls.get(imageId);
  if (url) URL.revokeObjectURL(url);
  imageUrls.delete(imageId);
  blobStore?.delete(imageId).catch(() => {});
}

/** Empties the board and deletes its pictures. */
function clearAll() {
  for (const entry of active().entries) {
    if (entry.type === 'image') forgetImage(entry.imageId);
  }
  setEntries([]);
}

/** A card was dragged and dropped at `point` (board units). */
function moveEntry(index, point) {
  setEntries(pinEntry(active().entries, active().entries[index].id, point));
}

/** Re-scatters every card, including ones placed by hand. */
function shuffle() {
  updateActive({ entries: clearPins(active().entries), layoutSeed: cryptoUint32() });
  persist();
  relayout();
}

function toggleMute() {
  app = { ...app, settings: { ...app.settings, muted: !app.settings.muted } };
  sound.setMuted(app.settings.muted);
  persist();
  updateControls();
}

function changeTheme(part, presetId) {
  app = { ...app, settings: { ...app.settings, theme: { ...app.settings.theme, [part]: presetId } } };
  applyTheme(document.documentElement, app.settings.theme);
  persist();
}

async function throwAtBoard() {
  if (busy || active().entries.length === 0) return;
  busy = true;
  updateControls();
  sound.unlock();
  clearDarts(board.dartLayer);
  board.highlight(null);

  const index = pickWinner(active().entries);
  const winner = active().entries[index];
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

/** Downloads everything the app has stored on this device as one JSON file. */
async function exportData() {
  try {
    const blobs = new Map();
    for (const [imageId, url] of imageUrls) blobs.set(imageId, await (await fetch(url)).blob());
    const data = await buildExport(app, blobs, { toDataUrl: blobToDataUrl });
    const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `dartpick-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch {
    toast('Couldn’t prepare the download — please try again.');
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Wipes every board, picture and setting from this device. */
async function deleteEverything() {
  if (!confirm('Delete every board, picture and setting from this device? This can’t be undone.')) return;
  try {
    await deleteAllData({ storage, blobStore });
  } catch {
    toast('Couldn’t delete everything — please try again.');
    return;
  }
  for (const url of imageUrls.values()) URL.revokeObjectURL(url);
  imageUrls.clear();
  app = emptyAppState();
  applyTheme(document.documentElement, app.settings.theme);
  sound.setMuted(app.settings.muted);
  yourData.close();
  relayout();
  toast('Everything has been deleted from this device.');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

persist(); // saves in the current format (migrating an older save) minus any pictures that failed to load
relayout();

// Ads and the one-time ad choice. Does nothing until the AdSense ids in ads.js are set.
setupAds();

// Cache the app so it works offline. Skipped where service workers aren't available.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
