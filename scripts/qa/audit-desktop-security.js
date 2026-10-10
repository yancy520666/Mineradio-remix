'use strict';

// Read-only production audit. All accounts/paths are synthetic; this harness
// reports observed defects rather than claiming a security pass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const results = [];
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(setImmediate);

async function main() {
  const html = source('qishui-auth-v6/security_host.html');
  const host = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1])
    .find(x => x.includes('window._SdkGlueInit('));
  for (const url of ['https://attacker.invalid/verify.js', 'http://127.0.0.1:9999/verify.js', 'file:///tmp/verify.js', 'https://user:pass@attacker.invalid/verify.js']) {
    const scripts = [], timers = new Map();
    const window = { _SdkGlueInit() {} };
    vm.runInNewContext(host, { window, URL, URLSearchParams, TextEncoder, AbortController,
      safeUrl: String, XMLHttpRequest: class {},
      document: { getElementById: () => ({ style: {} }), createElement: () => ({ remove() {} }),
        head: { appendChild(s) { scripts.push(s); } } },
      setTimeout(fn, ms) { const id = Symbol(); timers.set(id, { fn, ms }); return id; },
      clearTimeout(id) { timers.delete(id); },
    });
    const pending = window.__qishuiSecondVerify({ url }, { attemptId: '1' });
    await flush();
    const accepted = scripts.length > 0;
    if (accepted) {
      window.ucWebSecondVerify = data => data.verifyFinishCallback({ status: true, fixtureOnly: true });
      scripts[0].onload();
    }
    const result = await pending;
    results.push({ case: 'qishui-component-url', input: url, scriptAppended: accepted,
      verificationFinished: result.status === true });
    assert.equal(timers.size, 0);
  }
  const server = source('server.js');
  const bodyStart = server.indexOf('function readRequestBody(req)');
  const bodyEnd = server.indexOf('function normalizeApiCode(', bodyStart);
  const ctx = vm.createContext({ URLSearchParams });
  vm.runInContext(server.slice(bodyStart, bodyEnd), ctx);
  const broken = new EventEmitter(); broken.destroy = () => {};
  const pending = ctx.readRequestBody(broken);
  broken.emit('data', Buffer.from('{"partial":'));
  broken.emit('error', Object.assign(new Error('synthetic abort'), { code: 'ECONNRESET' }));
  const value = await pending;
  results.push({ case: 'request-body-error', resolvedAsEmptyObject: JSON.stringify(value) === '{}',
    listenersRetained: broken.eventNames().map(String) });
  const aborted = new EventEmitter(); aborted.destroy = () => {};
  let settled = false;
  ctx.readRequestBody(aborted).then(() => { settled = true; }, () => { settled = true; });
  aborted.emit('aborted'); aborted.emit('close');
  await flush();
  results.push({ case: 'request-body-close-only', settled });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-desktop-security-audit-'));
  try {
    const original = path.join(directory, 'Original'), remix = path.join(directory, 'Remix');
    fs.mkdirSync(original); fs.mkdirSync(remix);
    const token = JSON.stringify({ access_token: 'FAKE_AUDIT_TOKEN', refresh_token: 'FAKE_AUDIT_REFRESH' });
    const safeStorage = { isEncryptionAvailable: () => true,
      encryptString: text => Buffer.from('encrypted:' + text),
      decryptString: bytes => bytes.toString().replace(/^encrypted:/, '') };
    const cookieStorage = require(path.join(root, 'cookie-storage'));
    const importerContext = vm.createContext({ module: { exports: {} },
      require(name) { return name === '../cookie-storage' ? { ...cookieStorage,
        createCookieStore(file, opts) { return cookieStorage.createCookieStore(file, { ...opts, safeStorage, electronRuntime: true }); } } : require(name); } });
    vm.runInContext(source('desktop/original-profile-import.js'), importerContext);
    fs.writeFileSync(path.join(original, '.spotify-token.json'), token);
    const summary = importerContext.module.exports.createOriginalProfileImporter({ originalPath: original, remixPath: remix }).importFiles();
    const copied = fs.readFileSync(path.join(remix, '.spotify-token.json'), 'utf8');
    results.push({ case: 'original-spotify-import-plaintext', imported: summary.importedCredentials,
      protectedClassifier: cookieStorage.isProtectedCredentialFile('.spotify-token.json'),
      plaintextAtRest: copied.includes('FAKE_AUDIT_TOKEN'),
      sourceUnchanged: fs.readFileSync(path.join(original, '.spotify-token.json'), 'utf8') === token });
    fs.unlinkSync(path.join(remix, '.spotify-token.json'));
    cookieStorage.createCookieStore(path.join(original, '.spotify-token.json'), { safeStorage, electronRuntime: true }).write(token);
    const encryptedSummary = importerContext.module.exports.createOriginalProfileImporter({ originalPath: original, remixPath: remix }).importFiles();
    results.push({ case: 'original-spotify-import-encrypted', imported: encryptedSummary.importedCredentials,
      destinationPresent: fs.existsSync(path.join(remix, '.spotify-token.json')) });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log(JSON.stringify({ root, at: new Date().toISOString(), results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
