'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const moduleRoot = path.join(__dirname, '../public/js/modules/06-lyrics');
// A pinned baseline source directory lets this same geometry fixture act as a
// negative control without changing the working tree or running the app.
const sourceRoot = process.env.MINERADIO_PLAYLIST_CLIP_SOURCE_DIR || moduleRoot;
function source(name) { return fs.readFileSync(path.join(sourceRoot, name), 'utf8'); }
function load(context, file, names) {
  const text = source(file);
  for (const name of names) {
    const start = text.indexOf('function ' + name + '(');
    assert(start >= 0, name + ' is missing');
    let end = text.indexOf('{', start), depth = 0;
    for (; end < text.length; end++) {
      if (text[end] === '{') depth++;
      if (text[end] === '}' && --depth === 0) break;
    }
    vm.runInContext(text.slice(start, end + 1), context, { filename: file });
  }
}
function classList(...initial) {
  const values = new Set(initial);
  return {
    contains: value => values.has(value),
    add: (...items) => items.forEach(item => values.add(item)),
    remove: (...items) => items.forEach(item => values.delete(item)),
    toggle(value, force) { if (force) values.add(value); else values.delete(value); }
  };
}
function fixture({ tab = 'queue', scale = 1, scroll = 220, headerHeight, width = 340, rows = 500 } = {}) {
  if (headerHeight == null) headerHeight = width <= 280 ? 124 : 100;
  const events = {}, ready = [], frames = [], observers = [], mutations = [], css = new Map();
  const panes = {}, lists = {}, toolbars = {}, elements = {};
  const ids = { queue: ['queue-pane', 'queue-list'], playlists: ['pl-pane', 'pl-list'], podcasts: ['podcast-pane', 'podcast-list'] };
  const heights = { queue: 40, playlists: 52, podcasts: 64 };
  const panelTop = 40;
  const panel = {
    offsetHeight: 400, clientHeight: 400, clientWidth: width, scrollHeight: rows * 64 + 220,
    scrollTop: scroll, style: { setProperty: (key, value) => css.set(key, value) },
    classList: classList('show', 'pinned'), dataset: {},
    getBoundingClientRect: () => ({ top: panelTop, bottom: panelTop + 400 * scale, height: 400 * scale }),
    addEventListener: (event, callback) => (events[event] || (events[event] = [])).push(callback),
    querySelector(selector) {
      if (selector === '.playlist-panel-sticky') return header;
      for (const key of Object.keys(ids)) {
        if (selector === '#' + ids[key][1]) return lists[key];
        if (selector === '#' + ids[key][0] + ' .queue-toolbar') return toolbars[key];
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.queue-toolbar') return Object.values(toolbars);
      if (selector === '.queue-toolbar, #queue-list, #pl-list, #podcast-list') return [...Object.values(toolbars), ...Object.values(lists)];
      return [];
    }
  };
  const header = {
    offsetHeight: headerHeight,
    getBoundingClientRect: () => ({ top: panelTop, bottom: panelTop + header.offsetHeight * scale, height: header.offsetHeight * scale })
  };
  for (const key of Object.keys(ids)) {
    panes[key] = { style: { display: key === tab ? '' : 'none' } };
    lists[key] = {
      id: ids[key][1], style: {}, innerHTML: '', offsetHeight: rows * 64,
      getBoundingClientRect: () => ({
        top: panelTop + (header.offsetHeight + 8 + heights[key] + 8 - panel.scrollTop) * scale,
        height: rows * 64 * scale
      })
    };
    toolbars[key] = {
      get offsetHeight() { return panes[key].style.display === 'none' ? 0 : heights[key]; },
      getBoundingClientRect: () => ({
        top: panelTop + (header.offsetHeight + 8) * scale,
        bottom: panelTop + (header.offsetHeight + 8 + heights[key]) * scale,
        height: heights[key] * scale
      })
    };
    elements[ids[key][0]] = panes[key];
    elements[ids[key][1]] = lists[key];
  }
  elements['playlist-panel'] = panel;
  for (const id of ['tab-queue', 'tab-pl', 'tab-podcast']) elements[id] = { classList: classList() };
  const context = vm.createContext({
    console, document: {
      getElementById: id => elements[id] || null,
      addEventListener: (event, callback) => { if (event === 'DOMContentLoaded') ready.push(callback); }
    },
    window: { ResizeObserver: true },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.nodes = []; observers.push(this); }
      observe(node) { this.nodes.push(node); }
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; mutations.push(this); }
      observe() {}
    },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
    getComputedStyle: node => node === panel ? { paddingTop: '18px' } : { top: '-18px' },
    playQueue: [], queueViewTab: tab,
    normalizePlaylistPanelTab: value => value,
    savePlaylistPanelTabPreference() {}, refreshUserPlaylists() {},
    animatePlaylistPanelCurrentTab() {}, updatePanelTabIndicator() {}
  });
  return {
    context, panel, header, lists, toolbars, panes, events, observers, mutations, css,
    activate(key) { for (const item of Object.keys(panes)) panes[item].style.display = item === key ? '' : 'none'; },
    ready() { ready.forEach(callback => callback()); },
    flush() { const pending = frames.splice(0); pending.forEach(callback => callback()); },
    scale, toolbarHeights: heights
  };
}
function loadGeometry(f) {
  load(f.context, '01a-scroll-motion.js', ['playlistPanelTopInset', 'syncPlaylistPanelContentClip']);
}
function assertSafeClip(f, key) {
  const list = f.lists[key];
  const match = /^inset\((\d+)px 0px 0px\)$/.exec(list.style.clipPath || '');
  assert(match, key + ' must clip overscanned rows at the list ancestor');
  const clipTop = Number(match[1]);
  const listTop = list.getBoundingClientRect().top;
  const safeTop = Math.max(f.header.getBoundingClientRect().bottom, f.toolbars[key].getBoundingClientRect().bottom) + 8 * f.scale;
  const paintedTop = listTop + clipTop * f.scale;
  assert(paintedTop >= safeTop - 1e-8, key + ' rows still paint beneath controls');
  assert(paintedTop - Math.max(listTop, safeTop) < f.scale + 1e-8, key + ' must not hide a visible extra row');
  // The clipping boundary applies to transformed descendants, not their
  // pre-animation offsets. It also removes those pixels from hit testing.
  for (const translateY of [-24, -1, 0, 6]) {
    const rowTop = safeTop - 64 * f.scale + translateY * f.scale;
    const rowBottom = rowTop + 56 * f.scale;
    const paintedRowTop = Math.max(rowTop, paintedTop);
    const paintedRowBottom = Math.max(paintedRowTop, rowBottom);
    assert(paintedRowBottom === paintedRowTop || paintedRowTop >= safeTop, 'transformed overscan leaks above its ancestor clip');
  }
}

for (const tab of ['queue', 'playlists', 'podcasts']) {
  test(tab + ' overscan cannot paint through the transparent header or toolbar', () => {
    for (const scale of [.65, 1, 1.75]) for (const scroll of [0, 24, 220, 17320]) {
      for (const width of [280, 340, 430]) {
        const f = fixture({ tab, scale, scroll, width });
        loadGeometry(f);
        f.context.syncPlaylistPanelContentClip(f.panel);
        assertSafeClip(f, tab);
        for (const hidden of Object.keys(f.lists).filter(key => key !== tab)) assert.equal(f.lists[hidden].style.clipPath, undefined);
      }
    }
  });
}

test('an active toolbar sets the correct sticky offsets even when the playlists pane is hidden', () => {
  for (const tab of ['queue', 'playlists', 'podcasts']) {
    const f = fixture({ tab }); loadGeometry(f);
    const inset = f.context.playlistPanelTopInset(f.panel);
    assert.equal(f.css.get('--playlist-toolbar-top'), '90px');
    assert.equal(f.css.get('--playlist-detail-top'), (100 + f.toolbars[tab].offsetHeight + 16 - 18) + 'px');
    assert.equal(inset, 100 + f.toolbars[tab].offsetHeight + 16);
  }
});

test('clipping follows scroll, resize and reopening without replacing the glass material', () => {
  const f = fixture();
  vm.runInContext(source('01a-scroll-motion.js'), f.context, { filename: '01a-scroll-motion.js' });
  f.ready(); f.flush(); assertSafeClip(f, 'queue');
  f.panel.scrollTop += 300;
  f.events.scroll.forEach(callback => callback());
  assertSafeClip(f, 'queue'); // Scroll must update before the next animation frame.
  assert(f.observers[0].nodes.includes(f.panel));
  for (const node of [...Object.values(f.toolbars), ...Object.values(f.lists)]) assert(f.observers[0].nodes.includes(node));
  f.header.offsetHeight = 140;
  f.observers[0].callback(); f.flush(); assertSafeClip(f, 'queue');
  f.toolbarHeights.queue = 60;
  f.observers[0].callback(); f.flush(); assertSafeClip(f, 'queue');
  f.panel.classList.remove('show', 'pinned'); f.mutations[0].callback(); f.flush();
  f.panel.scrollTop = 0; f.panel.classList.add('peek'); f.mutations[0].callback(); f.flush();
  assertSafeClip(f, 'queue');
  assert.equal(f.panel.style.background, undefined);
  assert.equal(f.header.style, undefined);
});

test('the main header remains the clipping boundary when a toolbar is temporarily above it', () => {
  const f = fixture({ tab: 'queue', scale: 1.75 }); loadGeometry(f);
  f.toolbars.queue.getBoundingClientRect = () => ({ bottom: f.header.getBoundingClientRect().bottom - 20 });
  f.context.syncPlaylistPanelContentClip(f.panel);
  assertSafeClip(f, 'queue');
});

test('rapid tab switching refreshes the active list and clears each hidden list clip', () => {
  const f = fixture(); loadGeometry(f);
  f.context.cancelPlaylistReturnMotion = () => {};
  load(f.context, '01-playlist-panel-shell.js', ['switchPlaylistTab']);
  for (const tab of ['queue', 'playlists', 'podcasts', 'queue', 'podcasts', 'playlists', 'queue']) {
    f.context.switchPlaylistTab(tab, { save: false, animate: false, refresh: false });
    assertSafeClip(f, tab);
    for (const hidden of Object.keys(f.lists).filter(key => key !== tab)) assert.equal(f.lists[hidden].style.clipPath || '', '');
  }
});

test('queue virtualization reapplies its ancestor clip after replacing rows', () => {
  const f = fixture({ rows: 10000 }); loadGeometry(f);
  Object.assign(f.context, {
    queueRenderSeq: 0, playQueue: Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, name: 'Track ' + i, artist: 'Artist' })),
    currentIdx: 200, QUEUE_VIRTUAL_ROW_STEP: 64, QUEUE_VIRTUAL_OVERSCAN: 5,
    songCoverSrc: () => '', escHtml: value => value, isSongLiked: () => false,
    heartIconSvg: () => '', queueNextIconSvg: () => '', playlistPlusIconSvg: () => '', queueRemoveIconSvg: () => '',
    queueHydrationFooterHtml: () => '', renderMiniQueuePanel() {}
  });
  load(f.context, '02-playlist-detail.js', ['queuePanelVirtualWindow', 'queueVirtualSpacerHtml']);
  load(f.context, '01-playlist-panel-shell.js', ['renderQueuePanel']);
  f.context.renderQueuePanel({ animate: false, scrollCurrent: false });
  assertSafeClip(f, 'queue');
  assert((f.lists.queue.innerHTML.match(/data-queue-index=/g) || []).length < 30, 'the fix must preserve bounded virtualization');
  f.panel.scrollTop = 17320;
  f.context.renderQueuePanel({ animate: false, scrollCurrent: false });
  assertSafeClip(f, 'queue');
  assert((f.lists.queue.innerHTML.match(/data-queue-index=/g) || []).length < 30);
  f.context.playQueue = [];
  f.context.queueViewTab = 'playlists';
  f.lists.queue.style.clipPath = '';
  f.context.renderQueuePanel({ animate: false, scrollCurrent: false });
  assertSafeClip(f, 'queue');
});

test('playlist rendering keeps clipping current after both populated and empty catalog replacements', () => {
  const f = fixture({ tab: 'playlists' }); loadGeometry(f);
  const playlist = { id: 1, name: 'Playlist', provider: 'netease', trackCount: 20 };
  const cache = { entries: [
    { type: 'label', label: 'Mine' }, { type: 'card', pl: playlist, sourceIndex: 0 },
    { type: 'detail', pl: playlist, provider: 'netease' }
  ], offsets: [0, 20, 91, 459], totalHeight: 459 };
  Object.assign(f.context, {
    playlistRenderSeq: 0, userPlaylists: [playlist], playlistPanelDetailState: { key: 'netease:1' },
    playlistCatalogSyncState: { loading: false }, playlistCatalogFooterHtml: () => '',
    playlistPanelBuildVirtualEntries: () => cache, playlistPanelDetailHtml: () => '<div class="pl-inline-detail"><div style="transform:translate3d(0,-8px,0)">Track</div></div>',
    normalizePlaylistProvider: value => value, playlistProviderLabel: value => value,
    playlistPanelKey: (provider, id) => provider + ':' + id, escHtml: value => value,
    PLAYLIST_CARD_VIRTUAL_OVERSCAN_PX: 300, PLAYLIST_DETAIL_OUTER_CHROME_HEIGHT: 80,
    bindPlaylistPanelDetailScroller() {}, animateVisiblePanelList() {}
  });
  load(f.context, '02-playlist-detail.js', ['playlistPanelOffsetIndex', 'renderUserPlaylistsList']);
  f.context.renderUserPlaylistsList({ animate: false, preserveScroll: true });
  assertSafeClip(f, 'playlists');
  assert.equal(f.panel.scrollTop, 220);
  assert.match(f.lists.playlists.innerHTML, /pl-inline-detail/);
  f.context.userPlaylists = [];
  f.lists.playlists.style.clipPath = '';
  f.context.renderUserPlaylistsList({ animate: false, preserveScroll: true });
  assertSafeClip(f, 'playlists');
});

test('podcast collection and child renderers clip populated, empty and logged-out states', () => {
  const f = fixture({ tab: 'podcasts' }); loadGeometry(f);
  Object.assign(f.context, {
    loginStatus: { loggedIn: true }, myPodcastCollections: [{ key: 'liked', title: 'Liked', count: 1 }],
    escHtml: value => value, coverUrlWithSize: value => value, podcastDefaultCover: () => '', animateVisiblePanelList() {}
  });
  load(f.context, '02-playlist-detail.js', ['renderMyPodcastCollections']);
  load(f.context, '03-podcast-playlist-loaders.js', ['renderMyPodcastRadioItems']);
  const renderers = [
    () => f.context.renderMyPodcastCollections({ animate: false }),
    () => { f.context.myPodcastCollections = []; f.context.renderMyPodcastCollections({ animate: false }); },
    () => { f.context.loginStatus.loggedIn = false; f.context.renderMyPodcastCollections({ animate: false }); },
    () => f.context.renderMyPodcastRadioItems('liked', 'Liked', [{ id: 1, name: 'Radio' }]),
    () => f.context.renderMyPodcastRadioItems('liked', 'Liked', [])
  ];
  for (const render of renderers) {
    f.lists.podcasts.style.clipPath = '';
    f.panel.scrollTop += 10;
    render(); assertSafeClip(f, 'podcasts');
  }
});
