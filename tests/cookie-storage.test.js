'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { createCookieStore, ENCRYPTED_COOKIE_PREFIX } = require('../cookie-storage');
test('credentials migrate and round-trip; failed encryption preserves existing data', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cookie-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const key = crypto.randomBytes(32);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), bytes]); },
    decryptString: bytes => { const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(); }
  };
  for (const name of ['.cookie', '.qq-cookie', '.kugou-cookie', '.qishui-cookie', '.qishui-token', '.qishui-qr-login.json', '.qq-native-device.json']) {
    const file = path.join(temp, name), value = 'fixture-secret-' + name;
    fs.writeFileSync(file, value);
    const store = createCookieStore(file, { safeStorage, electronRuntime: true, logger: { warn() {} } });
    assert.equal(store.read(), value);
    assert(fs.readFileSync(file, 'utf8').startsWith(ENCRYPTED_COOKIE_PREFIX));
    assert(!fs.readFileSync(file, 'utf8').includes(value));
    assert.equal(store.read(), value);
    const previous = fs.readFileSync(file);
    const unavailable = createCookieStore(file, { safeStorage: null, electronRuntime: true, logger: { warn() {} } });
    assert.equal(unavailable.read(), ''); assert.throws(() => unavailable.write('new-secret'), { code: 'COOKIE_ENCRYPTION_UNAVAILABLE' });
    assert.deepEqual(fs.readFileSync(file), previous);
    const basic = createCookieStore(file, { safeStorage: { ...safeStorage, getSelectedStorageBackend: () => 'basic_text' }, electronRuntime: true, logger: { warn() {} } });
    assert.throws(() => basic.write(value), { code: 'COOKIE_ENCRYPTION_UNAVAILABLE' });
    store.write(''); assert(!fs.existsSync(file));
  }
  const corrupt = path.join(temp, 'corrupt'); fs.writeFileSync(corrupt, ENCRYPTED_COOKIE_PREFIX + 'invalid');
  assert.equal(createCookieStore(corrupt, { safeStorage, logger: { warn() {} } }).read(), '');
});
