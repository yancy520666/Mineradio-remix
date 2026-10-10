'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(refresh, failure, opts = {}) {
  let release, reject, requests = 0, epoch = 0;
  const gate = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  const c = vm.createContext({ homeDiscoverToken: 0,
    homeDiscoverState: { loading: false, loaded: false, songs: opts.cached ? [{ id: 'cached-A' }] : [], playlists: [], podcasts: [], error: '' },
    loginStatus: { loggedIn: true, userId: 'A' }, qqLoginStatus: { loggedIn: false }, kugouLoginStatus: { loggedIn: false }, qishuiLoginStatus: { loggedIn: false }, spotifyLoginStatus: { loggedIn: false },
    providerAuthEpoch: () => epoch, hasAnyPlatformLogin: () => true, userPlaylists: [], cloneSong: song => ({ ...song }), renderHomeDiscover() {},
    apiJson: async () => ++requests === 1 ? gate : { loggedIn: true, dailySongs: [{ id: 'B-song' }], playlists: [{ id: 'B-private' }] }, console: { warn() {} } });
  const file = 'public/js/modules/05-playback/03-home-discover-weather.js';
  try { loadFunctions(c, file, ['homeDiscoverAuthKey']); } catch (error) { if (!/is missing/.test(error.message)) throw error; }
  loadFunctions(c, file, ['loadHomeDiscover']);
  const old = c.loadHomeDiscover(true);
  if (opts.changeAccount !== false) { epoch = 1; c.loginStatus.userId = 'B'; }
  if (refresh) await c.loadHomeDiscover(true);
  if (failure) reject(new Error('A-failed')); else release({ loggedIn: true, dailySongs: [{ id: 'A-song' }], playlists: [{ id: 'A-private' }] });
  await old;
  return { refresh, failure, requests, songs: Array.from(c.homeDiscoverState.songs, song => song.id), playlists: Array.from(c.homeDiscoverState.playlists, pl => pl.id), error: c.homeDiscoverState.error, loading: c.homeDiscoverState.loading };
}
if (require.main === module) (async () => { for (const refresh of [false, true]) for (const failure of [false, true]) console.log(JSON.stringify(await scenario(refresh, failure))); })().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
