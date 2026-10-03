'use strict';
// Render a static HTML file (typically real markup + public/css/index.css)
// offscreen and save a PNG. Fast way to check a UI change without launching
// the whole player.
//
//   node_modules/electron/dist/electron.exe scripts/qa/render-static.js \
//     --html preview.html --out preview.png [--size 900x500] [--settle 700]
//
// Link the stylesheet with an absolute file:/// URL. Offscreen rendering is
// reliable here (unlike a hidden player window).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

function arg(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const html = arg('html', ''), out = arg('out', '');
if (!html || !out) { console.error('usage: --html file --out file.png [--size WxH]'); process.exit(2); }
const [width, height] = String(arg('size', '900x500')).split('x').map(Number);
const settle = Number(arg('settle', 700)) || 0;
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-render-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width, height, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.resolve(html));
  await new Promise(resolve => setTimeout(resolve, settle));
  fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  console.log('RENDERED ' + path.resolve(out));
  app.exit(0);
});
