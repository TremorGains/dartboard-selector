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
