'use strict';
const fs = require('fs');
const path = require('path');

function createOnboardingStore(userDataPath) {
  const file = path.join(userDataPath, 'onboarding-state.json');
  function read() {
    try {
      if (fs.statSync(file).size > 4096) return {};
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { visual: value.visual === true, login: value.login === true };
    } catch (_) { return {}; }
  }
  function markSeen(kind) {
    if (kind !== 'visual' && kind !== 'login') return { ok: false, error: 'INVALID_GUIDE' };
    const payload = read();
    if (payload[kind]) return { ok: true, payload };
    payload[kind] = true;
    const temporary = file + '.tmp';
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify(payload), 'utf8');
      fs.renameSync(temporary, file);
      return { ok: true, payload };
    } catch (error) { return { ok: false, error: error.code || 'GUIDE_SAVE_FAILED' }; }
  }
  return { read, markSeen };
}
module.exports = { createOnboardingStore };
