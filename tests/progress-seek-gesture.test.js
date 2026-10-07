'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  let now = 1000;
  const events = {};
  const bar = { addEventListener: (name, fn) => { events[name] = fn; },
    getBoundingClientRect: () => ({ left: 0, width: 100, top: 0, height: 10 }),
    classList: { add() {}, remove() {} }, setPointerCapture() {}, releasePointerCapture() {} };
  const c = vm.createContext({ document: { getElementById: () => bar },
    setInterval() {}, performance: { now: () => now }, playing: true,
    audio: { src: 'fixture', currentTime: 1, paused: false, ended: false, duration: 240, pause() { this.paused = true; } },
    clampRange: (x, a, b) => Math.max(a, Math.min(b, x)), setAudioOutputGainImmediate() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/06-lyrics/04-progress-seek.js'), 'utf8'), c);
  c.scheduleProgressLyricPreviewTick = () => {};
  c.previewProgressPointer = e => { c.progressDragState.previewTime = e.clientX * 2.4; return true; };
  c.queueProgressPointerPreview = () => {};
  c.commitProgressSeek = () => {};
  return { c, event: (type, x) => events[type]({ clientX: x, pointerId: 1 }), advance: ms => { now += ms; } };
}

test('real progress handlers distinguish a click, movement, long hold and cancellation', () => {
  for (const gesture of ['click', 'drag', 'hold', 'cancel']) {
    const { c, event, advance } = fixture();
    event('pointerdown', 75);
    assert.equal(c.progressLyricSeekGlideActive(), false, 'held pointer never starts a glide');
    if (gesture === 'drag') { event('pointermove', 40); event('pointermove', 75); }
    advance(gesture === 'hold' ? 300 : 50);
    event(gesture === 'cancel' ? 'pointercancel' : 'pointerup', 75);
    assert.equal(c.progressLyricSeekGlideActive(), gesture === 'click', gesture);
    c.clearProgressPreviewHold();
    assert.equal(c.progressLyricSeekGlideActive(), false);
  }
});
