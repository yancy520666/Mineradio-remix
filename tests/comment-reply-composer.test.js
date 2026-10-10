'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { loadFunctions } = require('./helpers/classic-functions');

const detailScript = 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js';
const repliesScript = 'public/js/modules/05-playback/06a-comment-replies.js';
const composeScript = 'public/js/modules/05-playback/06c-comment-reply-compose.js';
const readSource = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

// A small DOM adapter, not a browser or a fabricated composer. xmldom parses
// the actual renderer HTML; this supplies only the DOM/event APIs it uses.
function fixtureDocument() {
  const parser = new DOMParser({ errorHandler: { warning() {}, error(message) { throw new Error(message); }, fatalError(message) { throw new Error(message); } } });
  const nativeDocument = parser.parseFromString('<main><div id="song-comments"></div><div id="track-detail-modal"></div></main>', 'text/html');
  const wrappers = new WeakMap();
  const events = new WeakMap();
  const document = { activeElement: null };
  const elements = node => Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
  const descendants = node => elements(node).flatMap(child => [child, ...descendants(child)]);
  function matchesSingle(node, selector) {
    const parts = selector.trim().split(/\s+(?![^\[]*\])/);
    const atom = parts.pop();
    const tag = atom.match(/^[\w-]+/);
    if (tag && node.tagName.toLowerCase() !== tag[0].toLowerCase()) return false;
    for (const match of atom.matchAll(/\.([\w-]+)/g)) {
      if (!String(node.getAttribute('class') || '').split(/\s+/).includes(match[1])) return false;
    }
    const id = atom.match(/#([\w-]+)/);
    if (id && node.getAttribute('id') !== id[1]) return false;
    for (const match of atom.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      if (!node.hasAttribute(match[1]) || match[2] !== undefined && node.getAttribute(match[1]) !== match[2]) return false;
    }
    if (!parts.length) return true;
    let ancestor = node.parentNode;
    while (ancestor && ancestor.nodeType === 1) {
      if (matchesSingle(ancestor, parts.join(' '))) return true;
      ancestor = ancestor.parentNode;
    }
    return false;
  }
  const matches = (node, selector) => selector.split(',').some(part => matchesSingle(node, part));
  function wrap(node) {
    if (!node || node.nodeType !== 1) return null;
    if (wrappers.has(node)) return wrappers.get(node);
    const values = { value: node.tagName === 'textarea' ? node.textContent : node.getAttribute('value') || '' };
    const element = {
      node,
      get tagName() { return node.tagName.toUpperCase(); },
      get parentElement() { return wrap(node.parentNode); },
      get isConnected() { let cursor = node; while (cursor.parentNode) cursor = cursor.parentNode; return cursor === nativeDocument; },
      get innerHTML() { return Array.from(node.childNodes).map(child => new XMLSerializer().serializeToString(child)).join(''); },
      set innerHTML(html) { while (node.firstChild) node.removeChild(node.firstChild); this.insertAdjacentHTML('beforeend', html); },
      get textContent() { return node.textContent; },
      set textContent(value) { node.textContent = String(value); },
      get value() { return values.value; },
      set value(value) { values.value = String(value); },
      get hidden() { return node.hasAttribute('hidden'); },
      set hidden(value) { value ? node.setAttribute('hidden', '') : node.removeAttribute('hidden'); },
      get disabled() { return node.hasAttribute('disabled'); },
      set disabled(value) { value ? node.setAttribute('disabled', '') : node.removeAttribute('disabled'); },
      getAttribute(name) { return node.getAttribute(name); },
      setAttribute(name, value) { node.setAttribute(name, String(value)); },
      removeAttribute(name) { node.removeAttribute(name); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) { return descendants(node).filter(child => matches(child, selector)).map(wrap); },
      closest(selector) { let cursor = node; while (cursor && cursor.nodeType === 1) { if (matches(cursor, selector)) return wrap(cursor); cursor = cursor.parentNode; } return null; },
      contains(other) { let cursor = other && other.node; while (cursor) { if (cursor === node) return true; cursor = cursor.parentNode; } return false; },
      remove() { if (node.parentNode) node.parentNode.removeChild(node); },
      insertAdjacentHTML(position, html) {
        assert.equal(position, 'beforeend');
        const fragment = parser.parseFromString('<div>' + html + '</div>', 'text/html').documentElement;
        while (fragment.firstChild) node.appendChild(fragment.firstChild);
      },
      focus() { document.activeElement = this; values.focusCount = (values.focusCount || 0) + 1; },
      addEventListener(type, handler) { let listeners = events.get(node); if (!listeners) events.set(node, listeners = {}); (listeners[type] ||= []).push(handler); },
      listenerCount(type) { return (events.get(node)?.[type] || []).length; },
      dispatch(type, properties = {}) {
        if (type === 'click' && this.disabled) return null;
        const event = { type, target: this, defaultPrevented: false, stopped: false, ...properties,
          preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
        let cursor = node;
        while (cursor && !event.stopped) {
          for (const handler of events.get(cursor)?.[type] || []) handler(event);
          cursor = cursor.parentNode;
        }
        return event;
      },
    };
    element.dataset = new Proxy({}, { get(_target, key) { return node.getAttribute('data-' + String(key).replace(/[A-Z]/g, char => '-' + char.toLowerCase())) || undefined; },
      set(_target, key, value) { node.setAttribute('data-' + String(key).replace(/[A-Z]/g, char => '-' + char.toLowerCase()), String(value)); return true; } });
    element.classList = {
      contains(name) { return String(node.getAttribute('class') || '').split(/\s+/).includes(name); },
      add(name) { this.toggle(name, true); }, remove(name) { this.toggle(name, false); },
      toggle(name, forced) { const names = new Set(String(node.getAttribute('class') || '').split(/\s+/).filter(Boolean)); const add = forced === undefined ? !names.has(name) : forced; add ? names.add(name) : names.delete(name); node.setAttribute('class', [...names].join(' ')); return add; },
    };
    wrappers.set(node, element);
    return element;
  }
  document.getElementById = id => [nativeDocument.documentElement, ...descendants(nativeDocument.documentElement)].filter(node => node.getAttribute('id') === id).map(wrap)[0] || null;
  document.querySelectorAll = selector => [nativeDocument.documentElement, ...descendants(nativeDocument.documentElement)].filter(node => matches(node, selector)).map(wrap);
  document.createElement = tag => wrap(nativeDocument.createElement(tag));
  return document;
}

const rootComment = (id = 'root/+?', extra = {}) => ({ id, content: 'Root quote <safe>', replyCount: 2, replyResource: 'resource/+?',
  user: { id: 'fake-author', nickname: 'Root <author>' }, ...extra });
const nestedComment = (id = 'child/+?', extra = {}) => ({ id, content: 'Nested quote <safe>', replyCount: 0,
  user: { id: 'fake-child-author', nickname: 'Nested <author>' }, ...extra });

function renderer(provider = 'netease', options = {}) {
  const document = fixtureDocument();
  const requests = [], notices = [], logins = [], windowListeners = {};
  const account = { loggedIn: options.loggedIn !== false, userId: 'fake-account-a', epoch: 1 };
  const window = { getSelection: () => selection, addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); } };
  let selection = '';
  const ctx = vm.createContext({ document, window, URL, AbortController, Map, Set,
    trackDetailSeq: 1, detailCommentSong: null, detailCommentSort: 'latest', detailCommentsState: null, detailCommentSubmitBusy: false,
    songProviderKey: song => song.provider, coverUrlWithSize: value => value, coverProxySrc: value => value,
    songAccountLoginStatus: () => ({ ...account }), providerAuthEpoch: () => account.epoch, isSongAccountLoggedIn: () => account.loggedIn,
    showToast: value => notices.push(value), showLoginModal: value => logins.push(value), bindTrackDetailScrollers() {},
    closeGsapModal(_modal, done) { done(); }, toggleDetailCommentLike() {},
    apiJson(url, opts = {}) { return new Promise((resolve, reject) => requests.push({ url, opts, resolve, reject })); },
  });
  loadFunctions(ctx, 'public/js/modules/05-playback/00-api-quality-output.js', ['escHtml']);
  loadFunctions(ctx, detailScript, ['accountActionAuthSnapshot', 'accountActionAuthCurrent', 'detailCommentsConfig', 'detailCommentsSortable',
    'commentCountLabel', 'commentVipHtml', 'commentHeartSvg', 'commentLikeHtml', 'commentHeadHtml', 'commentTimeLabel', 'neteaseEmojiId', 'commentContentHtml',
    'renderDetailComments', 'bindDetailCommentLikes', 'renderDetailCommentComposer', 'cancelDetailCommentReads', 'detailCommentReadStore', 'invalidateDetailCommentReadCache',
    'readDetailComments', 'loadDetailComments', 'loadMoreDetailComments', 'updateDetailCommentsFooter', 'setDetailCommentSort', 'closeTrackDetailModal']);
  loadFunctions(ctx, repliesScript, ['detailReplyControlsHtml', 'bindDetailReplyControls', 'detailReplyRegion', 'updateDetailReplyControls',
    'toggleDetailReplies', 'renderDetailReplyItems', 'loadMoreDetailReplies']);
  vm.runInContext(readSource(composeScript), ctx, { filename: composeScript });
  const target = document.getElementById('song-comments');
  const song = { provider, id: '123', qqId: '123', mid: 'fake-song-mid', mixSongId: '123', providerSongId: '123' };
  const h = { ctx, document, target, song, requests, notices, logins, account,
    posts: () => requests.filter(request => request.opts.method === 'POST'),
    gets: () => requests.filter(request => !request.opts.method || request.opts.method === 'GET'),
    rows: () => target.querySelectorAll('[data-comment-reply-target]'),
    cards: () => target.querySelectorAll('.detail-reply-compose'),
    setSelection(value) { selection = value; },
    emitAuth() { for (const listener of windowListeners['provider-auth-session-changed'] || []) listener({ detail: { provider } }); },
    input() { return ctx.detailReplyDraft.card.querySelector('.detail-reply-input'); },
    action(kind) { return ctx.detailReplyDraft.card.querySelector('[data-comment-compose="' + kind + '"]'); },
    open(row = h.rows()[0], viaText = false) { (viaText ? row.querySelector(row.classList.contains('comment-reply-item') ? '.comment-reply-text' : '.comment-text') : row.querySelector('[data-comment-compose="open"]')).dispatch('click'); return ctx.detailReplyDraft; },
    type(content) { h.input().value = content; h.input().dispatch('input'); },
    async load(comments = [rootComment()], nextSong = song) {
      ctx.detailCommentSong = nextSong;
      const before = requests.length;
      const pending = ctx.loadDetailComments(nextSong, ctx.trackDetailSeq);
      if (requests.length > before) requests.at(-1).resolve({ comments, hasMore: false, nextCursor: '', nextOffset: 30 });
      await pending;
    },
    async replies(comments = [nestedComment()]) {
      const row = h.rows()[0];
      row.querySelector('[data-reply-action="toggle"]').dispatch('click');
      requests.at(-1).resolve({ comments, total: comments.length, hasMore: false, nextOffset: 20, nextCursor: '' });
      await flush();
      return h.rows().find(item => item.classList.contains('comment-reply-item'));
    },
  };
  return h;
}

test('reply capability is independent of root writing and unsupported Qishui renders no reply entry', async () => {
  for (const provider of ['netease', 'qq', 'kugou', 'qishui']) {
    const h = renderer(provider);
    await h.load();
    const config = h.ctx.detailCommentsState.config;
    assert.equal(config.canReply, provider !== 'qishui');
    assert.equal(config.canWrite, provider === 'netease' || provider === 'qishui');
    assert.equal(h.target.querySelectorAll('[data-comment-compose="open"]').length, provider === 'qishui' ? 0 : 1);
    assert.equal(h.rows().length, provider === 'qishui' ? 0 : 1);
    assert.equal(Boolean(h.ctx.renderDetailCommentComposer(config)), config.canWrite);
    if (provider !== 'qishui') { h.open(); assert.equal(h.cards().length, 1); assert.equal(h.posts().length, 0); }
    else { h.target.querySelector('.comment-text').dispatch('click'); assert.equal(h.cards().length, 0); }
  }
});

test('root and nested rendered reply targets send the exact clicked target on every supported provider', async () => {
  for (const provider of ['netease', 'qq', 'kugou']) {
    for (const nested of [false, true]) {
      const h = renderer(provider); await h.load();
      const row = nested ? await h.replies() : h.rows()[0];
      h.open(row, true);
      assert.equal(h.ctx.detailReplyDraft.target.nickname, nested ? 'Nested <author>' : 'Root <author>');
      assert.equal(h.ctx.detailReplyDraft.card.querySelector('.detail-reply-quote').textContent, nested ? 'Nested quote <safe>' : 'Root quote <safe>');
      assert.equal(h.ctx.detailReplyDraft.card.querySelectorAll('script').length, 0);
      h.type('  Exact reply\nsecond line  '); h.action('send').dispatch('click');
      const request = h.posts()[0];
      assert.equal(request.url, '/api/song/comment/reply');
      assert.equal(request.opts.timeoutMs, 20000);
      assert.equal(request.opts.signal, undefined, 'POST is outside the GET abort lifecycle');
      assert.equal(request.opts.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(request.opts.body), { provider, id: '123', parentId: 'root/+?', commentId: nested ? 'child/+?' : 'root/+?', resource: 'resource/+?', content: 'Exact reply\nsecond line' });
      request.resolve({ success: false, created: false, outcome: 'rejected' }); await flush();
    }
  }
});

test('zero or unknown reply counts still create a reply thread, while missing Kugou resource has no write target', async () => {
  for (const replyCount of [0, undefined, null]) {
    const h = renderer(); await h.load([rootComment('root', { replyCount })]);
    assert.equal(h.rows().length, 1);
    assert.equal(h.target.querySelector('[data-reply-action="toggle"]').hidden, true);
    assert(h.ctx.detailCommentsState.threads.root);
    h.open(); assert.equal(h.cards().length, 1);
  }
  const h = renderer('kugou'); await h.load([rootComment('root', { replyResource: '' })]);
  assert.equal(h.rows().length, 0);
  assert.equal(h.target.querySelector('[data-comment-compose="open"]'), null);
});

test('text selection, links, likes and expansion controls never open a reply composer', async () => {
  for (const provider of ['netease', 'qq', 'kugou']) {
    const h = renderer(provider); await h.load();
    const row = h.rows()[0];
    h.setSelection('selected comment text'); h.open(row, true);
    assert.equal(h.cards().length, 0); h.setSelection('');
    row.querySelector('.comment-text').insertAdjacentHTML('beforeend', '<a href="https://example.test/">a link</a>');
    row.querySelector('a').dispatch('click');
    row.querySelector('.comment-like-count').dispatch('click');
    assert.equal(h.cards().length, 0, provider + ' like display must not select its comment');
    row.querySelector('.comment-replies-panel').dispatch('click');
    row.querySelector('.comment-text').dispatch('click', { button: 2 });
    assert.equal(h.cards().length, 0, 'reply panel background and secondary clicks do not select the root');
    row.querySelector('[data-reply-action="toggle"]').dispatch('click');
    assert.equal(h.cards().length, 0);
    h.requests.at(-1).resolve({ comments: [nestedComment()], hasMore: false, nextOffset: 20 }); await flush();
    h.open(row, true); assert.equal(h.cards().length, 1);
    assert.equal(h.posts().length, 0);
  }
});

test('one inline draft cannot silently retarget after text is entered, and cancel restores trigger focus', async () => {
  const h = renderer(); await h.load([rootComment('root-a'), rootComment('root-b', { user: { nickname: 'Other author' } })]);
  const [a, b] = h.rows();
  h.open(a); const first = h.ctx.detailReplyDraft; h.open(a);
  assert.equal(h.ctx.detailReplyDraft, first); assert.equal(h.cards().length, 1);
  h.open(b); assert.notEqual(h.ctx.detailReplyDraft, first, 'an empty draft may switch targets');
  h.type('Keep this draft'); const populated = h.ctx.detailReplyDraft;
  h.open(a); assert.equal(h.ctx.detailReplyDraft, populated); assert.equal(h.input().value, 'Keep this draft');
  assert.match(populated.message, /先发送或取消/); assert.equal(h.document.activeElement, h.input());
  h.action('cancel').dispatch('click');
  assert.equal(h.cards().length, 0); assert.equal(h.ctx.detailReplyDraft, null);
  assert.equal(h.document.activeElement, b.querySelector('[data-comment-compose="open"]'));
  assert.equal(b.classList.contains('is-reply-selected'), false);
  assert.equal(h.posts().length, 0);
});

test('typing, ordinary Enter and IME keys do not post; only explicit Send or Ctrl/Meta Enter posts', async () => {
  for (const shortcut of ['send', 'ctrlKey', 'metaKey']) {
    const h = renderer(); await h.load(); h.open();
    assert.equal(h.action('send').disabled, true); h.type('A deliberate reply');
    assert.equal(h.posts().length, 0);
    const plain = h.input().dispatch('keydown', { key: 'Enter' }); assert.equal(plain.defaultPrevented, false);
    h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
    h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true, keyCode: 229 });
    h.input().dispatch('compositionstart'); h.input().dispatch('keydown', { key: 'Enter', metaKey: true });
    h.input().dispatch('compositionend'); assert.equal(h.posts().length, 0);
    if (shortcut === 'send') h.action('send').dispatch('click');
    else assert.equal(h.input().dispatch('keydown', { key: 'Enter', [shortcut]: true }).defaultPrevented, true);
    assert.equal(h.posts().length, 1);
    h.posts()[0].resolve({ created: false, success: false, outcome: 'rejected' }); await flush();
  }
});

test('maxlength and submit validation reject empty and oversized content without a service write', async () => {
  const h = renderer(); await h.load(); h.open();
  assert.equal(h.input().getAttribute('maxlength'), '280');
  for (const content of ['', ' \n ', 'x'.repeat(281)]) {
    h.type(content); assert.equal(h.action('send').disabled, true);
    h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true }); assert.equal(h.posts().length, 0);
  }
  h.type('x'.repeat(280)); assert.equal(h.action('send').disabled, false);
  assert.equal(h.ctx.detailReplyDraft.card.querySelector('.detail-reply-length').textContent, '280 / 280');
  h.action('send').dispatch('click'); assert.equal(JSON.parse(h.posts()[0].opts.body).content.length, 280);
  h.posts()[0].resolve({ created: false, success: false, outcome: 'rejected' }); await flush();
});

test('repeated Send and shortcuts make one POST; known rejection retains the draft for explicit retry', async () => {
  const h = renderer(); await h.load(); h.open(); h.type('Do not duplicate');
  const card = h.ctx.detailReplyDraft.card;
  h.action('send').dispatch('click'); h.action('send').dispatch('click');
  h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true });
  assert.equal(h.posts().length, 1); assert.equal(h.input().disabled, true); assert.equal(h.action('cancel').disabled, true);
  h.posts()[0].resolve({ created: false, success: false, outcome: 'rejected', error: 'UPSTREAM_REJECTED' }); await flush();
  assert.equal(h.ctx.detailReplyDraft.card, card); assert.equal(h.input().value, 'Do not duplicate');
  assert.equal(h.action('send').disabled, false); assert.match(h.ctx.detailReplyDraft.message, /草稿已保留/);
  await flush(); assert.equal(h.posts().length, 1, 'rejection never triggers automatic retry');
  h.action('send').dispatch('click'); assert.equal(h.posts().length, 2);
  assert.equal(h.posts()[1].opts.body, h.posts()[0].opts.body);
  h.posts()[1].resolve({ created: false, success: false, outcome: 'rejected' }); await flush();
});

test('only positively confirmed creation clears its draft, invalidates cached GETs and refreshes comments', async () => {
  const h = renderer(); await h.load(); h.open(); h.type('Confirmed reply');
  h.action('send').dispatch('click');
  h.posts()[0].resolve({ created: true, success: true, outcome: 'created' }); await flush();
  assert.equal(h.ctx.detailReplyDraft, null); assert.equal(h.cards().length, 0);
  assert.deepEqual(h.notices, ['回复已发送']); assert.equal(h.gets().length, 2);
  h.gets()[1].resolve({ comments: [rootComment('refreshed')], hasMore: false }); await flush();
  assert.equal(h.ctx.detailCommentsState.count, 1);
  assert.equal(h.posts().length, 1);
});

test('official-client verification rejection keeps the draft and allows only explicit retry without opening challenge links', async () => {
  const h = renderer('kugou'); await h.load(); h.open(); h.type('Reply needing account verification');
  const draft = h.ctx.detailReplyDraft;
  h.action('send').dispatch('click');
  h.posts()[0].resolve({ created: false, success: false, outcome: 'rejected', error: 'COMMENT_REPLY_VERIFICATION_REQUIRED',
    message: 'Visit an untrusted challenge', verifyUrl: 'https://evil.test/challenge?token=fake-token' });
  await flush();
  assert.equal(h.ctx.detailReplyDraft, draft); assert.equal(h.input().value, 'Reply needing account verification');
  assert.match(draft.message, /官方客户端完成安全验证/); assert.match(draft.message, /草稿已保留/);
  assert.equal(h.action('send').disabled, false); assert.equal(h.ctx.detailReplyWriteLedger.size, 0);
  assert.equal(draft.card.querySelector('a'), null); assert(!draft.card.textContent.includes('evil.test'));
  assert.equal(h.logins.length, 0); assert.deepEqual(h.notices, []);
  const requests = h.requests.length; await flush(); assert.equal(h.requests.length, requests, 'no automatic challenge or POST request');
  h.action('send').dispatch('click'); assert.equal(h.posts().length, 2);
  h.posts()[1].resolve({ created: false, success: false, outcome: 'rejected', error: 'COMMENT_REPLY_VERIFICATION_REQUIRED' }); await flush();
});

test('timeout and unknown responses retain and lock their draft; Refresh is GET-only and preserves its card', async () => {
  for (const result of ['timeout', 'unknown', 'partial-success', 'partial-rejection']) {
    const h = renderer(); await h.load(); await h.replies(); h.open(h.rows().find(row => row.classList.contains('comment-reply-item'))); h.type('Possibly already sent');
    const draft = h.ctx.detailReplyDraft, card = draft.card, owner = draft.owner;
    h.action('send').dispatch('click');
    if (result === 'timeout') h.posts()[0].reject(Object.assign(new Error('deadline exceeded'), { name: 'TimeoutError' }));
    else h.posts()[0].resolve(result === 'unknown' ? { outcome: 'unknown' } : result === 'partial-success' ? { created: true, success: true } : { created: false, outcome: 'rejected' });
    await flush();
    assert.equal(h.ctx.detailReplyDraft, draft); assert.equal(h.input().value, 'Possibly already sent');
    assert.equal(draft.unknown, true); assert.equal(h.action('send').disabled, true); assert.equal(h.action('refresh').hidden, false);
    assert.match(draft.message, /可能已发出/); assert.equal(h.posts().length, 1); assert.deepEqual(h.notices, []);
    h.action('send').dispatch('click'); h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true }); await flush();
    assert.equal(h.posts().length, 1, 'unknown never retries a POST');
    const before = h.gets().length; h.action('refresh').dispatch('click'); h.action('refresh').dispatch('click');
    assert.equal(h.gets().length, before + 1); assert.equal(h.action('refresh').disabled, true);
    const request = h.gets().at(-1);
    assert.match(request.url, /\/api\/song\/comment\/replies\?/); assert.match(request.url, /parentId=root%2F%2B%3F/); assert.match(request.url, /offset=0&cursor=$/);
    assert.equal(request.opts.timeoutMs, 15000);
    request.resolve({ comments: [nestedComment(), nestedComment('new-child')], hasMore: false, total: 2, nextOffset: 20 }); await flush();
    assert.equal(h.ctx.detailReplyDraft, draft); assert.equal(draft.owner, owner); assert.equal(draft.card, card);
    assert.equal(card.isConnected, true); assert.equal(h.input().value, 'Possibly already sent');
    assert.equal(h.action('send').disabled, true); assert.equal(h.posts().length, 1);
    assert.equal(h.target.querySelectorAll('.comment-reply-item').length, 2, 'refresh deduplicates existing rows while preserving the selected row');
    assert.match(draft.message, /草稿已保留/);
  }
});

test('an uncertain zero-reply root can refresh its hidden thread and stays locked after cancel/reopen', async () => {
  const h = renderer(); await h.load([rootComment('empty-root', { replyCount: 0 })]); h.open(); h.type('Uncertain root reply');
  h.action('send').dispatch('click'); h.posts()[0].reject(new Error('lost response')); await flush();
  const key = h.ctx.detailReplyDraft.target.key;
  h.action('refresh').dispatch('click'); assert.match(h.gets().at(-1).url, /parentId=empty-root/);
  h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
  assert.equal(h.action('send').disabled, true);
  h.action('cancel').dispatch('click'); h.open();
  assert.equal(h.ctx.detailReplyDraft.target.key, key); assert.equal(h.ctx.detailReplyDraft.unknown, true);
  h.type('Uncertain root reply'); h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true });
  assert.equal(h.posts().length, 1);
});

test('uncertain identities survive Close and sort when the lost result arrives before or after reopening', async () => {
  for (const change of ['close', 'sort']) {
    for (const resultTiming of ['before-reopen', 'after-reopen']) {
      const h = renderer(); await h.load(); h.open(); h.type('Private draft text must not be persisted'); h.action('send').dispatch('click');
      const firstIdentity = h.ctx.detailReplyDraft.identity, post = h.posts()[0];
      if (resultTiming === 'before-reopen') { post.reject(new Error('response lost')); await flush(); }
      if (change === 'close') { h.ctx.closeTrackDetailModal(); await h.load(); }
      else { const pending = h.ctx.setDetailCommentSort('hot'); h.gets().at(-1).resolve({ comments: [rootComment()], hasMore: false }); await pending; }
      h.open(); h.type('A new copy of the reply');
      const reopened = h.ctx.detailReplyDraft;
      assert.equal(reopened.identity, firstIdentity, 'stable identity does not depend on rendering sequence or sorting');
      if (resultTiming === 'after-reopen') { post.reject(new Error('late response lost')); await flush(); }
      assert.equal(h.ctx.detailReplyDraft, reopened); assert.equal(h.input().value, 'A new copy of the reply');
      assert.equal(reopened.unknown, true); assert.equal(h.action('send').disabled, true); assert.equal(h.action('refresh').hidden, false);
      h.input().dispatch('keydown', { key: 'Enter', ctrlKey: true }); assert.equal(h.posts().length, 1);
      const record = h.ctx.detailReplyWriteLedger.get(firstIdentity);
      assert.equal(record.outcome, 'unknown');
      assert(!JSON.stringify([...h.ctx.detailReplyWriteLedger]).includes('Private draft text'));
      assert(!JSON.stringify([...h.ctx.detailReplyWriteLedger]).includes('A new copy'));
      assert.deepEqual(h.notices, []);
    }
  }
});

test('the bounded uncertainty ledger never evicts an unknown attempt to allow another write', async () => {
  const h = renderer();
  assert.equal(h.ctx.detailReplyWriteLedgerLimit, 32);
  await h.load(Array.from({ length: 33 }, (_unused, index) => rootComment('root-' + index)));
  for (let index = 0; index < 32; index++) {
    h.open(h.rows()[index]); h.type('Temporary reply ' + index); h.action('send').dispatch('click');
    assert.equal(h.posts().length, index + 1);
    h.posts()[index].resolve({ outcome: 'unknown' }); await flush(); h.action('cancel').dispatch('click');
  }
  const firstIdentity = [...h.ctx.detailReplyWriteLedger.keys()][0];
  h.open(h.rows()[32]); h.type('Do not evict another unknown'); h.action('send').dispatch('click'); await flush();
  assert.equal(h.posts().length, 32); assert.equal(h.ctx.detailReplyWriteLedger.size, 32);
  assert.equal(h.ctx.detailReplyWriteLedger.get(firstIdentity).outcome, 'unknown'); assert.match(h.ctx.detailReplyDraft.message, /尚未确认/);
  h.action('cancel').dispatch('click'); h.open(h.rows()[0]); h.type('Original uncertain reply');
  assert.equal(h.action('send').disabled, true); assert.equal(h.ctx.detailReplyDraft.unknown, true);
  h.account.epoch++; h.emitAuth(); assert.equal(h.ctx.detailReplyWriteLedger.size, 0);
  h.gets().at(-1).resolve({ comments: [rootComment('root-0')], hasMore: false }); await flush();
  h.open(); h.type('New session reply'); assert.equal(h.action('send').disabled, false);
});

test('unknown refresh failures retain the draft and offer another GET refresh without unlocking a POST', async () => {
  const h = renderer(); await h.load(); h.open(); h.type('Unconfirmed reply'); h.action('send').dispatch('click');
  h.posts()[0].resolve({ outcome: 'unknown' }); await flush();
  const draft = h.ctx.detailReplyDraft, card = draft.card;
  h.action('refresh').dispatch('click'); h.gets().at(-1).reject(new Error('read offline')); await flush();
  assert.equal(h.ctx.detailReplyDraft, draft); assert.equal(draft.card, card); assert.equal(h.input().value, 'Unconfirmed reply');
  assert.equal(h.action('send').disabled, true); assert.equal(h.action('refresh').disabled, false); assert.match(draft.message, /刷新(?:失败|未完成).*草稿已保留/);
  const gets = h.gets().length; await flush(); assert.equal(h.gets().length, gets, 'failed refresh has no automatic GET retry');
  h.action('refresh').dispatch('click'); assert.equal(h.gets().length, gets + 1); assert.equal(h.posts().length, 1);
  h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush(); assert.equal(h.action('send').disabled, true);
});

test('only an explicit confirm-unsent after a fresh successful GET unlocks editing, preserves text and never posts', async () => {
  for (const provider of ['netease', 'qq', 'kugou']) {
    const h = renderer(provider); await h.load();
    const row = provider === 'netease' ? await h.replies() : h.rows()[0];
    h.open(row); h.type('Uncertain text remains available'); h.action('send').dispatch('click');
    h.posts()[0].resolve({ created: false, success: false, outcome: 'unknown' }); await flush();
    const draft = h.ctx.detailReplyDraft, identity = draft.identity, card = draft.card;
    assert.equal(draft.checked, false); assert.equal(h.action('confirm-unsent').hidden, true);
    h.action('confirm-unsent').dispatch('click'); h.ctx.confirmDetailReplyUnsent();
    assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown'); assert.equal(h.action('send').disabled, true);
    h.action('refresh').dispatch('click');
    assert.equal(h.action('confirm-unsent').hidden, true); assert.equal(h.action('send').disabled, true);
    h.ctx.confirmDetailReplyUnsent(); assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown');
    h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
    assert.equal(draft.checked, true); assert.equal(draft.unknown, true); assert.equal(h.action('send').disabled, true);
    const confirm = h.action('confirm-unsent'); assert.equal(confirm.hidden, false); assert.equal(confirm.disabled, false);
    assert.equal(confirm.textContent, '确认未发送，重新编辑');
    assert.equal(h.posts().length, 1, 'successful GET by itself never retries');
    confirm.dispatch('click'); confirm.dispatch('click'); h.ctx.confirmDetailReplyUnsent(); await flush();
    assert.equal(h.ctx.detailReplyDraft, draft); assert.equal(draft.card, card); assert.equal(h.input().value, 'Uncertain text remains available');
    assert.equal(draft.unknown, false); assert.equal(draft.checked, false); assert.equal(h.ctx.detailReplyWriteLedger.has(identity), false);
    assert.equal(h.action('send').disabled, false); assert.equal(h.action('confirm-unsent').hidden, true); assert.equal(h.posts().length, 1);
    assert.equal(h.document.activeElement, h.input()); assert.match(draft.message, /继续编辑.*再发送/);
    h.type('Explicitly edited retry'); h.action('send').dispatch('click'); assert.equal(h.posts().length, 2);
    assert.equal(JSON.parse(h.posts()[1].opts.body).content, 'Explicitly edited retry');
    assert.equal(JSON.parse(h.posts()[1].opts.body).commentId, provider === 'netease' ? 'child/+?' : 'root/+?');
    h.posts()[1].resolve({ created: false, success: false, outcome: 'rejected' }); await flush();
  }
});

test('reopening an uncertain target requires another fresh GET before confirm-unsent is available', async () => {
  const h = renderer(); await h.load(); h.open(); h.type('Unconfirmed reply'); h.action('send').dispatch('click');
  h.posts()[0].resolve({ outcome: 'unknown' }); await flush();
  const identity = h.ctx.detailReplyDraft.identity;
  h.action('refresh').dispatch('click'); h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
  assert.equal(h.ctx.detailReplyDraft.checked, true); assert.equal(h.action('confirm-unsent').hidden, false);
  h.action('cancel').dispatch('click'); h.open(); h.type('Same uncertain target reopened');
  assert.equal(h.ctx.detailReplyDraft.identity, identity); assert.equal(h.ctx.detailReplyDraft.checked, false);
  assert.equal(h.action('confirm-unsent').hidden, true); assert.equal(h.action('send').disabled, true);
  h.action('confirm-unsent').dispatch('click'); h.ctx.confirmDetailReplyUnsent();
  assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown'); assert.equal(h.posts().length, 1);
});

test('GET errors, aborts and unavailable regions never grant confirm-unsent; a failed repeat refresh revokes prior checking', async () => {
  for (const failure of ['error', 'abort', 'missing-region', 'missing-thread']) {
    const h = renderer(); await h.load(); h.open(); h.type('Retain after unsuccessful read'); h.action('send').dispatch('click');
    h.posts()[0].resolve({ outcome: 'unknown' }); await flush();
    const draft = h.ctx.detailReplyDraft, identity = draft.identity, thread = draft.owner.threads[draft.target.threadKey];
    h.action('refresh').dispatch('click'); h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
    assert.equal(draft.checked, true);
    if (failure === 'missing-region') h.document.getElementById(thread.id).remove();
    if (failure === 'missing-thread') delete draft.owner.threads[draft.target.threadKey];
    const requests = h.requests.length;
    h.action('refresh').dispatch('click');
    assert.equal(h.action('confirm-unsent').hidden, true, failure + ' revokes prior confirmation eligibility immediately');
    if (failure === 'error') h.gets().at(-1).reject(new Error('offline'));
    if (failure === 'abort') h.gets().at(-1).reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    if (failure === 'missing-region' || failure === 'missing-thread') assert.equal(h.requests.length, requests, 'early-return path has no GET');
    await flush();
    assert.equal(draft.checked, false); assert.equal(h.action('confirm-unsent').hidden, true); assert.equal(h.action('send').disabled, true);
    if (failure !== 'missing-thread') assert.match(draft.message, /刷新未完成.*草稿已保留/);
    h.action('confirm-unsent').dispatch('click'); h.ctx.confirmDetailReplyUnsent();
    assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown'); assert.equal(h.input().value, 'Retain after unsuccessful read'); assert.equal(h.posts().length, 1);
  }
});

test('a pending reply GET hides and blocks confirm-unsent and an early refresh cannot reuse old checked eligibility', async () => {
  const h = renderer(); await h.load(); h.open(); h.type('Wait for a completed read'); h.action('send').dispatch('click');
  h.posts()[0].resolve({ outcome: 'unknown' }); await flush();
  const draft = h.ctx.detailReplyDraft, thread = draft.owner.threads[draft.target.threadKey], identity = draft.identity;
  h.action('refresh').dispatch('click'); h.gets().at(-1).resolve({ comments: [], hasMore: true, nextCursor: 'next', nextOffset: 20 }); await flush();
  assert.equal(draft.checked, true);
  const pending = h.ctx.loadMoreDetailReplies(draft.target.threadKey); assert.equal(thread.loading, true);
  assert.equal(h.action('confirm-unsent').hidden, true, 'an active thread GET is not a completed user refresh');
  h.ctx.confirmDetailReplyUnsent(); assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown');
  const gets = h.gets().length; h.action('refresh').dispatch('click');
  assert.equal(h.gets().length, gets); assert.equal(draft.checked, false); assert.equal(h.action('confirm-unsent').hidden, true);
  h.ctx.confirmDetailReplyUnsent(); assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown');
  h.gets().at(-1).resolve({ comments: [], hasMore: false }); await pending;
  assert.equal(draft.checked, false); assert.equal(h.posts().length, 1);
});

test('an unrelated pending POST blocks confirm-unsent even after a successful read until that attempt finishes', async () => {
  const h = renderer(); await h.load([rootComment('uncertain'), rootComment('other')]); h.open(h.rows()[0]); h.type('Uncertain attempt'); h.action('send').dispatch('click');
  h.posts()[0].resolve({ outcome: 'unknown' }); await flush();
  h.action('cancel').dispatch('click'); h.open(h.rows()[1]); h.type('Other in-flight attempt'); h.action('send').dispatch('click');
  h.ctx.closeTrackDetailModal(); await h.load([rootComment('uncertain'), rootComment('other')]); h.open(h.rows()[0]); h.type('Keep uncertain reply');
  const draft = h.ctx.detailReplyDraft, identity = draft.identity;
  h.action('refresh').dispatch('click'); h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
  assert.equal(draft.checked, true); assert.equal(h.action('confirm-unsent').hidden, true); assert.equal(h.action('send').disabled, true);
  h.ctx.confirmDetailReplyUnsent(); assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown'); assert.equal(h.posts().length, 2);
  h.posts()[1].resolve({ created: false, success: false, outcome: 'rejected' }); await flush();
  assert.equal(h.action('confirm-unsent').hidden, false); assert.equal(h.action('send').disabled, true);
  h.action('confirm-unsent').dispatch('click'); assert.equal(h.action('send').disabled, false); assert.equal(h.posts().length, 2);
});

test('confirm-unsent cannot clear an uncertain record after authentication or owner identity changes', async () => {
  for (const change of ['account', 'epoch', 'track', 'owner']) {
    const h = renderer(); await h.load(); h.open(); h.type('Account-scoped uncertain reply'); h.action('send').dispatch('click');
    h.posts()[0].resolve({ outcome: 'unknown' }); await flush();
    const draft = h.ctx.detailReplyDraft, identity = draft.identity;
    h.action('refresh').dispatch('click'); h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
    assert.equal(draft.checked, true);
    if (change === 'account') h.account.userId = 'fake-account-b';
    if (change === 'epoch') h.account.epoch++;
    if (change === 'track') h.ctx.trackDetailSeq++;
    if (change === 'owner') h.ctx.detailCommentsState = { ...draft.owner };
    h.ctx.confirmDetailReplyUnsent();
    assert.equal(h.ctx.detailReplyWriteLedger.get(identity).outcome, 'unknown'); assert.equal(draft.unknown, true); assert.equal(h.posts().length, 1);
    assert.equal(draft.card.querySelector('.detail-reply-input').value, 'Account-scoped uncertain reply');
  }
});

test('successful stale writes preserve an active new-owner GET but prevent its pre-write response entering cache', async () => {
  const h = renderer(); await h.load(); h.open(); h.type('Old owner write'); h.action('send').dispatch('click');
  const nextSong = { ...h.song, id: '456' }; h.ctx.trackDetailSeq++; h.ctx.detailCommentSong = nextSong;
  const pendingRead = h.ctx.loadDetailComments(nextSong, h.ctx.trackDetailSeq), get = h.gets().at(-1);
  const owner = h.ctx.detailCommentsState, before = h.gets().length;
  assert.equal(owner.loading, true);
  h.posts()[0].resolve({ success: true, created: true, outcome: 'created' }); await flush();
  assert.equal(get.opts.signal.aborted, false); assert.equal(owner.loading, true); assert.equal(h.gets().length, before);
  assert.deepEqual(h.notices, []); assert.equal(h.ctx.detailCommentsState, owner);
  get.resolve({ comments: [rootComment('new-owner-root')], hasMore: false }); await pendingRead;
  assert.equal(owner.count, 1); assert.equal(owner.error, false);
  const store = h.ctx.detailCommentReadStore();
  assert.equal(store.cache.has('netease|1|' + get.url), false, 'read started before the write cannot become a fresh cache hit');
  const freshRead = h.ctx.readDetailComments(owner, get.url, true); assert.equal(h.gets().length, before + 1);
  h.gets().at(-1).resolve({ comments: [rootComment('after-write')], hasMore: false }); await freshRead;
  assert.equal(store.cache.get('netease|1|' + get.url).result.comments[0].id, 'after-write');
});

test('preserved pending GETs are detached from reuse and their finally cannot delete a same-key replacement', async () => {
  const h = renderer(); await h.load();
  const owner = h.ctx.detailCommentsState, url = '/api/song/comments?id=isolated&limit=30', key = 'netease|1|' + url;
  const oldRead = h.ctx.readDetailComments(owner, url, true), oldRequest = h.gets().at(-1), store = h.ctx.detailCommentReadStore();
  const oldTask = store.pending.get(key);
  const qqOwner = { config: { provider: 'qq' } }, otherUrl = '/api/qq/song/comments?id=other&limit=30', otherKey = 'qq|1|' + otherUrl;
  const otherRead = h.ctx.readDetailComments(qqOwner, otherUrl, true), otherRequest = h.gets().at(-1), otherTask = store.pending.get(otherKey);
  h.ctx.invalidateDetailCommentReadCache('netease', true);
  assert.equal(oldRequest.opts.signal.aborted, false); assert.equal(oldTask.noCache, true); assert.equal(store.pending.has(key), false);
  assert.equal(store.pending.get(otherKey), otherTask); assert.equal(otherRequest.opts.signal.aborted, false);
  const newRead = h.ctx.readDetailComments(owner, url, true), newRequest = h.gets().at(-1), replacement = store.pending.get(key);
  assert.notEqual(newRequest, oldRequest); assert.notEqual(replacement, oldTask);
  oldRequest.resolve({ comments: [rootComment('old-cache')], hasMore: false }); await oldRead;
  assert.equal(store.pending.get(key), replacement); assert.equal(store.cache.has(key), false);
  newRequest.resolve({ comments: [rootComment('new-cache')], hasMore: false }); await newRead;
  assert.equal(store.pending.has(key), false); assert.equal(store.cache.get(key).result.comments[0].id, 'new-cache');
  otherRequest.resolve({ comments: [], hasMore: false }); await otherRead; assert.equal(store.cache.has(otherKey), true);
});

test('actual text-only escHtml keeps malicious nickname and quote text out of HTML attributes', async () => {
  const h = renderer();
  const nickname = '\" autofocus onfocus=\"attack\"><script>evil</script>';
  await h.load([rootComment('root', { content: '<script>evil</script> & "quotes"', user: { nickname } })]);
  h.open(); const card = h.ctx.detailReplyDraft.card;
  assert.equal(card.querySelector('.detail-reply-target span').textContent, nickname);
  assert.equal(card.querySelector('.detail-reply-quote').textContent, '<script>evil</script> & "quotes"');
  assert.equal(card.querySelector('.detail-reply-input').getAttribute('aria-label'), '回复内容');
  assert.equal(h.target.querySelectorAll('script, [autofocus], [onfocus]').length, 0);
  assert.equal(h.target.querySelector('.comment-replies-panel').getAttribute('aria-label'), '评论回复');
  assert.equal(h.posts().length, 0);
});

test('closing, changing tracks, sorting and account changes prevent late POST results from altering the new owner', async () => {
  for (const change of ['close', 'track', 'sort', 'account']) {
    for (const outcome of ['created', 'rejected', 'timeout']) {
      const h = renderer(); await h.load(); h.open(); h.type('Old account/song reply'); h.action('send').dispatch('click');
      const oldRequest = h.posts()[0];
      if (change === 'close') { h.ctx.closeTrackDetailModal(); await h.load([rootComment('new-root')], { ...h.song, id: '456' }); }
      if (change === 'track') { h.ctx.trackDetailSeq++; await h.load([rootComment('new-root')], { ...h.song, id: '456' }); }
      if (change === 'sort') {
        const pending = h.ctx.setDetailCommentSort('hot'); h.gets().at(-1).resolve({ comments: [rootComment('new-root')], hasMore: false }); await pending;
      }
      if (change === 'account') {
        h.account.userId = 'fake-account-b'; h.account.epoch++; h.emitAuth();
        h.gets().at(-1).resolve({ comments: [rootComment('new-root')], hasMore: false }); await flush();
      }
      h.open(); h.type('New owner draft');
      const draft = h.ctx.detailReplyDraft, owner = h.ctx.detailCommentsState, card = draft.card, reads = h.gets().length;
      if (outcome === 'timeout') oldRequest.reject(new Error('late lost response'));
      else oldRequest.resolve(outcome === 'created' ? { created: true, success: true, outcome } : { created: false, success: false, outcome, error: 'LOGIN_REQUIRED' });
      await flush();
      assert.equal(h.ctx.detailReplyDraft, draft, change + '/' + outcome); assert.equal(h.ctx.detailCommentsState, owner);
      assert.equal(draft.card, card); assert.equal(h.input().value, 'New owner draft'); assert.equal(draft.message, ''); assert.equal(draft.unknown, false);
      assert.equal(h.gets().length, reads, 'stale completion cannot refresh the new owner'); assert.deepEqual(h.notices, []);
      assert.equal(h.posts().length, 1); assert.equal(h.action('send').disabled, false, 'old pending write releases its lock without clearing the new draft');
    }
  }
});

test('opening and sending both enforce authentication, including an epoch change without a delivered event', async () => {
  const loggedOut = renderer('qq', { loggedIn: false }); await loggedOut.load(); loggedOut.open();
  assert.equal(loggedOut.cards().length, 0); assert.equal(loggedOut.posts().length, 0);
  assert.equal(loggedOut.logins.length, 1); assert.equal(loggedOut.logins[0].provider, 'qq'); assert.match(loggedOut.notices[0], /登录/);
  for (const change of ['logout', 'account', 'epoch']) {
    const h = renderer(); await h.load(); h.open(); h.type('Authenticated only');
    if (change === 'logout') h.account.loggedIn = false;
    if (change === 'account') h.account.userId = 'fake-account-b';
    if (change === 'epoch') h.account.epoch++;
    h.action('send').dispatch('click'); await flush();
    assert.equal(h.posts().length, 0, change + ' must reject the stale auth snapshot'); assert.equal(h.ctx.detailReplyDraft, null);
  }
  const h = renderer(); await h.load(); h.open(); h.type('Cancel on auth event');
  h.account.epoch++; h.emitAuth(); assert.equal(h.ctx.detailReplyDraft, null); assert.equal(h.cards().length, 0);
  h.gets().at(-1).resolve({ comments: [], hasMore: false }); await flush();
});

test('Escape restores focus, pending writes cannot be cancelled, and delegated listeners stay bound once across rerenders', async () => {
  const h = renderer(); await h.load();
  const firstCounts = ['click', 'input', 'keydown', 'compositionstart', 'compositionend'].map(type => h.target.listenerCount(type));
  assert.deepEqual(firstCounts, [3, 1, 1, 1, 1]);
  for (let i = 0; i < 3; i++) {
    h.ctx.bindDetailReplyComposer(h.target); h.ctx.bindDetailReplyControls(h.target); h.ctx.bindDetailCommentLikes(h.target);
    await h.load([rootComment('rerender-' + i)], { ...h.song, id: String(456 + i) });
    h.open(); const trigger = h.ctx.detailReplyDraft.trigger;
    const event = h.input().dispatch('keydown', { key: 'Escape' });
    assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true); assert.equal(h.cards().length, 0); assert.equal(h.document.activeElement, trigger);
  }
  assert.deepEqual(['click', 'input', 'keydown', 'compositionstart', 'compositionend'].map(type => h.target.listenerCount(type)), firstCounts);
  h.open(); h.type('In flight'); h.action('send').dispatch('click');
  h.input().dispatch('keydown', { key: 'Escape' }); assert.equal(h.cards().length, 1); assert.equal(h.posts().length, 1);
  h.posts()[0].resolve({ created: false, success: false, outcome: 'rejected' }); await flush(); h.action('cancel').dispatch('click'); assert.equal(h.cards().length, 0);
});

test('composer loads after its renderer dependencies and has narrow-panel containment rules (source guards, not layout QA)', () => {
  const loader = readSource('public/js/index-loader.js');
  assert(loader.indexOf(detailScript.replace('public/', '')) < loader.indexOf(composeScript.replace('public/', '')));
  assert(loader.indexOf(repliesScript.replace('public/', '')) < loader.indexOf(composeScript.replace('public/', '')));
  assert.equal(loader.split(composeScript.replace('public/', '')).length - 1, 1);
  const css = readSource('public/css/index.css');
  const rule = selector => {
    const start = css.lastIndexOf(selector + ' {'); assert(start >= 0, selector + ' rule missing');
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  assert.match(rule('#song-comments .detail-reply-input'), /box-sizing:\s*border-box/);
  assert.match(rule('#song-comments .detail-reply-input'), /width:\s*100%/);
  assert.match(css, /#song-comments \.detail-reply-compose\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /#song-comments \.detail-reply-compose-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(rule('#song-comments .detail-reply-target span'), /text-overflow:\s*ellipsis/);
  assert.match(rule('#song-comments .detail-reply-quote'), /text-overflow:\s*ellipsis/);
});
