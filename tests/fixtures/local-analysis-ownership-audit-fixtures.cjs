'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario() {
  let reject;
  const old = new Promise((resolve, fail) => { reject = fail; });
  const statuses = [], modes = [], no = () => {};
  const c = vm.createContext({ localBeatAnalysis: { song: { localKey: 'old' }, audioUrl: 'fixture:old', active: false, token: 0 },
    beatMapToken: 0, djBeatMapToken: 0, audio: { currentTime: 0, duration: 100 }, getLocalBeatEntry: () => null,
    updateLocalBeatModal: no, setLocalBeatStatus: s => statuses.push(s), setDjModeActive: active => modes.push(active),
    resetBeatCameraSync: no, resetDjBeatMapState: no, analyzeAudioBeats: () => old,
    analyzePodcastDjBeats: () => new Promise(no), hideBeatChip: no, showToast: no, console: { warn: no } });
  loadFunctions(c, 'public/js/modules/03-beat/03-local-beat-cache-modal.js', ['startLocalBeatAnalysis']);
  const obsolete = c.startLocalBeatAnalysis('mr');
  // Real cancel/track switch invalidates this analysis before the next one starts.
  c.localBeatAnalysis.token++; c.beatMapToken++; c.localBeatAnalysis.active = false;
  c.localBeatAnalysis.song = { localKey: 'new' }; c.localBeatAnalysis.audioUrl = 'fixture:new';
  c.startLocalBeatAnalysis('dj');
  reject(new Error('obsolete decode failure')); await obsolete;
  return { newAnalysisActive: c.localBeatAnalysis.active, lastStatus: statuses.at(-1), lastDjMode: modes.at(-1) };
}
if (require.main === module) scenario().then(result => console.log('PBL-13 obsolete local analysis rejection', JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
