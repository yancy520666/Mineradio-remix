'use strict';
const fs = require('node:fs');
const path = require('node:path');
const KEYS = ['enabled', 'manualQuality', 'dismissed', 'sceneQualityPrompted', 'qualityReset'];

// App-owned choices must survive Chromium cache and localhost port changes.
function createSonicPreferencesStore(userDataPath) {
  const file = path.join(userDataPath, 'sonic-performance-preferences.json');
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SONIC_PREFERENCES');
    return Object.fromEntries(KEYS.map(key => [key, value[key] === true]));
  }
  function read() {
    try {
      if (!fs.existsSync(file)) return { ok: true, payload: null };
      if (fs.statSync(file).size > 4096) throw new Error('SONIC_PREFERENCES_TOO_LARGE');
      return { ok: true, payload: normalize(JSON.parse(fs.readFileSync(file, 'utf8'))) };
    } catch (error) { return { ok: false, error: error.message }; }
  }
  function write(value) {
    try {
      const payload = normalize(value);
      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(payload), 'utf8');
      fs.renameSync(file + '.tmp', file);
      return { ok: true, payload };
    } catch (error) { return { ok: false, error: error.message }; }
  }
  return { read, write };
}
module.exports = { createSonicPreferencesStore };
