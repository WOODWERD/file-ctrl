// One sync with the data repo (FC-R77 to FC-R83). No page code, so it's tested against a fake GitHub.
import { normalise } from './csv.js';
import { duplicates } from './uniqueness.js';
import { README_PATH, readme } from './github.js';
import { UNITS } from './seed.js';

const FIELDS = ['id', 'name', 'contents', 'icon', 'icon_source', 'custom_svg', 'icon_weak', 'version', 'status', 'updated', 'size', 'ground', 'ground_name'];
const canon = (rec) => JSON.stringify({ standard: rec.standard, drawers: rec.drawers.map(normalise) });
export const same = (a, b) => canon(a) === canon(b);
const rowSame = (a, b) => (!a && !b) || (!!a && !!b && JSON.stringify(normalise(a)) === JSON.stringify(normalise(b)));
// Drawers are matched by uid, so an edit follows a drawer whose ID changed (FC-R97)
const byUid = (rec) => new Map((rec?.drawers || []).map((d) => normalise(d)).map((d) => [d.uid, d]));

// Three-way merge, drawer by drawer and field by field (FC-R79). A drawer removed on one side and changed on the other is kept.
export function mergeRecords(base, local, remote) {
  const B = byUid(base), L = byUid(local), R = byUid(remote), conflicts = [];
  const keys = [...R.keys(), ...[...L.keys()].filter((k) => !R.has(k))];
  const drawers = [];
  for (const uid of keys) {
    const b = B.get(uid), l = L.get(uid), r = R.get(uid);
    if (rowSame(l, b)) { if (r) drawers.push(r); continue; }
    if (rowSame(r, b)) { if (l) drawers.push(l); continue; }
    if (!l || !r) { drawers.push(l || r); continue; }
    const d = { ...r };
    for (const f of FIELDS) {
      const bv = b?.[f], lv = l[f], rv = r[f];
      if (lv === rv || lv === bv) continue;
      if (rv === bv) { d[f] = lv; continue; }
      if (f === 'updated') { d[f] = lv > rv ? lv : rv; continue; } // a date, so the later one
      conflicts.push({ uid, id: r.id, field: f, mine: lv, theirs: rv });
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
  conflicts.forEach((c, i) => { if (keep[i] === 'mine') drawers.find((d) => d.uid === c.uid)[c.field] = c.mine; });
  return { ...merged, drawers };
}

// "07 Boards moved to 03, 4 renumbered" or "03 Solder and 07 Boards swapped" (FC-R99)
function movePart(moved) {
  if (!moved.length) return '';
  const tag = ([o, d]) => `${o.id} ${d.name}`;
  if (moved.length === 2 && moved[0][0].id === moved[1][1].id && moved[1][0].id === moved[0][1].id) return `${moved.map(tag).sort().join(' and ')} swapped`;
  const jump = ([o, d]) => Math.abs((parseInt(o.id.replace(/\D/g, ''), 10) || 0) - (parseInt(d.id.replace(/\D/g, ''), 10) || 0));
  const main = moved.reduce((a, b) => (jump(b) > jump(a) ? b : a));
  return `${tag(main)} moved to ${main[1].id}` + (moved.length > 1 ? `, ${moved.length - 1} renumbered` : '');
}

// FC-R110: "10-drawer colour set to Goose grey, 10 to reprint"
function colourPart(recoloured, after) {
  if (!recoloured.length) return '';
  const name = recoloured[0].ground_name || (recoloured[0].ground ? recoloured[0].ground : 'White');
  const same = recoloured.every((d) => d.ground === recoloured[0].ground && d.ground_name === recoloured[0].ground_name);
  const n = recoloured.length, reprint = `${n} to reprint`;
  if (!same) return `${n} label colours changed, ${reprint}`;
  const u = UNITS.find((x) => recoloured.every((d) => x.test(d.id)) && [...after.values()].filter((d) => x.test(d.id)).length === n);
  if (u) return `${u.name} colour set to ${name}, ${reprint}`;
  return n <= 2 ? `${recoloured.map((d) => `${d.id} ${d.name}`).join(', ')} colour set to ${name}` : `${n} drawers colour set to ${name}, ${reprint}`;
}

// "File Ctrl: 05 PASSIVES changed, 2 marked printed" (FC-R78)
export function commitMessage(before, after) {
  const B = byUid(before), A = byUid(after), tag = (d) => `${d.id} ${d.name}`;
  const added = [...A.values()].filter((d) => !B.has(d.uid));
  const removed = [...B.values()].filter((d) => !A.has(d.uid));
  const changed = [], printed = [], moved = [], recoloured = [];
  for (const d of A.values()) {
    const o = B.get(d.uid);
    if (!o || rowSame(o, d)) continue;
    if ((o.ground !== d.ground || o.ground_name !== d.ground_name) && FIELDS.every((f) => ['ground', 'ground_name', 'status', 'updated'].includes(f) || o[f] === d[f])) { recoloured.push(d); continue; }
    if (o.id !== d.id && FIELDS.every((f) => ['id', 'status', 'updated'].includes(f) || o[f] === d[f])) { moved.push([o, d]); continue; }
    const onlyStatus = FIELDS.every((f) => f === 'status' || f === 'updated' || o[f] === d[f]);
    if (onlyStatus && d.status !== o.status) printed.push(d); else changed.push(d);
  }
  const part = (list, word) => (!list.length ? '' : list.length <= 2 ? `${list.map(tag).join(', ')} ${word}` : `${list.length} drawers ${word}`);
  const statusPart = !printed.length ? '' : printed.every((d) => d.status === printed[0].status) ? `${printed.length} marked ${printed[0].status}` : `${printed.length} status changes`;
  const parts = [movePart(moved), colourPart(recoloured, A), part(added, 'added'), part(changed, 'changed'), part(removed, 'removed'), statusPart].filter(Boolean);
  if (!parts.length && before?.standard !== after.standard) parts.push(`cabinet standard ${after.standard}`);
  return 'File Ctrl: ' + (parts.join(', ') || 'saved');
}

// Changes on this device that GitHub doesn't have yet (FC-U13)
export function waiting(base, local) {
  if (!base) return 0;
  const B = byUid(base), L = byUid(local);
  let n = 0;
  for (const k of new Set([...B.keys(), ...L.keys()])) if (!rowSame(B.get(k), L.get(k))) n++;
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
