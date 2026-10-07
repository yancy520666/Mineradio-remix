'use strict';

// One active account, one full-list request per minute. Failed reads never
// invent a negative liked state, and an old session cannot fill the new cache.
function createNeteaseLikeCache({ fetchList, now = Date.now, onFailure = () => {} }) {
  const ttl = 60000;
  let active = null;
  function scopeFor(owner) {
    if (!active || active.cookie !== owner.cookie || active.uid !== String(owner.uid)) {
      active = { cookie: owner.cookie, uid: String(owner.uid), ids: null, at: 0,
        pending: null, retryAt: 0, code: 0, overrides: new Map() };
    }
    return active;
  }
  function response(scope, ids, complete) {
    const liked = {};
    if (scope.ids) ids.forEach(id => { liked[String(id)] = scope.ids.has(String(id)); });
    return { liked, complete, retryAfterMs: Math.max(0, scope.retryAt - now()), code: scope.code || 200 };
  }
  async function check(owner, ids) {
    if (!owner.cookie || !owner.uid) return { liked: {}, complete: false, code: 401 };
    const scope = scopeFor(owner);
    if (scope.ids && now() - scope.at < ttl) return response(scope, ids, true);
    if (scope.retryAt > now()) return response(scope, ids, false);
    if (!scope.pending) {
      scope.pending = Promise.resolve().then(() => fetchList(owner)).then(result => {
        if (active !== scope) return;
        const body = result && (result.body || result);
        if (!body || (body.code != null && Number(body.code) !== 200) || !Array.isArray(body.ids)) {
          throw { status: body && body.code || 502 };
        }
        const liked = new Set(body.ids.map(String));
        scope.overrides.forEach((change, id) => {
          if (now() - change.at >= ttl) { scope.overrides.delete(id); return; }
          if (change.liked) liked.add(id); else liked.delete(id);
        });
        scope.ids = liked; scope.at = now(); scope.retryAt = 0; scope.code = 0;
      }).catch(error => {
        if (active !== scope) return;
        const code = Number(error && (error.status || error.body && error.body.code || error.code)) || 502;
        scope.code = code;
        scope.retryAt = now() + (code === 405 || code === 429 ? 60000 : 15000);
        // Never hand the upstream error/Cookie object to the logger.
        onFailure({ code, retryAfterMs: scope.retryAt - now() });
      }).finally(() => { scope.pending = null; });
    }
    await scope.pending;
    if (active !== scope) return { liked: {}, complete: false, code: 409 };
    return response(scope, ids, scope.code === 0);
  }
  function record(owner, id, liked) {
    const scope = scopeFor(owner), key = String(id);
    scope.overrides.set(key, { liked: !!liked, at: now() });
    if (scope.ids) { if (liked) scope.ids.add(key); else scope.ids.delete(key); }
  }
  return { check, record, reset() { active = null; } };
}

module.exports = { createNeteaseLikeCache };
