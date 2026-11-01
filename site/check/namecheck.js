// Rules-only name check (FC-R40 to FC-R47). It suggests; it never renames.
import { CATEGORIES, SHORTHAND } from './synonyms.js';
import { nameUsedBy } from '../registry/uniqueness.js';

const single = (w) => (/ies$/.test(w) ? w.slice(0, -3) + 'y' : /(ch|sh|x)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 -]/g, ' ').trim().split(/\s+/).map(single).join(' ');
const expand = (s) => { const n = norm(s); return norm(SHORTHAND[n] || n); };
export const items = (contents) => String(contents || '').split(',').map((s) => s.trim()).filter(Boolean);

// Whole-word match either way, so "label tape" meets "tape"
const meets = (a, b) => a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
const terms = (d) => [norm(d.name), ...items(d.contents).map(expand)].filter(Boolean);
const matches = (list, term) => list.some((t) => meets(term, t));

export function nameCheck(drawer, drawers, fits) {
  const others = drawers.filter((d) => d.id !== drawer.id);
  const self = drawers.find((d) => d.id === drawer.id);
  const list = items(drawer.contents).map(expand);
  const name = norm(drawer.name);
  const label = (d) => `${d.id} ${d.name}`;

  const dup = nameUsedBy(drawers, drawer.name, drawer.id);
  if (dup) {
    const counts = {};
    for (const t of list) for (const w of t.split(' ')) if (w.length > 2) counts[w] = (counts[w] || 0) + 1;
    const pick = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).find((w) => !nameUsedBy(drawers, w, drawer.id));
    const suggestion = pick ? pick[0].toUpperCase() + pick.slice(1) : '';
    return { kind: 'duplicate', other: dup, suggestion, reason: `${label(dup)} already uses this name.` };
  }
  if (!fits) {
    const word = drawer.name.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] || '';
    return { kind: 'fit', suggestion: word, reason: "This name won't fit at 9 pt. One word reads best." };
  }
  if (!list.length) return { kind: 'unknown', reason: "Add contents and the app can check the name." };

  let best = null, bestN = 0;
  for (const d of others) {
    const t = terms(d), n = list.filter((i) => matches(t, i)).length;
    if (n > bestN) { best = d; bestN = n; }
  }
  if (best && bestN * 2 >= list.length) return { kind: 'overlap', other: best, reason: `Most of these belong with ${label(best)}.` };

  const ownTerms = self ? terms(self) : [];
  const catHits = Object.entries(CATEGORIES).map(([cat, words]) => [cat, list.filter((i) => words.some((w) => meets(i, norm(w)))).length]);
  const nameHit = list.some((i) => meets(i, name)) || catHits.some(([cat, n]) => n > 0 && norm(cat) === name);
  const [topCat, topN] = catHits.sort((a, b) => b[1] - a[1])[0];
  if (!nameHit && topN * 2 >= list.length && !ownTerms.includes(name) && !nameUsedBy(drawers, topCat, drawer.id)) {
    return { kind: 'mismatch', suggestion: topCat, reason: `These look like ${topCat.toLowerCase()}, and the name doesn't say so.` };
  }
  const known = nameHit || bestN > 0 || topN > 0 || (self && list.some((i) => matches(ownTerms, i)));
  if (!known) return { kind: 'unknown', reason: "These words aren't in the registry yet, so the app can't judge the name." };
  return { kind: 'ok', reason: 'Name fits the contents.' };
}
