import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFonts } from '../site/label/fonts.js';
import { standardByKey } from '../site/label/standards.js';
import { SEED, UNITS } from '../site/registry/seed.js';
import { toCsv, readRegistry } from '../site/registry/csv.js';
import { duplicates, iconUsedBy, nameUsedBy } from '../site/registry/uniqueness.js';
import { nameCheck } from '../site/check/namecheck.js';
import { checkSvg } from '../site/check/svgrules.js';
import { checks, blocked } from '../site/check/checks.js';

const buf = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const fonts = parseFonts(buf('site/fonts/InterTight-700.ttf'), buf('site/fonts/InterTight-400.ttf'));
const std = standardByKey('bisley');
const row = (o) => ({ id: '11', name: '', contents: '', icon: 'box', icon_source: 'tabler', custom_svg: '', icon_weak: false, version: 'v3', status: 'built', updated: '', ...o });

test('FC-A06 and FC-A07 names and icons stay unique', () => {
  assert.equal(nameUsedBy(SEED, 'solder', '11').id, '03');
  assert.equal(nameUsedBy(SEED, 'Solder', '03'), undefined);
  assert.equal(iconUsedBy(SEED, 'cpu', '11').id, '07');
  assert.equal(iconUsedBy(SEED, 'cpu', '07'), undefined);
  assert.ok(blocked(checks(fonts, std, row({ name: 'Solder', icon: 'nut' }), SEED, UNITS)));
  assert.ok(blocked(checks(fonts, std, row({ name: 'Parts', icon: 'cpu' }), SEED, UNITS)));
  assert.equal(duplicates(SEED).length, 0);
  assert.equal(duplicates([...SEED, row({ name: 'Solder', icon: 'cpu' })]).length, 2);
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
  const m = nameCheck(row({ name: 'Stuff', contents: 'Glue, epoxy, threadlocker' }), SEED, true);
  assert.equal(m.kind, 'mismatch'); assert.equal(m.suggestion, 'Adhesives');
});

test('FC-A12 custom SVG rules', () => {
  const iron = readFileSync('test/fixtures/custom-soldering-iron.svg', 'utf8');
  assert.ok(checkSvg(iron).ok, JSON.stringify(checkSvg(iron).fails));
  const good = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16"/></svg>';
  assert.ok(checkSvg(good).ok);
  const has = (s, w) => assert.ok(checkSvg(s).fails.some((f) => f.includes(w)), `${w}: ${checkSvg(s).fails}`);
  has(good.replace('0 0 24 24', '0 0 32 32'), 'viewBox');
  has(good.replace('fill="none"', 'fill="#000"'), 'fill none');
  has(good.replace('currentColor', '#000'), 'currentColor');
  has(good.replace('stroke-width="2"', 'stroke-width="1"'), 'stroke-width');
  has(good.replace('stroke-linecap="round"', 'stroke-linecap="square"'), 'round caps');
  has(good.replace('M4 4h16', 'M1 4h16'), 'within 2 to 22');
  has(good.replace('<path d="M4 4h16"/>', '<text>S</text><path d="M4 4h16"/>'), 'No text');
  has(good.replace('<path d="M4 4h16"/>', '<script>x()</script><path d="M4 4h16"/>'), 'script');
  has(good.replace('<path', '<path onclick="x()"'), 'event');
  assert.ok(!checkSvg('hello').ok);
  for (const f of ['box', 'cpu', 'usb', 'nut']) assert.ok(checkSvg(readFileSync(`test/fixtures/${f}.svg`, 'utf8')).ok, f);
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
  assert.ok(k({ name: 'Instrumentation and measurement cables' }).includes('FC-K02'));
  assert.ok(k({ name: 'Instrument cables' }).includes('FC-K03'));
  assert.ok(k({ id: '12', name: 'Parts' }).includes('FC-K06'));
  assert.ok(!k({ id: '12', name: 'Parts' }, []).includes('FC-K06'));
  assert.ok(k({ id: 'F1', name: 'Parts' }).includes('FC-K07'));
  assert.ok(k({ name: 'Parts', contents: '10k Ω' }).length >= 0);
  const notes = SEED.flatMap((d) => checks(fonts, std, d, SEED, UNITS));
  assert.equal(notes.filter((c) => c.level === 'hold').length, 0);
  assert.equal(notes.length, 9);
});
