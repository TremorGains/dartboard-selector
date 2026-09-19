import { THEME_PARTS, THEMES } from './themes.js';

// The Customise dialog: one group of preset choices per part, as radio buttons
// with small colour previews. Picking one calls onChange(part, presetId) straight away.

const PART_LABELS = { board: 'Board', dart: 'Dart', notes: 'Sticky notes', background: 'Background' };

// The colours shown as dots next to each preset's name.
const PREVIEW_VARS = {
  board: ['--board-red', '--board-light', '--board-green', '--board-dark'],
  dart: ['--dart-flight', '--dart-barrel', '--dart-tip'],
  notes: ['--paper', '--ink', '--pin'],
  background: ['--bg', '--panel', '--bg-glow'],
};

export function createCustomise(dialog, { onChange }) {
  const options = dialog.querySelector('#theme-options');
  options.replaceChildren(...THEME_PARTS.map(buildPart));
  options.addEventListener('change', (event) => {
    const { name, value } = event.target;
    if (name?.startsWith('theme-')) onChange(name.slice('theme-'.length), value);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // a click on the backdrop
  });

  return {
    open(theme) {
      for (const part of THEME_PARTS) {
        const input = options.querySelector(`input[name="theme-${part}"][value="${theme[part]}"]`);
        if (input) input.checked = true;
      }
      dialog.showModal();
      // Start keyboard users on the current board choice, not simply the first radio.
      options.querySelector('input:checked')?.focus();
    },
  };
}

function buildPart(part) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'theme-part';
  const legend = document.createElement('legend');
  legend.textContent = PART_LABELS[part];
  fieldset.append(legend);
  for (const preset of THEMES[part]) {
    const label = document.createElement('label');
    label.className = 'theme-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `theme-${part}`;
    input.value = preset.id;
    const swatch = document.createElement('span');
    swatch.className = 'theme-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    for (const name of PREVIEW_VARS[part]) {
      const dot = document.createElement('span');
      dot.style.background = preset.vars[name];
      swatch.append(dot);
    }
    const text = document.createElement('span');
    text.textContent = preset.name;
    label.append(input, swatch, text);
    fieldset.append(label);
  }
  return fieldset;
}
