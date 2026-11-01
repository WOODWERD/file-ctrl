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
