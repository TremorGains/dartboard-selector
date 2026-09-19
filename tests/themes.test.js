import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_PARTS, THEMES, DEFAULT_THEME, normalizeTheme, themeVars, applyTheme } from '../src/themes.js';

test('every customisable part has five presets with unique ids and names', () => {
  assert.deepEqual(THEME_PARTS, ['board', 'dart', 'notes', 'background']);
  for (const part of THEME_PARTS) {
    const presets = THEMES[part];
    assert.equal(presets.length, 5, part);
    assert.equal(new Set(presets.map((preset) => preset.id)).size, 5, `${part} ids must be unique`);
    for (const preset of presets) assert.ok(preset.name.length > 0, `${part}/${preset.id} needs a name`);
  }
});

test('presets of a part set the same colour variables, each a #rrggbb colour', () => {
  for (const part of THEME_PARTS) {
    const [first, ...rest] = THEMES[part];
    const keys = Object.keys(first.vars).sort();
    assert.ok(keys.length > 0, `${part} presets must set variables`);
    for (const preset of rest) {
      assert.deepEqual(Object.keys(preset.vars).sort(), keys, `${part}/${preset.id} sets different variables`);
    }
    for (const preset of THEMES[part]) {
      for (const [name, value] of Object.entries(preset.vars)) {
        assert.match(name, /^--[a-z0-9-]+$/, name);
        assert.match(value, /^#[0-9a-f]{6}$/, `${part}/${preset.id} ${name}=${value}`);
      }
    }
  }
});

test('the default theme uses a real preset for every part', () => {
  for (const part of THEME_PARTS) {
    assert.ok(THEMES[part].some((preset) => preset.id === DEFAULT_THEME[part]), part);
  }
});

test('normalizeTheme keeps valid choices and repairs missing or unknown ones', () => {
  assert.deepEqual(normalizeTheme(undefined), DEFAULT_THEME);
  assert.deepEqual(normalizeTheme('neon'), DEFAULT_THEME);
  assert.deepEqual(normalizeTheme({ board: 'neon', dart: 'nope' }), { ...DEFAULT_THEME, board: 'neon' });
});

test('applyTheme sets every variable of the chosen presets on the element', () => {
  const set = new Map();
  const element = { style: { setProperty: (name, value) => set.set(name, value) } };
  const theme = { ...DEFAULT_THEME, dart: 'blue' };
  applyTheme(element, theme);
  assert.deepEqual(Object.fromEntries(set), themeVars(theme));
  assert.equal(set.get('--dart-flight'), THEMES.dart.find((preset) => preset.id === 'blue').vars['--dart-flight']);
});
