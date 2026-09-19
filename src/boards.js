import { newId } from './random.js';

// Saved boards: each board has its own entries and layout. Pure helpers only —
// the live app state is held in main.js.

export const MAX_BOARDS = 10;
export const MAX_BOARD_NAME = 40;
const FIRST_BOARD_NAME = 'My board';

/** Trims and caps a board name (never splitting an emoji); blank names become `fallback`. */
export function normalizeBoardName(name, fallback) {
  const trimmed = Array.from(String(name ?? '').trim()).slice(0, MAX_BOARD_NAME).join('');
  return trimmed || fallback;
}

export function makeBoard(name = FIRST_BOARD_NAME, { entries = [], layoutSeed = 1 } = {}) {
  return { id: newId(), name, entries, layoutSeed };
}

/** The first "Board N" not already in use, counting on from the number of boards. */
export function nextBoardName(boards) {
  const taken = new Set(boards.map((board) => board.name));
  let n = boards.length + 1;
  while (taken.has(`Board ${n}`)) n++;
  return `Board ${n}`;
}

/** Appends a new board. Throws a RangeError once MAX_BOARDS is reached. */
export function addBoard(boards, name, options) {
  if (boards.length >= MAX_BOARDS) throw new RangeError(`addBoard: at most ${MAX_BOARDS} boards`);
  const board = makeBoard(normalizeBoardName(name, nextBoardName(boards)), options);
  return { boards: [...boards, board], board };
}

/** Renames one board; a blank name leaves it unchanged. */
export function renameBoard(boards, id, name) {
  return boards.map((board) => (board.id === id ? { ...board, name: normalizeBoardName(name, board.name) } : board));
}

/**
 * Removes a board and reports the picture ids it used, so their blobs can be deleted.
 * There is always at least one board: removing the last one leaves a fresh empty board.
 */
export function removeBoard(boards, id) {
  const removed = boards.find((board) => board.id === id);
  const imageIds = (removed?.entries ?? []).filter((entry) => entry.type === 'image').map((entry) => entry.imageId);
  const rest = boards.filter((board) => board.id !== id);
  return { boards: rest.length > 0 ? rest : [makeBoard(FIRST_BOARD_NAME)], imageIds };
}
