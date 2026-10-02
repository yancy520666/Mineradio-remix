'use strict';
// All writes and mutants live in a throwaway source copy. No dependency install,
// real account files, running player, installer or release is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const next = process.argv.includes('--next') ? require('./audit-next-targets') : null;
const reportFile = path.resolve(root, next ? 'docs/NEXT_PATH_MUTATION_RESULTS.json' : 'docs/CRITICAL_PATH_MUTATION_RESULTS.json');
const groups = next ? next.groups : {
  security: { files: ['server-security.test.js'], pattern: 'HTTP boundary|proxy blocks' },
  dns: { files: ['music-dns.test.js'] },
  playback: { files: ['playback-start-stall.test.js', 'playback-pause-cancellation.test.js'] },
  checkpoint: { files: ['playback-checkpoint.test.js'] },
  qishui: { files: ['qishui-seo-playback.test.js', 'qishui-tier-rights.test.js', 'qishui-session-recovery.test.js'] },
  cache: { files: ['cache-root-fallback.test.js', 'network-compatibility.test.js'], pattern: 'desktop cache|existing D drive|C drive cache|Netease empty' },
  config: { files: ['original-profile-import.test.js'] },
};
const controls = 'public/js/modules/05-playback/14-player-controls.js';
const graph = 'public/js/modules/05-playback/08-audio-graph-controls.js';
const queue = 'public/js/modules/05-playback/09-queue-snapshot-autoplay.js';
const mutations = next ? next.mutations : [
  ['proxy-mixed-address', 'security', 'server-security.js', 'addresses.some(item => isBlockedIpAddress(item.address))', 'addresses.every(item => isBlockedIpAddress(item.address))'],
  ['proxy-redirect-revalidation', 'security', 'server-security.js', 'target = await resolveTarget(new URL(response.headers.get(\'location\'), target.url).href);', 'target = { ...target, url: new URL(response.headers.get(\'location\'), target.url) };'],
  ['local-origin-boundary', 'security', 'server-security.js', "if (req.headers.origin && (new URL(req.headers.origin).origin !== host.origin || new URL(req.headers.origin).origin !== req.headers.origin)) return false;", 'if (false) return false;'],
  ['fake-ip-domain-suffix', 'dns', 'server-security.js', "host.endsWith('.' + domain)", 'host.includes(domain)'],
  ['dns-ttl-direction', 'dns', 'music-dns.js', 'cached.until > now()', 'cached.until < now()'],
  ['stale-track-recovery', 'playback', controls, 'token !== trackSwitchToken || recoverySerial !== playbackResumeRecovery.serial', 'false || recoverySerial !== playbackResumeRecovery.serial'],
  ['pending-pause-recovery', 'playback', controls, "if (typeof pendingAudioPause !== 'undefined' && pendingAudioPause) return false;", 'if (false) return false;'],
  ['error-pause-intent', 'playback', controls, 'media.__mineradioPlaybackStartedToken === token && media.__mineradioPlaybackExpected !== false', 'media.__mineradioPlaybackStartedToken === token && media.__mineradioPlaybackExpected === false'],
  ['fresh-url-retry-bound', 'playback', controls, '(Number(playbackResumeRecovery.freshUrlAttemptCount) || 0) >= 1', '(Number(playbackResumeRecovery.freshUrlAttemptCount) || 0) > 1'],
  ['old-media-pause', 'playback', graph, 'serial !== audioFadeSerial || audio !== media || (media.currentSrc || media.src) !== mediaSrc', 'serial !== audioFadeSerial || false || (media.currentSrc || media.src) !== mediaSrc'],
  ['old-source-pause', 'playback', graph, 'serial !== audioFadeSerial || audio !== media || (media.currentSrc || media.src) !== mediaSrc', 'serial !== audioFadeSerial || audio !== media || false'],
  ['checkpoint-order', 'checkpoint', 'desktop/playback-checkpoint-store.js', 'if (payload.savedAt <= latestAcceptedAt)', 'if (false)'],
  ['checkpoint-fsync', 'checkpoint', 'desktop/playback-checkpoint-store.js', 'await handle.sync();', 'await Promise.resolve();'],
  ['checkpoint-backup', 'checkpoint', 'desktop/playback-checkpoint-store.js', '[readFile(file), readFile(backup)]', '[readFile(file)]'],
  ['checkpoint-position-bound', 'checkpoint', 'public/js/playback-checkpoint-format.js', 'Math.min(value.currentTime, duration > 0 ? duration : 31536000)', 'value.currentTime'],
  ['checkpoint-browser-disk-order', 'checkpoint', queue, 'disk.savedAt >= local.savedAt', 'disk.savedAt <= local.savedAt'],
  ['checkpoint-song-identity', 'checkpoint', queue, "if (audio && typeof playbackMediaMatchesCurrentQueueItem === 'function' && !playbackMediaMatchesCurrentQueueItem(audio)) return;", 'if (false) return;'],
  ['qishui-trial-direction', 'qishui', 'qishui-api.js', 'const trial = duration + 2 < fullDuration;', 'const trial = duration + 2 > fullDuration;'],
  ['qishui-expired-login', 'qishui', 'qishui-api.js', "if (checked.reauthRequired) {\n      return qishuiUnavailable('汽水音乐登录状态已失效", "if (false) {\n      return qishuiUnavailable('汽水音乐登录状态已失效"],
  ['qishui-svip-tier', 'qishui', 'qishui-api.js', "if (requiredTier === 'svip') return !!membership.isSvip;", "if (requiredTier === 'svip') return !!membership.isVip;"],
  ['qishui-song-match', 'qishui', 'qishui-api.js', 'if (!track || String(track.id) !== id)', 'if (!track)'],
  ['qishui-public-cookie', 'qishui', 'qishui-api.js', "fetchQishuiPlayerInfo(playerUrl.href, '', membership,", 'fetchQishuiPlayerInfo(playerUrl.href, cookie, membership,'],
  ['qishui-vod-origin', 'qishui', 'qishui-api.js', "if (playerUrl.protocol !== 'https:' || playerUrl.hostname !== 'vod-luna.douyin.com'\n      || playerUrl.username || playerUrl.password || (playerUrl.port && playerUrl.port !== '443'))", 'if (false)'],
  ['cache-no-d-drive', 'cache', 'desktop/main.js', ": path.join(app.getPath('userData'), 'cache');", ": path.join(dDrive, 'MineradioCache');"],
  ['cache-c-drive-allowed', 'cache', 'server.js', 'const allowed = !!root;', "const allowed = !!root && !/^C:$/i.test(drive);"],
  ['netease-expiry-direction', 'cache', 'server.js', 'if (expire && expire <= Date.now()) return false;', 'if (expire && expire >= Date.now()) return false;'],
  ['netease-empty-first-source', 'cache', 'server.js', 'const vipInfos = [profile.vipInfo, profile.vipinfo, account.vipInfo, account.vipinfo, extra.vipInfo, extra.vipinfo].filter(isObject);', 'const vipInfos = [profile.vipInfo || account.vipInfo || extra.vipInfo].filter(isObject);'],
  ['import-preserve-visual-choice', 'config', 'public/js/modules/08-account/06-original-profile-import.js', 'if (JSON.stringify(remixValue) !== JSON.stringify(fxDefaults[key])) return;', 'if (false) return;'],
  ['import-preserve-credentials', 'config', 'desktop/original-profile-import.js', 'if (fs.existsSync(destination)) continue;', 'if (false) continue;'],
  ['import-secret-filter', 'config', 'desktop/original-profile-import.js', '/cookie|token|secret|password|credential|auth/i.test(key)', '/cookie|token|password|credential|auth/i.test(key)'],
  ['import-preserve-settings-file', 'config', 'desktop/original-profile-import.js', 'fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);', 'fs.copyFileSync(source, destination, 0);'],
];
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-critical-mutations-'));
const testEnv = { ...process.env };
testEnv.NODE_PATH = path.join(root, 'node_modules');
for (const key of ['COOKIE_FILE', 'QQ_COOKIE_FILE', 'KUGOU_COOKIE_FILE', 'QISHUI_COOKIE_FILE',
  'QISHUI_TOKEN_FILE', 'QISHUI_QR_CONFIG_FILE', 'MINERADIO_LISTEN_SYNC_FILE', 'CUEFIELD_FEEDBACK_FILE']) {
  testEnv[key] = path.join(sandbox, 'runtime', key);
}
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.equal(commit.status, 0);
const report = { baselineCommit: commit.stdout.trim(), sourceHashes: {}, baseline: {}, mutations: [] };
const originals = new Map();
function run(group, env = testEnv) {
  const args = ['--test', '--test-reporter=tap'];
  if (group.pattern) args.push('--test-name-pattern=' + group.pattern);
  args.push(...group.files.map(name => 'tests/' + name));
  const result = spawnSync(process.execPath, args, { cwd: sandbox, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  const output = (result.stdout || '') + (result.stderr || '');
  return { exit: result.status, error: result.error && result.error.code,
    invalid: /SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND|Error in script/.test(output),
    failedTests: [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(match => match[1]),
    tests: Number(output.match(/^# tests (\d+)/m)?.[1] || 0),
    skipped: Number(output.match(/^# skipped (\d+)/m)?.[1] || 0),
    // Bound output for troubleshooting; fixtures contain no real credentials.
    detail: result.status ? output.split(sandbox).join('<isolated-copy>').split(root).join('<repository>').slice(-3500) : undefined };
}
try {
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(tracked.status, 0);
  const files = new Set(tracked.stdout.split('\0').filter(file =>
    file === 'package.json' || file.endsWith('.js') && !/^(node_modules|public\/vendor|qishui-auth-v6)\//.test(file)));
  // Include newly added tests before they have been committed.
  for (const group of Object.values(groups)) for (const name of group.files) files.add('tests/' + name);
  for (const file of next ? next.extraFiles : []) files.add(file);
  for (const item of mutations) files.add(item[2]);
  for (const file of files) {
    const target = path.resolve(sandbox, file);
    assert(target.startsWith(sandbox + path.sep));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(target, source); originals.set(file, source);
  }
  for (const [name, group] of Object.entries(groups)) {
    const result = run(group); report.baseline[name] = result;
    console.log('baseline ' + name + ': ' + result.exit);
    assert.equal(result.exit, 0, name + ' baseline failed: ' + result.detail);
  }
  for (const file of new Set([...mutations.map(item => item[2]), ...Object.values(groups).flatMap(group => group.files.map(name => 'tests/' + name))])) {
    report.sourceHashes[file] = crypto.createHash('sha256').update(originals.get(file)).digest('hex');
  }
  for (const [name, group, file, from, to] of mutations) {
    const source = originals.get(file);
    assert(source && source.split(from).length === 2, name + ': mutation target must be unique');
    const target = path.join(sandbox, file);
    fs.writeFileSync(target, source.replace(from, to));
    if (file.endsWith('.js')) {
      const syntax = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8', windowsHide: true });
      assert.equal(syntax.status, 0, name + ': invalid mutation syntax');
    }
    const result = run(groups[group]);
    fs.writeFileSync(target, source);
    let status = result.error || result.invalid || result.exit === null || (result.exit !== 0 && !result.failedTests.length)
      ? 'inconclusive' : result.exit === 0 ? 'survived' : 'killed';
    const equivalentReason = next && next.equivalentMutations[name];
    if (status === 'survived' && equivalentReason) status = 'equivalent';
    report.mutations.push({ name, group, file, status, ...result, equivalentReason: status === 'equivalent' ? equivalentReason : undefined, detail: status === 'inconclusive' ? result.detail : undefined });
    console.log(name + ': ' + status);
  }
  if (next) {
    // The download test mutates the locked dependency in RAM, never node_modules.
    const result = run({ files: ['remix-updater-download.test.js'] }, { ...testEnv, MINERADIO_UPDATE_DIGEST_MUTANT: '1' });
    const status = result.exit !== 0 && result.failedTests.length && !result.error && !result.invalid ? 'killed' : 'inconclusive';
    const file = 'node_modules/builder-util-runtime/out/httpExecutor.js';
    report.sourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    report.mutations.push({ name: 'dependency-sha512-comparison', group: 'updater', file, mode: 'RAM only', status, ...result });
    console.log('dependency-sha512-comparison: ' + status);
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log('Report: ' + path.relative(root, reportFile));
  if (report.mutations.some(item => !['killed', 'equivalent'].includes(item.status))) process.exitCode = 1;
} finally {
  assert(path.dirname(sandbox) === path.resolve(os.tmpdir()) && path.basename(sandbox).startsWith('mineradio-critical-mutations-'));
  fs.rmSync(sandbox, { recursive: true, force: true });
}
