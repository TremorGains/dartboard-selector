# Dartboard Selector

Pin names or pictures to a dartboard, throw a dart, and it picks one — an alternative to wheel-of-names spinners.

**Live:** https://tremorgains.github.io/dartboard-selector/

## Using it

- Type entries (one per line) and press **Add**, or use **Add pictures**. Up to 50 entries.
- **Throw dart** — every entry has exactly the same chance, wherever its card sits.
- **Shuffle** re-scatters the cards. **Mute** turns the sound effects off.
- In the reveal, **Remove & close** takes the winner off the board, which is handy for drawing an order.

Everything stays in your browser (localStorage and IndexedDB). Nothing is uploaded anywhere.

## Running locally

Browsers won't load ES modules from `file://`, so serve the folder:

```bash
python -m http.server 8000   # or: npx serve
```

Then open http://localhost:8000.

## Tests

```bash
npm test
```

Uses Node's built-in test runner (Node 18+). No dependencies to install.

## Deploying

GitHub Pages serves the `main` branch root. Pushing to `main` redeploys the site.
