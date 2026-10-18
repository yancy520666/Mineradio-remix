'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../public/js/modules/06-lyrics/01b-desktop-drag-scroll.js');

function fixture() {
  const listeners = new Map(), classes = new Set(['desktop-wallpaper-mode', 'desktop-wallpaper-interactive']);
  let now = 1000, observer;
  function on(owner, type, callback) {
    const key = owner + ':' + type;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(callback);
  }
  function node(parent, options = {}) {
    const matches = new Set(options.matches || []);
    const element = {
      parentElement: parent, isConnected: true, id: options.id || '',
      style: { scrollBehavior: options.scrollBehavior || '' },
      scrollTop: options.scrollTop == null ? 100 : options.scrollTop,
      scrollHeight: options.scrollHeight || 1000, clientHeight: options.clientHeight || 200,
      clientWidth: 180, offsetWidth: 200, offsetHeight: 200, clientLeft: 0,
      computed: { overflowY: options.overflowY || 'visible', direction: 'ltr', userSelect: 'none',
        borderLeftWidth: '0', borderRightWidth: '0', borderTopWidth: '0', borderBottomWidth: '0',
        pointerEvents: 'auto', display: 'block', visibility: 'visible' },
      getBoundingClientRect: () => ({ left: 0, right: 200, top: 0, bottom: 200, width: 200, height: 200 }),
      matches: selector => selector.split(',').some(part => matches.has(part.trim()) || part.trim() === '#' + element.id),
      closest(selector) { for (let current = element; current; current = current.parentElement) if (current.matches(selector)) return current; return null; },
      contains(other) { for (let current = other; current; current = current.parentElement) if (current === element) return true; return false; },
      setPointerCapture: pointer => { element.captured = pointer; },
      releasePointerCapture: pointer => { if (element.captured === pointer) element.captured = null; },
      hasPointerCapture: pointer => element.captured === pointer,
    };
    return element;
  }
  const body = node(null, { id: 'body' });
  body.classList = { contains: name => classes.has(name) };
  const root = node(body, { id: 'playlist-panel', overflowY: 'auto' });
  const blank = node(root, { scrollHeight: 200 });
  const smoothTargets = [], killed = [];
  root.__syncSmoothWheelTarget = top => smoothTargets.push(top);
  const document = { body, visibilityState: 'visible', addEventListener: (type, fn) => on('document', type, fn) };
  const window = { addEventListener: (type, fn) => on('window', type, fn),
    getComputedStyle: element => element.computed, gsap: { killTweensOf: (element, properties) => killed.push([element, properties]) } };
  const context = vm.createContext({ document, window, performance: { now: () => now },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} }, markRenderInteraction() {} });
  // Before the fix, no drag handler runs when Windows sends pointer input but
  // routes the wheel to Explorer. Keep that exact failed-scroll baseline testable.
  vm.runInContext(fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '', context);
  function dispatch(type, values = {}, owner = 'document') {
    const event = { type, target: blank, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: 0, buttons: 1, clientX: 40, clientY: 100, detail: 1,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; },
      ...values };
    for (const callback of listeners.get(owner + ':' + type) || []) { callback(event); if (event.stopped) break; }
    return event;
  }
  return { context, document, window, root, blank, body, node, classes, smoothTargets, killed, dispatch,
    advance: ms => { now += ms; }, mutation: () => { if (observer) observer(); } };
}

test('desktop pointer dragging scrolls without any wheel input, then suppresses only its release click', () => {
  const f = fixture();
  assert.equal(f.dispatch('pointerdown').defaultPrevented, undefined);
  assert.equal(f.dispatch('pointermove', { clientY: 95 }).defaultPrevented, undefined);
  assert.equal(f.root.scrollTop, 100, 'small movements keep ordinary clicks');
  const move = f.dispatch('pointermove', { clientY: 60 });
  assert.equal(f.root.scrollTop, 140, 'missing desktop wheel has a mouse-only fallback');
  assert.equal(move.defaultPrevented, true);
  assert.equal(f.root.captured, 1);
  assert.equal(f.root.style.scrollBehavior, 'auto');
  assert.equal(f.smoothTargets[0], 100, 'an old smooth-wheel destination cannot fight the drag');
  assert.equal(f.killed[0][1], 'scrollTop', 'unrelated panel animations stay intact');
  f.dispatch('pointerup', { buttons: 0, clientY: 60 });
  assert.equal(f.root.captured, null);
  assert.equal(f.root.style.scrollBehavior, '');
  assert.equal(f.dispatch('click', { target: f.root, clientY: 60 }).defaultPrevented, true);
  assert.equal(f.dispatch('click', { target: f.root, clientY: 60 }).defaultPrevented, undefined, 'only the associated click is consumed');
});

test('short clicks, horizontal drags, non-mouse input, other buttons and modifiers remain untouched', () => {
  const click = fixture();
  click.dispatch('pointerdown'); click.dispatch('pointermove', { clientY: 97 }); click.dispatch('pointerup', { buttons: 0 });
  assert.equal(click.dispatch('click').defaultPrevented, undefined);
  assert.equal(click.root.scrollTop, 100);
  for (const values of [{}, { pointerType: 'touch' }, { pointerType: 'pen' }, { button: 2 }, { isPrimary: false }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }]) {
    const f = fixture();
    f.dispatch('pointerdown', values);
    f.dispatch('pointermove', { clientX: 80, clientY: 99, ...values });
    f.dispatch('pointerup', { buttons: 0, ...values });
    assert.equal(f.root.scrollTop, 100);
    assert.equal(f.dispatch('click').defaultPrevented, undefined);
  }
});

test('controls, sortable song/card rows, workflow wires, text selection and crop/color stages keep their gestures', () => {
  for (const selector of ['button', 'a', 'input', 'textarea', 'select', 'label', '[contenteditable]', '[role="slider"]', '[onclick]', '[draggable="true"]',
    '.queue-item[data-queue-index]', '.mini-queue-item[data-queue-index]', '.pl-card[data-playlist-index]',
    '.audio-route-graph', '#login-node-graph', '#background-crop-stage', '#cover-crop-stage', '#color-lab-pop']) {
    const f = fixture(), target = f.node(f.root, { matches: [selector] });
    f.dispatch('pointerdown', { target });
    const move = f.dispatch('pointermove', { target, clientY: 40 });
    assert.equal(f.root.scrollTop, 100, selector);
    assert.equal(move.defaultPrevented, undefined, selector);
  }
  const f = fixture();
  f.blank.computed.userSelect = 'text';
  f.dispatch('pointerdown'); f.dispatch('pointermove', { clientY: 40 });
  assert.equal(f.root.scrollTop, 100);
});

test('fallback is limited to unlocked interactive full desktop panels, without affecting canvas or normal windows', () => {
  for (const change of [f => f.classes.delete('desktop-wallpaper-mode'), f => f.classes.delete('desktop-wallpaper-interactive'),
    f => f.classes.add('desktop-software-locked'), f => { f.document.visibilityState = 'hidden'; },
    f => { f.blank.parentElement = f.body; }]) {
    const f = fixture(); change(f);
    f.dispatch('pointerdown'); const move = f.dispatch('pointermove', { clientY: 40 });
    assert.equal(f.root.scrollTop, 100); assert.equal(move.defaultPrevented, undefined);
  }
});

test('the nearest real nested scroller owns the gesture, stays at its boundaries and does not jump to the outer panel', () => {
  const f = fixture(), nested = f.node(f.root, { overflowY: 'auto', scrollTop: 20, scrollHeight: 260 });
  const target = f.node(nested);
  f.dispatch('pointerdown', { target });
  f.dispatch('pointermove', { target, clientY: 20 });
  assert.equal(nested.scrollTop, 60);
  assert.equal(f.root.scrollTop, 100);
  f.dispatch('pointermove', { target, clientY: -100 });
  assert.equal(nested.scrollTop, 60); assert.equal(f.root.scrollTop, 100);
  f.dispatch('pointermove', { target, clientY: 500 });
  assert.equal(nested.scrollTop, 0); assert.equal(f.root.scrollTop, 100);
  f.dispatch('pointerup', { target, buttons: 0 });
});

test('layout scaling is accounted for and native scrollbar lanes are never claimed', () => {
  const f = fixture();
  f.root.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 300, width: 300, height: 300 });
  f.dispatch('pointerdown'); f.dispatch('pointermove', { clientY: 40 });
  assert.equal(f.root.scrollTop, 140, 'client pixels map back to layout pixels');
  f.dispatch('pointerup', { buttons: 0 });
  for (const values of [{ clientX: 290 }, { clientY: 295 }]) {
    const g = fixture();
    g.root.getBoundingClientRect = f.root.getBoundingClientRect;
    if (values.clientY) { g.root.clientHeight = 180; g.root.computed.overflowX = 'auto'; }
    g.dispatch('pointerdown', values); g.dispatch('pointermove', { clientY: 30, ...values });
    assert.equal(g.root.scrollTop, 100);
  }
});

test('release, cancellation, lost capture, blur, pagehide, visibility and mode exit clean up ownership', () => {
  for (const finish of [f => f.dispatch('pointerup', { buttons: 0 }), f => f.dispatch('pointercancel'),
    f => f.dispatch('lostpointercapture', { target: f.root }), f => f.dispatch('blur', {}, 'window'),
    f => f.dispatch('pagehide', {}, 'window'), f => { f.document.visibilityState = 'hidden'; f.dispatch('visibilitychange'); },
    f => { f.classes.delete('desktop-wallpaper-mode'); f.mutation(); },
    f => { f.root.isConnected = false; f.dispatch('pointermove', { clientY: 20 }); },
    f => f.dispatch('pointermove', { buttons: 0, clientY: 20 })]) {
    const f = fixture(); f.dispatch('pointerdown'); f.dispatch('pointermove', { clientY: 60 });
    finish(f);
    assert.equal(f.root.captured, null); assert.equal(f.root.style.scrollBehavior, '');
    f.dispatch('pointermove', { clientY: 20 }); assert.equal(f.root.scrollTop, 140);
  }
});

test('new pointerdown and keyboard clicks do not inherit stale drag-click suppression', () => {
  const f = fixture();
  f.dispatch('pointerdown'); f.dispatch('pointermove', { clientY: 60 }); f.dispatch('pointerup', { buttons: 0 });
  assert.equal(f.dispatch('click', { detail: 0 }).defaultPrevented, undefined);
  f.dispatch('pointerdown'); f.dispatch('pointerup', { buttons: 0 });
  assert.equal(f.dispatch('click').defaultPrevented, undefined);
});

test('a tween moving before drag activation is rebased, and delivered wheels or external scrolls regain ownership', () => {
  const f = fixture();
  f.dispatch('pointerdown'); f.root.scrollTop = 160;
  f.dispatch('pointermove', { clientY: 60 });
  assert.equal(f.root.scrollTop, 200, 'activation continues from the actual tween position');
  assert.equal(f.smoothTargets[0], 160);
  const wheel = f.dispatch('wheel');
  assert.equal(wheel.defaultPrevented, undefined);
  assert.equal(f.root.captured, null);
  f.dispatch('pointermove', { clientY: 20 }); assert.equal(f.root.scrollTop, 200);
  for (const useScrollEvent of [true, false]) {
    const g = fixture(); g.dispatch('pointerdown'); g.dispatch('pointermove', { clientY: 60 }); g.root.scrollTop = 300;
    if (useScrollEvent) g.dispatch('scroll', { target: g.root });
    g.dispatch('pointermove', { clientY: 20 });
    assert.equal(g.root.scrollTop, 300, 'external auto-positioning is not overwritten');
    assert.equal(g.root.captured, null);
  }
});

test('releasing only the left button and hiding a nested container ancestor both cancel the drag', () => {
  for (const change of [f => f.dispatch('pointermove', { buttons: 2, clientY: 20 }),
    f => { f.root.computed.display = 'none'; f.dispatch('pointermove', { clientY: 20 }); },
    f => { f.root.computed.pointerEvents = 'none'; f.dispatch('pointermove', { clientY: 20 }); }]) {
    const f = fixture(), nested = f.node(f.root, { overflowY: 'auto' }), target = f.node(nested);
    f.dispatch('pointerdown', { target }); f.dispatch('pointermove', { target, clientY: 60 });
    change(f); assert.equal(nested.scrollTop, 140); assert.equal(nested.captured, null);
    assert.equal(nested.style.scrollBehavior, '');
  }
});

test('continuous blank inner edges preserve ordinary-mode padding and outer panel dimensions', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/index.css'), 'utf8');
  const marker = '/* A small existing-panel inner edge stays grabbable';
  const start = css.indexOf(marker);
  assert(start >= 0);
  const block = css.slice(start, css.indexOf('}', start) + 1);
  const selectors = block.slice(block.indexOf('*/') + 2, block.indexOf('{')).trim().split(',').map(s => s.trim());
  assert.deepEqual(selectors, ['search-results', 'mini-queue-list', 'track-detail-body'].map(id =>
    'body.desktop-wallpaper-mode.desktop-wallpaper-interactive:not(.desktop-software-locked) #' + id));
  const declarations = block.slice(block.indexOf('{') + 1, block.indexOf('}')).trim().split(';').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(declarations, ['box-sizing: border-box', 'padding-left: 12px'],
    'only left inner padding changes, with border-box retaining the same outer width');
  assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/,
    'the original normal-window sizing rule is retained');
  const loader = fs.readFileSync(path.join(__dirname, '../public/js/index-loader.js'), 'utf8');
  assert.match(loader, /01a-scroll-motion\.js',\s*'js\/modules\/06-lyrics\/01b-desktop-drag-scroll\.js'/);
});
