'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const pinyinSource = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06c-search-pinyin.js'), 'utf8');
const searchSource = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');

function load(extra) {
  const sandbox = Object.assign({
    Intl, Object, Array, String, Math,
    songProviderKey: (s) => s.provider || 'netease',
    searchModeProvider: (m) => (m === 'song' ? '' : m),
  }, extra || {});
  vm.createContext(sandbox);
  vm.runInContext(pinyinSource, sandbox);
  return sandbox;
}

test('pinyin initials turn hanzi titles into letters and ignore pure Latin titles', () => {
  const s = load();
  assert.equal(s.pinyinInitialsOf('失眠飞行').text, 'smfx');
  assert.equal(s.pinyinInitialsOf('周杰伦').text, 'zjl');
  assert.equal(s.pinyinInitialsOf('晴天 (Live)').text, 'qtlive');
  assert.equal(s.pinyinInitialsOf('Love Story').hasHanzi, false);
});

test('2-12 letters count as an initials query', () => {
  const s = load();
  assert.equal(s.searchQueryIsPinyinInitials('smfx'), true);
  assert.equal(s.searchQueryIsPinyinInitials('SMFX'), true, 'case does not matter');
  assert.equal(s.searchQueryIsPinyinInitials('s'), false);
  assert.equal(s.searchQueryIsPinyinInitials('失眠'), false);
  assert.equal(s.searchQueryIsPinyinInitials('sm fx'), false);
});

test('local matches prefer exact title initials, skip Latin-only titles and respect the platform tab', () => {
  const songs = [
    { id: '1', name: '失眠飞行', artist: '沈以诚', provider: 'netease' },
    { id: '2', name: '失眠飞行 (Live)', artist: '沈以诚', provider: 'qq' },
    { id: '3', name: 'smfx', artist: 'Someone', provider: 'netease' },
    { id: '4', name: '晴天', artist: '周杰伦', provider: 'netease' },
  ];
  const s = load({ playQueue: songs, persistentLocalLibraryTracks: [], playlistPanelDetailState: { tracks: [songs[0]] } });
  const all = s.localPinyinSongMatches('smfx', 'song');
  assert.deepEqual(Array.from(all, (x) => x.id), ['1', '2'], 'exact first, prefix second, Latin-only title ignored, no duplicates');
  const qqOnly = s.localPinyinSongMatches('smfx', 'qq');
  assert.deepEqual(Array.from(qqOnly, (x) => x.id), ['2']);
  assert.deepEqual(Array.from(s.localPinyinSongMatches('晴天', 'song')), []);
});

test('pinyin hits go after literal matches and never reorder platform results', () => {
  const s = load();
  const remote = [{ id: 'a', name: 'smfx remix', artist: 'x' }, { id: 'b', name: '别的歌', artist: 'y' }];
  const hit = { id: 'p', name: '失眠飞行', artist: '沈以诚' };
  const merged = s.insertPinyinSongMatches(remote, [hit], 'smfx');
  assert.deepEqual(Array.from(merged, (x) => x.id), ['a', 'p', 'b']);
  const noLiteral = s.insertPinyinSongMatches([remote[1]], [hit], 'smfx');
  assert.deepEqual(Array.from(noLiteral, (x) => x.id), ['p', 'b']);
  const dup = s.insertPinyinSongMatches([{ id: 'p', provider: 'netease', name: '失眠飞行', artist: '沈以诚' }], [hit], 'smfx');
  assert.equal(dup.length, 1, 'a song the platform already returned is not added twice');
});

test('search wires pinyin in once, without an extra request', () => {
  assert.match(searchSource, /localPinyinSongMatches\(q, mode\)/);
  assert.match(searchSource, /insertPinyinSongMatches\(songs, pinyinMatches, q\)/);
  const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  assert.ok(loader.indexOf('06c-search-pinyin.js') > 0 && loader.indexOf('06c-search-pinyin.js') < loader.indexOf('07-search.js'));
});

test('pinyin supplementation keeps the preferred platform copy of the same recording', () => {
  const s = load({
    searchCanonicalSongKey: song => song.name + '|' + song.artist,
    searchProviderPreferenceRanks: () => ({ qq: 0, netease: 1 }),
    searchProviderPreferenceRank: (ranks, song) => ranks[song.provider] ?? 99,
  });
  const remote = [{ id: 'n', provider: 'netease', name: '失眠飞行', artist: '沈以诚' }];
  const local = [
    { id: 'q', provider: 'qq', name: '失眠飞行', artist: '沈以诚' },
    { id: 'q2', provider: 'qq', name: '失眠飞行', artist: '沈以诚' },
  ];
  const merged = s.insertPinyinSongMatches(remote, local, 'smfx');
  assert.deepEqual(Array.from(merged, song => song.id), ['q']);
  assert.equal(remote[0].id, 'n', 'the original platform result array is not mutated');
  const preferredRemote = [local[0]];
  assert.deepEqual(Array.from(s.insertPinyinSongMatches(preferredRemote, remote, 'smfx'), song => song.id), ['q']);
});
