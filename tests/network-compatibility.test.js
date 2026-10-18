'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const http = require('node:http');
const { spawn } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, start);
  return source.slice(first, last);
}

test('Netease empty info cannot mask VIP or SVIP from another source', () => {
  const ctx = {};
  vm.runInNewContext(section('function firstPositiveNumberFrom(', 'function normalizeLoginInfo('), ctx);
  const normalize = ctx.normalizeNeteaseVip;
  assert.equal(normalize({ vipInfo: {} }, { vipInfo: { vipType: 11 } }, {}).isVip, true);
  assert.equal(normalize({ vipInfo: {} }, {}, { vipInfo: { svipType: 1 } }).isSvip, true);
  assert.equal(normalize({ musicVipLevel: 10, redVipLevel: 3 }, {}, {}).vipLevel, 'none');
  assert.equal(normalize({ vipInfo: { title: 'VIP', label: 'SVIP' } }, {}, {}).vipLevel, 'none');
  assert.equal(normalize({ vipType: 11 }, {}, {}).isSvip, false);
  assert.equal(normalize({ isVip: '0', vipFlag: 1 }, {}, {}).isVip, true);
  const future = Date.now() + 60000, past = Date.now() - 60000;
  assert.equal(normalize({}, {}, { vipExtra: {}, vipInfoV2: { data: { associator: { vipLevel: 1, expireTime: future } } } }).isVip, true);
  assert.equal(normalize({ vipInfo: { redplus: {} } }, { vipInfo: { redplus: { vipLevel: 1, expireTime: future } } }, {}).isSvip, true);
  assert.equal(normalize({}, {}, { vipExtra: { data: { associator: { vipLevel: 1, expireTime: past, title: 'VIP' } } } }).isVip, false);
  assert.equal(ctx.activeNeteaseVipPackage({ level: 1, expireTime: Math.floor(future / 1000) }), true);
  assert.equal(ctx.activeNeteaseVipPackage({ level: 1, expireTime: 'broken' }), false);
});

test('C drive cache is allowed and actual isolated cache round-trips without D drive', async t => {
  const windows = { path: path.win32, fs: { existsSync: () => true }, BEATMAP_CACHE_DIR: 'C:\\Users\\fixture\\cache\\beatmaps' };
  vm.runInNewContext(section('function beatCacheRootInfo(', 'function ensureBeatMapCacheDir('), windows);
  assert.equal(windows.beatCacheRootInfo().allowed, true);
  assert.equal(windows.beatCacheRootInfo().available, true);
  const missing = { ...windows, fs: { existsSync: () => false } };
  vm.runInNewContext(section('function beatCacheRootInfo(', 'function safeBeatMapCacheFile('), missing);
  assert.throws(() => missing.ensureBeatMapCacheDir(), { code: 'BEAT_CACHE_DRIVE_UNAVAILABLE' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-network-cache-'));
  let maintenance;
  t.after(async () => { await maintenance; assert(dir.startsWith(path.join(os.tmpdir(), 'mineradio-network-cache-'))); fs.rmSync(dir, { recursive: true, force: true }); });
  const ctx = { fs, path, crypto, Buffer, console, BEATMAP_CACHE_DIR: path.join(dir, 'beatmaps'),
    createGeneratedCachePruner: options => {
      const prune = require('../generated-cache-pruner').createGeneratedCachePruner(options);
      return () => (maintenance = prune());
    },
  };
  vm.runInNewContext(section("let beatCachePinnedFile = ''", 'function localUpdateFallback('), ctx);
  const result = ctx.writeBeatMapCache({ key: 'netease:123', map: { beats: [0, 1, 2] } });
  assert.equal(result.ok, true);
  await maintenance;
  assert.deepEqual(Array.from(ctx.readBeatMapCache('netease:123').map.beats), [0, 1, 2]);
  ctx.fs = { ...fs, writeFileSync: () => { throw Object.assign(new Error('read only'), { code: 'EACCES' }); } };
  assert.throws(() => ctx.writeBeatMapCache({ key: 'netease:123', map: { beats: [99] } }), { code: 'EACCES' });
  assert.deepEqual(Array.from(ctx.readBeatMapCache('netease:123').map.beats), [0, 1, 2]);
  assert.match(source, /const BEATMAP_CACHE_DIR = process\.env\.MINERADIO_BEAT_CACHE_DIR \|\| path\.join\(os\.homedir\(\)/);
});

test('weather uses HTTPS and rejects failed, absent or out-of-range coordinates', async () => {
  let body = { success: true, city: 'Fixture', latitude: 31.2, longitude: 121.4, timezone: { id: 'Asia/Shanghai' } };
  const ctx = { URL, UA: 'fixture', WEATHER_IP_LOCATION_URL: 'https://ipwho.is/', WEATHER_DEFAULT_LOCATION: { name: 'Fallback' },
    requestJson: async url => { assert.equal(new URL(url).protocol, 'https:'); return body; } };
  vm.runInNewContext(section('async function fetchIpWeatherLocation(', 'function weatherRadioSeedQueries('), ctx);
  assert.match(source, /const WEATHER_IP_LOCATION_URL = 'https:\/\/ipwho\.is\/'/);
  const location = await ctx.fetchIpWeatherLocation();
  assert.equal(location.provider, 'ipwho.is'); assert.equal(location.timezone, 'Asia/Shanghai');
  for (const invalid of [{ success: false, latitude: 1, longitude: 1 }, { success: true },
    { success: true, latitude: null, longitude: 0 }, { success: true, latitude: 91, longitude: 0 }]) {
    body = invalid; await assert.rejects(ctx.fetchIpWeatherLocation());
  }
  body = { success: true, latitude: 0, longitude: 0, timezone: 'UTC' };
  assert.equal((await ctx.fetchIpWeatherLocation()).timezone, 'UTC');
});

test('isolated production server persists beatmaps through its HTTP API on the temp drive', { timeout: 15000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-network-api-'));
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, PORT: String(port), MINERADIO_BEAT_CACHE_DIR: path.join(dir, 'beatmaps') };
  for (const key of ['COOKIE_FILE', 'QQ_COOKIE_FILE', 'KUGOU_COOKIE_FILE', 'QISHUI_COOKIE_FILE', 'QISHUI_TOKEN_FILE', 'QISHUI_QR_CONFIG_FILE', 'MINERADIO_LISTEN_SYNC_FILE', 'CUEFIELD_FEEDBACK_FILE']) env[key] = path.join(dir, key);
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore', windowsHide: true });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  t.after(async () => {
    if (child.exitCode === null) {
      const closed = new Promise(resolve => child.once('close', resolve));
      child.kill(); await closed;
    }
    assert(dir.startsWith(path.join(os.tmpdir(), 'mineradio-network-api-')));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('isolated server exited before readiness');
    try { ready = (await fetch(base + '/api/app/version', { signal: AbortSignal.timeout(300) })).ok; } catch (_) {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  assert(ready);
  const status = await (await fetch(base + '/api/beatmap/cache/status')).json();
  assert.equal(status.enabled, true); assert.equal(status.mode, 'disk');
  if (path.parse(dir).root.toUpperCase() === 'C:\\') assert.equal(status.drive, 'C:');
  const saved = await (await fetch(base + '/api/beatmap/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'netease:fixture', map: { beats: [0, 1, 2] } }) })).json();
  assert.equal(saved.ok, true);
  const read = await (await fetch(base + '/api/beatmap/cache?key=netease%3Afixture')).json();
  assert.equal(read.hit, true); assert.deepEqual(read.map.beats, [0, 1, 2]);
});
