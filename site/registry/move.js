// Moving a drawer to another slot (FC-R89 to FC-R96). No page code, so it's tested on its own.
// The ID is the slot and is printed, so every drawer whose ID changes needs a new label.

export const unitOf = (id, units) => units.find((u) => u.test(id));

// Where a drawer can go: its unit's slots, each with the drawer in it now, or null when empty
export function slotsFor(drawers, id, units) {
  const u = unitOf(id, units);
  if (!u) return [];
  return u.slots.map((s) => ({ id: s, drawer: drawers.find((d) => d.id === s) || null }));
}

// The ID changes a move makes, as [{ uid, from, to }]. mode is 'shift' or 'swap' (Q17).
// Shift: the drawers between move one slot toward the old one, stopping at an empty slot (FC-R92).
export function planMove(drawers, uid, to, mode, units) {
  const mover = drawers.find((d) => d.uid === uid);
  if (!mover || !to || to === mover.id) return [];
  const at = (id) => drawers.find((d) => d.id === id);
  const target = at(to);
  if (!target) return [{ uid, from: mover.id, to }];
  if (mode === 'swap') return [{ uid, from: mover.id, to }, { uid: target.uid, from: to, to: mover.id }];
  const u = unitOf(mover.id, units);
  if (!u || u !== unitOf(to, units)) return [];   // FC-R96: no slots, so no shift
  const i = u.slots.indexOf(mover.id), j = u.slots.indexOf(to), dir = Math.sign(i - j);
  const out = [{ uid, from: mover.id, to }];
  for (let k = j, cur = target; cur; k += dir) {
    const next = u.slots[k + dir];
    out.push({ uid: cur.uid, from: cur.id, to: next });
    cur = next === mover.id ? null : at(next);
  }
  return out;
}

// The registry after a move. Changed drawers go back to built with today's date (FC-R94).
export function applyMove(drawers, changes, date) {
  const by = new Map(changes.map((c) => [c.uid, c.to]));
  return drawers.map((d) => (by.has(d.uid) ? { ...d, id: by.get(d.uid), status: 'built', updated: date } : d));
}

// Each unit's drawers in slot order (FC-R96)
export const slotOrder = (list, u) => [...list].sort((a, b) => u.slots.indexOf(a.id) - u.slots.indexOf(b.id));
