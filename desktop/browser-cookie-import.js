'use strict';

// One-click import of a music platform login from the browsers on this PC.
// Runs only after the user clicks the import button. Reads just the target
// platform's login cookies (domain + name allowlist below), never logs values,
// and returns them to the player, which validates and stores them locally like
// a pasted cookie. Nothing is uploaded anywhere.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PROVIDERS = {
  netease: {
    label: '网易云音乐',
    site: 'music.163.com',
    domains: ['163.com', 'music.163.com'],
    names: ['MUSIC_U', '__csrf', 'NMTID', 'MUSIC_A', '__remember_me', '_ntes_nuid', '_ntes_nnid', 'WEVNSM', 'WNMCID', 'JSESSIONID-WYYY'],
    loggedIn: obj => !!obj.MUSIC_U,
    keyCookie: 'MUSIC_U',
  },
  qq: {
    label: 'QQ 音乐',
    site: 'y.qq.com',
    domains: ['qq.com', 'y.qq.com'],
    names: ['uin', 'qqmusic_uin', 'wxuin', 'login_type', 'qm_keyst', 'qqmusic_key', 'p_skey', 'skey', 'psrf_qqopenid',
      'psrf_qqunionid', 'psrf_qqaccess_token', 'psrf_qqrefresh_token', 'wxopenid', 'wxunionid', 'wxrefresh_token', 'wxskey', 'p_uin', 'ptcz', 'RK'],
    loggedIn: obj => {
      const wechat = !!obj.wxopenid || Number(obj.login_type) === 2;
      const uin = String((wechat ? (obj.wxuin || obj.uin) : (obj.uin || obj.qqmusic_uin || obj.wxuin)) || obj.p_uin || '').replace(/\D/g, '');
      return !!(uin && (obj.qm_keyst || obj.qqmusic_key || obj.wxskey));
    },
    keyCookie: 'qqmusic_key',
  },
  kugou: {
    label: '酷狗音乐',
    site: 'www.kugou.com',
    domains: ['kugou.com', 'www.kugou.com'],
    names: ['KuGoo', 'Kugou', 'kugou', 'token', 'Token', 't', 'T', 'userid', 'UserId', 'KugooID', 'kugouID', 'kg_mid', 'KG_MID',
      'kg_dfid', 'KG_DFID', 'dfid', 'DFID', 'mid', 'NickName', 'UserName'],
    loggedIn: obj => !!(obj.KuGoo || ((obj.token || obj.Token || obj.t || obj.T) && (obj.userid || obj.UserId || obj.KugooID || obj.kugouID))),
    keyCookie: 'KuGoo',
  },
};

const MESSAGES = {
  NO_BROWSER: '这台电脑上没找到 Chrome、Edge、Brave 或 Firefox。可以改用扫码登录。',
  LOCKED: '{browser} 正在运行，暂时读不到它的登录文件。请完全关闭 {browser}（包括后台）后再试，或改用扫码。',
  APP_BOUND: '{browser} 新版给登录信息加了只有它自己能解开的加密，其他软件读不到。可以换另一个浏览器（如 Firefox）登录后再导入，或直接扫码。',
  KEY_UNAVAILABLE: '找到了 {browser} 的登录信息，但 Windows 没有交出它的解密密钥（数据保护接口调用失败）。可换另一个浏览器导入，或直接扫码。',
  READ_FAILED: '{browser} 的登录文件无法读取（可能被安全软件拦截或文件损坏）。可换另一个浏览器导入，或直接扫码。',
  DECRYPT_FAILED: '找到了 {browser} 的登录信息，但解密失败。可换另一个浏览器导入，或直接扫码。',
};

function providerConfig(provider) {
  return PROVIDERS[String(provider || '').toLowerCase()] || null;
}

function domainMatches(host, domains) {
  const h = String(host || '').replace(/^\./, '').toLowerCase();
  return domains.some(d => h === d || h.endsWith('.' + d));
}

// --- Browser discovery ------------------------------------------------------

function chromiumBrowsers(env) {
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [
    { id: 'edge', label: 'Edge', root: path.join(local, 'Microsoft', 'Edge', 'User Data') },
    { id: 'chrome', label: 'Chrome', root: path.join(local, 'Google', 'Chrome', 'User Data') },
    { id: 'brave', label: 'Brave', root: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  ];
}

function chromiumProfiles(root, fsApi) {
  let names = [];
  try { names = fsApi.readdirSync(root); } catch (_) { return []; }
  return names
    .filter(name => name === 'Default' || /^Profile \d+$/.test(name))
    .map(name => {
      const network = path.join(root, name, 'Network', 'Cookies');
      const legacy = path.join(root, name, 'Cookies');
      const file = fsApi.existsSync(network) ? network : (fsApi.existsSync(legacy) ? legacy : '');
      return file ? { profile: name, file } : null;
    })
    .filter(Boolean);
}

function firefoxProfiles(env, fsApi) {
  const roaming = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const root = path.join(roaming, 'Mozilla', 'Firefox', 'Profiles');
  let names = [];
  try { names = fsApi.readdirSync(root); } catch (_) { return []; }
  return names
    .map(name => ({ profile: name, file: path.join(root, name, 'cookies.sqlite') }))
    .filter(item => fsApi.existsSync(item.file));
}

// --- Reading ----------------------------------------------------------------

// Browsers keep their cookie database open. Work on a private copy, removed
// right after reading, so the browser's own file is never written.
function withDatabaseCopy(file, fsApi, read) {
  const dir = fsApi.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cookie-'));
  const copy = path.join(dir, 'cookies.db');
  try {
    try { fsApi.copyFileSync(file, copy); } catch (error) {
      const locked = /EBUSY|EPERM|EACCES/.test(error && error.code || '');
      throw Object.assign(new Error(locked ? 'LOCKED' : 'READ_FAILED'), { code: locked ? 'LOCKED' : 'READ_FAILED' });
    }
    for (const suffix of ['-wal', '-shm']) {
      try { if (fsApi.existsSync(file + suffix)) fsApi.copyFileSync(file + suffix, copy + suffix); } catch (_) {}
    }
    return read(copy);
  } finally {
    try { fsApi.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

function openDatabase(file) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(file, { readOnly: true });
}

function sqlDomainFilter(column, domains) {
  const clauses = [];
  const params = [];
  domains.forEach(d => {
    clauses.push(column + ' = ?', column + ' = ?');
    params.push(d, '.' + d);
  });
  return { where: '(' + clauses.join(' OR ') + ')', params };
}

function namesFilter(names) {
  return { where: 'name IN (' + names.map(() => '?').join(',') + ')', params: names.slice() };
}

const CHROMIUM_EPOCH_OFFSET_SECONDS = 11644473600;

function readChromiumRows(file, config, deps) {
  return withDatabaseCopy(file, deps.fs, copy => {
    const db = deps.openDatabase(copy);
    try {
      let metaVersion = 0;
      try {
        const row = db.prepare("SELECT value FROM meta WHERE key = 'version'").get();
        metaVersion = Number(row && row.value) || 0;
      } catch (_) {}
      const domain = sqlDomainFilter('host_key', config.domains);
      const names = namesFilter(config.names);
      const rows = db.prepare('SELECT host_key, name, path, expires_utc, value, encrypted_value FROM cookies WHERE '
        + domain.where + ' AND ' + names.where).all(...domain.params, ...names.params);
      return { metaVersion, rows };
    } finally {
      try { db.close(); } catch (_) {}
    }
  });
}

function readFirefoxRows(file, config, deps) {
  return withDatabaseCopy(file, deps.fs, copy => {
    const db = deps.openDatabase(copy);
    try {
      const domain = sqlDomainFilter('host', config.domains);
      const names = namesFilter(config.names);
      return db.prepare('SELECT host, name, path, value, expiry FROM moz_cookies WHERE '
        + domain.where + ' AND ' + names.where).all(...domain.params, ...names.params);
    } finally {
      try { db.close(); } catch (_) {}
    }
  });
}

// --- Chromium decryption ----------------------------------------------------

function powershellDpapiUnprotect(buffer) {
  // Windows DPAPI for the current user. Input goes through stdin, never argv.
  const script = 'Add-Type -AssemblyName System.Security;'
    + '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());'
    + "$o=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');"
    + '[Console]::Out.Write([Convert]::ToBase64String($o))';
  return new Promise((resolve, reject) => {
    // Absolute path: a packaged app's PATH may not contain the system PowerShell directory.
    const shell = path.join(process.env.SystemRoot || 'C:\\Windows','System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = execFile(fs.existsSync(shell) ? shell : 'powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) return reject(Object.assign(new Error('DECRYPT_FAILED'), { code: 'DECRYPT_FAILED' }));
        const out = Buffer.from(String(stdout || '').trim(), 'base64');
        if (!out.length) return reject(Object.assign(new Error('DECRYPT_FAILED'), { code: 'DECRYPT_FAILED' }));
        resolve(out);
      });
    child.stdin.on('error', () => reject(Object.assign(new Error('DECRYPT_FAILED'), { code: 'DECRYPT_FAILED' })));
    child.stdin.end(buffer.toString('base64'));
  });
}

async function chromiumMasterKey(root, deps) {
  let state;
  try { state = JSON.parse(deps.fs.readFileSync(path.join(root, 'Local State'), 'utf8')); } catch (_) { return null; }
  const encoded = state && state.os_crypt && state.os_crypt.encrypted_key;
  if (!encoded) return null;
  const raw = Buffer.from(encoded, 'base64');
  if (raw.subarray(0, 5).toString('latin1') !== 'DPAPI') return null;
  const key = await deps.dpapiUnprotect(raw.subarray(5));
  return key && key.length === 32 ? key : null;
}

function decryptChromiumValue(row, key, metaVersion) {
  const plain = row.value == null ? '' : String(row.value);
  if (plain) return { value: plain };
  const enc = Buffer.isBuffer(row.encrypted_value) ? row.encrypted_value : Buffer.from(row.encrypted_value || []);
  if (!enc.length) return { value: '' };
  const prefix = enc.subarray(0, 3).toString('latin1');
  if (prefix === 'v20') return { appBound: true };
  if ((prefix !== 'v10' && prefix !== 'v11') || !key) return { failed: true };
  try {
    const nonce = enc.subarray(3, 15);
    const tag = enc.subarray(enc.length - 16);
    const data = enc.subarray(15, enc.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    let out = Buffer.concat([decipher.update(data), decipher.final()]);
    // Since cookie DB version 24 the plaintext starts with SHA-256(host_key).
    if (metaVersion >= 24 && out.length >= 32) out = out.subarray(32);
    return { value: out.toString('utf8') };
  } catch (_) {
    return { failed: true };
  }
}

// --- Assembly ----------------------------------------------------------------

function pickCookies(cookies, config) {
  const picked = new Map();
  cookies.forEach(cookie => {
    if (!cookie.value || !config.names.includes(cookie.name) || !domainMatches(cookie.domain, config.domains)) return;
    const host = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    // Only cookies that the browser would send to this music site's root page.
    if (config.site && !(config.site === host || config.site.endsWith('.' + host))) return;
    if (cookie.path && cookie.path !== '/') return;
    if (/[;\x00-\x1f\x7f]/.test(String(cookie.value))) return;
    if (cookie.expires && cookie.expires * 1000 <= Date.now()) return;
    const previous = picked.get(cookie.name);
    const specificity = host.length;
    const previousSpecificity = previous ? String(previous.domain || '').replace(/^\./, '').length : -1;
    if (!previous || specificity > previousSpecificity
        || (specificity === previousSpecificity && (cookie.expires || 0) > (previous.expires || 0))) picked.set(cookie.name, cookie);
  });
  const obj = {};
  picked.forEach((cookie, name) => { obj[name] = cookie.value; });
  const ordered = config.names.filter(name => obj[name]).map(name => name + '=' + obj[name]);
  const key = picked.get(config.keyCookie) || [...picked.values()][0];
  return { header: ordered.join('; '), obj, freshness: key && key.expires || 0 };
}

async function collectCandidates(config, deps) {
  const candidates = [];
  const problems = new Map();
  const note = (code, browser) => { if (!problems.has(code)) problems.set(code, browser); };
  let browsersFound = 0;
  for (const browser of chromiumBrowsers(deps.env)) {
    const profiles = chromiumProfiles(browser.root, deps.fs);
    if (!profiles.length) continue;
    browsersFound++;
    let key;
    let keyLoaded = false;
    for (const item of profiles) {
      let result;
      try { result = readChromiumRows(item.file, config, deps); } catch (error) {
        note(error.code === 'LOCKED' ? 'LOCKED' : 'READ_FAILED', browser.label);
        continue;
      }
      if (!result.rows.length) continue;
      if (!keyLoaded) {
        keyLoaded = true;
        try { key = await chromiumMasterKey(browser.root, deps); } catch (_) { key = null; }
      }
      const cookies = [];
      result.rows.forEach(row => {
        const decoded = decryptChromiumValue(row, key, result.metaVersion);
        if (decoded.appBound) note('APP_BOUND', browser.label);
        else if (decoded.failed) note(key ? 'DECRYPT_FAILED' : 'KEY_UNAVAILABLE', browser.label);
        else {
          const micro = Number(row.expires_utc) || 0;
          cookies.push({ name: row.name, value: decoded.value, domain: row.host_key, path: row.path,
            expires: micro ? micro / 1e6 - CHROMIUM_EPOCH_OFFSET_SECONDS : 0 });
        }
      });
      const built = pickCookies(cookies, config);
      if (config.loggedIn(built.obj)) candidates.push({ browser: browser.label, profile: item.profile, ...built });
    }
  }
  const firefox = firefoxProfiles(deps.env, deps.fs);
  if (firefox.length) browsersFound++;
  for (const item of firefox) {
    let rows;
    try { rows = readFirefoxRows(item.file, config, deps); } catch (error) {
      note(error.code === 'LOCKED' ? 'LOCKED' : 'READ_FAILED', 'Firefox');
      continue;
    }
    const cookies = rows.map(row => {
      const expiry = Number(row.expiry) || 0;
      return { name: row.name, value: String(row.value || ''), domain: row.host, path: row.path, expires: expiry > 1e11 ? expiry / 1000 : expiry };
    });
    const built = pickCookies(cookies, config);
    if (config.loggedIn(built.obj)) candidates.push({ browser: 'Firefox', profile: item.profile, ...built });
  }
  return { candidates, problems, browsersFound };
}

async function importBrowserLogin(provider, options) {
  options = options || {};
  const config = providerConfig(provider);
  if (!config) return { ok: false, error: 'UNSUPPORTED_PROVIDER', message: '这个平台不支持从浏览器导入' };
  const deps = {
    env: options.env || process.env,
    fs: options.fs || fs,
    openDatabase: options.openDatabase || openDatabase,
    dpapiUnprotect: options.dpapiUnprotect || powershellDpapiUnprotect,
  };
  if (!options.env && process.platform !== 'win32') return { ok: false, error: 'NO_BROWSER', message: MESSAGES.NO_BROWSER };
  const { candidates, problems, browsersFound } = await collectCandidates(config, deps);
  if (candidates.length) {
    // Several browsers may hold a login; the one with the latest-expiring
    // session cookie is the most recent sign-in.
    candidates.sort((a, b) => b.freshness - a.freshness);
    const best = candidates[0];
    return { ok: true, provider, cookie: best.header, browser: best.browser, profile: best.profile };
  }
  if (!browsersFound) return { ok: false, error: 'NO_BROWSER', message: MESSAGES.NO_BROWSER };
  for (const code of ['APP_BOUND', 'LOCKED', 'KEY_UNAVAILABLE', 'DECRYPT_FAILED', 'READ_FAILED']) {
    if (problems.has(code)) {
      return { ok: false, error: code, browser: problems.get(code), message: MESSAGES[code].replace(/\{browser\}/g, problems.get(code)) };
    }
  }
  return { ok: false, error: 'NOT_LOGGED_IN',
    message: '浏览器里没有找到' + config.label + '的登录。请先在浏览器打开 ' + config.site + ' 登录，再回来导入。' };
}

module.exports = {
  importBrowserLogin,
  providerConfig,
  _test: { decryptChromiumValue, pickCookies, sqlDomainFilter, chromiumMasterKey },
};
