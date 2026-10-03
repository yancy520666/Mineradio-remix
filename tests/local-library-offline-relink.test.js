'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { LocalMusicLibrary, localFileId } = require('../desktop/local-music-library');
test('offline records survive; content relinking preserves IDs, playlists and media bytes', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-relink-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'song.mp3'), moved = path.join(temp, 'renamed.mp3'), copy = path.join(temp, 'copy.mp3');
  fs.writeFileSync(file, 'fixture-audio-bytes');
  fs.writeFileSync(path.join(temp, 'song.lrc'), '[00:01.000]原有旁挂歌词');
  const library = new LocalMusicLibrary({ userDataPath: temp, parseMetadata: async () => ({ common: { title: 'fixture' } }) });
  const first = await library.importFiles([file]); const track = first.tracks[0], token = library.mediaToken;
  fs.renameSync(file, moved);
  const index = fs.readFileSync(library.indexPath);
  assert.equal(library.listTracksSync().count, 0); assert.equal((await library.listTracks()).missing, 1);
  assert.deepEqual(fs.readFileSync(library.indexPath), index, 'offline enumeration cannot delete or change user records');
  assert.equal(library.resolveTrack(track.localFileId).localMissing, true);
  const relinked = await library.importFiles([moved]);
  assert.match(library.lyricForTrack(track.localFileId).lyric, /原有旁挂歌词/, 'moving audio alone cannot erase persisted lyrics');
  assert.equal(relinked.count, 1); assert.equal(relinked.tracks[0].localFileId, track.localFileId); assert.equal(library.mediaToken, token);
  fs.copyFileSync(moved, copy); assert.equal((await library.importFiles([copy])).count, 1, 'exact duplicate content is indexed once');
  fs.unlinkSync(copy);
  const reopened = new LocalMusicLibrary({ userDataPath: temp });
  assert.equal(reopened.listTracksSync().count, 1, 'available duplicate remains usable when the selected copy disappears');
  const response = await reopened.mediaResponse(new Request(track.localUrl)); assert.equal(await response.text(), 'fixture-audio-bytes');
  const different = path.join(temp, 'different.mp3'); fs.writeFileSync(different, 'fixture-audio-other');
  assert.equal((await library.importFiles([different])).count, 2, 'same size and metadata cannot collapse distinct content');
  fs.renameSync(moved, file); assert.equal(reopened.listTracksSync().count, 1, 'reattaching the original path restores its entry');
});
test('version 1 index and capability token remain readable without destructive migration', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-local-v1-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'old.mp3'); fs.writeFileSync(file, 'old');
  const token = 'a'.repeat(48), id = localFileId(file);
  const original = JSON.stringify({ version: 1, mediaToken: token, records: [{ id, audioPath: file, name: 'legacy' }] });
  fs.writeFileSync(path.join(temp, 'local-music-library.json'), original);
  const library = new LocalMusicLibrary({ userDataPath: temp });
  assert.equal(library.listTracksSync().tracks[0].localFileId, id); assert.equal(library.mediaToken, token);
  assert.equal(fs.readFileSync(library.indexPath, 'utf8'), original);
});

test('a stale alternate path holding different audio becomes a new song, not the moved one', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-alternate-hijack-'));
  try {
    const music = path.join(temp, 'music'); fs.mkdirSync(path.join(music, 'moved'), { recursive: true });
    const p1 = path.join(music, 'song.mp3'), p2 = path.join(music, 'moved', 'song.mp3');
    const library = new LocalMusicLibrary({ userDataPath: temp, parseMetadata: async file => ({ common: { title: fs.readFileSync(file, 'utf8').slice(0, 6) } }) });
    fs.writeFileSync(p1, 'SONG-A audio bytes');
    const a = (await library.importFiles([p1])).tracks[0].localKey;
    fs.renameSync(p1, p2);
    await library.importFiles([p2]);
    fs.writeFileSync(p1, 'SONG-B different bytes');
    await library.importFiles([p1]);
    const byId = new Map((await library.listTracks()).tracks.map(t => [t.localKey, t.name]));
    assert.equal(byId.get(a), 'SONG-A', 'playlists referencing the moved song keep playing it');
    assert.equal(byId.size, 2);
    assert.ok(!(library.records.get(a).alternatePaths || []).some(file => path.resolve(file) === path.resolve(p1)), 'the moved song no longer falls back to the reused path');
    // Re-tagging the primary file in place still updates the same record.
    fs.writeFileSync(p2, 'SONG-A retagged bytes');
    await library.importFiles([p2]);
    assert.equal(new Map((await library.listTracks()).tracks.map(t => [t.localKey, t.name])).get(a), 'SONG-A');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a replaced file at an old location is not played under the moved song', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-alternate-size-'));
  try {
    const music = path.join(temp, 'music'); fs.mkdirSync(path.join(music, 'moved'), { recursive: true });
    const p1 = path.join(music, 'song.mp3'), p2 = path.join(music, 'moved', 'song.mp3');
    const library = new LocalMusicLibrary({ userDataPath: temp, parseMetadata: async () => ({ common: { title: 'A' } }) });
    fs.writeFileSync(p1, 'SONG-A audio bytes');
    const a = (await library.importFiles([p1])).tracks[0].localKey;
    fs.renameSync(p1, p2);
    await library.importFiles([p2]);
    fs.writeFileSync(p1, 'SONG-B audio bytes');
    fs.rmSync(p2);
    const listed = await library.listTracks();
    assert.equal(listed.tracks.some(t => t.localKey === a), false, 'shown as offline instead of resolving to the replaced file');
    assert.equal(library.resolveTrack(a).localMissing, true, 'synchronous playback resolution also rejects equal-size replacements');
    fs.writeFileSync(p1, 'SONG-A audio bytes');
    assert.equal((await library.listTracks()).tracks.some(t => t.localKey === a), true, 'the same content at the old location still works');
    assert.equal(library.resolveTrack(a).localMissing, false);
    const response = await library.mediaResponse(new Request(library.resolveTrack(a).localUrl));
    assert.equal(await response.text(), 'SONG-A audio bytes');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
