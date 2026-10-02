'use strict';

const fs = require('fs');
const path = require('path');

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// electron-updater keeps the downloaded installer in <cache>/pending until the
// next update is downloaded (~112 MB). Once that version is the one running,
// remove it. installer.exe + current.blockmap stay: they enable differential
// downloads next time. An installer for a newer, not yet installed version is kept.
function cleanupInstalledPendingUpdate({ currentVersion, resourcesPath, localAppData, fsImpl = fs } = {}) {
  try {
    if (!currentVersion || !resourcesPath || !localAppData) return { removed: false, reason: 'unsupported' };
    const yml = fsImpl.readFileSync(path.join(resourcesPath, 'app-update.yml'), 'utf8');
    const match = /^updaterCacheDirName:\s*([A-Za-z0-9._-]+)\s*$/m.exec(yml);
    if (!match) return { removed: false, reason: 'no-cache-name' };
    const pending = path.join(localAppData, match[1], 'pending');
    const stat = fsImpl.lstatSync(pending);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { removed: false, reason: 'not-a-directory' };
    const info = JSON.parse(fsImpl.readFileSync(path.join(pending, 'update-info.json'), 'utf8'));
    const version = /-(\d+\.\d+\.\d+)-Setup\.exe$/i.exec(String(info && info.fileName || ''));
    if (!version) return { removed: false, reason: 'unknown-version' };
    if (compareVersions(version[1], currentVersion) > 0) return { removed: false, reason: 'newer-pending' };
    fsImpl.rmSync(pending, { recursive: true, force: true });
    return { removed: true, version: version[1] };
  } catch (error) {
    return { removed: false, reason: error && error.code === 'ENOENT' ? 'none' : 'failed' };
  }
}

// The update dialog shows the release's "更新重点" (older notes: "本版重点")
// as short plain-text lines: only each item's bold lead phrase, at most four.
// Release notes arrive as HTML (GitHub feed) or Markdown; nothing is passed
// to the renderer as markup.
const HIGHLIGHT_HEADING = /(更新重点|本版重点)/;
function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function highlightLine(item) {
  const bold = /<strong>([\s\S]*?)<\/strong>|\*\*([^*]+)\*\*/.exec(item);
  let text = plainText(bold ? (bold[1] || bold[2]) : item);
  if (!bold) text = text.split(/[：:。]/)[0];
  return text.length > 40 ? text.slice(0, 39) + '…' : text;
}
function extractReleaseHighlights(notes) {
  let source = notes;
  if (Array.isArray(notes)) source = notes.map(item => (item && item.note) || '').join('\n');
  source = String(source || '').slice(0, 200000);
  if (!source.trim()) return [];
  const isHtml = /<li[\s>]/i.test(source);
  const sections = isHtml ? source.split(/<h[1-6][^>]*>/i) : source.split(/^#{1,6}\s+/m);
  const section = sections.find(part => HIGHLIGHT_HEADING.test(part.split(isHtml ? /<\/h[1-6]>/i : /\n/)[0] || ''));
  const items = (text) => isHtml
    ? (text.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [])
    : text.split('\n').filter(line => /^\s*[-*]\s+/.test(line)).map(line => line.replace(/^\s*[-*]\s+/, ''));
  const picked = section ? items(section).slice(0, 4) : items(source).slice(0, 3);
  return picked.map(highlightLine).filter(Boolean);
}

function createRemixUpdater(options) {
  const app = options.app;
  const enabled = options.enabled === true;
  const onState = typeof options.onState === 'function' ? options.onState : () => {};
  let updater = null;
  let checkPromise = null;
  let downloadPromise = null;
  let state = { supported: enabled, status: enabled ? 'idle' : 'external', currentVersion: app.getVersion(), version: '', percent: 0, error: '' };

  function publish(patch) {
    state = { ...state, ...patch };
    onState({ ...state });
    return { ...state };
  }

  function ensureUpdater() {
    if (!enabled) return null;
    if (updater) return updater;
    updater = (options.loadUpdater || (() => require('electron-updater').autoUpdater))();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('update-available', (info) => {
      const files = Array.isArray(info && info.files) ? info.files : [];
      const size = Number(files[0] && files[0].size) || 0;
      publish({ status: 'available', version: String(info && info.version || ''), error: '',
        highlights: extractReleaseHighlights(info && info.releaseNotes), downloadBytes: size > 0 ? size : 0 });
    });
    updater.on('update-not-available', () => publish({ status: 'current', version: '', error: '', highlights: [], downloadBytes: 0 }));
    updater.on('download-progress', (progress) => {
      if (!downloadPromise || state.status !== 'downloading') return;
      publish({ status: 'downloading', percent: Math.max(0, Math.min(100, Number(progress && progress.percent) || 0)) });
    });
    updater.on('update-downloaded', (info) => {
      if (!downloadPromise || state.status !== 'downloading' || !info || info.version !== state.version) return;
      publish({ status: 'downloaded', percent: 100, error: '' });
    });
    updater.on('error', (error) => publish({ status: 'error', error: String(error && error.message || error || 'UPDATE_FAILED').slice(0, 160) }));
    return updater;
  }

  async function check() {
    if (!enabled || state.status === 'downloaded' || state.status === 'downloading') return { ...state };
    if (checkPromise) return checkPromise;
    publish({ status: 'checking', error: '' });
    checkPromise = Promise.resolve().then(() => ensureUpdater().checkForUpdates()).then(() => {
      return state.status === 'checking' ? publish({ status: 'current', version: '' }) : { ...state };
    }, (error) => {
      return publish({ status: 'error', error: String(error && error.message || error || 'UPDATE_CHECK_FAILED').slice(0, 160) });
    }).finally(() => { checkPromise = null; });
    return checkPromise;
  }

  async function download() {
    if (!enabled || (state.status !== 'available' && state.status !== 'error')) return { ...state };
    if (downloadPromise) return downloadPromise;
    if (state.status === 'error') {
      await check();
      if (state.status !== 'available') return { ...state };
    }
    publish({ status: 'downloading', percent: 0, error: '' });
    downloadPromise = Promise.resolve().then(() => ensureUpdater().downloadUpdate()).then((files) => {
      if (state.status !== 'downloading') return { ...state };
      if (!Array.isArray(files) || !files.length) return publish({ status: 'error', error: 'UPDATE_DOWNLOAD_INCOMPLETE' });
      return publish({ status: 'downloaded', percent: 100 });
    }, (error) => {
      return publish({ status: 'error', error: String(error && error.message || error || 'UPDATE_DOWNLOAD_FAILED').slice(0, 160) });
    }).finally(() => { downloadPromise = null; });
    return downloadPromise;
  }

  function install() {
    if (!enabled || state.status !== 'downloaded') return { ok: false, error: 'UPDATE_NOT_READY' };
    ensureUpdater().quitAndInstall(true, true);
    return { ok: true };
  }

  function cleanupInstalledDownload() {
    if (!enabled) return { removed: false, reason: 'disabled' };
    return cleanupInstalledPendingUpdate({
      currentVersion: app.getVersion(),
      resourcesPath: process.resourcesPath,
      localAppData: process.env.LOCALAPPDATA,
    });
  }

  return { getState: () => ({ ...state }), check, download, install, cleanupInstalledDownload };
}

module.exports = { createRemixUpdater, cleanupInstalledPendingUpdate, extractReleaseHighlights };
