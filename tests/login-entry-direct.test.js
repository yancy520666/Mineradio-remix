'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const accountDir = path.join(__dirname, '..', 'public', 'js', 'modules', '08-account');
const modalSource = fs.readFileSync(path.join(accountDir, '03-login-modal-flows.js'), 'utf8');
const userButtonSource = fs.readFileSync(path.join(accountDir, '01-login-modal-utils.js'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end + 3);
}

function testAvatarOpensAccountBinding(order, expected) {
  const calls = [];
  const modal = { id: 'login-modal' };
  const context = vm.createContext({
    document: { getElementById: (id) => id === 'login-modal' ? modal : null },
    loginProvider: 'netease',
    topAccountPillClickSuppressed: false,
    // The last-used account must not decide which platform opens first.
    hasAnyPlatformLogin: () => true,
    firstLoggedProvider: () => 'qishui',
    accountProviderOrder: () => order,
    normalizeLoginProviderKey: (value) => value,
    openGsapModal: (element) => { assert.equal(element, modal); calls.push('open'); },
    bindLoginWorkflowPointerEvents: () => calls.push('bind'),
    setLoginAuthDrawerOpen: (open) => { assert.equal(open, false); calls.push('drawer'); },
    updateLoginProviderUi: () => calls.push('provider'),
    scheduleLoginWorkflowEdges: (reason) => { assert.equal(reason, 'open'); calls.push('edges'); },
  });
  vm.runInContext([
    functionSource(modalSource, 'showLoginModal'),
    functionSource(userButtonSource, 'onUserBtnClick'),
  ].join('\n'), context);
  context.onUserBtnClick();
  assert.equal(context.loginProvider, expected);
  assert.deepEqual(calls, ['open', 'bind', 'drawer', 'provider', 'edges']);
}

testAvatarOpensAccountBinding(['netease', 'qq', 'kugou', 'qishui'], 'netease');
testAvatarOpensAccountBinding(['kugou', 'netease', 'qq', 'qishui'], 'kugou');
testAvatarOpensAccountBinding([], 'netease');
console.log('OK login-entry-direct');
