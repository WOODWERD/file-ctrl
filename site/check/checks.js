// Plain-language checks next to the label (FC-K01 to FC-K10). hold blocks save; note doesn't.
import { nameUsedBy, iconUsedBy } from '../registry/uniqueness.js';
import { derive } from '../label/geometry.js';
import { fitLabel } from '../label/fit.js';
import { isOldIcon } from '../icons/legacy.js';

const missing = (fonts, text) => [...new Set([...text].filter((c) => c !== ' ' && fonts.regular.charToGlyph(c).index === 0))];

export function checks(fonts, std, d, drawers, units) {
  const out = [];
  const hold = (id, text) => out.push({ id, level: 'hold', text });
  const note = (id, text) => out.push({ id, level: 'note', text });
  const f = fitLabel(fonts, derive(std), d.name, d.contents);
  if (!d.id) hold('FC-K01', 'Add an ID to save this drawer.');
  if (!d.name) hold('FC-K01', 'Add a name to save this drawer.');
  if (!d.icon && !d.custom_svg) hold('FC-K01', 'Pick an icon to save this drawer.');
  if (isOldIcon(d)) hold('FC-K10', 'Pick an icon. This one was from the old icon set.');
  if (d.name && f.nameOver) hold('FC-K02', 'This name is too long even at 6 pt. Shorten it.');
  if (d.name && !f.nameOver && f.namePt < 7) note('FC-K03', `Name prints at ${f.namePt} pt. Consider a shorter one.`);
  if (f.contentsOver) note('FC-K04', `Contents run to ${f.lines.length} lines. Trim the list.`);
  const n = nameUsedBy(drawers, d.name, d.id);
  if (d.name && n) hold('FC-K05', `Name already used by ${n.id}.`);
  const i = iconUsedBy(drawers, d.icon, d.id);
  if (i) hold('FC-K05', `Icon already used by ${i.id}.`);
  if (units.length) {
    const u = units.find((x) => x.test(d.id));
    if (d.id && !u) note('FC-K06', `ID ${d.id} isn't in 01 to 10, D1 to D3 or F1 to F3.`);
    if (u && !u.measured) note('FC-K07', `${u.name} card size isn't measured yet.`);
  }
  if (std.windowMeasured === false) note('FC-K11', `${std.sizeName} window isn't measured yet, so text keeps to an assumed ${std.window.w} × ${std.window.h}.`);
  if (d.icon_weak) note('FC-K08', 'This icon is flagged for a better one.');
  const gone = missing(fonts, (d.name || '').toUpperCase() + (d.contents || '') + d.id);
  if (gone.length) note('FC-K09', `The label font has no ${gone.join(' ')}, so it prints as a gap.`);
  return out;
}

export const blocked = (list) => list.some((c) => c.level === 'hold');
