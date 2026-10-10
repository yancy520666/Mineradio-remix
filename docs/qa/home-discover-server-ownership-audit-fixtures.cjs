'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(waitAt, failure = false, changeAccount = true, loggedIn = true) {
  let release, reject;
  const gate = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  const writes = [], sends = [];
  const c = vm.createContext({ userCookie: 'fixture-A', loginSessionGeneration: { netease: 0 },
    getLoginInfo: async () => { if (waitAt === 'login') await gate; return { loggedIn, userId: loggedIn ? 'A' : '' }; },
    sendJSON: (_res, payload, status = 200) => sends.push({ status, payload }), console: { error() {} },
    personalized: async params => { writes.push(params.cookie); if (waitAt === 'upstream') await gate; return { body: { result: [{ id: params.cookie, name: params.cookie }] } }; },
    recommend_resource: async params => { writes.push(params.cookie); if (waitAt === 'upstream') await gate; return { body: { recommend: [{ id: params.cookie + '-private', name: params.cookie }] } }; },
    recommend_songs: async params => { writes.push(params.cookie); if (waitAt === 'upstream') await gate; return { body: { data: { dailySongs: [{ id: params.cookie + '-song', name: params.cookie }] } } }; },
    mapDiscoverPlaylist: pl => pl, mapDailyRecommendationSongs: songs => songs });
  loadFunctions(c, 'server.js', ['captureNeteaseAccountSession', 'checkNeteaseAccountSession', 'handleDiscoverHome']);
  const source = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
  const first = source.indexOf("  if (pn === '/api/discover/home') {");
  const last = source.indexOf("  if (pn === '", first + 1);
  vm.runInContext('async function route(res) { const pn="/api/discover/home";\n' + source.slice(first, last) + '\n}', c);
  const pending = c.route({});
  await new Promise(setImmediate);
  if (changeAccount) { c.userCookie = 'fixture-B'; c.loginSessionGeneration.netease++; }
  if (failure) reject(new Error('fixture-old-error')); else release();
  await pending;
  return { waitAt, failure, writes, sends: sends.map(({ status, payload }) => ({ status, user: payload.user && payload.user.userId, songs: Array.from(payload.dailySongs || [], song => song.id), playlists: Array.from(payload.playlists || [], pl => pl.id), error: payload.error })) };
}
if (require.main === module) (async () => { for (const waitAt of ['login', 'upstream']) for (const failure of [false, true]) console.log(JSON.stringify(await scenario(waitAt, failure))); })().catch(error => { console.error(error); process.exitCode=1; });
module.exports = { scenario };
