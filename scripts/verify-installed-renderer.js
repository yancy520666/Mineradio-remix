'use strict';
// Talks only to the temporary runner's installed app, through its loopback CDP port.
const assert = require('node:assert/strict');
const [port, mode] = process.argv.slice(2);
const base = `http://127.0.0.1:${Number(port)}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const deadline = Date.now() + 60000;
  let page;
  while (Date.now() < deadline) {
    try { page = (await (await fetch(base + '/json')).json()).find(p => p.type === 'page' && /^http:\/\/127\.0\.0\.1:/.test(p.url)); } catch (_) {}
    if (page) break;
    await sleep(200);
  }
  assert(page, 'installed app did not expose its local renderer');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id); clearTimeout(call.timer);
    if (message.error || message.result?.exceptionDetails) call.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else call.resolve(message.result.result.value);
  });
  function evaluate(expression) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Installed renderer evaluation timed out')); }, 20000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
  }
  try {
    let ready = false;
    while (Date.now() < deadline) {
      ready = await evaluate('typeof renderer !== "undefined" && !!renderer && typeof ACCOUNT_PROVIDER_KEYS !== "undefined" && Array.isArray(ACCOUNT_PROVIDER_KEYS) && typeof saveLyricLayout === "function"');
      if (ready) break;
      await sleep(200);
    }
    assert(ready, 'installed app modules did not initialize');
    if (mode === 'write') await evaluate('fx.lyricScale = 1.17; fx.lyricTranslationGap = 0.61; saveLyricLayout({ user: true, force: true, reason: "installer-smoke" }); true');
    const values = await evaluate('({ scale: fx.lyricScale, gap: fx.lyricTranslationGap, bridge: typeof desktopWindow !== "undefined" && !!desktopWindow, title: document.title })');
    assert.equal(values.scale, 1.17, 'upgrade must preserve lyric scale');
    assert.equal(values.gap, 0.61, 'upgrade must preserve translation gap');
    assert(values.bridge, 'installed preload bridge is missing');
    console.log('INSTALLED_RENDERER:' + JSON.stringify({ mode, ...values }));
    // Ask the real window close handler to quit and flush its settings.
    ws.send(JSON.stringify({ id: ++nextId, method: 'Runtime.evaluate', params: { expression: 'desktopWindow.close("exit")' } }));
  } finally { ws.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
