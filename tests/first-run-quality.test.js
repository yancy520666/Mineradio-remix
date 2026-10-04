'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'public', 'js', 'modules', '00-state', '08a-first-run-quality.js');

function load({ stored = null, renderer = '', profile = {} } = {}) {
  const gl = {
    getExtension: name => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
    getParameter: () => renderer
  };
  const c = {
    fx: { performanceQuality: 'ultra' },
    runtimeHardwareProfile: profile,
    readCurrentFxAutosaveStorageRaw: () => stored,
    document: { createElement: () => ({ getContext: () => (renderer === null ? null : gl) }) }
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  return c;
}

test('real Windows ANGLE renderer names map to GPU classes', () => {
  const { classifyRendererGpu: gpu } = load();
  assert.equal(gpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'discrete');
  assert.equal(gpu('ANGLE (AMD, AMD Radeon RX 6600 XT (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'discrete');
  assert.equal(gpu('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'discrete');
  assert.equal(gpu('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(gpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(gpu('ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(gpu('ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(gpu('ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(gpu('ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics (0x000015DD) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(gpu('ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'software');
  assert.equal(gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), 'software');
  assert.equal(gpu(''), 'unknown');
});

test('first launch keeps original detail on capable machines and steps down on weak ones', () => {
  const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  const iris = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
  assert.equal(load({ renderer: rtx }).fx.performanceQuality, 'ultra');
  assert.equal(load({ renderer: '' }).fx.performanceQuality, 'ultra');
  assert.equal(load({ renderer: iris }).fx.performanceQuality, 'balanced');
  assert.equal(load({ renderer: iris, profile: { veryLargeSurface: true } }).fx.performanceQuality, 'eco');
  assert.equal(load({ renderer: rtx, profile: { lowCore: true } }).fx.performanceQuality, 'eco');
  assert.equal(load({ renderer: null }).fx.performanceQuality, 'eco');
});

test('any stored settings, including an explicit ultra on an integrated GPU, are kept', () => {
  const c = load({ stored: { performanceQuality: 'ultra' }, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' });
  assert.equal(c.fx.performanceQuality, 'ultra');
  assert.equal(c.firstRunQualityDecision, null);
});
