import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BOARDS,
  MAX_BOARD_NAME,
  normalizeBoardName,
  makeBoard,
  nextBoardName,
  addBoard,
  renameBoard,
  removeBoard,
} from '../src/boards.js';

test('makeBoard creates an empty board with a fresh id', () => {
  const a = makeBoard('Team');
  const b = makeBoard('Team');
  assert.deepEqual({ ...a, id: 'x' }, { id: 'x', name: 'Team', entries: [], layoutSeed: 1 });
  assert.notEqual(a.id, b.id);
});

test('normalizeBoardName trims, caps at 40 characters and falls back when blank', () => {
  assert.equal(MAX_BOARD_NAME, 40);
  assert.equal(normalizeBoardName('  Friday games  ', 'Board 2'), 'Friday games');
  assert.equal(normalizeBoardName('x'.repeat(50), 'Board 2').length, 40);
  assert.equal(normalizeBoardName('   ', 'Board 2'), 'Board 2');
});

test('nextBoardName picks the first unused "Board N" after the current count', () => {
  assert.equal(nextBoardName([makeBoard('My board')]), 'Board 2');
  assert.equal(nextBoardName([makeBoard('My board'), makeBoard('Board 2')]), 'Board 3');
  assert.equal(nextBoardName([makeBoard('My board'), makeBoard('Board 3')]), 'Board 4');
});

test('addBoard appends a new board, named by the caller or automatically', () => {
  const boards = [makeBoard('My board')];
  const named = addBoard(boards, 'Raffle');
  assert.equal(named.boards.length, 2);
  assert.equal(named.board.name, 'Raffle');
  assert.equal(named.boards[1], named.board);
  assert.equal(boards.length, 1, 'must not mutate the input');
  assert.equal(addBoard(boards, '  ').board.name, 'Board 2');
});

test('addBoard refuses to go past MAX_BOARDS', () => {
  assert.equal(MAX_BOARDS, 10);
  const full = Array.from({ length: 10 }, (_, i) => makeBoard(`B${i}`));
  assert.throws(() => addBoard(full, 'One more'), RangeError);
});

test('renameBoard renames only the chosen board and ignores a blank name', () => {
  const boards = [makeBoard('A'), makeBoard('B')];
  const renamed = renameBoard(boards, boards[1].id, ' Quiz night ');
  assert.equal(renamed[1].name, 'Quiz night');
  assert.equal(renamed[0], boards[0]);
  assert.equal(renameBoard(boards, boards[1].id, '   ')[1].name, 'B');
});

test('removeBoard drops the board and reports its pictures for clean-up', () => {
  const picture = { id: 'p', type: 'image', label: 'Pic', imageId: 'img-1' };
  const text = { id: 't', type: 'text', label: 'Ann' };
  const boards = [makeBoard('A'), { ...makeBoard('B'), entries: [text, picture] }];
  const result = removeBoard(boards, boards[1].id);
  assert.deepEqual(result.boards.map((b) => b.name), ['A']);
  assert.deepEqual(result.imageIds, ['img-1']);
});

test('removing the last board leaves a fresh empty one', () => {
  const only = [makeBoard('Only')];
  const result = removeBoard(only, only[0].id);
  assert.equal(result.boards.length, 1);
  assert.equal(result.boards[0].name, 'My board');
  assert.deepEqual(result.boards[0].entries, []);
  assert.notEqual(result.boards[0].id, only[0].id);
});
