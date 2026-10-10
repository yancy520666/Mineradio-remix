'use strict';

// Challenge destinations are untrusted upstream data. Keep both the initial
// verification page and all subsequent navigations on official HTTPS hosts.
function validateKugouVerificationUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    const host = url.hostname.toLowerCase();
    if (!host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return '';
    return host === 'kugou.com' || host.endsWith('.kugou.com') ? url.href : '';
  } catch (_) { return ''; }
}

function getKugouVerificationChallenge(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const roots = [payload, payload.data, payload.error].filter(row => row && typeof row === 'object');
  const nested = roots.flatMap(row => [row.challenge, row.verification, row.captcha]).filter(row => row && typeof row === 'object');
  const rows = [...roots, ...nested];
  const codes = rows.flatMap(row => [row.err_code, row.errcode, row.error_code, row.code, row.status]);
  const text = rows.flatMap(row => [row.message, row.msg, row.err_msg, row.errmsg, row.error]).filter(value => typeof value === 'string').join(' ');
  const urls = rows.flatMap(row => [row.verificationUrl, row.verification_url, row.verify_url, row.captcha_url, row.challenge_url, row.url]);
  const explicitUrl = nested.some(row => row.url) || rows.some(row => row.verificationUrl || row.verification_url || row.verify_url || row.captcha_url || row.challenge_url);
  if (!codes.some(code => Number(code) === 30020) && !/captcha|verification[_ -]?required|安全验证|安全校验|验证码|人机验证|滑块/i.test(text) && !explicitUrl) return null;
  const verificationUrl = urls.map(validateKugouVerificationUrl).find(Boolean);
  return { ok: false, verificationRequired: true, error: 'KUGOU_VERIFICATION_REQUIRED', ...(verificationUrl ? { verificationUrl } : {}) };
}

function isKugouVerificationPageUrl(value) {
  const safe = validateKugouVerificationUrl(value);
  if (!safe) return false;
  const url = new URL(safe);
  return /captcha|verify|verification|challenge|safety|security/i.test(url.pathname + url.search);
}

// Detection only: do not solve, click, fill or submit the official challenge.
const verificationPageScript = `(() => {
  const visible = node => {
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  for (const node of document.querySelectorAll('input, iframe, [id], [class], p, span, label, h1, h2, h3')) {
    if (!visible(node)) continue;
    const hint = [node.id, typeof node.className === 'string' ? node.className : '', node.getAttribute('src'), node.getAttribute('name')].join(' ');
    if (/captcha|geetest|tcaptcha|verify-code|verification-code/i.test(hint)) return true;
    const text = (node.innerText || '').trim();
    if (text.length < 180 && /安全验证|安全校验|人机验证|滑动.{0,12}验证|拖动.{0,12}滑块|输入.{0,12}验证码|请完成.{0,12}验证/.test(text)) return true;
  }
  return false;
})()`;

// A hung frame gets at most one evaluation. Retry checks share that promise
// instead of queuing another executeJavaScript every polling interval.
const pendingFrameChecks = new WeakMap();
function frameVerificationState(frame, timeoutMs) {
  let pending = pendingFrameChecks.get(frame);
  if (!pending) {
    pending = Promise.resolve().then(() => frame.executeJavaScript(verificationPageScript))
      .then(value => value === true, () => null);
    pendingFrameChecks.set(frame, pending);
    pending.then(() => { if (pendingFrameChecks.get(frame) === pending) pendingFrameChecks.delete(frame); });
  }
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    pending.then(value => { clearTimeout(timer); resolve(value); });
  });
}

async function detectKugouVerificationPage(webContents, options = {}) {
  if (!webContents) return false;
  if (typeof webContents.getURL === 'function' && isKugouVerificationPageUrl(webContents.getURL())) return true;
  const main = webContents.mainFrame;
  if (!main) return false;
  let frames;
  try { frames = main.framesInSubtree || [main]; } catch (_) { frames = [main]; }
  const deadline = Date.now() + (options.timeoutMs || 700);
  let uncertain = false;
  for (const frame of frames) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const state = await frameVerificationState(frame, remaining);
    if (state === true) return true;
    if (state === null) uncertain = true;
  }
  // Unknown is deliberately distinct from "no challenge": old cookies must
  // not complete login while the official challenge cannot be inspected.
  return uncertain ? null : false;
}

function kugouLoginEntryScript() {
  return `setTimeout(() => {
    if (${verificationPageScript}) return;
    const nodes = Array.from(document.querySelectorAll('a, button, span'));
    const loginNode = nodes.find(node => {
      const text = (node.textContent || '').trim();
      const rect = node.getBoundingClientRect();
      return /^(登录|登陆|立即登录|立即登陆)$/.test(text) && rect.width > 0 && rect.height > 0;
    });
    if (loginNode) loginNode.click();
  }, 700);`;
}

module.exports = { validateKugouVerificationUrl, getKugouVerificationChallenge, isKugouVerificationPageUrl, detectKugouVerificationPage, kugouLoginEntryScript };
