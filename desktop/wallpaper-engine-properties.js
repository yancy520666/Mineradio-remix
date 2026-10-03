'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const safeKey = /^[a-z0-9_.-]{1,128}$/i;
const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fileKey = value => path.win32.normalize(String(value || '').replace(/\//g, '\\')).toLowerCase();

function savedProperties(config, username, projectFile, scenePackage) {
  const accountKey = Object.keys(config).find(key => key.toLowerCase() === username.toLowerCase());
  const account = accountKey ? config[accountKey] : config;
  if (!object(account) || !object(account.wproperties)) return {};
  const entryKey = Object.keys(account.wproperties).find(key =>
    fileKey(key) === fileKey(scenePackage) || fileKey(key) === fileKey(projectFile));
  const locations = entryKey && account.wproperties[entryKey];
  if (!object(locations)) return {};
  const selected = account.general && account.general.wallpaperconfig
    && account.general.wallpaperconfig.selectedwallpapers;
  const keys = Object.keys(locations).filter(key => !/^Mineradio/i.test(key));
  const active = keys.find(key => selected && selected[key]
    && [fileKey(projectFile), fileKey(scenePackage)].includes(fileKey(selected[key].file)));
  const location = locations[active || (keys.includes('Monitor0') ? 'Monitor0' : keys[0])];
  if (!object(location)) return {};
  return object(location.userproperties) ? location.userproperties : location;
}

function normalizeValue(value) {
  if (object(value)) value = value.value;
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  // JSON handles quotes, Unicode and newlines; no shell or source interpolation.
  if (typeof value === 'string' && value.length <= 4096 && !value.includes('\0')
    && !value.includes(')~END')) return value;
  return undefined;
}

async function readJson(file, maxBytes) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid property file');
  return { stat, value: JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')) };
}

async function readSavedWallpaperProperties(executable, projectFile, scenePackage, previous = null) {
  if (!projectFile) return previous;
  try {
    const configFile = path.join(path.dirname(executable), 'config.json');
    const stat = await fs.stat(configFile);
    const stamp = `${stat.size}:${stat.mtimeMs}`;
    if (previous && previous.stamp === stamp) return previous;
    const [{ value: config }, { value: project }] = await Promise.all([
      readJson(configFile, 16 * 1024 * 1024), readJson(projectFile, 1024 * 1024),
    ]);
    if (!object(config)) return previous;
    const saved = savedProperties(config, os.userInfo().username, projectFile, scenePackage);
    const definitions = project && project.general && project.general.properties;
    const values = Object.create(null);
    for (const [key, property] of Object.entries(object(definitions) ? definitions : {}).slice(0, 256)) {
      if (!safeKey.test(key) || blockedKeys.has(key.toLowerCase())) continue;
      const value = Object.prototype.hasOwnProperty.call(saved, key)
        ? normalizeValue(saved[key])
        : previous && Object.prototype.hasOwnProperty.call(previous.values, key)
          ? normalizeValue(property) : undefined;
      if (value !== undefined) values[key] = value;
    }
    return { stamp, values: { ...values } };
  } catch (_) {
    // WE may be saving config.json. Keep the last good settings and retry.
    return previous;
  }
}

module.exports = { readSavedWallpaperProperties };
