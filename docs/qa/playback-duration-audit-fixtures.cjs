'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
function scenario() {
  const c = vm.createContext({});
  loadFunctions(c, 'public/js/modules/06-lyrics/04-progress-seek.js', ['normalizePlaybackDurationSeconds', 'playbackDurationFromSong']);
  loadFunctions(c, 'public/js/modules/05-playback/11-provider-fallback.js', ['songDurationSecondsForMatch']);
  return { localThirtyMinutes: c.playbackDurationFromSong({ type: 'local', duration: 1800 }),
    qishuiThirtyMinutes: c.playbackDurationFromSong({ provider: 'qishui', duration: 1800 }),
    explicitMilliseconds: c.playbackDurationFromSong({ durationMs: 800 }),
    neteaseTypical: c.playbackDurationFromSong({ provider: 'netease', duration: 205423 }),
    longQishuiMatch: c.songDurationSecondsForMatch({ provider: 'qishui', duration: 18000 }) };
}
if (require.main === module) console.log('PBL-15 duration unit boundary', JSON.stringify(scenario()));
module.exports = { scenario };
