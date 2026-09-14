const TOAST_MS = 4000;

/** Shows a short message in the #toasts live region. */
export function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  document.getElementById('toasts').append(item);
  setTimeout(() => item.remove(), TOAST_MS);
}
