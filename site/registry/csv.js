// Registry import and export. CSV follows RFC 4180, so custom SVGs keep their line breaks (FC-R24, FC-A16).
export const COLUMNS = ['id', 'name', 'contents', 'icon', 'icon_source', 'custom_svg', 'icon_weak', 'version', 'status', 'updated'];
const STATUS = ['built', 'printed', 'installed'];

export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = ''; rows.push(row); row = [];
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export const toCsv = (drawers) => [COLUMNS.join(','), ...drawers.map((d) => COLUMNS.map((c) => cell(d[c])).join(','))].join('\n') + '\n';

export function normalise(o) {
  const d = {};
  for (const c of COLUMNS) d[c] = o[c] ?? '';
  d.id = String(d.id).trim();
  d.name = String(d.name).trim();
  d.icon_weak = d.icon_weak === true || String(d.icon_weak).toLowerCase() === 'true';
  d.icon_source = d.icon_source === 'custom' ? 'custom' : 'tabler';
  if (!STATUS.includes(d.status)) d.status = 'built';
  d.version = d.version || 'v4';
  return d;
}

// Returns rows, or throws with a message saying what to fix
export function readRegistry(text, filename = '') {
  if (/\.json$/i.test(filename) || /^\s*[[{]/.test(text)) {
    let j;
    try { j = JSON.parse(text); } catch { throw new Error("This JSON file can't be read. Export it again and retry."); }
    const list = Array.isArray(j) ? j : j.drawers;
    if (!Array.isArray(list)) throw new Error('This JSON file has no drawers list.');
    return list.map(normalise);
  }
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('This file has no drawers in it.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ['id', 'name'].filter((c) => !head.includes(c));
  if (missing.length) throw new Error('This CSV has no ' + missing.join(' or ') + ' column. Add it and import again.');
  return rows.slice(1).map((r) => normalise(Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))));
}
