'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.resolve(__dirname, '..', 'public', 'js', 'modules', '05-playback');
const searchSource = fs.readFileSync(path.join(dir, '07-search.js'), 'utf8');
const detailSource = fs.readFileSync(path.join(dir, '06-track-detail-lyrics-actions.js'), 'utf8');

function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}()`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unterminated ' + name);
}

test('查看更多 closes the detail page and searches the artist in the album tab', () => {
  const calls = [];
  const sandbox = {
    $input: { value: 'old', focus() { calls.push('focus'); } },
    searchMode: 'kugou',
    document: { getElementById: () => ({}) },
    setPeek: () => calls.push('peek'),
    setSearchMode(mode) { calls.push('mode:' + mode); sandbox.searchMode = mode; },
    setSearchResultType: (type, opts) => calls.push('type:' + type + ':' + !!opts.force),
    closeTrackDetailModal: () => calls.push('close'),
    detailArtistAlbumQuery: '周杰伦',
  };
  vm.runInNewContext(`${fn(searchSource, 'searchArtistAlbums')}\n${fn(detailSource, 'openArtistAlbumSearch')}\nthis.searchArtistAlbums = searchArtistAlbums;\nthis.open = openArtistAlbumSearch;`, sandbox);
  sandbox.open();
  assert.equal(sandbox.$input.value, '周杰伦', 'query is set before any search runs');
  assert.deepEqual(calls, ['close', 'mode:song', 'peek', 'type:album:true', 'focus'], 'album-less platform tabs fall back to all platforms');
  calls.length = 0;
  sandbox.searchMode = 'qq';
  sandbox.searchArtistAlbums('Jay');
  assert.ok(!calls.some((c) => c.startsWith('mode:')), 'QQ tab can already search albums');
});

test('the detail page offers the button and remembers the artist name', () => {
  assert.match(detailSource, /onclick="openArtistAlbumSearch\(\)">查看更多/);
  assert.match(detailSource, /detailArtistAlbumQuery = artistNamesForMatch\[0\]/);
});
