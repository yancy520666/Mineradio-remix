'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const source = 'public/js/modules/05-playback/00-api-quality-output.js';
test('route geometry maps scaled client coordinates into SVG coordinates', () => {
  const c = vm.createContext({});
  loadFunctions(c, source, ['audioRoutePointForPort', 'audioRoutePointFromEvent']);
  const root = { clientWidth: 400, clientHeight: 200, getBoundingClientRect: () => ({ left: 20, top: 40, width: 600, height: 300 }) };
  const port = { getBoundingClientRect: () => ({ left: 155, top: 100, width: 30, height: 30 }) };
  assert.deepEqual({ ...c.audioRoutePointForPort(port, root) }, { x: 100, y: 50 });
  assert.deepEqual({ ...c.audioRoutePointFromEvent({ clientX: 170, clientY: 115 }, root) }, { x: 100, y: 50 });
});
test('drop snapping excludes clipped ports, other UI controls and unrelated surfaces', () => {
  let hit;
  const viewport = { getBoundingClientRect: () => ({ left: 90, top: 100, right: 300, bottom: 180 }) };
  function port(y, disabled = false) {
    return { getBoundingClientRect: () => ({ left: 80, top: y - 20, width: 40, height: 40 }),
      closest: selector => selector === '.route-node-grid' ? viewport : disabled ? {} : null };
  }
  const visible = port(130), clipped = port(200), disabled = port(140, true);
  const root = { isConnected: true, contains: node => node === hit && hit.inside,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 300 }),
    querySelectorAll: () => [clipped, disabled, visible] };
  const c = vm.createContext({ document: { elementFromPoint: () => hit } });
  loadFunctions(c, source, ['audioRouteDropPort']);
  hit = { inside: true, closest: () => null };
  assert.equal(c.audioRouteDropPort({ clientX: 76, clientY: 130 }, root), visible);
  assert.equal(c.audioRouteDropPort({ clientX: 100, clientY: 200 }, root), null);
  hit = { inside: true, closest: selector => selector.startsWith('input,') ? {} : null };
  assert.equal(c.audioRouteDropPort({ clientX: 100, clientY: 130 }, root), null);
  hit = { inside: false, closest: () => null };
  assert.equal(c.audioRouteDropPort({ clientX: 100, clientY: 130 }, root), null);
});
