// The board menu in the panel: pick a saved board, or create, rename or delete one.
// Handlers receive plain values; main.js owns the boards.

export function createBoardMenu({ onSwitch, onCreate, onRename, onDelete }) {
  const select = document.getElementById('board-select');
  const newButton = document.getElementById('new-board');
  const renameButton = document.getElementById('rename-board');
  const deleteButton = document.getElementById('delete-board');
  const dialog = document.getElementById('board-name');
  const title = document.getElementById('board-name-title');
  const input = document.getElementById('board-name-input');

  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close('cancel'));

  /** Asks for a board name. Resolves with the typed text, or null if cancelled. */
  function askName(heading, current) {
    title.textContent = heading;
    input.value = current;
    dialog.returnValue = '';
    dialog.showModal();
    input.select();
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'save' ? input.value : null), {
        once: true,
      });
    });
  }

  const currentName = () => select.selectedOptions[0]?.textContent ?? '';

  select.addEventListener('change', () => onSwitch(select.value));
  newButton.addEventListener('click', async () => {
    const name = await askName('New board', '');
    if (name !== null) onCreate(name);
  });
  renameButton.addEventListener('click', async () => {
    const name = await askName('Rename board', currentName());
    if (name !== null) onRename(name);
  });
  deleteButton.addEventListener('click', () => {
    if (confirm(`Delete “${currentName()}” and everything on it? This can’t be undone.`)) onDelete();
  });

  return {
    render(boards, activeBoardId, { canAdd }) {
      select.replaceChildren(
        ...boards.map((board) => {
          const option = document.createElement('option');
          option.value = board.id;
          option.textContent = board.name;
          return option;
        }),
      );
      select.value = activeBoardId;
      newButton.disabled = !canAdd;
      newButton.title = canAdd ? '' : 'You can keep up to 10 boards';
    },
  };
}
