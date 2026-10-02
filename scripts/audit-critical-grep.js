'use strict';
// Search results are review candidates, not proof of a bug. Never print values
// from credential/log matches. Vendor code, fixtures and audit rules are excluded.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rules = [
  ['native-prompt', String.raw`window\.prompt\s*\(`],
  ['tls-bypass', String.raw`rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|ignore-certificate-errors`],
  ['fixed-drive', String.raw`D:\\|\^C:\$`],
  ['plaintext-sensitive', String.raw`http://(?:[^/\s'"\x60]*(?:ip-api|passport|oauth|login)[^/\s'"\x60]*)`],
  ['literal-credential', String.raw`(?:cookie|(?:access|refresh)[_-]?token)\s*[:=]\s*['"][^'"]{12,}['"]`],
  ['credential-log', String.raw`console\.(?:log|warn|error|debug)\([^\n]*(?:cookie|token)`],
];
const findings = [];
for (const [rule, pattern] of rules) {
  const result = spawnSync('rg', ['--json', '--ignore-case', '-e', pattern,
    '-g', '*.js', '-g', '!node_modules/**', '-g', '!public/vendor/**', '-g', '!tests/**', '-g', '!scripts/**', '.'],
  { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (result.error || ![0, 1].includes(result.status)) throw result.error || new Error(result.stderr);
  let count = 0;
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type !== 'match') continue;
    findings.push({ rule, file: event.data.path.text.replace(/^\.\\|^\.\//, '').replace(/\\/g, '/'), line: event.data.line_number });
    count++;
  }
  console.log(rule + ': ' + count + ' review candidate(s)');
}
console.log(JSON.stringify({ findings }, null, 2));
