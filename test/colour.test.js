// Label colour (FC-A58 to FC-A64). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFonts } from '../site/label/fonts.js';
import { standardByKey, withSize } from '../site/label/standards.js';
import { labelOps, renderLabel, renderProof } from '../site/label/render.js';
import { normHex, inkFor, readability, contrast, stripShades, isMatched, baseName, WHITE_INK } from '../site/label/colour.js';
import { SEED } from '../site/registry/seed.js';
import { readRegistry, toCsv } from '../site/registry/csv.js';
import { toRecord } from '../site/registry/github.js';
import { mergeRecords, commitMessage } from '../site/registry/sync.js';
import { checks } from '../site/check/checks.js';
import { renderSheet, renderPagePreview, PAGES } from '../site/export/sheet.js';
import { ICONS } from '../site/icons/icons.js';

const buf = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const fonts = parseFonts(buf('site/fonts/InterTight-700.ttf'), buf('site/fonts/InterTight-400.ttf'));
const std = standardByKey('bisley');
const icon = (d) => ICONS[d.icon]?.f || '';
const seed = () => SEED.map((d) => ({ ...d }));
const fills = (d) => [...new Set(labelOps(fonts, withSize(std, d.size), d, icon(d)).ops.map((o) => o.fill))].sort();

test('hex colours read the same however they are typed', () => {
  for (const v of ['#a8ada8', 'A8ADA8', ' #A8ADA8 ']) assert.equal(normHex(v), '#A8ADA8');
  assert.equal(normHex('abc'), '#AABBCC');
  assert.equal(normHex('#ab'), '');
  assert.equal(normHex(''), '');
});

test('FC-A58 a white label draws exactly as before', () => {
  const d = SEED[0];
  assert.deepEqual(inkFor('').full, WHITE_INK.full);
  assert.deepEqual(fills(d), [WHITE_INK.full, WHITE_INK.contents, WHITE_INK.id, WHITE_INK.rule].sort());
  assert.equal(renderLabel(fonts, withSize(std, d.size), d, icon(d)), renderLabel(fonts, withSize(std, d.size), { ...d, ground: '#ffffff' }, icon(d)));
  assert.match(renderProof(fonts, withSize(std, d.size), d, icon(d)), /fill="#fff"/);
});

test('FC-A59 a light ground keeps black ink with tinted greys', () => {
  const k = inkFor('#E8D9B0');
  assert.equal(k.dark, false);
  assert.equal(k.full, '#101010');
  for (const c of [k.contents, k.id, k.rule]) assert.notEqual(c, WHITE_INK.contents);
  // the greys sit between the ink and the ground, in today's order
  assert.ok(contrast(k.contents, k.ground) > contrast(k.id, k.ground) && contrast(k.id, k.ground) > contrast(k.rule, k.ground));
});

test('FC-A60 a dark ground leaves the ink as bare paper', () => {
  const d = { ...SEED[0], ground: '#2F3E52' }, k = inkFor(d.ground);
  assert.equal(k.dark, true);
  assert.equal(k.full, '#FFFFFF');
  assert.ok(fills(d).includes('#FFFFFF'));
  assert.ok(!fills(d).includes('#101010'));
  assert.match(renderLabel(fonts, withSize(std, d.size), d, icon(d)), /<rect width="\d+" height="\d+" fill="#2F3E52"\/>/);
});

test('FC-A61 every ground reads, since the ink flips; a mid grey gets the faint note', () => {
  let worst = 99;
  for (let v = 0; v <= 255; v += 5) worst = Math.min(worst, readability(normHex([v, v, v].map((x) => x.toString(16).padStart(2, '0')).join(''))).ratio);
  assert.ok(worst > 4 && worst < 4.5, String(worst));
  const k = checks(fonts, withSize(std, 'multidrawer'), { ...SEED[0], ground: '#797979', ground_name: 'Mid grey' }, SEED, []).map((c) => c.text);
  assert.ok(k.some((t) => /faint on this colour/.test(t)));
  assert.ok(k.some((t) => /isn't matched to your drawer yet/.test(t)));
  assert.ok(!checks(fonts, withSize(std, 'multidrawer'), { ...SEED[0], ground: '#2F3E52', ground_name: 'Blue, tuned B2' }, SEED, []).some((c) => /colour|matched/.test(c.text)));
});

test('FC-A63 a test strip is nine shades around the colour, B2 in the middle', () => {
  const s = stripShades('#2F3E52');
  assert.deepEqual(s.map((x) => x.code), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']);
  assert.equal(s[4].hex, '#2F3E52');
  assert.equal(new Set(s.map((x) => x.hex)).size, 9);
  assert.ok(inkFor(s[1].hex) && contrast('#000000', s[1].hex) > contrast('#000000', s[7].hex));   // A is lighter than C
  const fine = stripShades('#2F3E52', 2);
  assert.ok(contrast(fine[1].hex, fine[7].hex) < contrast(s[1].hex, s[7].hex));
  assert.ok(isMatched('Goose grey, tuned C2'));
  assert.ok(!isMatched('Goose grey'));
  assert.equal(baseName('Goose grey, tuned C2'), 'Goose grey');
});

test('colour columns survive CSV and JSON, and white has no name', () => {
  const list = seed().map((d, i) => (i < 3 ? { ...d, ground: '#2f3e52', ground_name: 'Blue' } : d));
  const back = readRegistry(toCsv(list), 'r.csv');
  assert.equal(back[0].ground, '#2F3E52');
  assert.equal(back[0].ground_name, 'Blue');
  assert.equal(back[5].ground, '');
  assert.equal(readRegistry(JSON.stringify({ drawers: [{ id: '01', name: 'A', ground: '', ground_name: 'Stray' }] }), 'r.json')[0].ground_name, '');
});

test('FC-A64 a unit colour and a contents edit on another device both keep, and commit as one colour change', () => {
  const tint = (list) => list.map((d) => (/^F/.test(d.id) ? { ...d, ground: '#2F3E52', ground_name: 'Blue', status: 'built', updated: '2026-11-06' } : d));
  const base = toRecord('bisley', seed());
  const local = toRecord('bisley', tint(seed()));
  const remote = { ...base, drawers: base.drawers.map((d) => (d.id === 'F1' ? { ...d, contents: 'Breadboards only' } : d)) };
  const m = mergeRecords(base, local, remote);
  assert.equal(m.conflicts.length, 0);
  const f1 = m.record.drawers.find((d) => d.id === 'F1');
  assert.equal(f1.ground, '#2F3E52');
  assert.equal(f1.contents, 'Breadboards only');
  assert.equal(commitMessage(base, local), 'File Ctrl: File cabinet colour set to Blue, 3 to reprint');
});

test('sheets and PDF previews fill the ground, with bleed only on coloured cards', () => {
  const list = seed().slice(0, 2).map((d, i) => (i ? { ...d, ground: '#2F3E52' } : d));
  const sheet = renderSheet(fonts, withSize(std, 'multidrawer'), list, icon);
  assert.match(sheet, /fill="#fff"/);
  assert.match(sheet, /fill="#2F3E52"/);
  const page = renderPagePreview(fonts, withSize(std, 'multidrawer'), list, icon, PAGES.letter);
  assert.equal((page.match(/fill="#2F3E52"/g) || []).length, 1);
});
