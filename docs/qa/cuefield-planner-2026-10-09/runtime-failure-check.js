'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { createCuefieldAutoMix } = require(path.join(root, 'public/js/modules/05-playback/16-cuefield-automix-core'));
const { planCuefieldTransitionFromCache } = require(path.join(root, 'cuefield/mineradio-bridge'));
const cache = { a: { key: 'a', map: { duration: 20, gridStep: .5, cameraBeats: [] } },
  b: { key: 'b', map: { duration: 1, gridStep: .5, cameraBeats: [] } } };
let preparedAudioCalls = 0;
const runtime = createCuefieldAutoMix({ getKey: song => song.key, ensureBeatMap: async () => true,
  planTransition: async (fromKey, toKey) => planCuefieldTransitionFromCache({ fromKey, toKey,
    minimumListenUntil: 20, enableCadenceFallback: true, readBeatMapCache: key => cache[key] }),
  prepareAudioUrl: async () => { preparedAudioCalls += 1; return '/synthetic-fixture'; } });
runtime.setEnabled(true);
runtime.prepare({ token: 1, currentIndex: 0, nextIndex: 1, currentSong: { key: 'a' }, nextSong: { key: 'b' } })
  .then(result => {
    const state = runtime.snapshot();
    assert.equal(result.status, 'technical-error'); assert.equal(state.pending, null);
    assert.equal(state.preparing, false); assert.equal(preparedAudioCalls, 0);
    assert.equal(runtime.shouldTrigger({ token: 1, currentIndex: 0, currentTime: 20, nextKey: 'b' }), false);
    const outcome = { status: result.status, error: result.error, pending: state.pending, preparing: state.preparing,
      preparedAudioCalls, shouldTrigger: false, note: 'Pure runtime state checked; no media loaded or account accessed.' };
    fs.writeFileSync(path.join(__dirname, 'runtime-failure-check.json'), JSON.stringify(outcome, null, 2));
    console.log(JSON.stringify(outcome, null, 2));
  }).catch(error => { console.error(error); process.exitCode = 1; });
