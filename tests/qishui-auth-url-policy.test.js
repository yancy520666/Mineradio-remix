'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Pure validation tests: no network, vendor component or Electron execution.
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'qishui-auth-v6/security_host.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'qishui-auth-v6.js'), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(html.slice(html.indexOf('function normalizeVerifyComponentUrl('), html.indexOf('function loadVerifyScript(')), context);
vm.runInContext(main.slice(main.indexOf('function isAuthHostNavigationAllowed('), main.indexOf('function configure(')), context);

test('MFA component URLs require bounded HTTPS transport without credentials, fragments or nonstandard ports', () => {
  const normalize = context.normalizeVerifyComponentUrl;
  assert.equal(normalize('/component.js').href, 'https://api.qishui.com/component.js');
  assert.equal(normalize('https://example.invalid:443/component.js').port, '');
  for (const value of [null, {}, '', 'http://example.invalid/a.js', 'file:///component.js', 'javascript:void(0)',
    'https://name:password@example.invalid/a.js', 'https://example.invalid:8443/a.js',
    'https://example.invalid/a.js#fragment', 'https://example.invalid/a.js#', ' https://example.invalid/a.js',
    'https://example.invalid/' + 'x'.repeat(8192)]) {
    assert.throws(() => normalize(value));
  }
});

test('MFA top-level navigation only accepts the exact local seed and host documents', () => {
  const base = 'http://127.0.0.1:12345/fixture-token/';
  const allowed = context.isAuthHostNavigationAllowed;
  assert.equal(allowed(base + 'security_seed.html', base), true);
  assert.equal(allowed(base + 'security_host.html', base), true);
  for (const value of ['https://api.qishui.com/', base + 'security_host.html?next=remote',
    base + 'security_host.html#fragment', base + 'sdk-glue.js', 'about:blank', null]) {
    assert.equal(allowed(value, base), false);
  }
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
});
