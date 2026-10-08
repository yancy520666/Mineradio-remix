'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
test('login panel and main badge agree on pending, verified ordinary and verified VIP', () => {
  const c = vm.createContext({ escHtml: String, providerVipLevel: (_p, s) => s.vipLevel || 'none', qqLoginNeedsAuthorizationRefresh: s => s.authorizationIncomplete || s.playbackKeyReady === false, qqMembershipNeedsSync: s => s.membershipKnown !== true || s.membershipStale });
  loadFunctions(c, 'public/js/modules/08-account/01-login-modal-utils.js', ['providerMembershipNeedsSync', 'providerVipBadge']);
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js', ['loginProviderVipLabel']);
  for (const provider of ['qq', 'kugou', 'qishui']) {
    const pending = { loggedIn: true, vipLevel: 'none', membershipKnown: false, membershipVerified: false };
    const ordinary = { ...pending, membershipKnown: true, membershipVerified: true, playbackKeyReady: true };
    const vip = { ...ordinary, vipLevel: 'vip' };
    for (const [state, label] of [[pending, '待同步'], [ordinary, '普通'], [vip, 'VIP'], [{ ...vip, membershipStale: true }, '待同步']]) {
      assert.equal(c.loginProviderVipLabel(provider, state), label);
      assert.ok(c.providerVipBadge(provider, state, '', true).includes('>' + label + '</span>'));
    }
    assert.equal(c.loginProviderVipLabel(provider, { loggedIn: false }), '');
  }
});
