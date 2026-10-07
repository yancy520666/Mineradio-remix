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
    'searchTitleMarksAltEdition',
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
  const resung = { name: '稻香(深情版)', artist: '其他歌手', album: '稻香', popularity: 100 };
  const credited = { name: '晴天 (原唱 周杰伦)', artist: '其他歌手', album: '合集', popularity: 100 };
  const dao = { name: '稻香', artist: '周杰伦', album: '魔杰座' };
  assert.ok(sandbox.score(dao, '稻香', 0) > sandbox.score(resung, '稻香', 0), 'a bracketed edition must not tie the original');
  assert.ok(sandbox.score(original, '晴天', 1) > sandbox.score(credited, '晴天', 0));
});

test('overview best match names the singer of a searched title before a same-name artist', () => {
  const sandbox = {
    searchMusicRenderState: { songs: [
      { name: '夜曲', artist: '某翻唱' },
      { name: '夜曲', artist: '周杰伦' },
    ] },
  };
  vm.runInNewContext(functionBundle(['simpleSearchNorm', 'sourceSwitchArtistParts', 'typedSearchMatchScore', 'searchOverviewArtist', 'mergeSearchOverviewData'],
    '', 'this.pick = searchOverviewArtist; this.merge = mergeSearchOverviewData;'), sandbox);
  const data = sandbox.merge({
    qq: { artists: [{ provider: 'qq', name: '夜曲' }], albums: [], playlists: [] },
    netease: { artists: [{ provider: 'netease', name: '周杰伦' }], albums: [], playlists: [{ name: '周杰伦《夜曲》' }] },
  }, ['qq', 'netease']);
  assert.equal(data.playlists.length, 1, 'playlists come from any platform, not only the top one');
  assert.equal(sandbox.pick(data, '夜曲').name, '周杰伦');
  sandbox.searchMusicRenderState.songs = [{ name: '周杰伦', artist: '刘耀彬' }];
  assert.equal(sandbox.pick({ artists: [{ name: '周杰伦战队' }, { name: '周杰伦' }] }, '周杰伦').name, '周杰伦',
    'without a singer match the exact name beats a prefix match');
  assert.equal(sandbox.pick({ artists: [{ name: '周稻香' }] }, '稻香'), null, 'a name that merely contains the query is not a best match');
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
    'searchMentionsKnownArtist', 'searchLooksLikeDerivative', 'searchTitleMarksAltEdition', 'sourceSwitchArtistParts',
    'searchPopularityScore', 'searchCanonicalSongKey', 'scoreSongSearchResult',
    'searchProviderPreferenceRanks', 'searchProviderPreferenceRank', 'searchProviderPreferenceBonus',
    'mergeSongSearchResults', 'interleaveSearchProviders',
  ];
  const sandbox = { order: ['qq', 'netease', 'kugou', 'qishui'] };
  vm.runInNewContext(functionBundle(names, `
    var SEARCH_PROVIDER_PREFERENCE_STEP = 8;
    var SEARCH_PROVIDER_RUN_PENALTY = 36;
    var SEARCH_PROVIDER_RUN_PENALTY_MAX_STEPS = 3;
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

  // The preferred platform has more, slightly better songs; the other platform
  // must still reach the first screen instead of starting after row 12.
  sandbox.order = ['qq', 'netease', 'kugou', 'qishui'];
  const titles = ['晴天', '稻香', '七里香', '夜曲', '青花瓷', '搁浅', '轨迹', '借口', '枫', '园游会', '以父之名', '半岛铁盒'];
  const qqSongs = titles.map((name, i) => ({ provider: 'qq', mid: 'q' + i, name, artist: '周杰伦', album: name }));
  const neteaseSongs = ['屋顶', '布拉格广场', '刀马旦'].map((name, i) => ({ provider: 'netease', id: 'n' + i, name, artist: '周杰伦 / 温岚', album: name }));
  merged = sandbox.merge(neteaseSongs, qqSongs, [], [], [], 30, '周杰伦');
  const firstNetease = merged.findIndex((song) => song.provider === 'netease');
  assert.ok(firstNetease > 0 && firstNetease <= 3, 'another platform appears within the first rows, got index ' + firstNetease);
  assert.equal(merged[0].provider, 'qq', 'the best match stays first');
  assert.equal(merged.length, 15);
});

test('typed results put the closest name first, then the account platform order', () => {
  const sandbox = { order: ['qq', 'netease'] };
  vm.runInNewContext(functionBundle([
    'simpleSearchNorm', 'searchProviderPreferenceRanks', 'typedSearchMatchScore', 'mergeTypedSearchItems',
  ], `
    var MUSIC_SEARCH_PROVIDER_ORDER = ['netease', 'qq', 'kugou', 'qishui'];
    function contentProviderOrder() { return order.concat('spotify'); }
  `, 'this.merge = mergeTypedSearchItems;'), sandbox);
  const merged = sandbox.merge({
    netease: [{ provider: 'netease', name: '周杰伦的床边故事' }, { provider: 'netease', name: '周杰伦' }],
    qq: [{ provider: 'qq', name: '周杰伦' }],
  }, ['qq', 'netease'], '周杰伦');
  assert.deepEqual(Array.from(merged, (item) => item.provider + ':' + item.name), ['qq:周杰伦', 'netease:周杰伦', 'netease:周杰伦的床边故事']);
  assert.match(searchSource, /role="tablist" aria-label="搜索类型"/);
  assert.match(searchSource, /tabindex="' \+ \(active \? '0' : '-1'\)/, 'only the active type tab is in the Tab order');
});
