'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const index = args.includes('--index');
const refAt = args.indexOf('--ref');
const ref = refAt < 0 ? 'HEAD' : args[refAt + 1];
if (!ref || ref.startsWith('-')) throw new Error('Expected a Git revision after --ref');
const git = (...argv) => execFileSync('git', argv, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const personalEmail = /[\w.+-]+@(?:gmail|hotmail|outlook|live|qq|163|126)\.com\b/gi;
const secret = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/g;
const localProfile = /[A-Z]:[\\/]+Users[\\/]+(?!fixture\b|test\b|example\b|public\b|fake\b|qa\b|default\b)[^\s\\/"'<>]+|\/home\/(?:administrator|agent)\//gi;

function privatePath(file) {
  if (/^(?:\.local|\.codex|qa)\//.test(file)) return true;
  if (file.startsWith('.claude/') && !/^\.claude\/(?:CLAUDE\.md|STATUS\.md|skills\/)/.test(file)) return true;
  if (file.startsWith('docs/') && !/^docs\/(?:releases\/|assets\/|SUPPORT\.md$|THIRD_PARTY_PORTS\.md$)/.test(file)) return true;
  return /(?:^|\/)(?:\.env(?:\..*)?|auth\.json|credentials\.json|(?:CLAUDE|AGENTS)\.local\.md|settings\.local\.json|[^/]*\.jsonl|[^/]*\.log(?:\.gz)?|[^/]*\.(?:pem|pfx|p12|key)|\.[^/]*(?:cookie|token))$/.test(file);
}

const files = git(...(index ? ['ls-files', '-z'] : ['ls-tree', '-r', '--name-only', '-z', ref]))
  .toString('utf8').split('\0').filter(Boolean);
const failures = [];
for (const file of files) {
  if (privatePath(file)) failures.push(`private file: ${file}`);
  const data = git('show', index ? `:${file}` : `${ref}:${file}`);
  if (data.subarray(0, 8192).includes(0)) continue;
  const text = data.toString('utf8');
  for (const [label, pattern] of [['personal email', personalEmail], ['secret', secret], ['local profile path', localProfile]]) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) failures.push(`${label}: ${file}:${text.slice(0, match.index).split('\n').length}`);
  }
}
if (!index) {
  const emails = git('log', ref, '--format=%ae%n%ce').toString('utf8');
  personalEmail.lastIndex = 0;
  if (personalEmail.test(emails)) failures.push('personal email in reachable commit metadata');
}
if (failures.length) {
  console.error('Public-file check failed (values are redacted):\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public-file check passed: ${files.length} files`);
}
