// Moving drawers (FC-A50 to FC-A56). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED, UNITS } from '../site/registry/seed.js';
import { planMove, applyMove, slotsFor, slotOrder } from '../site/registry/move.js';
import { toRecord } from '../site/registry/github.js';
import { mergeRecords, commitMessage } from '../site/registry/sync.js';
import { duplicates } from '../site/registry/uniqueness.js';

const seed = () => SEED.map((d) => ({ ...d }));
const at = (list, id) => list.find((d) => d.id === id);
const uidOf = (list, id) => at(list, id).uid;
const move = (list, from, to, mode = 'shift') => applyMove(list, planMove(list, uidOf(list, from), to, mode, UNITS), '2026-11-06');

test('FC-A50 a shift moves the drawers between one slot and flags them for reprint', () => {
  const before = seed().map((d) => ({ ...d, status: 'installed' }));
  const changes = planMove(before, uidOf(before, '07'), '03', 'shift', UNITS);
  assert.deepEqual(changes.map((c) => `${c.from}>${c.to}`), ['07>03', '03>04', '04>05', '05>06', '06>07']);
  const after = applyMove(before, changes, '2026-11-06');
  assert.equal(at(after, '03').name, 'Boards');
  assert.deepEqual(['04', '05', '06', '07'].map((id) => at(after, id).name), ['Solder', 'Drivers', 'Passives', 'Semis']);
  for (const id of ['03', '04', '05', '06', '07']) assert.equal(at(after, id).status, 'built');
  for (const id of ['01', '02', '08', '09', '10', 'D1', 'F1']) assert.equal(at(after, id).status, 'installed');
  assert.equal(after.length, before.length);
  assert.deepEqual(duplicates(after), []);
});

test('a shift the other way, and a move into an empty slot changes only that drawer', () => {
  const a = move(seed(), '03', '07');
  assert.deepEqual(['03', '04', '05', '06', '07'].map((id) => at(a, id).name), ['Drivers', 'Passives', 'Semis', 'Boards', 'Solder']);
  const gap = seed().filter((d) => d.id !== '08');
  const changes = planMove(gap, uidOf(gap, '02'), '08', 'shift', UNITS);
  assert.deepEqual(changes.map((c) => `${c.from}>${c.to}`), ['02>08']);
});

test('FC-A51 a shift stops at an empty slot', () => {
  const gap = seed().filter((d) => d.id !== '08');
  const after = move(gap, '10', '05');
  assert.deepEqual(['05', '06', '07', '08'].map((id) => at(after, id).name), ['Fasteners', 'Passives', 'Semis', 'Boards']);
  assert.equal(at(after, '09').name, 'Wire');
  assert.equal(at(after, '10'), undefined);
});

test('FC-A52 a swap changes only the two drawers', () => {
  const after = move(seed(), '07', '03', 'swap');
  assert.equal(at(after, '03').name, 'Boards');
  assert.equal(at(after, '07').name, 'Solder');
  assert.equal(after.filter((d, i) => d.id !== SEED[i].id).length, 2);
});

test('FC-R92 a full unit rotates, and other units take no shift', () => {
  const after = move(seed(), '10', '01');
  assert.deepEqual(slotOrder(after.filter((d) => /^\d/.test(d.id)), UNITS[0]).map((d) => d.name).slice(0, 3), ['Fasteners', 'Desk', 'Hand tools']);
  assert.deepEqual(planMove(seed(), uidOf(seed(), '03'), 'D2', 'shift', UNITS), []);
  assert.deepEqual(planMove(seed(), uidOf(seed(), '03'), '03', 'shift', UNITS), []);
  assert.deepEqual(slotsFor(seed(), 'D1', UNITS).map((s) => s.id), ['D1', 'D2', 'D3']);
});

test('FC-R96 with no units, a move takes a free ID or swaps', () => {
  const list = seed();
  assert.deepEqual(planMove(list, uidOf(list, '03'), 'X9', 'shift', []).map((c) => c.to), ['X9']);
  assert.deepEqual(planMove(list, uidOf(list, '03'), '07', 'shift', []), []);
  assert.equal(planMove(list, uidOf(list, '03'), '07', 'swap', []).length, 2);
});

test('FC-A54 an edit on another device follows the drawer to its new ID', () => {
  const base = toRecord('bisley', seed());
  const local = toRecord('bisley', move(seed(), '05', '06'));
  const remote = { ...base, drawers: base.drawers.map((d) => (d.id === '05' ? { ...d, contents: 'Resistors, caps' } : d)) };
  const m = mergeRecords(base, local, remote);
  assert.equal(m.conflicts.length, 0);
  assert.equal(at(m.record.drawers, '06').name, 'Passives');
  assert.equal(at(m.record.drawers, '06').contents, 'Resistors, caps');
  assert.equal(at(m.record.drawers, '05').name, 'Semis');
});

test('FC-A55 two devices moving different drawers into one slot hold', () => {
  const base = toRecord('bisley', seed().filter((d) => d.id !== '08'));
  const one = { ...base, drawers: base.drawers.map((d) => (d.id === '02' ? { ...d, id: '08' } : d)) };
  const two = { ...base, drawers: base.drawers.map((d) => (d.id === '09' ? { ...d, id: '08' } : d)) };
  const m = mergeRecords(base, one, two);
  assert.equal(m.conflicts.length, 0);
  assert.match(duplicates(m.record.drawers).join(' '), /share the ID 08/);
});

test('FC-R98 two devices moving the same drawer to different slots ask which ID to keep', () => {
  const base = toRecord('bisley', seed().filter((d) => !['08', '09'].includes(d.id)));
  const one = { ...base, drawers: base.drawers.map((d) => (d.id === '02' ? { ...d, id: '08' } : d)) };
  const two = { ...base, drawers: base.drawers.map((d) => (d.id === '02' ? { ...d, id: '09' } : d)) };
  const m = mergeRecords(base, one, two);
  assert.deepEqual(m.conflicts.map((c) => [c.field, c.mine, c.theirs]), [['id', '08', '09']]);
});

test('FC-A56 registries with no keys agree on both devices', () => {
  const old = seed().map(({ uid, ...d }) => d);
  const base = toRecord('bisley', old);
  const a = { ...base, drawers: old.map((d) => (d.id === '01' ? { ...d, contents: 'Pens' } : d)) };
  const b = { ...base, drawers: old.map((d) => (d.id === '02' ? { ...d, contents: 'Pliers' } : d)) };
  const m = mergeRecords(base, a, b);
  assert.equal(m.conflicts.length, 0);
  assert.equal(at(m.record.drawers, '01').contents, 'Pens');
  assert.equal(at(m.record.drawers, '02').contents, 'Pliers');
  assert.equal(at(m.record.drawers, '02').uid, 'd-02');
});

test('FC-R99 a move commits as one plain message', () => {
  const base = toRecord('bisley', seed());
  assert.equal(commitMessage(base, toRecord('bisley', move(seed(), '07', '03'))), 'File Ctrl: 07 Boards moved to 03, 4 renumbered');
  assert.equal(commitMessage(base, toRecord('bisley', move(seed(), '07', '03', 'swap'))), 'File Ctrl: 03 Solder and 07 Boards swapped');
  const gap = seed().filter((d) => d.id !== '08');
  assert.equal(commitMessage(toRecord('bisley', gap), toRecord('bisley', move(gap, '02', '08'))), 'File Ctrl: 02 Hand tools moved to 08');
});
