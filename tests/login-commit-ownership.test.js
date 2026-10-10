'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../docs/qa/independent-integration-fixtures.cjs');
for (const outcome of ['success', 'error']) {
  test(`Qishui QR commit rejects the previous status ${outcome} without cancelling its own poll`, async () => {
    const result = await f.qishuiStatusAcrossQr(outcome);
    assert.equal(result.status.userId, 'B');
    assert.equal(result.status.stale, undefined);
    assert.equal(result.epoch, 1);
    assert.equal(result.qrGeneration, 1);
    assert.deepEqual(result.timers, [450]);
  });
  test(`catalog page awaiting across an account identity change rejects old ${outcome} even at the same epoch`, async () => {
    const result = await f.catalogAccountChangesDuringAwait(outcome);
    assert.equal(result.committed, false);
    assert.deepEqual(result.rows, ['A-page1']);
    assert.equal(result.current, 'B');
    assert.equal(result.storedAccountKey, '[true,"A"]');
    assert.equal(result.error, '');
  });
}
test('the first NetEase QR803 commit invalidates a previous account status before delayed profile refresh', async () => {
  const result = await f.neteaseFirstQrCommit();
  assert.equal(result.committed, 'B');
  assert.equal(result.afterOldRead, 'B');
  assert.equal(result.epoch, 1);
  assert.deepEqual(result.delays, [500]);
});
const { scenario: successOrder } = require('../docs/qa/login-success-order-audit-fixtures.cjs');
for (const provider of ['netease', 'qq', 'kugou']) for (const mode of ['web', 'cookie']) {
  test(`${provider} ${mode} commits auth before starting its own catalog or home refresh`, async () => {
    const result = await successOrder(provider, mode);
    assert.equal(result.userId, 'B');
    const connected = result.effects.findIndex(effect => effect.kind === 'connected');
    const catalog = result.effects.findIndex(effect => effect.kind === 'catalog');
    assert(connected >= 0 && catalog > connected);
    assert(result.effects.filter(effect => effect.kind === 'catalog' || effect.kind === 'home').every(effect => effect.epoch === result.epoch));
    if (provider === 'netease') { assert.equal(result.loaded, true); assert.deepEqual(result.songs, ['B-daily']); }
  });
}
test('NetEase delayed fresh profile uses the first QR commit epoch and its own home refresh survives', async () => {
  const result = await successOrder('netease', 'qr');
  assert.equal(result.userId, 'B');
  assert.equal(result.epoch, 1);
  assert.equal(result.loaded, true);
  assert.deepEqual(result.songs, ['B-daily']);
  assert.deepEqual(result.delays, [500]);
});
