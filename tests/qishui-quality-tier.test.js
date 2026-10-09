'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { qishuiStreamForRequestedQuality } = require('../qishui-api');

const member = { membershipKnown: true, isVip: true, isSvip: true, vipLevel: 'svip' };
const flac = { url: 'https://a/flac', quality: 'lossless', format: 'flac', bitrate: 1000, duration: 200 };
const hq = { url: 'https://a/320', quality: 'higher', format: 'm4a', bitrate: 320, duration: 200 };
const std = { url: 'https://a/128', quality: 'medium', format: 'm4a', bitrate: 128, duration: 200 };

test('Qishui honours the requested tier instead of always taking the largest stream', () => {
  const list = [flac, hq, std];
  assert.equal(qishuiStreamForRequestedQuality(list, member, 'hires').url, flac.url);
  assert.equal(qishuiStreamForRequestedQuality(list, member, 'lossless').url, flac.url);
  assert.equal(qishuiStreamForRequestedQuality(list, member, 'exhigh').url, hq.url);
  assert.equal(qishuiStreamForRequestedQuality(list, member, 'standard').url, std.url);
  assert.equal(qishuiStreamForRequestedQuality([flac], member, 'standard').url, flac.url, 'nothing lower: play what exists');
  const preview = { ...std, duration: 30 };
  assert.equal(qishuiStreamForRequestedQuality([flac, preview], member, 'standard').url, flac.url, 'a preview never beats a full track');
});
