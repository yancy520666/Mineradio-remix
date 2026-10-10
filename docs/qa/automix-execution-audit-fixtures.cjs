'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(stage) {
  let release, reject;
  const gate = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  const stopped = [], notices = [], ui = [], no = () => {};
  const oldMedia = { label: 'old-incoming', play: () => stage === 'play' ? gate : Promise.resolve(), src: 'fixture:old', paused: false };
  const nextMedia = { label: 'new-incoming', play: () => Promise.resolve(), src: 'fixture:new', paused: false };
  const c = vm.createContext({ cuefieldAutoMixExecuting: false, cuefieldTransitionGeneration: 0, cuefieldActiveTransitionContext: null,
    currentIdx: 0, trackSwitchToken: 1, audio: { label: 'old-outgoing', paused: false }, playQueue: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    performance: { now: () => 0 }, cuefieldAutoMixBlockedByAlbumGapless: () => false, cuefieldSongKey: song => song.name,
    prepareCuefieldPendingAudio: pending => pending.token === 1 ? oldMedia : nextMedia,
    applyAudioOutputDevice: media => media === oldMedia && stage === 'output' ? gate : media === nextMedia ? new Promise(no) : Promise.resolve(),
    cuefieldTransitionStillCurrent: (pending, owner) => pending.token === c.trackSwitchToken && owner.generation === c.cuefieldTransitionGeneration,
    cuefieldSetMediaTime: no, cuefieldWriteIncomingGain: no, stopCuefieldPreparedAudio: media => stopped.push(media.label),
    recoverCuefieldAutoMixEndedOutgoing: no, updateCuefieldAutoMixUi: value => ui.push(value), showToast: value => notices.push(value),
    cuefieldFeedbackContext: () => ({}), runCuefieldTimeline: () => stage === 'timeline' ? gate : Promise.resolve(true),
    cuefieldPendingDescriptor: () => ({ proxyUrl: 'fixture:old' }), playQueueAt: () => stage === 'handoff' ? gate : Promise.resolve(false),
    cuefieldRecentRecipes: [], showCuefieldFeedback: no, console, targetVolume: 1 });
  const source = 'public/js/modules/05-playback/18-cuefield-automix-integration.js';
  try { loadFunctions(c, source, ['releaseCuefieldExecutionIfOwned']); } catch (error) { if (!/is missing/.test(error.message)) throw error; }
  loadFunctions(c, source, ['executeCuefieldAutoMix']);
  const pending = token => ({ token, currentIndex: token - 1, nextIndex: token, timelineExecution: { bStart: 0, actions: [] } });
  const old = c.executeCuefieldAutoMix(pending(1));
  await new Promise(setImmediate);
  // A real track switch resets the old execution before preparing a new pair.
  c.cuefieldTransitionGeneration++; c.trackSwitchToken = 2; c.currentIdx = 1; c.audio = { label: 'new-outgoing', paused: false };
  c.cuefieldAutoMixExecuting = false; c.cuefieldActiveTransitionContext = null;
  c.executeCuefieldAutoMix(pending(2));
  const newerOwner = c.cuefieldActiveTransitionContext;
  if (stage === 'play') reject(new Error('obsolete play rejection')); else release(false);
  await old;
  return { stage, executing: c.cuefieldAutoMixExecuting, sameNewOwner: c.cuefieldActiveTransitionContext === newerOwner, stopped, notices, lastUi: ui.at(-1) };
}
if (require.main === module) (async () => { for (const stage of ['output', 'play', 'timeline', 'handoff']) console.log('PBL-10 stale execution cleanup', JSON.stringify(await scenario(stage))); })().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
