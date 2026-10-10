'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scenario: front } = require('../docs/qa/home-discover-ownership-audit-fixtures.cjs');
const { scenario: server } = require('../docs/qa/home-discover-server-ownership-audit-fixtures.cjs');
for (const refresh of [false, true]) for (const failure of [false, true]) {
  test(`home discovery rejects old ${failure ? 'failure' : 'private rows'} with ${refresh ? 'new account refresh' : 'unchanged request token'}`, async () => {
    const result = await front(refresh, failure);
    assert.deepEqual(result.songs, refresh ? ['B-song'] : []);
    assert.deepEqual(result.playlists, refresh ? ['B-private'] : []);
    assert.equal(result.requests, refresh ? 2 : 1);
    assert.equal(result.error, '');
    assert.equal(result.loading, false);
  });
}
test('same-account home requests remain deduplicated while loading', async () => {
  const result = await front(true, false, { changeAccount: false });
  assert.equal(result.requests, 1);
  assert.deepEqual(result.songs, ['A-song']);
});
test('same-account home force refresh preserves last usable rows on failure', async () => {
  const result = await front(true, true, { changeAccount: false, cached: true });
  assert.equal(result.requests, 1);
  assert.deepEqual(result.songs, ['cached-A']);
  assert.equal(result.error, 'DISCOVER_FAILED');
  assert.equal(result.loading, false);
});
for (const waitAt of ['login', 'upstream']) for (const failure of [false, true]) {
  test(`home API account switch through ${waitAt} ${failure ? 'failure' : 'success'} returns 409 without mixed private data`, async () => {
    const result = await server(waitAt, failure);
    assert.equal(result.sends.length, 1);
    assert.equal(result.sends[0].status, 409);
    assert.equal(result.sends[0].error, 'ACCOUNT_SESSION_CHANGED');
    assert.deepEqual(result.sends[0].songs, []);
    assert.deepEqual(result.sends[0].playlists, []);
    assert.deepEqual(result.writes, waitAt === 'login' ? [] : ['fixture-A', 'fixture-A', 'fixture-A']);
  });
}
test('same-account home API preserves recommendation ordering and successful status', async () => {
  const result = await server('upstream', false, false);
  assert.equal(result.sends[0].status, 200);
  assert.equal(result.sends[0].user, 'A');
  assert.deepEqual(result.sends[0].playlists, ['fixture-A-private', 'fixture-A']);
  assert.deepEqual(result.sends[0].songs, ['fixture-A-song']);
});
test('logged-out home API remains a successful empty starter response', async () => {
  const result = await server('login', false, false, false);
  assert.equal(result.sends[0].status, 200);
  assert.deepEqual(result.sends[0].songs, []);
  assert.deepEqual(result.sends[0].playlists, []);
  assert.deepEqual(result.writes, []);
});
