'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('identical recent stats cannot hide alternate-file replacement or restoration', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-racy-hash-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'song.mp3'), original = 'SONG-A audio bytes';
  const now = Date.now();
  for (const method of ['audioCandidateUsable', 'audioCandidateUsableAsync']) {
    for (const recent of [true, false]) {
      const stat = { dev: 1, ino: 2, size: original.length, mtimeMs: now - (recent ? 1000 : 6000), ctimeMs: now - 6000, isFile: () => true };
      let reads = 0;
      const ctx = vm.createContext({
        Buffer, crypto, Date: { now: () => now }, alternateFingerprintCache: new Map(), ALTERNATE_FINGERPRINT_RACY_MS: 3000,
        fs: { ...fs, fstatSync: () => stat, promises: { stat: async () => stat },
          readSync: (...args) => { reads++; return fs.readSync(...args); },
          createReadStream: (...args) => { reads++; return fs.createReadStream(...args); } },
      });
      loadFunctions(ctx, 'desktop/local-music-library.js', ['alternateFingerprintKey', 'cacheAlternateFingerprint', 'recordedAudioSize', 'audioFingerprint', method]);
      const record = { fingerprint: crypto.createHash('sha256').update(original).digest('hex') };
      fs.writeFileSync(file, original);
      assert.equal(await ctx[method](record, file, stat, false), true);
      const firstReads = reads;
      assert.equal(await ctx[method](record, file, stat, false), true);
      if (!recent) {
        assert.equal(reads, firstReads, method + ' caches stable files');
        assert.equal(ctx.alternateFingerprintCache.size, 1);
        continue;
      }
      fs.writeFileSync(file, 'SONG-B audio bytes');
      assert.equal(await ctx[method](record, file, stat, false), false, method + ' rejects different bytes with an identical stat');
      fs.writeFileSync(file, original);
      assert.equal(await ctx[method](record, file, stat, false), true, method + ' recognizes restored bytes immediately');
      assert.equal(ctx.alternateFingerprintCache.size, 0);
    }
  }
});
