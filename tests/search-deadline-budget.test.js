'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sources = Object.fromEntries(['server', 'qishui-api'].map(name => [name, fs.readFileSync(path.join(__dirname, '..', name + '.js'), 'utf8')]));
function extract(file, name) {
  const src = sources[file];
  const start = src.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  return src.slice(start, src.indexOf('\n}\n', start) + 2);
}
function harness(file, names, overrides = {}) {
  let now = 1000;
  let timerId = 0;
  const timers = new Map();
  const context = { URL, Buffer, console: { log() {}, warn() {} }, Date: { now: () => now },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, ...overrides };
  vm.createContext(context);
  vm.runInContext(names.map(name => extract(file, name)).join('\n'), context);
  return { context, timers, elapsed: () => now - 1000, advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } } };
}
const row = { mid: 'm', name: 'fixture', artist: 'artist' };
function qq(overrides = {}, names = []) {
  return harness('server', ['qqSearchBudget', 'fetchQQSearch', ...names], {
    qqFullSongSearch: async () => [], qqSmartboxSearch: async () => [], qqSongDetail: async (_, item) => item, ...overrides,
  });
}
test('QQ slow main search reserves fallback and short detail budgets within 7s', async () => {
  const calls = [];
  const h = qq({
    qqFullSongSearch: async (_, __, ___, budget) => { calls.push(budget); h.advance(budget); throw new Error('main timeout'); },
    qqSmartboxSearch: async (_, __, budget) => { calls.push(budget); h.advance(budget); return [row]; },
    qqSongDetail: async (_, __, budget) => { calls.push(budget); h.advance(budget); throw new Error('detail timeout'); },
  });
  const result = await h.context.fetchQQSearch('q', 18, 0);
  assert.equal(result[0].name, row.name);
  assert.deepEqual(calls, [4000, 2500, 500]);
  assert.equal(h.elapsed(), 7000);
});
test('QQ full rows skip detail enrichment and late incomplete rows skip it too', async () => {
  let details = 0;
  const h = qq({ qqFullSongSearch: async () => [{ ...row, _qqSearchComplete: true }], qqSongDetail: async () => { details++; } });
  assert.equal((await h.context.fetchQQSearch('q', 18, 0)).length, 1);
  assert.equal(details, 0);
  h.context.qqFullSongSearch = async () => { h.advance(6950); return [row]; };
  assert.equal((await h.context.fetchQQSearch('q', 18, 0)).length, 1);
  assert.equal(details, 0);
});
test('QQ errors propagate on later pages and failed-main empty fallbacks; real empty pages remain empty', async () => {
  const error = new Error('network down');
  let fallbackCalls = 0;
  const h = qq({ qqFullSongSearch: async () => { throw error; }, qqSmartboxSearch: async () => { fallbackCalls++; return []; } });
  await assert.rejects(h.context.fetchQQSearch('q', 18, 18), /network down/);
  assert.equal(fallbackCalls, 0);
  await assert.rejects(h.context.fetchQQSearch('q', 18, 0), /network down/);
  h.context.qqFullSongSearch = async () => [];
  assert.equal((await h.context.fetchQQSearch('q', 18, 18)).length, 0);
});
test('QQ full search forwards timeout and rejects upstream status errors', async () => {
  let options;
  const h = harness('server', ['qqFullSongSearch'], { qqSearchSign: () => 'signature', requestJson: async (_, opts) => { options = opts; return { code: 0, req: { code: 42 } }; }, mapQQTrack: () => row, qqSearchTrackComplete: () => true });
  await assert.rejects(h.context.qqFullSongSearch('q', 18, 0, 321), /QQ_SEARCH_FAILED/);
  assert.equal(options.timeoutMs, 321);
});
test('QQ Smartbox fallback forwards its deadline and overview issues only one request', async () => {
  let calls = 0;
  let options;
  const h = harness('server', ['fetchQQSmartboxData', 'qqSmartboxSearch', 'qqTypedSearchItems', 'fetchQQTypedSearch', 'fetchQQOverview'], {
    QQ_SMARTBOX_URL: 'https://fixture.invalid/search', QQ_HEADERS: {}, parseJSONText: JSON.parse, mapQQSmartSong: item => item,
    qqSingerAvatar: () => '', qqAlbumCover: () => '',
    requestText: async (_, opts) => { calls++; options = opts; return JSON.stringify({ data: { song: { itemlist: [row] }, singer: { itemlist: [{ mid: 's', name: 'singer' }] }, album: { itemlist: [{ mid: 'a', name: 'album' }] } } }); },
  });
  assert.equal((await h.context.qqSmartboxSearch('q', 18, 456)).length, 1);
  assert.equal(options.timeoutMs, 456);
  calls = 0;
  const result = await h.context.fetchQQOverview('q');
  assert.equal(calls, 1);
  assert.equal(result.artists[0].id, 's');
  assert.equal(result.albums[0].id, 'a');
});
test('QQ detail forwards the short enrichment timeout', async () => {
  let options;
  const h = harness('server', ['qqSongDetail'], { qqMusicRequest: async (_, opts) => { options = opts; return {}; }, mapQQTrack: (_, fallback) => fallback });
  await h.context.qqSongDetail('m', row, 250);
  assert.equal(options.timeoutMs, 250);
});
function qishui(status, overrides = {}, names = []) {
  return harness('qishui-api', ['qishuiSearchBudget', 'qishuiSearchOptional', 'handleQishuiSearch', ...names], {
    normalizeText: value => String(value || '').trim(), getQishuiStatus: () => status, QISHUI_PUBLIC_ENABLED: true,
    qishuiCookieFingerprint: value => value, qishuiSearchCache: { wrap: (_, __, fn) => fn() },
    qishuiSessionExpired: () => false, qishuiSessionFailure: () => ({ reauthRequired: true, message: 'expired' }),
    QISHUI_RELATED_MEDIA_PATH: '/related', extractQishuiMediaList: json => json.items || [], mapQishuiMedia: item => item,
    handleQishuiPcSearch: async () => { throw new Error('pc timeout'); },
    handleQishuiPublicSearch: async () => ({ songs: [row] }), qishuiPost: async () => { throw new Error('token timeout'); }, ...overrides,
  });
}
test('Qishui slow PC search leaves public fallback enough time before frontend 8s', async () => {
  const budgets = [];
  const h = qishui({ webSession: true }, {
    handleQishuiPcSearch: async (...args) => { budgets.push(args[4]); h.advance(args[4]); throw new Error('pc timeout'); },
    handleQishuiPublicSearch: async (...args) => { budgets.push(args[4]); h.advance(args[4]); return { songs: [row] }; },
  });
  const result = await h.context.handleQishuiSearch('q', 18, 'fixture', 0);
  assert.equal(result.songs.length, 1);
  assert.deepEqual(budgets, [4000, 3000]);
  assert.equal(h.elapsed(), 7000);
  assert.equal(result.pcSearchError, 'pc timeout');
});
test('Qishui PC plus token failure still reserves public fallback in the same deadline', async () => {
  const budgets = [];
  const h = qishui({ webSession: true, tokenConfigured: true }, {
    handleQishuiPcSearch: async (...args) => { budgets.push(args[4]); h.advance(args[4]); throw new Error('pc timeout'); },
    qishuiPost: async (_, __, budget) => { budgets.push(budget); h.advance(budget); throw new Error('token timeout'); },
    handleQishuiPublicSearch: async (...args) => { budgets.push(args[4]); h.advance(args[4]); return { songs: [row] }; },
  });
  const result = await h.context.handleQishuiSearch('q', 18, 'fixture', 0);
  assert.deepEqual(budgets, [2500, 2000, 2500]);
  assert.equal(h.elapsed(), 7000);
  assert.equal(result.officialError, 'token timeout');
});
test('Qishui optional membership probe cannot consume the public fallback reserve', async () => {
  let publicBudget;
  const h = qishui({ webSession: true }, {
    handleQishuiPcSearch: async () => { h.advance(4000); throw Object.assign(new Error('empty'), { code: 'QISHUI_EMPTY_RESPONSE' }); },
    fetchQishuiPlaybackMembership: () => new Promise(() => {}),
    handleQishuiPublicSearch: async (...args) => { publicBudget = args[4]; return { songs: [row] }; },
  });
  const promise = h.context.handleQishuiSearch('q', 18, 'fixture', 0);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(h.timers.size, 1);
  h.advance(400);
  assert.equal((await promise).songs.length, 1);
  assert.equal(publicBudget, 2600);
  assert.equal(h.timers.size, 0);
});
test('Qishui immediate expired membership still annotates fallback session state', async () => {
  const h = qishui({ webSession: true }, {
    handleQishuiPcSearch: async () => { throw Object.assign(new Error('empty'), { code: 'QISHUI_EMPTY_RESPONSE' }); },
    fetchQishuiPlaybackMembership: async () => ({ reauthRequired: true }),
  });
  const result = await h.context.handleQishuiSearch('q', 18, 'fixture', 0);
  assert.equal(result.reauthRequired, true);
  assert.equal(result.loggedIn, false);
  assert.equal(h.timers.size, 0);
});
test('Qishui request helpers pass search budgets through to HTTP requests', async () => {
  const budgets = [];
  const h = harness('qishui-api', ['handleQishuiPublicSearch', 'handleQishuiPcSearch', 'qishuiPost'], {
    urlWithParams: url => url, QISHUI_PUBLIC_SEARCH_URL: 'https://fixture.invalid', QISHUI_PUBLIC_HEADERS: {},
    requestJson: async (_, opts) => { budgets.push(opts.timeoutMs); return {}; },
    mapQishuiPublicItem: item => item, rankQishuiPublicSongs: songs => songs, getQishuiStatus: () => ({}),
    normalizeQishuiCookieInput: cookie => cookie, qishuiCookieHasLogin: () => true, qishuiPcAppParams: params => params,
    QISHUI_WEB_PC_API_BASE: 'https://fixture.invalid', qishuiWebRequestJson: async (_, __, ___, opts) => { budgets.push(opts.timeoutMs); return {}; },
    extractQishuiPcSearchItems: () => [], mapQishuiMediaList: () => [], pickObject: (...args) => args.find(Boolean) || {}, normalizeText: text => text,
    qishuiAccessToken: () => 'fixture-token', qishuiUrl: path => path, QISHUI_UA: 'fixture',
  });
  await h.context.handleQishuiPublicSearch('q', 18, '', 0, 201);
  await h.context.handleQishuiPcSearch('q', 18, 'fixture', 0, 202);
  await h.context.qishuiPost('/fixture', {}, 203);
  assert.deepEqual(budgets, [201, 202, 203]);
});
test('expired shared budgets throw rather than become HTTP default timeouts', () => {
  const qqh = harness('server', ['qqSearchBudget']);
  assert.throws(() => qqh.context.qqSearchBudget(1000, 4000), /QQ_SEARCH_TIMEOUT/);
  const qh = harness('qishui-api', ['qishuiSearchBudget']);
  assert.throws(() => qh.context.qishuiSearchBudget(3500, 4000, 2500), /QISHUI_SEARCH_TIMEOUT/);
});

test('Qishui public-only search uses the total budget without touching PC or token routes', async () => {
  let budget;
  const h = qishui({}, {
    handleQishuiPcSearch: async () => { throw new Error('unexpected PC request'); },
    qishuiPost: async () => { throw new Error('unexpected token request'); },
    handleQishuiPublicSearch: async (...args) => { budget = args[4]; return { songs: [] }; },
  });
  assert.equal((await h.context.handleQishuiSearch('q', 18, '', 0)).songs.length, 0);
  assert.equal(budget, 7000);
});
test('Qishui exhausted budget prevents starting another provider request', async () => {
  let fallbackCalls = 0;
  const h = qishui({ webSession: true, tokenConfigured: true }, {
    handleQishuiPcSearch: async () => { h.advance(7000); throw new Error('late timeout'); },
    qishuiPost: async () => { throw new Error('unexpected token request'); },
    handleQishuiPublicSearch: async () => { fallbackCalls++; return { songs: [] }; },
  });
  await assert.rejects(h.context.handleQishuiSearch('q', 18, 'fixture', 0), /QISHUI_SEARCH_TIMEOUT/);
  assert.equal(fallbackCalls, 0);
});
test('Qishui successful PC rows avoid fallback and token work', async () => {
  let fallbackCalls = 0;
  const h = qishui({ webSession: true, tokenConfigured: true }, {
    handleQishuiPcSearch: async () => ({ songs: [row], nextOffset: 18 }),
    qishuiPost: async () => { fallbackCalls++; return {}; },
    handleQishuiPublicSearch: async () => { fallbackCalls++; return {}; },
  });
  assert.equal((await h.context.handleQishuiSearch('q', 18, 'fixture', 0)).nextOffset, 18);
  assert.equal(fallbackCalls, 0);
});
test('Qishui later pages bypass token route and preserve public offsets', async () => {
  let args;
  const h = qishui({ tokenConfigured: true }, {
    qishuiPost: async () => { throw new Error('unexpected token request'); },
    handleQishuiPublicSearch: async (...values) => { args = values; return { songs: [] }; },
  });
  await h.context.handleQishuiSearch('q', 18, '', 36);
  assert.equal(args[3], 36);
  assert.equal(args[4], 7000);
});
