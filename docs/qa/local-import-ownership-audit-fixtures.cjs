'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(coverPhase) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const starts = [], covers = [], no = () => {};
  const c = vm.createContext({ playQueue: [{ name: 'existing' }], currentIdx: 0, trackSwitchToken: 7, queueLoadRequestSerial: 0,
    persistentLocalLibraryTracks: [], finishUploadFilePicker: no, sortedAudioUploadFiles: files => files, firstImageUploadFile: () => ({ name: 'old-cover' }),
    canUsePersistentLocalMusicLibrary: () => true, importPersistentLocalAudioFiles: () => gate, showToast: no, console, setTimeout: no,
    cloneSong: song => ({ ...song }), homeForcedOpen: false, homeSuppressed: false, setHomeControlsLocked: no, miniQueueOpen: false,
    safeRenderQueuePanel: no, safeShelfRebuild: no, forcePlaybackControlsInteractive: no, updateEmptyHomeVisibility: no,
    cancelPlaylistQueueHydration: () => c.queueLoadRequestSerial++, loadCoverFromFile: file => covers.push({ file: file.name, song: c.playQueue[0].name }) });
  c.playQueueAt = () => { c.trackSwitchToken++; starts.push(c.playQueue[0].name); return coverPhase ? gate : Promise.resolve(true); };
  loadFunctions(c, 'public/js/modules/06-lyrics/03-podcast-playlist-loaders.js', ['beginQueueLoadRequest', 'queueLoadRequestStillCurrent']);
  loadFunctions(c, 'public/js/modules/06-lyrics/05-upload-dragdrop.js', ['handleFiles', 'importLocalAudioSongs']);
  const old = coverPhase ? c.importLocalAudioSongs([{ name: 'old-local' }], { coverFile: { name: 'old-cover' } }) : c.handleFiles([{ name: 'old-local.mp3' }], {});
  c.playQueue = [{ name: 'new-selection' }]; c.currentIdx = 0; c.trackSwitchToken++;
  release(coverPhase ? true : { tracks: [{ name: 'old-local' }] });
  await old; await new Promise(setImmediate);
  return { coverPhase, queue: Array.from(c.playQueue, song => song.name), starts, covers };
}
if (require.main === module) (async () => { for (const coverPhase of [false, true]) console.log('PBL-12 stale local import', JSON.stringify(await scenario(coverPhase))); })().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
