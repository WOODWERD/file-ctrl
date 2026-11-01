// Named by acceptance criteria in the spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFonts } from '../site/label/fonts.js';
import { STANDARDS, standardByKey } from '../site/label/standards.js';
import { derive } from '../site/label/geometry.js';
import { fitLabel, textArea } from '../site/label/fit.js';
import { renderLabel, renderProof, labelOps } from '../site/label/render.js';
import { SEED } from '../site/registry/seed.js';
import { sheetLayout, sheetPixels, sheetCount, pageLayout, PAGES } from '../site/export/sheet.js';

const buf = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const fonts = parseFonts(buf('site/fonts/InterTight-700.ttf'), buf('site/fonts/InterTight-400.ttf'));
const std = standardByKey('bisley');
const geo = derive(std);
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
// Label v4: name pt, name lines, contents pt, contents lines
const V4 = { D1: [11.5, 1, 5.5, 2], D2: [11.5, 1, 5.5, 2], D3: [11.5, 1, 5.5, 2], '01': [11.5, 1, 5.5, 1], '02': [11.5, 2, 5.5, 2], '03': [11.5, 1, 5.5, 2], '04': [11.5, 1, 5.5, 2], '05': [11.5, 1, 5.5, 2], '06': [11.5, 1, 5.5, 2], '07': [11.5, 1, 5.5, 2], '08': [9.25, 1, 5.5, 2], '09': [11.5, 1, 5.5, 2], 10: [11.25, 1, 5.5, 2], F1: [11.5, 1, 5.5, 2], F2: [11.5, 1, 5.5, 2], F3: [11.5, 1, 5.5, 2] };

test('FC-A01 geometry', () => {
  assert.deepEqual(geo.file, { w: 44, h: 22 });
  near(geo.icon, 16.04); near(geo.text, 25.96);
  assert.deepEqual(geo.off, { x: 1, y: 2 });
  assert.equal(geo.W, 520); assert.equal(geo.H, 260);
});

test('FC-A02 and FC-A03 seeds match the v4 table', () => {
  near(textArea(geo).width / 300 * 25.4, 23.79);
  for (const d of SEED) {
    const f = fitLabel(fonts, geo, d.name, d.contents);
    assert.deepEqual([f.namePt, f.nameLines.length, f.contentsPt, f.lines.length], V4[d.id], d.id);
  }
});

test('FC-A04 name shrinks in 0.25 steps and stops at 6 pt', () => {
  const a = fitLabel(fonts, geo, 'Instrumentation', 'x');
  assert.ok(a.namePt < 9 && a.namePt >= 6 && a.namePt * 4 === Math.round(a.namePt * 4));
  assert.equal(fitLabel(fonts, geo, 'Hand tools', 'x').nameLines.length, 2);
  const b = fitLabel(fonts, geo, 'Instrumentationandmeasurementcables', 'x');
  assert.equal(b.namePt, 6); assert.ok(b.nameOver);
});

test('FC-A05 contents shrink to 4 pt, then report overflow', () => {
  const long = 'Resistors, capacitors, inductors, potentiometers, trimmers, crystals, fuses, thermistors, varistors';
  const f = fitLabel(fonts, geo, 'Parts', long);
  assert.equal(f.contentsPt, 4); assert.ok(f.lines.length > 2); assert.ok(f.contentsOver);
});

test('FC-A19 all ink stays inside the window', () => {
  const icons = JSON.parse(readFileSync('site/icons/tabler.json', 'utf8'));
  const x1 = geo.X(std.window.w), y1 = geo.Y(std.window.h);
  for (const d of SEED) {
    const { ops } = labelOps(fonts, std, d, icons[d.icon][0]);
    for (const o of ops) if (o.t === 'fill') for (const m of o.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
      assert.ok(+m[1] <= x1 + 1 && +m[2] <= y1 + 1 && +m[1] >= geo.X(0) - 1 && +m[2] >= geo.Y(0) - 1, d.id);
    }
    assert.match(renderProof(fonts, std, d, icons[d.icon][0]), /^<svg/);
    assert.match(renderLabel(fonts, std, d, icons[d.icon][0]), /width="44mm" height="22mm"/);
  }
});

test('FC-A26 sheet layout', () => {
  const l = sheetLayout(std);
  assert.equal(l.perSheet, 9);
  assert.equal(l.pitchX - l.across, 7);        // 3 of border plus 4 between stickers
  assert.ok(l.mx >= std.border && l.my >= std.border);
  assert.deepEqual(sheetPixels(std), { w: 1063, h: 2008 });
  assert.equal(sheetCount(std, 16), 2);
});

test('FC-A27 and FC-A28 page layouts', () => {
  assert.equal(pageLayout(std, PAGES.letter).perPage, 36);
  assert.equal(pageLayout(std, PAGES.a4).perPage, 40);
});

test('FC-A24 a second standard is data only', () => {
  const other = { ...std, key: 'test', name: 'TEST', prefix: 'TEST', card: { w: 60, h: 30 }, window: { w: 54, h: 24 } };
  const g = derive(other);
  assert.deepEqual(g.file, { w: 57, h: 27 });
  assert.equal(sheetLayout(other).perSheet > 0, true);
  assert.equal(STANDARDS.length >= 1, true);
});
