'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSonicPreferencesStore } = require('../desktop/sonic-performance-preferences');

test('desktop Sonic preferences survive reopening and reject invalid input without replacing saved choices', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-sonic-prefs-'));
  try {
    const store = createSonicPreferencesStore(root);
    assert.deepEqual(store.read(), { ok: true, payload: null });
    assert.equal(store.write({ enabled: false, dismissed: true, manualQuality: true, qualityReset: true, extra: 'ignored' }).ok, true);
    const saved = createSonicPreferencesStore(root).read();
    assert.equal(saved.payload.dismissed, true);
    assert.equal(saved.payload.manualQuality, true);
    assert.equal(saved.payload.qualityReset, true);
    assert.equal(saved.payload.enabled, false);
    assert.equal('extra' in saved.payload, false);
    assert.equal(store.write([]).ok, false);
    assert.deepEqual(store.read(), saved);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('mineradio-sonic-prefs-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
