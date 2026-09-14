const CONFETTI_COLORS = ['#e0442f', '#f2c14e', '#12804a', '#f7f0de', '#4ea8de'];
const CONFETTI_PIECES = 40;

export function createReveal(dialog) {
  const content = dialog.querySelector('#reveal-content');
  const confetti = dialog.querySelector('.confetti');

  // A click on the backdrop lands on the <dialog> itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('close');
  });

  return {
    /** Shows the winner. Resolves 'remove' or 'close' (Esc and backdrop count as close). */
    show(entry, imageUrl) {
      content.replaceChildren(renderWinner(entry, imageUrl));
      confetti.replaceChildren(...makeConfetti());
      dialog.returnValue = '';
      dialog.showModal();
      return new Promise((resolve) => {
        dialog.addEventListener(
          'close',
          () => resolve(dialog.returnValue === 'remove' ? 'remove' : 'close'),
          { once: true },
        );
      });
    },
  };
}

function renderWinner(entry, imageUrl) {
  const wrap = document.createElement('div');
  wrap.className = `reveal-winner reveal-${entry.type}`;
  if (entry.type === 'image' && imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = entry.label;
    const caption = document.createElement('p');
    caption.className = 'reveal-caption';
    caption.textContent = entry.label;
    wrap.append(img, caption);
  } else {
    const text = document.createElement('p');
    text.className = 'reveal-text';
    text.textContent = entry.label;
    wrap.append(text);
  }
  return wrap;
}

// Cosmetic only, so Math.random is fine here.
function makeConfetti() {
  return Array.from({ length: CONFETTI_PIECES }, () => {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
    piece.style.animationDuration = `${(1.6 + Math.random() * 1.2).toFixed(2)}s`;
    piece.style.setProperty('--drift', `${Math.round((Math.random() * 2 - 1) * 60)}px`);
    piece.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
    return piece;
  });
}
