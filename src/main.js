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
