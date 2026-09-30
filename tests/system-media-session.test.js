'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
test('media actions are idempotent and follow the live audio owner through handoff', () => {
  const actions = {}, positions = [], events = new Map();
  const media = () => ({ src: 'fixture.wav', paused: true, ended: false, duration: 100, currentTime: 30, playbackRate: 1,
    addEventListener(name, fn) { events.set(this, { ...(events.get(this) || {}), [name]: fn }); },
    removeEventListener(name) { delete events.get(this)[name]; }
  });
  const first = media(), second = media();
  const session = { setActionHandler: (name, fn) => { actions[name] = fn; }, setPositionState: state => positions.push(state) };
  let plays = 0, pauses = 0, next = 0, previous = 0;
  const context = vm.createContext({
    navigator: { mediaSession: session }, window: { addEventListener() {} }, Date, console,
    MediaMetadata: class { constructor(values) { Object.assign(this, values); } },
    audio: first, playQueue: [{ name: '第一首', artist: '歌手', album: '专辑' }], currentIdx: 0, currentLocalSong: null,
    progressDragState: { active: false },
    togglePlay: () => { if (context.audio.paused) { plays++; context.audio.paused = false; } else { pauses++; context.audio.paused = true; } },
    nextTrack: manual => { assert(manual); next++; }, prevTrack: manual => { assert(manual); previous++; },
    commitProgressSeek: (time, resume) => { assert.equal(resume, !context.audio.paused); context.audio.currentTime = time; },
    resetCuefieldAutoMix() {}, clearAlbumGaplessPreload() {}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/14a-system-media-session.js'), 'utf8'), context);
  context.bindSystemMediaAudio(first); assert.equal(session.metadata.title, '第一首');
  actions.play(); actions.play(); assert.equal(plays, 1);
  actions.pause(); actions.pause(); assert.equal(pauses, 1);
  actions.nexttrack(); actions.previoustrack(); assert.equal(next, 1); assert.equal(previous, 1);
  actions.seekto({ seekTime: 1000 }); assert.equal(first.currentTime, 100);
  actions.seekbackward({ seekOffset: 10 }); assert.equal(first.currentTime, 90);
  context.audio = second; context.playQueue[0] = { name: '第二首', artist: '新歌手' };
  context.bindSystemMediaAudio(second); assert.equal(Object.keys(events.get(first)).length, 0, 'old owner cannot overwrite the session');
  second.paused = false; events.get(second).playing(); assert.equal(session.playbackState, 'playing'); assert.equal(session.metadata.title, '第二首');
  second.duration = Infinity; context.updateSystemMediaPosition(true); assert.equal(positions.at(-1), undefined);
  context.clearSystemMediaSession(); assert.equal(session.metadata, null); assert.equal(session.playbackState, 'none'); assert(Object.values(actions).every(fn => fn === null));
});
