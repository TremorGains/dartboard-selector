// Preset looks for each customisable part. A preset is a set of CSS custom
// properties; applying a theme just sets them on the page, so every part
// restyles instantly without redrawing anything.

export const THEME_PARTS = ['board', 'dart', 'notes', 'background'];

const board = (id, name, [dark, light, red, green, wire, surround, number]) => ({
  id,
  name,
  vars: {
    '--board-dark': dark,
    '--board-light': light,
    '--board-red': red,
    '--board-green': green,
    '--board-wire': wire,
    '--board-surround': surround,
    '--board-number': number,
  },
});

const dart = (id, name, [flight, edge, barrel, shaft, tip]) => ({
  id,
  name,
  vars: {
    '--dart-flight': flight,
    '--dart-flight-edge': edge,
    '--dart-barrel': barrel,
    '--dart-shaft': shaft,
    '--dart-tip': tip,
  },
});

const notes = (id, name, [paper, ink, pin]) => ({
  id,
  name,
  vars: { '--paper': paper, '--ink': ink, '--pin': pin },
});

// Backgrounds also retint the panel so the whole page stays coherent.
const background = (id, name, [bg, glow, bg2, panel, line]) => ({
  id,
  name,
  vars: { '--bg': bg, '--bg-glow': glow, '--bg-2': bg2, '--panel': panel, '--line': line },
});

export const THEMES = {
  board: [
    board('classic', 'Classic', ['#1b1b1b', '#efe3c2', '#c8243a', '#12804a', '#b9bcc0', '#101010', '#f4f1ea']),
    board('midnight', 'Midnight', ['#141a33', '#3b4a7a', '#7c5cff', '#2fb4c8', '#8fa0d0', '#0b0f1f', '#dfe6ff']),
    board('pub-wood', 'Pub wood', ['#3b2415', '#c99a61', '#8e2a1c', '#2f5d3a', '#d8c3a0', '#24160c', '#f3e2c4']),
    board('neon', 'Neon', ['#0d0d12', '#1f1f2b', '#ff2d95', '#00e5ff', '#5a5a78', '#050507', '#f0f0ff']),
    board('pastel', 'Pastel', ['#7d6f8f', '#f6eee4', '#f29aa8', '#9bd3b8', '#ffffff', '#3d3448', '#fff7ef']),
  ],
  dart: [
    dart('red', 'Red', ['#e0442f', '#8e1f12', '#3b4048', '#1e1f22', '#cfd4db']),
    dart('blue', 'Blue', ['#2f7de0', '#123e8e', '#3b4048', '#1e1f22', '#cfd4db']),
    dart('gold', 'Gold', ['#f2c14e', '#8e6a12', '#6b5a2e', '#2a2418', '#e8e2cf']),
    dart('green', 'Green', ['#22a55b', '#0d5a2d', '#3b4048', '#1e1f22', '#cfd4db']),
    dart('black-silver', 'Black & silver', ['#2b2d31', '#0f1012', '#a7adb6', '#5b6068', '#eef1f5']),
  ],
  notes: [
    notes('paper', 'Paper', ['#f7f0de', '#2a2118', '#e0442f']),
    notes('yellow', 'Yellow', ['#fff1a8', '#2f2a10', '#2f7de0']),
    notes('pink', 'Pink', ['#ffd3e0', '#3a1a24', '#c8243a']),
    notes('mint', 'Mint', ['#d4f5e4', '#143325', '#7c5cff']),
    notes('kraft', 'Kraft', ['#d8b98f', '#2e1f10', '#1b1b1b']),
  ],
  background: [
    background('pub-green', 'Pub green', ['#121a16', '#213128', '#1b2620', '#1f2c25', '#2f3f36']),
    background('night-sky', 'Night sky', ['#0e1224', '#1f2a52', '#171d36', '#1a2140', '#2c3660']),
    background('charcoal', 'Charcoal', ['#141414', '#2a2a2a', '#1e1e1e', '#222222', '#353535']),
    background('plum', 'Plum', ['#1d1020', '#3a1f40', '#2a1830', '#2e1a34', '#45294d']),
    background('ocean', 'Ocean', ['#0c1a22', '#16384a', '#13262f', '#152c37', '#24434f']),
  ],
};

export const DEFAULT_THEME = { board: 'classic', dart: 'red', notes: 'paper', background: 'pub-green' };

/** Keeps each part's choice if it names a real preset, otherwise uses the default. */
export function normalizeTheme(theme) {
  const chosen = theme !== null && typeof theme === 'object' ? theme : {};
  return Object.fromEntries(
    THEME_PARTS.map((part) => [
      part,
      THEMES[part].some((preset) => preset.id === chosen[part]) ? chosen[part] : DEFAULT_THEME[part],
    ]),
  );
}

/** Every CSS variable set by the theme's chosen presets. */
export function themeVars(theme) {
  const valid = normalizeTheme(theme);
  return Object.assign({}, ...THEME_PARTS.map((part) => THEMES[part].find((preset) => preset.id === valid[part]).vars));
}

/** Applies a theme by setting its CSS variables on `element` (normally the document root). */
export function applyTheme(element, theme) {
  for (const [name, value] of Object.entries(themeVars(theme))) element.style.setProperty(name, value);
}
