import { MAX_ENTRIES } from './entries.js';

/** Wires the entry panel in index.html. Handlers receive plain values. */
export function createPanel({ onAddText, onAddFiles, onDelete, onClearAll }) {
  const controls = document.getElementById('panel-controls');
  const textarea = document.getElementById('entry-text');
  const addText = document.getElementById('add-text');
  const pickPictures = document.getElementById('pick-pictures');
  const fileInput = document.getElementById('add-pictures');
  const count = document.getElementById('entry-count');
  const clearAll = document.getElementById('clear-all');
  const list = document.getElementById('entry-list');

  const submitText = () => {
    if (textarea.value.trim()) onAddText(textarea.value);
  };
  addText.addEventListener('click', submitText);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitText();
    }
  });
  pickPictures.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = ''; // allow picking the same file again
    if (files.length > 0) onAddFiles(files);
  });
  clearAll.addEventListener('click', () => {
    if (confirm('Remove every entry from the board?')) onClearAll();
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    const index = [...list.querySelectorAll('.entry-delete')].indexOf(button);
    onDelete(button.dataset.id); // re-renders the list synchronously
    const remaining = list.querySelectorAll('.entry-delete');
    if (remaining.length === 0) textarea.focus();
    else remaining[Math.min(index, remaining.length - 1)].focus();
  });

  return {
    render(entries, imageUrlFor) {
      list.replaceChildren(...entries.map((entry) => renderItem(entry, imageUrlFor(entry))));
      count.textContent = `${entries.length} / ${MAX_ENTRIES}`;
      clearAll.disabled = entries.length === 0;
      const full = entries.length >= MAX_ENTRIES;
      addText.disabled = full;
      pickPictures.disabled = full;
    },
    clearText() {
      textarea.value = '';
    },
    setBusy(busy) {
      controls.inert = busy; // blocks clicks, typing and focus while a throw or upload runs
    },
  };
}

function renderItem(entry, imageUrl) {
  const item = document.createElement('li');
  item.className = 'entry';
  if (entry.type === 'image' && imageUrl) {
    const thumb = document.createElement('img');
    thumb.className = 'entry-thumb';
    thumb.src = imageUrl;
    thumb.alt = '';
    item.append(thumb);
  }
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = entry.label;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'entry-delete';
  remove.dataset.id = entry.id;
  remove.setAttribute('aria-label', `Remove ${entry.label}`);
  remove.textContent = '×';
  item.append(label, remove);
  return item;
}
