'use strict';

// These tests inspect the PowerShell/BAT sources and exercise Git primitives in
// disposable repositories. They never execute the updater or fetch from GitHub.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const psBytes = fs.readFileSync(path.join(root, 'scripts/update-local.ps1'));
const source = psBytes.toString('utf8');
const launcher = fs.readFileSync(path.join(root, 'update-mineradio.bat'), 'utf8');
const invocations = [...source.matchAll(/Invoke-Git -GitArguments @\(([^)]*)\)/g)];
const hookOptions = [...source.match(/\$arguments = @\(([^)]*)\) \+ \$GitArguments/)[1].matchAll(/'([^']*)'/g)].map(match => match[1]);

function fixedArguments(command) {
  const invocation = invocations.find(match => match[1].startsWith(`'${command}'`));
  assert.ok(invocation, `missing explicit ${command} invocation`);
  return [...invocation[1].matchAll(/'([^']*)'/g)].map(match => match[1]);
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-update-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repo = path.join(directory, 'repo');
  fs.mkdirSync(repo);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  const emptyConfig = path.join(directory, 'empty-git-config');
  fs.writeFileSync(emptyConfig, '');
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig, GIT_TERMINAL_PROMPT: '0' });
  const run = (args, allowFailure = false, cwd = repo) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 15000 });
    if (result.error) throw result.error;
    if (!allowFailure) assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return { code: result.status, output: result.stdout.trim(), error: result.stderr.trim() };
  };
  const invoke = (args, allowFailure = false) => run([...hookOptions, ...args], allowFailure);
  invoke(['init', '--quiet', '--initial-branch=main']);
  invoke(['config', 'user.name', 'Source Updater Test']);
  invoke(['config', 'user.email', 'source-updater-test@example.invalid']);
  fs.writeFileSync(path.join(repo, '.gitignore'), 'private-local.txt\n');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'base\n');
  invoke(['add', '.gitignore', 'source.txt']);
  invoke(['commit', '--quiet', '-m', 'fixture base']);
  const before = invoke(['rev-parse', 'HEAD']).output;
  return { directory, repo, run, invoke, before };
}

function incomingCommit(fx, files = { 'source.txt': 'incoming\n' }) {
  fx.invoke(['switch', '--quiet', '-c', 'incoming']);
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(fx.repo, name), text);
    fx.invoke(['add', '--force', name]);
  }
  fx.invoke(['commit', '--quiet', '-m', 'fixture incoming']);
  const target = fx.invoke(['rev-parse', 'HEAD']).output;
  fx.invoke(['switch', '--quiet', 'main']);
  return target;
}

test('Windows launcher respects execution policy and returns the updater result', () => {
  assert.deepEqual([...psBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'Windows PowerShell 5.1 needs BOM for Chinese messages');
  assert.doesNotMatch(launcher, /ExecutionPolicy|Set-ExecutionPolicy/i);
  assert.match(launcher, /powershell\.exe" -NoProfile -File "%~dp0scripts\\update-local\.ps1" -RepoDirectory "%~dp0\."/);
  assert.match(launcher, /set "UPDATE_EXIT=%ERRORLEVEL%"/);
  assert.match(launcher, /exit \/b %UPDATE_EXIT%/);
});

test('PowerShell binds every Git argument array by name and preserves the stop guards', () => {
  assert.doesNotMatch(source, /Invoke-Git\s+@\(/, 'array splatting binds later items to TimeoutSeconds');
  assert.equal(invocations.length, [...source.matchAll(/Invoke-Git\s+-/g)].length);
  assert.match(source, /if \(\$branch -ne 'main'\)\s*\{\s*throw/);
  assert.deepEqual(fixedArguments('symbolic-ref'), ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  assert.deepEqual(fixedArguments('status'), ['status', '--porcelain', '--untracked-files=no']);
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_START', 'index.lock']) {
    assert.ok(source.includes(`'${marker}'`), `missing pending-operation guard ${marker}`);
  }
  assert.match(source, /IsPathRooted\(\$markerPath\)/);
  assert.equal([...source.matchAll(/^    Assert-Ready$/gm)].length, 2, 'recheck tracked state after network wait');
  assert.equal([...source.matchAll(/^    Assert-SourceStopped$/gm)].length, 2, 'recheck source process after network wait');
  assert.match(source, /Get-CimInstance Win32_Process[^\n]*electron\.exe[^\n]*-ErrorAction Stop/);
  assert.match(source, /ExecutablePath\.StartsWith\(\$script:repo \+ '\\', \[StringComparison\]::OrdinalIgnoreCase\)/);
  const commands = invocations.map(match => fixedArguments(match[1].match(/^'([^']+)'/)[1])[0]);
  for (const forbidden of ['reset', 'rebase', 'clean', 'stash', 'push']) assert.equal(commands.includes(forbidden), false);
  assert.doesNotMatch(source, /^\s*(?:&\s+)?(?:npm|npx|electron|Start-Process)\b/im);
  assert.match(source, /已安装的 EXE 版本需要在应用内或 Release 页面升级/);
  assert.match(source, /不会强制覆盖或自动回滚/);
  assert.match(source, /if \(\$ancestor\.Code -ne 0\)\s*\{/);
  assert.match(source, /if \(\$ancestor\.Code -eq 1 -and \$ahead\.Code -eq 0\)\s*\{\s*throw/);
});

test('origin validation uses one effective official URL and rejects lookalikes', () => {
  assert.deepEqual(fixedArguments('remote'), ['remote', 'get-url', '--all', 'origin']);
  assert.match(source, /if \(\$originUrls\.Count -ne 1\) \{ throw/);
  const originPattern = source.match(/\$origin -notmatch '([^']+)'/)[1];
  const accepts = new RegExp(originPattern, 'i'); // PowerShell -notmatch is case-insensitive.
  for (const url of [
    'https://github.com/yancy520666/Mineradio-remix',
    'https://github.com/yancy520666/Mineradio-remix.git',
    'git@github.com:yancy520666/Mineradio-remix.git',
    'ssh://git@github.com/yancy520666/Mineradio-remix.git'
  ]) assert.ok(accepts.test(url), url);
  for (const url of [
    'https://github.com.evil.invalid/yancy520666/Mineradio-remix',
    'https://github.com/yancy520666/Mineradio-remix-other',
    'https://github.com/another/Mineradio-remix',
    'https://github.com/yancy520666/Mineradio-remix.git?redirect=evil',
    'file:///tmp/Mineradio-remix',
    'https://github.com/yancy520666/Mineradio-remix\nevil'
  ]) assert.equal(accepts.test(url), false, url);
});

test('fetch and merge policies are explicit; hooks are disabled only for this command', () => {
  assert.deepEqual(hookOptions, ['-c', 'core.hooksPath=/dev/null']);
  assert.match(source, /临时禁用 Git hooks/);
  assert.match(source, /原有 Git 配置保持不变/);
  assert.deepEqual(fixedArguments('fetch'), ['fetch', '--no-tags', '--no-prune', '--no-recurse-submodules', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  assert.deepEqual(fixedArguments('merge'), ['merge', '--ff-only', '--no-autostash', '--no-overwrite-ignore']);
  assert.ok(source.indexOf("@('update-ref', $backupRef, $before)") < source.indexOf("@('merge', '--ff-only'"));
  assert.match(source, /if \(\$after -ne \$target\) \{ throw/);
  assert.match(source, /ReadToEndAsync\(\)/);
  assert.match(source, /WaitForExit\(\$TimeoutSeconds \* 1000\)/);
  assert.match(source, /可能留下部分状态/);
});

test('effective remote query reveals URL rewrites and all configured fetch URLs without networking', t => {
  const fx = fixture(t);
  const official = 'https://github.com/yancy520666/Mineradio-remix.git';
  fx.invoke(['remote', 'add', 'origin', official]);
  assert.equal(fx.invoke(fixedArguments('remote')).output, official);
  fx.invoke(['config', 'url.https://example.invalid/.insteadOf', 'https://github.com/']);
  assert.equal(fx.invoke(fixedArguments('remote')).output, 'https://example.invalid/yancy520666/Mineradio-remix.git');
  fx.invoke(['config', '--add', 'remote.origin.url', 'https://example.invalid/another.git']);
  assert.equal(fx.invoke(fixedArguments('remote')).output.split(/\r?\n/).length, 2);
});

test('fetch reads only main even when configured refspecs and pruning request more', t => {
  const fx = fixture(t);
  const target = incomingCommit(fx);
  const remote = path.join(fx.directory, 'fixture-origin.git');
  // Clone only this generated fixture, then adjust its bare refs. No push or
  // external URL is used, and the updater itself is never executed.
  fx.run([...hookOptions, 'clone', '--quiet', '--bare', '--no-local', fx.repo, remote], false, fx.directory);
  fx.run([...hookOptions, 'update-ref', 'refs/heads/main', target], false, remote);
  fx.run([...hookOptions, 'update-ref', 'refs/heads/unrelated', target], false, remote);
  fx.run([...hookOptions, 'update-ref', 'refs/tags/fixture-tag', target], false, remote);
  fx.invoke(['remote', 'add', 'origin', remote]);
  fx.invoke(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
  fx.invoke(['config', 'fetch.prune', 'true']);
  fx.invoke(['config', 'fetch.pruneTags', 'true']);
  fx.invoke(['update-ref', 'refs/remotes/origin/keep-local-ref', fx.before]);
  fx.invoke(fixedArguments('fetch'));
  assert.equal(fx.invoke(['rev-parse', 'refs/remotes/origin/main']).output, target);
  assert.equal(fx.invoke(['rev-parse', 'refs/remotes/origin/keep-local-ref']).output, fx.before);
  assert.equal(fx.invoke(['show-ref', '--verify', '--quiet', 'refs/remotes/origin/unrelated'], true).code, 1);
  assert.equal(fx.invoke(['show-ref', '--verify', '--quiet', 'refs/tags/fixture-tag'], true).code, 1);
  assert.equal(fx.invoke(['rev-parse', 'HEAD']).output, fx.before, 'fetch alone must not change local source');
});

test('fast-forward preserves a backup and skips existing hooks without changing configuration', t => {
  const fx = fixture(t);
  const target = incomingCommit(fx);
  const hooks = path.join(fx.directory, 'local-hooks');
  fs.mkdirSync(hooks);
  const marker = path.join(fx.repo, 'hook-ran.txt');
  fs.writeFileSync(path.join(hooks, 'post-merge'), '#!/bin/sh\nprintf ran > hook-ran.txt\n', { mode: 0o755 });
  fx.run(['config', 'core.hooksPath', hooks]);
  assert.equal(fx.invoke(['merge-base', '--is-ancestor', fx.before, target]).code, 0);
  const backup = 'refs/mineradio-update-backups/fixture';
  fx.invoke([...fixedArguments('update-ref'), backup, fx.before]);
  fx.invoke([...fixedArguments('merge'), target]);
  assert.equal(fx.invoke(['rev-parse', 'HEAD']).output, target);
  assert.equal(fx.invoke(['rev-parse', backup]).output, fx.before);
  assert.equal(fs.existsSync(marker), false, 'post-merge must not run');
  assert.equal(fx.run(['config', '--get', 'core.hooksPath']).output, hooks, 'command override must not rewrite config');
});

test('no-autostash blocks a newly dirty worktree despite merge.autoStash=true', t => {
  const fx = fixture(t);
  const target = incomingCommit(fx);
  fx.invoke(['config', 'merge.autoStash', 'true']);
  const local = 'uncommitted local edit\n';
  fs.writeFileSync(path.join(fx.repo, 'source.txt'), local);
  assert.ok(fx.invoke(fixedArguments('status')).output);
  assert.notEqual(fx.invoke([...fixedArguments('merge'), target], true).code, 0);
  assert.equal(fx.invoke(['rev-parse', 'HEAD']).output, fx.before);
  assert.equal(fs.readFileSync(path.join(fx.repo, 'source.txt'), 'utf8'), local);
  assert.equal(fx.invoke(['stash', 'list']).output, '', 'do not hide or restore local edits');
});

test('incoming ignored-file collisions stop the merge and preserve private local data', t => {
  const fx = fixture(t);
  const target = incomingCommit(fx, { 'private-local.txt': 'incoming tracked content\n' });
  const local = 'private local fixture\n';
  fs.writeFileSync(path.join(fx.repo, 'private-local.txt'), local);
  assert.equal(fx.invoke(fixedArguments('status')).output, '', 'ignored files are not a tracked-state change');
  assert.notEqual(fx.invoke([...fixedArguments('merge'), target], true).code, 0);
  assert.equal(fx.invoke(['rev-parse', 'HEAD']).output, fx.before);
  assert.equal(fs.readFileSync(path.join(fx.repo, 'private-local.txt'), 'utf8'), local);
});

test('incoming untracked-file collisions stop the merge and preserve local files', t => {
  const fx = fixture(t);
  const target = incomingCommit(fx, { 'local-note.txt': 'incoming tracked content\n' });
  const local = 'untracked local fixture\n';
  fs.writeFileSync(path.join(fx.repo, 'local-note.txt'), local);
  assert.equal(fx.invoke(fixedArguments('status')).output, '');
  assert.notEqual(fx.invoke([...fixedArguments('merge'), target], true).code, 0);
  assert.equal(fx.invoke(['rev-parse', 'HEAD']).output, fx.before);
  assert.equal(fs.readFileSync(path.join(fx.repo, 'local-note.txt'), 'utf8'), local);
});

test('ahead and diverged local histories cannot be replaced by the fast-forward policy', t => {
  const fx = fixture(t);
  const target = incomingCommit(fx);
  fs.writeFileSync(path.join(fx.repo, 'local-commit.txt'), 'local commit\n');
  fx.invoke(['add', 'local-commit.txt']);
  fx.invoke(['commit', '--quiet', '-m', 'fixture local commit']);
  const local = fx.invoke(['rev-parse', 'HEAD']).output;
  assert.equal(fx.invoke(['merge-base', '--is-ancestor', local, target], true).code, 1);
  assert.equal(fx.invoke(['merge-base', '--is-ancestor', target, local], true).code, 1);
  assert.notEqual(fx.invoke([...fixedArguments('merge'), target], true).code, 0);
  assert.equal(fx.invoke(['rev-parse', 'HEAD']).output, local);
  assert.equal(fx.invoke(['merge-base', '--is-ancestor', local, fx.before], true).code, 1);
  assert.equal(fx.invoke(['merge-base', '--is-ancestor', fx.before, local]).code, 0);
});
