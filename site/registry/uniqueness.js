// One row per ID, and no two rows share a name or an icon (FC-R21).
const key = (s) => String(s || '').trim().toLowerCase();

export const nameUsedBy = (drawers, name, self) => drawers.find((d) => d.id !== self && key(d.name) === key(name));
export const iconUsedBy = (drawers, icon, self) => (icon ? drawers.find((d) => d.id !== self && d.icon === icon) : undefined);

// Plain sentences, each naming the rows, for a file that breaks the rules
export function duplicates(drawers) {
  const out = [];
  for (const [field, word] of [['id', 'ID'], ['name', 'name'], ['icon', 'icon'], ['uid', 'drawer key']]) {
    const seen = new Map();
    drawers.forEach((d, i) => {
      const k = key(d[field]);
      if (!k) return;
      seen.set(k, [...(seen.get(k) || []), i + 2]);
    });
    for (const [k, rows] of seen) if (rows.length > 1) out.push(`Rows ${rows.join(' and ')} share the ${word} ${k}.`);
  }
  return out;
}
