// One sync with the data repo (FC-R77 to FC-R83). No page code, so it's tested against a fake GitHub.
import { normalise } from './csv.js';
import { duplicates } from './uniqueness.js';
import { README_PATH, readme } from './github.js';

const FIELDS = ['name', 'contents', 'icon', 'icon_source', 'custom_svg', 'icon_weak', 'version', 'status', 'updated', 'size'];
const canon = (rec) => JSON.stringify({ standard: rec.standard, drawers: rec.drawers.map(normalise) });
export const same = (a, b) => canon(a) === canon(b);
const rowSame = (a, b) => (!a && !b) || (!!a && !!b && JSON.stringify(normalise(a)) === JSON.stringify(normalise(b)));
const byId = (rec) => new Map((rec?.drawers || []).map((d) => [d.id, normalise(d)]));

// Three-way merge, drawer by drawer and field by field (FC-R79). A drawer removed on one side and changed on the other is kept.
export function mergeRecords(base, local, remote) {
  const B = byId(base), L = byId(local), R = byId(remote), conflicts = [];
  const ids = [...R.keys(), ...[...L.keys()].filter((id) => !R.has(id))];
  const drawers = [];
  for (const id of ids) {
    const b = B.get(id), l = L.get(id), r = R.get(id);
    if (rowSame(l, b)) { if (r) drawers.push(r); continue; }
    if (rowSame(r, b)) { if (l) drawers.push(l); continue; }
    if (!l || !r) { drawers.push(l || r); continue; }
    const d = { ...r };
    for (const f of FIELDS) {
      const bv = b?.[f], lv = l[f], rv = r[f];
      if (lv === rv || lv === bv) continue;
      if (rv === bv) { d[f] = lv; continue; }
      if (f === 'updated') { d[f] = lv > rv ? lv : rv; continue; } // a date, so the later one
      conflicts.push({ id, field: f, mine: lv, theirs: rv });
    }
    drawers.push(d);
  }
  let standard = remote.standard;
  if (local.standard !== (base?.standard ?? local.standard)) standard = local.standard;
  return { record: { standard, drawers }, conflicts };
}

// Apply the person's choices: keep[i] is 'mine' or 'theirs' for conflicts[i]
export function resolve(merged, conflicts, keep) {
  const drawers = merged.drawers.map((d) => ({ ...d }));
  conflicts.forEach((c, i) => { if (keep[i] === 'mine') drawers.find((d) => d.id === c.id)[c.field] = c.mine; });
  return { ...merged, drawers };
}

// "File Ctrl: 05 PASSIVES changed, 2 marked printed" (FC-R78)
export function commitMessage(before, after) {
  const B = byId(before), A = byId(after), tag = (d) => `${d.id} ${d.name}`;
  const added = [...A.values()].filter((d) => !B.has(d.id));
  const removed = [...B.values()].filter((d) => !A.has(d.id));
  const changed = [], printed = [];
  for (const d of A.values()) {
    const o = B.get(d.id);
    if (!o || rowSame(o, d)) continue;
    const onlyStatus = FIELDS.every((f) => f === 'status' || f === 'updated' || o[f] === d[f]);
    if (onlyStatus && d.status !== o.status) printed.push(d); else changed.push(d);
  }
  const part = (list, word) => (!list.length ? '' : list.length <= 2 ? `${list.map(tag).join(', ')} ${word}` : `${list.length} drawers ${word}`);
  const statusPart = !printed.length ? '' : printed.every((d) => d.status === printed[0].status) ? `${printed.length} marked ${printed[0].status}` : `${printed.length} status changes`;
  const parts = [part(added, 'added'), part(changed, 'changed'), part(removed, 'removed'), statusPart].filter(Boolean);
  if (!parts.length && before?.standard !== after.standard) parts.push(`cabinet standard ${after.standard}`);
  return 'File Ctrl: ' + (parts.join(', ') || 'saved');
}

// Changes on this device that GitHub doesn't have yet (FC-U13)
export function waiting(base, local) {
  if (!base) return 0;
  const B = byId(base), L = byId(local);
  let n = 0;
  for (const id of new Set([...B.keys(), ...L.keys()])) if (!rowSame(B.get(id), L.get(id))) n++;
  return n + (base.standard !== local.standard ? 1 : 0);
}

// base: the registry as last synced; sha: GitHub's version of it. readOnly never commits (FC-R83).
// Returns synced, conflict (FC-S25, fields), hold (FC-S25, a name or icon used twice) or error (FC-S26).
export async function syncOnce({ gh, repo, local, base, sha, readOnly = false }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const rem = await gh.readRecord();
    if (rem.error) return { status: 'error', error: rem.error };
    if (rem.missing) {
      if (readOnly) return { status: 'error', error: { kind: 'empty', text: `There is no registry in ${repo} yet. Connect a device whose token can write first; this token only reads.` } };
      if (duplicates(local.drawers).length) return { status: 'hold', record: local, base, sha, dups: duplicates(local.drawers) };
      const message = 'File Ctrl: first registry';
      const w = await gh.writeRecord(local, null, message);
      if (w.stale) continue;
      if (w.error) return { status: 'error', error: w.error };
      const rd = await gh.read(README_PATH);
      if (rd.missing) await gh.write(README_PATH, readme(repo), null, 'File Ctrl: README');
      return { status: 'synced', record: local, base: local, sha: w.sha, message, wrote: true };
    }
    if (readOnly) return { status: 'synced', record: rem.record, base: rem.record, sha: rem.sha, wrote: false };
    let next = local;
    if (!(rem.sha === sha && base)) {
      const m = mergeRecords(base, local, rem.record);
      if (m.conflicts.length) return { status: 'conflict', merged: m.record, conflicts: m.conflicts, remote: rem.record, remoteSha: rem.sha };
      next = m.record;
      base = rem.record; sha = rem.sha;
    }
    // FC-R80: never write a registry with a name or icon used twice. The merged one is kept on the device to fix there.
    const dups = duplicates(next.drawers);
    if (dups.length) return { status: 'hold', record: next, base, sha, dups };
    if (same(next, base)) return { status: 'synced', record: next, base, sha, wrote: false };
    const message = commitMessage(base, next);
    const w = await gh.writeRecord(next, sha, message);
    if (w.stale) { local = next; continue; }
    if (w.error) return { status: 'error', error: w.error, record: next, base, sha };
    return { status: 'synced', record: next, base: next, sha: w.sha, message, wrote: true };
  }
  return { status: 'error', error: { kind: 'busy', text: 'GitHub kept changing while this synced. Press Sync now in a minute.' } };
}
