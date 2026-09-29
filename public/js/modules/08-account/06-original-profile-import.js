var originalProfileImportPending = false;
var originalProfileAvailable = false;
var ORIGINAL_PROFILE_IMPORT_DECISION_KEY = 'mineradio-remix-original-import-decision-v1';

function closeOriginalProfileImport() {
  var modal = document.getElementById('original-profile-modal');
  if (modal) modal.classList.remove('show');
  originalProfileImportPending = false;
  try { localStorage.setItem(ORIGINAL_PROFILE_IMPORT_DECISION_KEY, 'skip'); } catch (_) { }
  if (typeof maybeRunStartupLoginGuide === 'function') maybeRunStartupLoginGuide('profile-import');
}

function mergeOriginalVisualSettings(original) {
  if (!original || typeof original !== 'object' || Array.isArray(original)) return 0;
  var current = readCurrentFxAutosaveRaw() || {};
  var merged = Object.assign({}, current);
  var count = 0;
  Object.keys(fxDefaults).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(original, key)) return;
    var remixValue = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : fxDefaults[key];
    if (JSON.stringify(remixValue) !== JSON.stringify(fxDefaults[key])) return;
    if (JSON.stringify(original[key]) === JSON.stringify(remixValue)) return;
    merged[key] = original[key];
    count++;
  });
  if (!count) return 0;
  merged.currentAutosaveSchema = CURRENT_FX_AUTOSAVE_SCHEMA;
  merged.visualPresetSchema = original.visualPresetSchema || VISUAL_PRESET_SCHEMA;
  merged.desktopLyricsSchema = original.desktopLyricsSchema || 'desktop-lyrics-v3';
  merged.autosavedAt = Date.now();
  merged.autosaveUser = true;
  merged.autosaveReason = 'original-profile-import';
  if (!writeCurrentFxAutosavePayload(merged, { syncDisk: true })) throw new Error('VISUAL_SETTINGS_SAVE_FAILED');
  return count;
}

async function openOriginalProfileImport(manual) {
  var bridge = window.desktopWindow;
  if (!bridge || typeof bridge.inspectOriginalProfile !== 'function') return false;
  var description = document.getElementById('original-profile-description');
  try {
    var info = await bridge.inspectOriginalProfile();
    if (info && info.supported === false) {
      var link = document.querySelector('.original-profile-link');
      if (link) link.hidden = true;
    }
    if (!info || !info.available) {
      if (manual && description) {
        description.textContent = '这台电脑尚未找到可导入的原版配置。';
        document.getElementById('original-profile-modal').classList.add('show');
        document.getElementById('original-profile-confirm').style.display = 'none';
      }
      originalProfileImportPending = false;
      return false;
    }
    originalProfileAvailable = true;
    originalProfileImportPending = true;
    document.getElementById('original-profile-confirm').style.display = '';
    if (description) description.textContent = '找到 ' + info.settings + ' 项配置文件和 ' + info.credentials + ' 项账号文件。只补齐 Remix 的默认设置与缺失账号；原版文件保持原样。';
    document.getElementById('original-profile-modal').classList.add('show');
    return true;
  } catch (_) {
    originalProfileImportPending = false;
    return false;
  }
}

async function confirmOriginalProfileImport() {
  if (!originalProfileAvailable) return;
  var bridge = window.desktopWindow;
  var button = document.getElementById('original-profile-confirm');
  var description = document.getElementById('original-profile-description');
  button.disabled = true;
  try {
    var imported = await bridge.importOriginalProfile(Object.keys(fxDefaults));
    if (!imported || !imported.ok) throw new Error(imported && imported.error || 'IMPORT_FAILED');
    var visualCount = mergeOriginalVisualSettings(imported.visualSettings);
    try { localStorage.setItem(ORIGINAL_PROFILE_IMPORT_DECISION_KEY, 'imported'); } catch (_) { }
    if (description) description.textContent = '已导入 ' + imported.importedCredentials + ' 项账号、' + imported.importedSettings + ' 项配置文件和 ' + visualCount + ' 项视觉设置。正在重启以重新读取账号。';
    if (bridge.restartApp) {
      var restart = await bridge.restartApp();
      if (!restart || restart.ok !== true) throw new Error(restart && restart.error || 'RESTART_FAILED');
    }
  } catch (error) {
    if (description) description.textContent = '导入没有完成：' + String(error && error.message || error || 'UNKNOWN_ERROR');
    button.disabled = false;
  }
}

function maybeOfferOriginalProfileImport() {
  if (!originalProfileImportPending) return;
  openOriginalProfileImport(false).then(function (opened) {
    if (!opened && typeof maybeRunStartupLoginGuide === 'function') maybeRunStartupLoginGuide('profile-import');
  });
}

function initOriginalProfileImport() {
  var bridge = window.desktopWindow;
  if (!bridge || typeof bridge.inspectOriginalProfile !== 'function') return;
  try { originalProfileImportPending = !localStorage.getItem(ORIGINAL_PROFILE_IMPORT_DECISION_KEY); } catch (_) { }
  bridge.inspectOriginalProfile().then(function (info) {
    if (info && info.supported === false) {
      var link = document.querySelector('.original-profile-link');
      if (link) link.hidden = true;
      originalProfileImportPending = false;
    }
  }).catch(function () { originalProfileImportPending = false; });
  if (!document.body.classList.contains('splash-active')) maybeOfferOriginalProfileImport();
}
