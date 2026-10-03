---
name: isolated-ui-check
description: Verify or reproduce a Mineradio Remix UI/behavior issue in the real player without touching the user's installed app or data — measure DOM, run renderer functions, take screenshots, or render a static preview with the real CSS. Use when the user reports a visual/layout/interaction bug, before claiming a UI fix works, or to compare before/after.
---

# Isolated UI check

Two tools in `scripts/qa/` (run with the repo's Electron, `ELECTRON_RUN_AS_NODE` unset):

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe \
  scripts/qa/isolated-electron.js --page probe.js [--shot out.png --visible] [--size 1280x820] [--settle 600]

env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe \
  scripts/qa/render-static.js --html preview.html --out preview.png [--size 900x500]
```

Keep probe/preview files in the scratchpad, not the repo.

## isolated-electron.js — the real player, throwaway profile

- Starts `desktop/main.js` with a temporary profile (guides marked seen, cache in temp, audio muted), blocks Google Fonts, disables occlusion throttling, waits for the renderer, dismisses the splash, then evaluates `--page` and prints one line `QA_RESULT {json}`.
- The page script runs in the renderer's global scope: call real functions (`showLoginModal`, `selectLoginProviderNode`, `renderQueuePanel`, `switchPlaylistTab`, …) and return measurements. Use an async IIFE:

```js
(async () => {
  showLoginModal({ provider: 'kugou' });
  await new Promise(r => setTimeout(r, 600));
  const r = document.querySelector('#login-modal .dual-login-modal').getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
})()
```

- Screenshots need `--visible` (a muted window briefly appears). A hidden window's capture can be stale — trust DOM measurements over a hidden screenshot.
- Measure *why*, not just *what*: list widths/heights of the element and its ancestors (`getComputedStyle` display/opacity/width, `elementFromPoint` at its center) to find which rule or child drives the problem.

## render-static.js — fast visual check of markup + real CSS

Build an HTML file that links `public/css/index.css` with an absolute `file:///` URL and contains the real markup copied from `public/index.html` (extract by id/class rather than retyping). Containers that are hidden or off-screen by default need inline overrides (`position:relative!important; transform:none!important; opacity:1!important; visibility:visible!important; display:block!important`). Render several states side by side (e.g. pinned vs unpinned) in one page. Add `html{zoom:3}` to inspect alignment, and guide lines if needed.

## Rules that came from real mistakes

- **Fake data is not the user's UI.** Without a logged-in account some panels show loading placeholders; do not turn what an isolated run shows into a design claim about the user's screen. Ask for, or reason from, the user's screenshot.
- **Bisect before blaming.** If a check fails, `git stash push -- <file>` the suspected change and rerun; also rerun the untouched baseline. A failure that also happens on the baseline is not caused by the change.
- **Reproduce the user's condition.** Size the window, zoom, open the same entry point (button vs node vs drag) the user used — different entry points take different code paths.
- Real network/accounts only when the user explicitly asks, and read-only.
- Delete nothing in the user's profile; the tool never needs it.
