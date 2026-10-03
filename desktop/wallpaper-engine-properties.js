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

function validatePropertyValue(property, value, allowPath = false) {
  if (!property || property.autoMuted) throw new Error('WALLPAPER_PROPERTY_READ_ONLY');
  switch (property.type) {
    case 'bool':
      if (typeof value === 'boolean') return value;
      break;
    case 'slider': {
      if (typeof value !== 'number' || !Number.isFinite(value)) break;
      const min = Number.isFinite(property.min) ? property.min : 0;
      const max = Number.isFinite(property.max) ? property.max : 100;
      if (min > max || value < min || value > max) break;
      const step = property.step || (property.precision ? 10 ** -property.precision : 1);
      const rounded = Number((min + Math.round((value - min) / step) * step).toFixed(6));
      if (!Number.isFinite(rounded)) break;
      return Math.max(min, Math.min(max, rounded));
    }
    case 'combo':
      if ((property.options || []).some(option => option.value === value)) return value;
      break;
    case 'color': {
      if (typeof value !== 'string') break;
      const components = value.trim().split(/\s+/).map(Number);
      if (components.length === 3 && components.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) {
        return components.map(n => Number(n.toFixed(6))).join(' ');
      }
      break;
    }
    case 'textinput':
      if (typeof value === 'string' && value.length <= 4096 && !value.includes('\0') && !value.includes(')~END')) return value;
      break;
    case 'file':
    case 'directory':
      if (allowPath && typeof value === 'string' && path.isAbsolute(value) && normalizeValue(value) !== undefined) return value;
      break;
    default: throw new Error('WALLPAPER_PROPERTY_READ_ONLY');
  }
  throw new Error('WALLPAPER_PROPERTY_VALUE_INVALID');
}

class WallpaperPropertyStore {
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'wallpaper-engine-properties.json');
    this.writeQueue = Promise.resolve();
    this.loaded = null;
  }

  async load() {
    if (!this.loaded) this.loaded = readJson(this.file, 4 * 1024 * 1024)
      .then(result => object(result.value.projects) ? result.value.projects : {})
      .catch(() => ({}));
    return this.loaded;
  }

  async values(id, definitions) {
    const projects = await this.load();
    const saved = object(projects[id]) ? projects[id] : {};
    const values = {};
    for (const property of definitions) {
      if (!Object.prototype.hasOwnProperty.call(saved, property.key)) continue;
      try { values[property.key] = validatePropertyValue(property, saved[property.key], true); } catch (_) { }
    }
    return values;
  }

  update(id, definitions, changes, reset = false, allowPath = false) {
    if (!/^[a-f0-9]{24}$/.test(id) || !object(changes) || Object.keys(changes).length > 256) {
      return Promise.reject(new Error('WALLPAPER_PROPERTY_VALUE_INVALID'));
    }
    const validated = {};
    try {
      for (const [key, value] of Object.entries(changes)) {
        if (!safeKey.test(key) || blockedKeys.has(key.toLowerCase())) throw new Error('WALLPAPER_PROPERTY_VALUE_INVALID');
        validated[key] = validatePropertyValue(definitions.find(property => property.key === key), value, allowPath);
      }
    } catch (error) { return Promise.reject(error); }
    const operation = this.writeQueue.catch(() => {}).then(async () => {
      const projects = await this.load();
      const next = { ...projects };
      if (reset) delete next[id];
      else next[id] = { ...(object(projects[id]) ? projects[id] : {}), ...validated };
      // WE's Windows control command must fit CreateProcess's command-line
      // limit, including its executable, location and RAW JSON framing.
      if (next[id] && Buffer.byteLength(JSON.stringify(next[id])) > 24 * 1024) throw new Error('WALLPAPER_PROPERTY_TEXT_TOO_LONG');
      const encoded = JSON.stringify({ version: 1, projects: next });
      if (Buffer.byteLength(encoded) > 4 * 1024 * 1024) throw new Error('WALLPAPER_PROPERTY_STORE_FULL');
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      await fs.writeFile(temporary, encoded, 'utf8');
      await fs.rename(temporary, this.file);
      this.loaded = Promise.resolve(next);
    });
    this.writeQueue = operation;
    return operation;
  }
}

module.exports = { readSavedWallpaperProperties, WallpaperPropertyStore, validatePropertyValue };
