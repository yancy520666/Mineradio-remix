'use strict';

// Shows an official login page's QR code inside the player. The official page
// still runs (offscreen, never shown), so the login and its cookies are exactly
// those of the visible login window; only the QR region is copied out of the
// page's painted frame. When no QR can be found the caller falls back to the
// visible official window.

const crypto = require('crypto');

const QR_HINT = /qr|qrcode|codekey|ptqrshow|scan|二维码|扫码/i;

// Runs inside every frame. Returns the most QR-like element in that frame.
function qrLocateScript() {
  return `(() => {
  const hint = ${QR_HINT.toString()};
  const near = /扫码|二维码|扫一扫|扫描/;
  const expiredText = /二维码(已)?(失效|过期)|已失效|已过期/;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const label = (node) => [node.id, typeof node.className === 'string' ? node.className : '', node.getAttribute && node.getAttribute('src'), node.getAttribute && node.getAttribute('alt')].join(' ');
  const shown = (node) => {
    for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.2) return false;
    }
    return true;
  };
  let best = null;
  for (const node of document.querySelectorAll('img, canvas, svg')) {
    const r = node.getBoundingClientRect();
    if (r.width < 80 || r.height < 80 || r.width > 380 || r.height > 380) continue;
    const ratio = r.width / r.height;
    if (ratio < 0.8 || ratio > 1.25) continue;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    if (node.tagName === 'IMG' && !(node.complete && node.naturalWidth > 0)) continue;
    if (!shown(node)) continue;
    let score = 0;
    if (hint.test(label(node))) score += 5;
    let parent = node.parentElement;
    for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
      if (hint.test(label(parent))) { score += 3; break; }
    }
    parent = node.parentElement;
    for (let depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
      if (near.test((parent.innerText || '').slice(0, 400))) { score += 2; break; }
    }
    if (node.tagName === 'CANVAS') score += 1;
    score += 1 - Math.min(1, Math.abs(1 - ratio) * 4);
    if (score < 2) continue;
    if (!best || score > best.score) best = { score, x: r.left, y: r.top, width: r.width, height: r.height };
  }
  const text = (document.body && document.body.innerText || '').slice(0, 4000);
  return { found: !!best, qr: best, expired: expiredText.test(text) };
})()`;
}

// Runs in a parent frame: where is the iframe that hosts the child frame?
function iframeRectScript(name, url) {
  return `((name, url) => {
  const strip = (value) => String(value || '').split('#')[0];
  const frames = Array.from(document.querySelectorAll('iframe, frame'));
  const visible = frames.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  let hit = name ? frames.find((el) => el.name === name || el.id === name) : null;
  if (!hit) hit = frames.find((el) => { const src = strip(el.src); return src && (src === strip(url) || strip(url).indexOf(src) === 0); });
  if (!hit) {
    try {
      const want = new URL(url);
      hit = visible.find((el) => { try { const u = new URL(el.src); return u.origin === want.origin && u.pathname === want.pathname; } catch (_) { return false; } });
    } catch (_) {}
  }
  if (!hit && visible.length === 1) hit = visible[0];
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  return { x: r.left + hit.clientLeft, y: r.top + hit.clientTop };
})(${JSON.stringify(name || '')}, ${JSON.stringify(url || '')})`;
}

async function frameOffset(frame) {
  let x = 0;
  let y = 0;
  for (let child = frame; child && child.parent; child = child.parent) {
    const rect = await child.parent.executeJavaScript(iframeRectScript(child.name, child.url), true).catch(() => null);
    if (!rect) return null;
    x += rect.x;
    y += rect.y;
  }
  return { x, y };
}

async function locateQr(webContents) {
  const main = webContents && webContents.mainFrame;
  if (!main) return { found: false, expired: false };
  let frames = [];
  try { frames = main.framesInSubtree || [main]; } catch (_) { frames = [main]; }
  let best = null;
  let expired = false;
  for (const frame of frames) {
    const state = await frame.executeJavaScript(qrLocateScript(), true).catch(() => null);
    if (!state) continue;
    if (state.expired) expired = true;
    if (!state.found || !state.qr) continue;
    const offset = frame === main ? { x: 0, y: 0 } : await frameOffset(frame);
    if (!offset) continue;
    const rect = { x: state.qr.x + offset.x, y: state.qr.y + offset.y, width: state.qr.width, height: state.qr.height };
    if (!best || state.qr.score > best.score) best = { score: state.qr.score, rect };
  }
  return { found: !!best, rect: best && best.rect, expired };
}

function cropFrame(image, rect, contentSize) {
  if (!image || image.isEmpty() || !rect) return null;
  const size = image.getSize();
  const scale = contentSize && contentSize.width ? size.width / contentSize.width : 1;
  const pad = 2;
  const x = Math.max(0, Math.floor((rect.x - pad) * scale));
  const y = Math.max(0, Math.floor((rect.y - pad) * scale));
  const width = Math.min(size.width - x, Math.ceil((rect.width + pad * 2) * scale));
  const height = Math.min(size.height - y, Math.ceil((rect.height + pad * 2) * scale));
  if (width < 40 || height < 40) return null;
  const cropped = image.crop({ x, y, width, height });
  return cropped.isEmpty() ? null : cropped;
}

// win: an offscreen BrowserWindow. notify(payload) receives
// { stage: 'qr', image, expired } | { stage: 'scanned' }.
// onFail(reason) fires once when no QR shows up in time.
function createInlineQrSession(win, options) {
  options = options || {};
  const notify = typeof options.notify === 'function' ? options.notify : () => {};
  const onFail = typeof options.onFail === 'function' ? options.onFail : () => {};
  const timeoutMs = options.timeoutMs || 15000;
  const intervalMs = options.intervalMs || 700;
  const startedAt = Date.now();
  const wc = win.webContents;
  let frame = null;
  let rect = null;
  let lastHash = '';
  let seen = false;
  let lostSince = 0;
  let stopped = false;
  let failed = false;
  let timer = null;
  let busy = false;

  const onPaint = (_event, _dirty, image) => { frame = image; };
  wc.on('paint', onPaint);
  try { wc.setFrameRate(10); } catch (_) {}

  const fail = (reason) => {
    if (failed || stopped) return;
    failed = true;
    stop();
    onFail(reason);
  };

  const tick = async () => {
    if (stopped || busy || wc.isDestroyed()) return;
    busy = true;
    try {
      const state = await locateQr(wc);
      if (stopped) return;
      if (state.found) {
        rect = state.rect;
        lostSince = 0;
        let size = null;
        try { size = win.getContentBounds(); } catch (_) {}
        const cropped = cropFrame(frame, rect, size);
        if (cropped) {
          const png = cropped.toPNG();
          const hash = crypto.createHash('sha1').update(png).digest('hex') + (state.expired ? ':x' : '');
          if (hash !== lastHash) {
            lastHash = hash;
            seen = true;
            notify({ stage: 'qr', image: 'data:image/png;base64,' + png.toString('base64'), expired: !!state.expired });
          }
        }
      } else if (seen) {
        // The QR left the page: scanned and confirmed, the page is moving on.
        if (!lostSince) lostSince = Date.now();
        else if (Date.now() - lostSince > 1200 && lastHash !== 'scanned') {
          lastHash = 'scanned';
          notify({ stage: 'scanned' });
        }
      } else if (Date.now() - startedAt > timeoutMs) {
        fail('QR_NOT_FOUND');
        return;
      }
    } finally {
      busy = false;
    }
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    try { if (!wc.isDestroyed()) wc.removeListener('paint', onPaint); } catch (_) {}
  }

  timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    stop,
    fail,
    // fx/fy are 0..1 inside the QR image the player shows.
    click(fx, fy) {
      if (stopped || !rect || wc.isDestroyed()) return false;
      const x = Math.round(rect.x + Math.max(0, Math.min(1, Number(fx) || 0.5)) * rect.width);
      const y = Math.round(rect.y + Math.max(0, Math.min(1, Number(fy) || 0.5)) * rect.height);
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return true;
    },
  };
}

module.exports = {
  createInlineQrSession,
  qrLocateScript,
  iframeRectScript,
  locateQr,
  cropFrame,
};
