'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const updateSource = read('public/js/modules/08-account/00-update-preview.js');

function functionSource(name) {
  const start = updateSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = updateSource.indexOf('\n}', start + 1);
  assert.ok(end > start, `unterminated ${name}`);
  return updateSource.slice(start, end + 2);
}

function makeContext() {
  const classes = new Set(['splash-active']);
  const entryClasses = new Set();
  let checks = 0;
  const context = vm.createContext({
    updatePreviewState: { visible: false },
    document: {
      body: { classList: { contains: (name) => classes.has(name) } },
      getElementById: (id) => id === 'update-entry' ? {
        classList: { toggle: (name, value) => value ? entryClasses.add(name) : entryClasses.delete(name) },
      } : null,
    },
    window: {},
    renderUpdatePreviewPanel() {},
    checkLatestUpdate() { checks += 1; },
  });
  vm.runInContext(functionSource('initUpdatePreview') + '\n' + functionSource('setUpdatePreviewVisible'), context);
  return { context, classes, entryClasses, getChecks: () => checks };
}

test('startup begins the update request without a nine-second timer', () => {
  const startup = read('public/js/modules/10-shell/05-startup-bindings.js');
  assert.match(startup, /\binitUpdatePreview\(\);/);
  assert.doesNotMatch(startup, /setTimeout\(initUpdatePreview/);
  const { context, getChecks } = makeContext();
  context.initUpdatePreview();
  assert.equal(getChecks(), 1);
});

test('early result waits for the home screen; late result appears when ready', () => {
  const splash = read('public/js/modules/10-shell/03-splash.js');
  assert.match(splash, /setUpdatePreviewVisible\(updatePreviewState\.visible\)/);
  const { context, classes, entryClasses } = makeContext();
  context.setUpdatePreviewVisible(true);
  assert.equal(context.updatePreviewState.visible, true);
  assert.equal(entryClasses.has('available'), false);
  classes.delete('splash-active');
  context.setUpdatePreviewVisible(context.updatePreviewState.visible);
  assert.equal(entryClasses.has('available'), true);

  context.setUpdatePreviewVisible(false);
  assert.equal(entryClasses.has('available'), false);
  context.setUpdatePreviewVisible(true);
  assert.equal(entryClasses.has('available'), true);
});
