'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');
const checkpoint = require('../public/js/playback-checkpoint-format');
const root = path.join(__dirname, '..');

test('removed provider has no executable backend, token configuration or login/reset handler', () => {
  assert.equal(fs.existsSync(path.join(root, 'spotify-api.js')), false);
  for (const name of ['desktop/main.js', 'desktop/preload.js', 'server.js']) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(source, /require\(['"][^'"]*spotify-api|SPOTIFY_|clearSpotify|openSpotify|SpotifyOAuth/);
  }
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const context = vm.createContext({});
  const start = source.indexOf('function normalizeListenReportProvider(');
  const end = source.indexOf('function listenReportSongId(', start);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.normalizeListenReportProvider('spotify'), '');
  assert.equal(context.normalizeListenReportProvider('qq'), 'qq');
  assert.match(source, /PROVIDER_REMOVED/);
});

test('archived provider tracks survive reload and unrelated playlist writes without becoming playable', async t => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-archive-provider-'));
  t.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }));
  const id = 'abcdef0123456789abcdef01';
  const file = path.join(userDataPath, 'built-in-playlists.json');
  const original = JSON.stringify({ version: 1, playlists: [{ id, name: 'Archive', tracks: [
    { provider: 'spotify', source: 'spotify', id: 'old-track', spotifyId: 'old-track', spotifyUri: 'spotify:track:old-track', name: 'Saved title' },
  ] }] });
  fs.writeFileSync(file, original);
  const library = new BuiltInPlaylistLibrary({ userDataPath });
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'reading must not rewrite the archive');
  const track = library.page(id).tracks[0];
  assert.equal(track.provider, 'spotify');
  assert.equal(track.spotifyId, 'old-track');
  assert.equal(track.spotifyUri, 'spotify:track:old-track');
  assert.equal(track.playable, false);
  assert.equal(track.providerRemoved, true);
  await library.rename(id, 'Renamed archive');
  const restored = new BuiltInPlaylistLibrary({ userDataPath }).page(id).tracks[0];
  assert.equal(restored.spotifyId, 'old-track');
  assert.equal(restored.name, 'Saved title');
  await assert.rejects(library.addTrack(id, { provider: 'spotify', id: 'new-track' }), /TRACK_INVALID/);
  await assert.rejects(library.addTrack(id, { id: 'spotify:track:raw-legacy' }), /TRACK_INVALID/);
  await assert.rejects(library.addTrack(id, { uri: 'spotify:track:raw-legacy', name: 'Legacy URI' }), /TRACK_INVALID/);
});

test('saved playback checkpoints retain old IDs as non-playable archive records', () => {
  const original = { provider: 'spotify', id: 'old-track', spotifyId: 'old-track', name: 'Saved title' };
  const result = checkpoint.normalize({ version: 1, savedAt: Date.now(), currentTime: 0, duration: 10,
    currentIdx: 0, current: original, queue: [original], playing: false });
  assert.ok(result);
  assert.equal(result.current.provider, 'spotify');
  assert.equal(result.queue[0].spotifyId, 'old-track');
  assert.equal(result.current.providerRemoved, true);
  assert.equal(result.current.playable, false);
  assert.equal(original.playable, undefined, 'normalizing must not mutate the caller record');
  const raw = checkpoint.normalize({ version: 1, savedAt: Date.now(), currentTime: 0, duration: 10,
    currentIdx: 0, current: { id: 'spotify:track:raw-legacy' }, queue: [{ id: 'spotify:track:raw-legacy' }], playing: false });
  assert.equal(raw.current.id, 'spotify:track:raw-legacy');
  assert.equal(raw.current.providerRemoved, true);
  assert.equal(raw.current.playable, false);
});
