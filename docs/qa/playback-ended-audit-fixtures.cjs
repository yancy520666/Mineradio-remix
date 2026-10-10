'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
function scenario(mode, duplicate) {
  const file = 'public/js/modules/05-playback/13-playback-start-audio.js';
  const source = fs.readFileSync(require('node:path').resolve(__dirname, '../..', file), 'utf8');
  const callbacks = [], calls = [], original = {}, replacement = {}, queue = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  const c = vm.createContext({ audio: original, token: 1, trackSwitchToken: 1, currentIdx: 0, playQueue: queue, playMode: mode,
    setTimeout: fn => callbacks.push(fn), restartSingleRepeatMedia: () => false, finalizeListenSession() {}, playAlbumGaplessNextOnEnded: () => false,
    nextTrack: () => { calls.push('next'); c.trackSwitchToken++; }, playQueueAt: index => { calls.push('repeat:' + index); c.trackSwitchToken++; } });
  try { loadFunctions(c, file, ['schedulePlaybackEndedAdvance']); } catch (error) { if (!/is missing/.test(error.message)) throw error; }
  const start = source.indexOf('audio.onended = function () {', source.indexOf('async function playLocalQueueSong('));
  let depth = 0, end = source.indexOf('{', start);
  for (let i = end; i < source.length; i++) { if (source[i] === '{') depth++; if (source[i] === '}' && --depth === 0) { end = i; break; } }
  vm.runInContext(source.slice(start, end + 2), c);
  original.onended();
  if (duplicate) original.onended();
  else { c.trackSwitchToken = 2; c.currentIdx = 1; c.audio = replacement; }
  for (const callback of callbacks) callback();
  return { mode, duplicate, calls, tokenAfter: c.trackSwitchToken };
}
if (require.main === module) for (const mode of ['loop', 'single']) for (const duplicate of [false, true]) console.log('PBL-11 deferred ended', JSON.stringify(scenario(mode, duplicate)));
module.exports = { scenario };
