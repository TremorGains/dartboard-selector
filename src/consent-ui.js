// The plain-English ad choice, built in JavaScript so every page shares one copy.
// Only fixed wording goes in here — no user text ever reaches the DOM from this file.

const COPY = {
  title: 'Ads keep DartPick free',
  body:
    'Ads can be picked using what you do on this device, or they can be plain ads that ignore it. ' +
    'Either way your names, pictures and boards stay on your device — they are never used for ads.',
  yes: 'Yes, use my activity',
  no: 'No, plain ads',
  google: 'Google’s ad choices',
  close: 'Close',
};

export function createConsentUi(doc = document) {
  const dialog = doc.createElement('dialog');
  dialog.className = 'reveal';
  dialog.id = 'consent-dialog';

  const form = doc.createElement('form');
  form.method = 'dialog';
  form.className = 'reveal-card data-card';

  const title = doc.createElement('h2');
  title.className = 'data-title';
  title.textContent = COPY.title;

  const body = doc.createElement('p');
  body.textContent = COPY.body;

  const choices = doc.createElement('div');
  choices.className = 'row';
  const yes = button(doc, COPY.yes, 'personalised', 'btn btn-primary');
  const no = button(doc, COPY.no, 'non-personalised', 'btn');
  choices.append(yes, no);

  const extras = doc.createElement('div');
  extras.className = 'row';
  const googleButton = button(doc, COPY.google, 'google', 'link-btn');
  googleButton.type = 'button';
  googleButton.hidden = true;
  const close = button(doc, COPY.close, 'close', 'link-btn');
  close.hidden = true;
  extras.append(googleButton, close);

  const note = doc.createElement('p');
  note.className = 'hint';

  form.append(title, body, choices, extras, note);
  dialog.append(form);
  doc.body.append(dialog);

  let onGoogle = null;
  googleButton.addEventListener('click', () => onGoogle?.());

  return {
    /**
     * Shows the choice. `dismissable` adds a Close button (for the Privacy choices link).
     * @returns the chosen value, or null if it was closed without choosing
     */
    ask({ current = null, dismissable = false, googleOptions = null } = {}) {
      close.hidden = !dismissable;
      googleButton.hidden = !googleOptions;
      onGoogle = googleOptions;
      note.textContent = current
        ? `Your choice now: ${current === 'personalised' ? COPY.yes.toLowerCase() : COPY.no.toLowerCase()}.`
        : '';
      dialog.showModal();
      return new Promise((resolve) => {
        dialog.addEventListener(
          'close',
          () => {
            const value = dialog.returnValue;
            resolve(value === 'personalised' || value === 'non-personalised' ? value : null);
          },
          { once: true },
        );
      });
    },
  };
}

function button(doc, label, value, className) {
  const el = doc.createElement('button');
  el.className = className;
  el.value = value;
  el.textContent = label;
  return el;
}
