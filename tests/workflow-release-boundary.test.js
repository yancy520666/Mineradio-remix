'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const yaml = require('js-yaml');

test('release source version matches the lockfile, UI fallback, and release notes', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  const html = fs.readFileSync('public/index.html', 'utf8');
  const versionLabel = html.match(/id="update-modal-version"[^>]*>v([^<]+)</);
  assert.ok(versionLabel, 'update dialog must have a version fallback');
  assert.equal(versionLabel[1], pkg.version);
  assert.ok(fs.existsSync(`docs/RELEASE_NOTES_v${pkg.version}.md`), 'release notes must exist before tag validation');
  assert.equal(pkg.build.appId, 'com.mineradio.remix', 'a version bump must retain the existing installation identity');
});

test('CI and release actions are pinned; only the gated publisher has write permission', () => {
  const ci = yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
  const release = yaml.load(fs.readFileSync('.github/workflows/release-windows.yml', 'utf8'));
  for (const workflow of [ci, release]) {
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (!step.uses) continue;
        assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
        if (step.uses.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'], false);
      }
    }
  }
  assert.equal(release.on.pull_request, undefined); assert.deepEqual(release.on.push.tags, ['v*']);
  assert.equal(release.on.workflow_dispatch.inputs.prepare_draft.default, false);
  const build = release.jobs['windows-release'], publish = release.jobs['publish-draft'];
  assert.equal(build.permissions, undefined);
  assert.equal(publish.needs, 'windows-release'); assert.equal(publish.if, "github.event_name == 'push' || inputs.prepare_draft");
  assert.deepEqual(publish.permissions, { contents: 'write' });
  assert.equal(publish.steps.some(step => step.run), false, 'publisher must not execute build/install scripts');
  const upload = build.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  const download = publish.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(upload.with.name, download.with.name);
  const create = publish.steps.find(step => step.uses?.startsWith('softprops/action-gh-release@'));
  assert.equal(create.with.draft, true);
  assert.equal(create.with.target_commitish, '${{ needs.windows-release.outputs.sha }}');
  assert.equal(create.with.body_path, 'docs/RELEASE_NOTES_v${{ needs.windows-release.outputs.version }}.md');
});
