'use strict';

// One-click import of a music platform's login cookies from a browser on this machine.
// Read-only: copies the browser's cookie database to a temp file and never writes back.
// Firefox stores cookies in plain text. Chromium browsers use DPAPI + AES-GCM ("v10");
// Chrome 127+ app-bound cookies ("v20") can only be read by the browser itself.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

const PROVIDER_HOSTS = {
  netease: ['music.163.com', '163.com'],
  qq: ['y.qq.com', 'qq.com'],
  kugou: ['kugou.com'],
};
const PROVIDER_REQUIRED = {
  netease: ['MUSIC_U'],
  qq: ['qqmusic_key', 'qm_keyst', 'p_skey', 'skey'],
  kugou: ['t', 'KuGooRandom', 'kg_mid'],
};

function hostMatches(host, wanted) {
  host = String(host || '').replace(/^\./, '').toLowerCase();
  return wanted.some(w => host === w || host.endsWith('.' + w));
}

function chromiumBrowsers() {
  const local = process.env.LOCALAPPDATA || '';
  return [
    { id: 'edge', label: 'Edge', dir: path.join(local, 'Microsoft', 'Edge', 'User Data') },
    { id: 'chrome', label: 'Chrome', dir: path.join(local, 'Google', 'Chrome', 'User Data') },
    { id: 'brave', label: 'Brave', dir: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  ];
}

function profileDirs(userDataDir) {
  try {
    return fs.readdirSync(userDataDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name)))
      .map(d => path.join(userDataDir, d.name));
  } catch (_) { return []; }
}

// Edge keeps its cookie file open with shared access, so a share-tolerant read works while it runs;
// Chrome holds an exclusive lock and still needs to be closed.
function copySharedWindows(file, dest) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$i=[IO.File]::Open($env:MR_SRC,"Open","Read","ReadWrite,Delete");try{$o=[IO.File]::Create($env:MR_DST);try{$i.CopyTo($o)}finally{$o.Close()}}finally{$i.Close()}'],
  { env: { ...process.env, MR_SRC: file, MR_DST: dest }, windowsHide: true, timeout: 15000, stdio: 'ignore' });
}
function copyOne(file, dest) {
  try { fs.copyFileSync(file, dest); } catch (_) { copySharedWindows(file, dest); }
}
function copyToTemp(file) {
  const tmp = path.join(os.tmpdir(), 'mineradio-cookie-' + crypto.randomBytes(6).toString('hex') + '.sqlite');
  copyOne(file, tmp);
  for (const suffix of ['-wal', '-shm']) {
    try { if (fs.existsSync(file + suffix)) copyOne(file + suffix, tmp + suffix); } catch (_) {}
  }
  return tmp;
}
function removeTemp(tmp) {
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + suffix); } catch (_) {} }
}

function queryRows(dbFile, sql, params) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try { return db.prepare(sql).all(...(params || [])); } finally { db.close(); }
}

function dpapiUnprotect(buffer) {
  return new Promise((resolve, reject) => {
    const script = '[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect('
      + '[Convert]::FromBase64String($env:MR_DPAPI_IN),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Security; ' + script],
    { env: { ...process.env, MR_DPAPI_IN: buffer.toString('base64') }, windowsHide: true, timeout: 15000 },
    (error, stdout) => error ? reject(error) : resolve(Buffer.from(String(stdout).trim(), 'base64')));
  });
}

async function chromiumKey(userDataDir) {
  const state = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8'));
  const encoded = state && state.os_crypt && state.os_crypt.encrypted_key;
  if (!encoded) throw new Error('NO_KEY');
  const raw = Buffer.from(encoded, 'base64');
  if (raw.subarray(0, 5).toString() !== 'DPAPI') throw new Error('NO_KEY');
  return dpapiUnprotect(raw.subarray(5));
}

function decryptChromiumValue(blob, key) {
  if (!blob || !blob.length) return { value: '' };
  const buf = Buffer.from(blob);
  const tag = buf.subarray(0, 3).toString();
  if (tag === 'v10' || tag === 'v11') {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(3, 15));
    decipher.setAuthTag(buf.subarray(buf.length - 16));
    const plain = Buffer.concat([decipher.update(buf.subarray(15, buf.length - 16)), decipher.final()]);
    // Chrome 130+ prefixes a 32-byte host hash in front of the real value.
    return { value: plain.toString('utf8') };
  }
  if (tag === 'v20') return { appBound: true };
  return { value: '' };
}

async function readChromium(browser, wanted) {
  const jar = {}; let appBound = false, locked = false, found = false;
  const key = await chromiumKey(browser.dir).catch(() => null);
  for (const profile of profileDirs(browser.dir)) {
    const dbFile = [path.join(profile, 'Network', 'Cookies'), path.join(profile, 'Cookies')].find(f => fs.existsSync(f));
    if (!dbFile) continue;
    found = true;
    let tmp;
    try { tmp = copyToTemp(dbFile); } catch (_) { locked = true; continue; }
    try {
      const rows = queryRows(tmp, 'SELECT host_key, name, value, encrypted_value FROM cookies');
      for (const row of rows) {
        if (!hostMatches(row.host_key, wanted)) continue;
        let value = row.value;
        if (!value && row.encrypted_value && key) {
          try {
            const result = decryptChromiumValue(row.encrypted_value, key);
            if (result.appBound) { appBound = true; continue; }
            value = result.value;
            // Chrome 130+ app-bound-free values carry the 32-byte host digest prefix.
            if (value && value.length > 32 && /[\u0000-\u0008\u000e-\u001f�]/.test(value.slice(0, 32))) value = value.slice(32);
          } catch (_) { continue; }
        }
        if (value) jar[row.name] = value;
      }
    } catch (_) { locked = true; } finally { removeTemp(tmp); }
  }
  return { jar, appBound, locked, found };
}

async function readFirefox(wanted) {
  const jar = {}; let found = false, locked = false;
  const base = path.join(process.env.APPDATA || '', 'Mozilla', 'Firefox', 'Profiles');
  let dirs = [];
  try { dirs = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(base, d.name)); } catch (_) {}
  for (const dir of dirs) {
    const dbFile = path.join(dir, 'cookies.sqlite');
    if (!fs.existsSync(dbFile)) continue;
    found = true;
    let tmp;
    try { tmp = copyToTemp(dbFile); } catch (_) { locked = true; continue; }
    try {
      for (const row of queryRows(tmp, 'SELECT host, name, value FROM moz_cookies')) {
        if (hostMatches(row.host, wanted) && row.value) jar[row.name] = row.value;
      }
    } catch (_) { locked = true; } finally { removeTemp(tmp); }
  }
  return { jar, found, locked };
}

function jarToHeader(jar) {
  return Object.keys(jar).map(name => name + '=' + jar[name]).join('; ');
}
function hasRequired(provider, jar) {
  const need = PROVIDER_REQUIRED[provider] || [];
  return need.some(name => jar[name]);
}

// Returns { ok, cookie, browser } or { ok:false, message }. The cookie is handed straight to the
// existing per-platform login endpoint and is never logged.
async function importBrowserCookies(provider) {
  const wanted = PROVIDER_HOSTS[provider];
  if (!wanted) return { ok: false, message: '该平台暂不支持自动导入' };
  if (process.platform !== 'win32') return { ok: false, message: '自动导入目前只支持 Windows' };
  let appBound = false, locked = false, anyBrowser = false;
  try {
    const ff = await readFirefox(wanted);
    anyBrowser = anyBrowser || ff.found; locked = locked || ff.locked;
    if (hasRequired(provider, ff.jar)) return { ok: true, cookie: jarToHeader(ff.jar), browser: 'Firefox' };
  } catch (_) {}
  for (const browser of chromiumBrowsers()) {
    if (!fs.existsSync(browser.dir)) continue;
    anyBrowser = true;
    try {
      const result = await readChromium(browser, wanted);
      appBound = appBound || result.appBound; locked = locked || result.locked;
      if (hasRequired(provider, result.jar)) return { ok: true, cookie: jarToHeader(result.jar), browser: browser.label };
    } catch (_) {}
  }
  if (!anyBrowser) return { ok: false, message: '没有找到 Edge、Chrome、Brave 或 Firefox，请改用扫码登录' };
  if (locked) return { ok: false, message: '浏览器正在占用 Cookie 文件，请先完全关闭浏览器后再点一次' };
  if (appBound) return { ok: false, message: '新版 Chrome/Edge 对 Cookie 做了应用绑定加密，其他程序无法读取。请改用 Firefox，或使用扫码登录' };
  return { ok: false, message: '浏览器里没有找到该平台的登录状态，请先在浏览器登录一次' };
}

module.exports = { importBrowserCookies };
