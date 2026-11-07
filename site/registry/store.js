// Autosave. Every touch of browser storage is guarded (FC-R23). Keys start with file-ctrl: all tools on the site share one origin.
const KEY = 'file-ctrl.registry';

export function load() {
  try { const s = localStorage.getItem(KEY); return { data: s ? JSON.parse(s) : null, ok: true }; }
  catch { return { data: null, ok: false }; }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function clear() {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}

// GitHub connection, kept apart from the registry so it can't reach an export or the repo (FC-R73).
// file-ctrl.github: { repo, token }. file-ctrl.sync: { repo, sha, base }, the registry as last synced.
const GH = 'file-ctrl.github', SYNC = 'file-ctrl.sync';
const get = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };
const put = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); return true; } catch { return false; } };
export const loadGitHub = () => get(GH);
export const saveGitHub = (v) => put(GH, v);
export const loadSync = () => get(SYNC);
export const saveSync = (v) => put(SYNC, v);
