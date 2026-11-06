import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFonts } from '../site/label/fonts.js';
import { standardByKey, withSize } from '../site/label/standards.js';
import { SEED, UNITS } from '../site/registry/seed.js';
import { toCsv, readRegistry } from '../site/registry/csv.js';
import { duplicates, iconUsedBy, nameUsedBy } from '../site/registry/uniqueness.js';
import { nameCheck } from '../site/check/namecheck.js';
import { checkSvg } from '../site/check/svgrules.js';
import { checks, blocked } from '../site/check/checks.js';
import { ICONS } from '../site/icons/icons.js';

const buf = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const fonts = parseFonts(buf('site/fonts/InterTight-700.ttf'), buf('site/fonts/InterTight-400.ttf'));
const std = standardByKey('bisley');
const row = (o) => ({ id: '11', name: '', contents: '', icon: 'kit', icon_source: 'iconctrl', custom_svg: '', icon_weak: false, version: 'v3', status: 'built', updated: '', size: '', ...o });

test('FC-A06 and FC-A07 names and icons stay unique', () => {
  assert.equal(nameUsedBy(SEED, 'solder', '11').id, '03');
  assert.equal(nameUsedBy(SEED, 'Solder', '03'), undefined);
  assert.equal(iconUsedBy(SEED, 'dev-board', '11').id, '07');
  assert.equal(iconUsedBy(SEED, 'dev-board', '07'), undefined);
  assert.ok(blocked(checks(fonts, std, row({ name: 'Solder', icon: 'nut' }), SEED, UNITS)));
  assert.ok(blocked(checks(fonts, std, row({ name: 'Parts', icon: 'dev-board' }), SEED, UNITS)));
  assert.equal(duplicates(SEED).length, 0);
  assert.equal(duplicates([...SEED, row({ name: 'Solder', icon: 'dev-board' })]).length, 2);
});

test('FC-A09 seeds raise no suggestions', () => {
  for (const d of SEED) assert.equal(nameCheck(d, SEED, true).kind, 'ok', d.id);
});

test('FC-A10 overlap is flagged and the name is left alone', () => {
  const d = row({ name: 'Parts', contents: 'Resistors, capacitors, pots' });
  const r = nameCheck(d, SEED, true);
  assert.equal(r.kind, 'overlap'); assert.equal(r.other.id, '05');
  assert.equal(d.name, 'Parts');
});

test('FC-A11 unknown words are said to be unknown', () => {
  assert.equal(nameCheck(row({ name: 'Parts', contents: 'Gaskets, o-rings, shims' }), SEED, true).kind, 'unknown');
});

test('name check covers duplicate, fit and mismatch', () => {
  assert.equal(nameCheck(row({ name: 'Wire', contents: 'Hookup wire' }), SEED, true).kind, 'duplicate');
  assert.equal(nameCheck(row({ name: 'Instrument cables', contents: 'Probes' }), SEED, false).suggestion, 'Instrument');
  assert.equal(checks(fonts, std, row({ name: 'Hand tool storage' , contents: 'Bins' }), SEED, UNITS).some((c) => c.id === 'FC-K03'), false);
  const m = nameCheck(row({ name: 'Stuff', contents: 'Glue, epoxy, threadlocker' }), SEED, true);
  assert.equal(m.kind, 'mismatch'); assert.equal(m.suggestion, 'Adhesives');
});

test('FC-A12 custom SVG rules', () => {
  const good = '<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M4 4h16v16H4zM8 8v8h8V8z"/></svg>';
  assert.ok(checkSvg(good).ok, JSON.stringify(checkSvg(good).fails));
  const has = (s, w) => assert.ok(checkSvg(s).fails.some((f) => f.includes(w)), `${w}: ${checkSvg(s).fails}`);
  has(good.replace('0 0 24 24', '0 0 32 32'), 'viewBox');
  has(good.replace('currentColor', '#000'), 'fill currentColor');
  has(good.replace('<path', '<path stroke="currentColor" stroke-width="2"'), 'no stroke');
  has(good.replace(' fill-rule="evenodd"', ''), 'evenodd');
  has(good.replace('M4 4h16', 'M0.5 4h16'), 'within 1 to 23');
  has(good.replace('<path', '<text>S</text><path'), 'No text');
  has(good.replace('<path', '<script>x()</script><path'), 'script');
  has(good.replace('<path', '<path onclick="x()"'), 'event');
  has('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16"/></svg>', 'Use no stroke');
  assert.ok(!checkSvg('hello').ok);
  for (const f of ['soldering-iron', 'chip', 'usb-cable', 'nut']) assert.ok(checkSvg(readFileSync(`test/fixtures/${f}.svg`, 'utf8')).ok, f);
});

test('FC-A16 registry round trips through CSV and JSON', () => {
  const list = [...SEED, row({ name: 'Iron "hot", 40W', contents: 'Tips, stand', icon: 'custom-x', icon_source: 'custom', custom_svg: '<svg\n viewBox="0 0 24 24"></svg>', icon_weak: true })];
  assert.deepEqual(readRegistry(toCsv(list), 'r.csv'), list);
  assert.deepEqual(readRegistry(JSON.stringify({ drawers: list }), 'r.json'), list);
  assert.throws(() => readRegistry('name,icon\na,b\n', 'x.csv'), /no id column/);
});

test('checks use plain words', () => {
  const k = (o, u = UNITS) => checks(fonts, std, row(o), SEED, u).map((c) => c.id);
  assert.ok(k({ name: '', icon: '' }).includes('FC-K01'));
  assert.ok(k({ name: 'Instrumentationandmeasurementcables' }).includes('FC-K02'));
  assert.ok(k({ name: 'Instrumentations' }).includes('FC-K03'));
  assert.ok(k({ id: '12', name: 'Parts' }).includes('FC-K06'));
  assert.ok(!k({ id: '12', name: 'Parts' }, []).includes('FC-K06'));
  assert.ok(!k({ id: 'D1', name: 'Parts' }).includes('FC-K07'));
  assert.ok(k({ id: 'D1', name: 'Parts' }, UNITS.map((u) => ({ ...u, measured: false }))).includes('FC-K07'));
  assert.ok(k({ name: 'Parts', contents: '10k Ω' }).length >= 0);
  const notes = SEED.flatMap((d) => checks(fonts, withSize(std, d.size), d, SEED, UNITS));
  assert.equal(notes.filter((c) => c.id === 'FC-K11').length, 0);
  assert.equal(notes.filter((c) => c.level === 'hold').length, 0);
  assert.equal(notes.length, 0);
});

test('FC-A32 every seed drawer has its own Icon Ctrl icon', () => {
  assert.equal(SEED.length, 16);
  for (const d of SEED) { assert.ok(ICONS[d.icon], d.id); assert.equal(d.icon_source, 'iconctrl'); assert.equal(d.icon_weak, false); }
  assert.equal(new Set(SEED.map((d) => d.icon)).size, 16);
});

test('FC-A33 old Tabler registries move to Icon Ctrl', () => {
  const old = 'id,name,contents,icon,icon_source,custom_svg,icon_weak,version,status,updated\n03,Solder,Flux,droplet,tabler,,true,v4,built,2026-10-30\n11,Parts,Bins,anchor,tabler,,false,v4,built,2026-10-30\n';
  const [a, b] = readRegistry(old, 'old.csv');
  assert.deepEqual([a.icon, a.icon_source, a.icon_weak], ['soldering-iron', 'iconctrl', false]);
  assert.equal(b.icon, 'anchor');
  const k = checks(fonts, std, b, [b], UNITS);
  assert.ok(blocked(k) && k.some((c) => c.id === 'FC-K10' && c.text.includes('old icon set')));
  const j = readRegistry(JSON.stringify([{ id: '08', name: 'Connectors', icon: 'plug-connected', icon_source: 'tabler' }]), 'r.json');
  assert.equal(j[0].icon, 'connector');
});
