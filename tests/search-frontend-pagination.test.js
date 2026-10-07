'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const searchPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js');
const searchSource = fs.readFileSync(searchPath, 'utf8');

function namedFunctionSource(source, name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(declaration, `missing ${name}()`);
  const bodyStart = source.indexOf('{', declaration.index + declaration[0].length);
  let depth = 0;
  let quote = '';
  let regex = false;
  let regexClass = false;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (regex) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '[') regexClass = true;
      else if (character === ']') regexClass = false;
      else if (character === '/' && !regexClass) regex = false;
      continue;
    }
    if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '/') {
      let previousIndex = index - 1;
      while (previousIndex >= bodyStart && /\s/.test(source[previousIndex])) previousIndex -= 1;
      const previous = source[previousIndex] || '';
      if (!previous || /[=(,:;!&|?{}\[]/.test(previous)) {
        regex = true;
        regexClass = false;
        continue;
      }
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(declaration.index, index + 1);
    }
  }
  throw new Error(`unterminated ${name}()`);
}

function functionBundle(names, prelude, expose) {
  return `${prelude || ''}\n${names.map((name) => namedFunctionSource(searchSource, name)).join('\n')}\n${expose || ''}`;
}

test('legacy search histories migrate into one list shared by every tab', () => {
  const values = new Map([
    ['mineradio-search-history', JSON.stringify(['晴天', '晴天', '夜曲'])],
  ]);
  const sandbox = {
    searchMode: 'song',
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
  vm.runInNewContext(functionBundle([
    'emptySearchHistoryState',
    'normalizeSearchHistoryItems',
    'readSearchHistoryState',
    'writeSearchHistoryState',
    'readSearchHistory',
    'writeSearchHistory',
    'rememberSearchQuery',
  ], `
    var SEARCH_HISTORY_STORE_KEY = 'mineradio-search-history';
    var SEARCH_HISTORY_STORE_VERSION = 3;
    var SEARCH_HISTORY_MODES = ['song', 'netease', 'qq', 'kugou', 'qishui', 'spotify', 'podcast'];
  `, `
    this.readSearchHistory = readSearchHistory;
    this.writeSearchHistory = writeSearchHistory;
    this.rememberSearchQuery = rememberSearchQuery;
  `), sandbox);

  assert.deepEqual(Array.from(sandbox.readSearchHistory('song')), ['晴天', '夜曲']);
  assert.deepEqual(Array.from(sandbox.readSearchHistory('qq')), ['晴天', '夜曲']);
  sandbox.rememberSearchQuery('稻香', 'qq');
  let stored = JSON.parse(values.get('mineradio-search-history'));
  assert.equal(stored.version, 3);
  assert.deepEqual(stored.items, ['稻香', '晴天', '夜曲']);
  assert.deepEqual(Array.from(sandbox.readSearchHistory('podcast')), stored.items);

  values.set('mineradio-search-history', JSON.stringify({
    version: 2,
    modes: {
      song: ['晴天', '夜曲'],
      netease: ['海阔天空'],
      qq: ['夜曲', '稻香'],
      podcast: ['故事 FM'],
    },
  }));
  assert.deepEqual(Array.from(sandbox.readSearchHistory('spotify')), ['晴天', '夜曲', '海阔天空', '稻香', '故事 FM']);
  sandbox.rememberSearchQuery('一路向北', 'podcast');
  stored = JSON.parse(values.get('mineradio-search-history'));
  assert.deepEqual(stored.items, ['一路向北', '晴天', '夜曲', '海阔天空', '稻香', '故事 FM']);

  sandbox.writeSearchHistory([], 'qq');
  assert.deepEqual(JSON.parse(values.get('mineradio-search-history')).items, []);
  assert.deepEqual(Array.from(sandbox.readSearchHistory('song')), []);
});

test('history rendering and replay keep the currently selected tab', () => {
  const renderSource = namedFunctionSource(searchSource, 'renderSearchHistory');
  const replaySource = namedFunctionSource(searchSource, 'runSearchHistory');
  const modeSource = namedFunctionSource(searchSource, 'setSearchMode');
  const podcastSource = namedFunctionSource(searchSource, 'doPodcastSearch');

  assert.doesNotMatch(renderSource, /isMusicSearchMode/);
  assert.doesNotMatch(renderSource, /data-history-mode/);
  assert.doesNotMatch(replaySource, /searchMode\s*=/);
  assert.match(modeSource, /else if \(!renderSearchHistory\(\)\) loadPodcastHot\(\)/);
  assert.match(podcastSource, /rememberSearchQuery\(q\)/);
});

test('catalogue search readiness is separate from login state', () => {
  const statuses = {
    qishui: { loggedIn: false, searchReady: true, publicCatalog: true },
    spotify: { loggedIn: false, searchReady: true },
    spotifyOff: { loggedIn: false, searchReady: false },
  };
  const sandbox = {
    searchProviderStatus(provider) {
      return provider === 'spotify-off' ? statuses.spotifyOff : (statuses[provider] || {});
    },
  };
  vm.runInNewContext(`${namedFunctionSource(searchSource, 'searchProviderCanSearch')}\nthis.canSearch = searchProviderCanSearch;`, sandbox);
  assert.equal(sandbox.canSearch('qishui'), true);
  assert.equal(sandbox.canSearch('spotify'), true);
  assert.equal(sandbox.canSearch('spotify-off'), false);
  assert.equal(sandbox.canSearch('netease'), true);
  assert.equal(sandbox.canSearch('qq'), true);
  assert.equal(sandbox.canSearch('kugou'), true);
});

test('ranking favors exact originals while preserving explicitly requested versions', () => {
  const names = [
    'simpleSearchNorm',
    'searchQueryTokens',
    'searchVersionSignature',
    'searchTokenCoverage',
    'searchMentionsKnownArtist',
    'searchLooksLikeDerivative',
    'sourceSwitchArtistParts',
    'searchPopularityScore',
    'searchCanonicalSongKey',
    'scoreSongSearchResult',
  ];
  const sandbox = {};
  vm.runInNewContext(functionBundle(names, '', `
    this.score = scoreSongSearchResult;
    this.key = searchCanonicalSongKey;
  `), sandbox);

  const original = { name: '晴天', artist: '周杰伦', album: '叶惠美', popularity: 80 };
  const live = { name: '晴天 (Live)', artist: '周杰伦', album: '演唱会', popularity: 95 };
  const cover = { name: '晴天（翻唱）', artist: '其他歌手', album: '翻唱集', popularity: 100 };
  const unrelated = { name: '雨天', artist: '其他歌手', album: '合集', popularity: 100 };
  assert.ok(sandbox.score(original, '晴天 周杰伦', 0) > sandbox.score(cover, '晴天 周杰伦', 0));
  assert.ok(sandbox.score(original, '晴天', 0) > sandbox.score(unrelated, '晴天', 0));
  assert.ok(sandbox.score(live, '晴天 live', 0) > sandbox.score(original, '晴天 live', 0));
  assert.notEqual(sandbox.key(original), sandbox.key(live), 'studio and live editions must not collapse');
});

test('search pagination carries provider offsets and ignores stale sessions', () => {
  const providerUrl = namedFunctionSource(searchSource, 'searchProviderUrl');
  const sandbox = { encodeURIComponent };
  vm.runInNewContext(`${providerUrl}\nthis.url = searchProviderUrl;`, sandbox);
  assert.match(sandbox.url('qq', '晴天', 12, 24), /limit=12&offset=24$/);
  assert.match(sandbox.url('spotify', 'Muse', 10, 30), /limit=10&offset=30$/);

  assert.match(searchSource, /fetchMusicSearchResults\(q, mode, previousPages, opts\)/);
  assert.match(searchSource, /value\.nextOffset/);
  assert.match(searchSource, /value\.hasMore/);
  assert.match(searchSource, /new IntersectionObserver/);
  assert.match(searchSource, /MUSIC_SEARCH_INITIAL_VISIBLE\s*=\s*18/);
  assert.match(searchSource, /loadNextMusicSearchPage\(expectedKey\)/);
  assert.match(searchSource, /requestSeq\s*!==\s*searchRequestSeq/);
  assert.match(searchSource, /searchMode\s*!==\s*mode/);

  const mergeSource = namedFunctionSource(searchSource, 'mergeSongSearchResults');
  assert.doesNotMatch(mergeSource, /sourceSwitchSongHasBlockedArtist/,
    'source-switch blacklist must not remove ordinary search results');
  const scoreSource = namedFunctionSource(searchSource, 'scoreSongSearchResult');
  assert.doesNotMatch(scoreSource, /provider\s*===|searchIntentPrefersQQ/,
    'ordinary relevance must not contain platform-specific score boosts');
});

test('song search shows each provider as it arrives and keeps engaged rows stable', async () => {
  const fetchSource = namedFunctionSource(searchSource, 'fetchMusicSearchResults');
  assert.doesNotMatch(fetchSource, /Promise\.allSettled/, 'search must not wait for every provider before showing results');
  assert.match(fetchSource, /timeoutMs:\s*MUSIC_SEARCH_PROVIDER_TIMEOUT_MS/);
  assert.match(fetchSource, /signal:\s*opts\.signal/);

  const resolvers = {};
  const progress = [];
  const sandbox = {
    console: { warn() {} },
    searchProviderNotice: '',
    MUSIC_SEARCH_MAX_RESULTS: 180,
    MUSIC_SEARCH_PROVIDER_TIMEOUT_MS: 8000,
    activeSearchProvidersForMode: () => ['netease', 'qq'],
    searchProviderLoginNotice: () => '',
    searchProviderUrl: (provider) => provider,
    controlSourceProviderTitle: (provider) => provider,
    searchProviderPagesHaveMore: () => false,
    mergeSongSearchResults: (netease, qq) => [].concat(netease || [], qq || []),
    apiJson: (provider) => new Promise((resolve) => { resolvers[provider] = resolve; }),
  };
  vm.runInNewContext(`${fetchSource}\nthis.fetch = fetchMusicSearchResults;`, sandbox);
  const done = sandbox.fetch('晴天', 'song', null, { onProgress: (partial) => progress.push(partial) });
  resolvers.netease({ songs: [{ name: '晴天', provider: 'netease' }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(progress.length, 1, 'the first provider is shown while the other is still pending');
  assert.equal(progress[0].songs.length, 1);
  assert.equal(progress[0].pending, 1);
  resolvers.qq({ songs: [{ name: '晴天', provider: 'qq' }] });
  const final = await done;
  assert.equal(final.songs.length, 2);
  assert.equal(final.pending, 0);
  assert.equal(progress.length, 1, 'the final result is returned, not reported as progress');

  const presentSource = namedFunctionSource(searchSource, 'presentSongSearchResults');
  assert.match(presentSource, /searchResultsAreEngaged\(\)/);
  assert.match(presentSource, /mergeUniqueSearchSongPools\(visible, songs\)/,
    'late results must not move rows the user is already looking at');
  assert.match(namedFunctionSource(searchSource, 'loadNextMusicSearchPage'), /searchMusicRenderState\.partial/,
    'paging waits until the first page of every provider has settled');
  assert.match(namedFunctionSource(searchSource, 'handleSearchInput'), /isComposing/);
  assert.match(searchSource, /addEventListener\('compositionend'/);
});

test('account platform order picks the shown copy without beating a better match', () => {
  const names = [
    'simpleSearchNorm', 'searchQueryTokens', 'searchVersionSignature', 'searchTokenCoverage',
    'searchMentionsKnownArtist', 'searchLooksLikeDerivative', 'sourceSwitchArtistParts',
    'searchPopularityScore', 'searchCanonicalSongKey', 'scoreSongSearchResult',
    'searchProviderPreferenceRanks', 'searchProviderPreferenceRank', 'searchProviderPreferenceBonus',
    'mergeSongSearchResults',
  ];
  const sandbox = { order: ['qq', 'netease', 'kugou', 'qishui'] };
  vm.runInNewContext(functionBundle(names, `
    var SEARCH_PROVIDER_PREFERENCE_STEP = 8;
    var MUSIC_SEARCH_PROVIDER_ORDER = ['netease', 'qq', 'kugou', 'qishui'];
    var SEARCH_ORIGINAL_ARTIST_HINTS = [];
    function contentProviderOrder() { return order.concat('spotify'); }
    function songProviderKey(song) { return song.provider; }
  `, 'this.merge = mergeSongSearchResults;'), sandbox);

  const neteaseOriginal = { provider: 'netease', id: 1, name: '晴天', artist: '周杰伦', album: '叶惠美' };
  const qqOriginal = { provider: 'qq', mid: 'a', name: '晴天', artist: '周杰伦', album: '叶惠美' };
  let merged = sandbox.merge([neteaseOriginal], [qqOriginal], [], [], [], 10, '晴天');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].provider, 'qq', 'the top account platform supplies the shared song');

  sandbox.order = ['netease', 'qq', 'kugou', 'qishui'];
  merged = sandbox.merge([{ ...neteaseOriginal }], [{ ...qqOriginal }], [], [], [], 10, '晴天');
  assert.equal(merged[0].provider, 'netease', 'reordering accounts changes the preferred copy');

  sandbox.order = ['kugou', 'netease', 'qq', 'qishui'];
  const kugouCover = { provider: 'kugou', id: 'k', name: '晴天（翻唱）', artist: '其他歌手', album: '翻唱集' };
  merged = sandbox.merge([{ ...neteaseOriginal }], [], [kugouCover], [], [], 10, '晴天');
  assert.equal(merged[0].provider, 'netease', 'platform preference must not lift a cover above the original');
});
