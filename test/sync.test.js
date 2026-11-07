// GitHub storage against a fake GitHub (FC-A39 to FC-A48). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../site/registry/seed.js';
import { client, toRecord, recordText, RECORD_PATH, README_PATH } from '../site/registry/github.js';
import { syncOnce, mergeRecords, resolve, commitMessage, waiting, same } from '../site/registry/sync.js';

const TOKEN = 'github_pat_TEST_ONLY_0000';
const REPO = 'drew/file-ctrl-data';

// A fake GitHub contents API: files by path, sha per version, 409 on a stale sha
function fakeGitHub({ files = {}, isPrivate = true, push = true, status = null } = {}) {
  let n = 0; const store = {}; const log = [];
  for (const [p, t] of Object.entries(files)) store[p] = { text: t, sha: 'v' + n++ };
  const enc = (t) => Buffer.from(t, 'utf8').toString('base64');
  const fetchFn = async (url, opts = {}) => {
    log.push({ url, opts });
    const reply = (s, j) => ({ status: s, json: async () => j });
    if (status) return reply(status, {});
    const m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)(\/contents\/(.+))?$/);
    if (!m || m[1] !== REPO) return reply(404, {});
    if (!m[2]) return reply(200, { full_name: REPO, private: isPrivate, permissions: { push } });
    const p = m[3];
    if ((opts.method || 'GET') === 'GET') return store[p] ? reply(200, { content: enc(store[p].text), encoding: 'base64', sha: store[p].sha }) : reply(404, {});
    if (!push) return reply(403, {});
    const body = JSON.parse(opts.body);
    if (store[p] && body.sha !== store[p].sha) return reply(409, {});
    if (!store[p] && body.sha) return reply(409, {});
    store[p] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 'v' + n++, message: body.message };
    return reply(store[p].sha === 'v0' ? 201 : 200, { content: { sha: store[p].sha } });
  };
  return { fetchFn, store, log, edit(p, t) { store[p] = { text: t, sha: 'v' + n++ }; } };
}

const reg = () => toRecord('bisley', SEED.map((d) => ({ ...d })));
const withRow = (rec, id, o) => ({ ...rec, drawers: rec.drawers.map((d) => (d.id === id ? { ...d, ...o } : d)) });

test('FC-A40 an empty repo gets the registry and a README, and the file re-imports identically', async () => {
  const g = fakeGitHub(); const gh = client(REPO, TOKEN, g.fetchFn);
  const local = reg();
  const r = await syncOnce({ gh, repo: REPO, local, base: null, sha: null });
  assert.equal(r.status, 'synced'); assert.ok(r.wrote);
  assert.ok(g.store[RECORD_PATH] && g.store[README_PATH]);
  assert.ok(same(JSON.parse(g.store[RECORD_PATH].text), local));
  assert.match(g.store[README_PATH].text, /woodwerd\.github\.io\/file-ctrl/);
});

test('FC-A40 an existing README is left alone', async () => {
  const g = fakeGitHub({ files: { [README_PATH]: 'mine' } }); const gh = client(REPO, TOKEN, g.fetchFn);
  await syncOnce({ gh, repo: REPO, local: reg(), base: null, sha: null });
  assert.equal(g.store[README_PATH].text, 'mine');
});

test('FC-A39 and FC-A48 requests go only to this repo, only for File Ctrl files, token only in a header', async () => {
  const g = fakeGitHub({ files: { 'tool-ctrl.json': '{"secret":1}' } }); const gh = client(REPO, TOKEN, g.fetchFn);
  let s = await syncOnce({ gh, repo: REPO, local: reg(), base: null, sha: null });
  const local = withRow(s.record, '05', { name: 'PARTS' });
  s = await syncOnce({ gh, repo: REPO, local, base: s.base, sha: s.sha });
  await gh.check();
  for (const { url, opts } of g.log) {
    assert.ok(url.startsWith(`https://api.github.com/repos/${REPO}`), url);
    assert.ok(!url.includes(TOKEN));
    assert.ok(url === `https://api.github.com/repos/${REPO}` || url.endsWith('/contents/' + RECORD_PATH) || url.endsWith('/contents/' + README_PATH), url);
    assert.equal(opts.headers.Authorization, 'Bearer ' + TOKEN);
  }
  assert.equal(g.store['tool-ctrl.json'].text, '{"secret":1}');
  for (const f of Object.values(g.store)) { assert.ok(!f.text.includes(TOKEN)); assert.ok(!String(f.message || '').includes(TOKEN)); }
  assert.ok(!recordText(local).includes(TOKEN));
  await assert.rejects(() => gh.read('tool-ctrl.json'));
});

test('FC-R78 one commit per sync, with a plain message', async () => {
  const before = reg();
  assert.equal(commitMessage(before, withRow(before, '05', { name: 'PARTS' })), 'File Ctrl: 05 PARTS changed');
  const two = withRow(withRow(before, '01', { status: 'printed' }), '02', { status: 'printed' });
  assert.equal(commitMessage(before, two), 'File Ctrl: 2 marked printed');
  const g = fakeGitHub(); const gh = client(REPO, TOKEN, g.fetchFn);
  let s = await syncOnce({ gh, repo: REPO, local: before, base: null, sha: null });
  const puts = () => g.log.filter((e) => e.opts.method === 'PUT').length;
  const n = puts();
  s = await syncOnce({ gh, repo: REPO, local: s.record, base: s.base, sha: s.sha });
  assert.equal(puts(), n, 'nothing changed, nothing written');
  s = await syncOnce({ gh, repo: REPO, local: two, base: s.base, sha: s.sha });
  assert.equal(puts(), n + 1); assert.equal(g.store[RECORD_PATH].message, 'File Ctrl: 2 marked printed');
});

test('FC-A42 two devices change different drawers, both kept with no question', async () => {
  const g = fakeGitHub(); const gh = client(REPO, TOKEN, g.fetchFn);
  const first = await syncOnce({ gh, repo: REPO, local: reg(), base: null, sha: null });
  const a = await syncOnce({ gh, repo: REPO, local: withRow(first.record, '05', { name: 'PARTS' }), base: first.base, sha: first.sha });
  const b = await syncOnce({ gh, repo: REPO, local: withRow(first.record, '07', { contents: 'ESP32, Pico' }), base: first.base, sha: first.sha });
  assert.equal(a.status, 'synced'); assert.equal(b.status, 'synced');
  const onGh = JSON.parse(g.store[RECORD_PATH].text);
  assert.equal(onGh.drawers.find((d) => d.id === '05').name, 'PARTS');
  assert.equal(onGh.drawers.find((d) => d.id === '07').contents, 'ESP32, Pico');
});

test('FC-A43 the same field on two devices asks, and the kept value goes up', async () => {
  const g = fakeGitHub(); const gh = client(REPO, TOKEN, g.fetchFn);
  const first = await syncOnce({ gh, repo: REPO, local: reg(), base: null, sha: null });
  await syncOnce({ gh, repo: REPO, local: withRow(first.record, '05', { contents: 'From the Mac' }), base: first.base, sha: first.sha });
  const b = await syncOnce({ gh, repo: REPO, local: withRow(first.record, '05', { contents: 'From the iPad' }), base: first.base, sha: first.sha });
  assert.equal(b.status, 'conflict');
  assert.deepEqual(b.conflicts.map((c) => [c.id, c.field, c.mine, c.theirs]), [['05', 'contents', 'From the iPad', 'From the Mac']]);
  const kept = resolve(b.merged, b.conflicts, ['mine']);
  const s = await syncOnce({ gh, repo: REPO, local: kept, base: b.remote, sha: b.remoteSha });
  assert.equal(s.status, 'synced');
  assert.equal(JSON.parse(g.store[RECORD_PATH].text).drawers.find((d) => d.id === '05').contents, 'From the iPad');
});

test('FC-A44 two devices give different drawers the same icon: held, nothing written', async () => {
  const g = fakeGitHub(); const gh = client(REPO, TOKEN, g.fetchFn);
  const first = await syncOnce({ gh, repo: REPO, local: reg(), base: null, sha: null });
  await syncOnce({ gh, repo: REPO, local: withRow(first.record, '05', { icon: 'jigsaw' }), base: first.base, sha: first.sha });
  const before = g.store[RECORD_PATH].sha;
  const b = await syncOnce({ gh, repo: REPO, local: withRow(first.record, '07', { icon: 'jigsaw' }), base: first.base, sha: first.sha });
  assert.equal(b.status, 'hold'); assert.match(b.dups.join(' '), /icon jigsaw/);
  assert.equal(g.store[RECORD_PATH].sha, before);
  // Fixing one drawer on this device lets it go
  const fixed = withRow(b.record, '07', { icon: 'dev-board' });
  const s = await syncOnce({ gh, repo: REPO, local: fixed, base: b.base, sha: b.sha });
  assert.equal(s.status, 'synced');
  const onGh = JSON.parse(g.store[RECORD_PATH].text).drawers;
  assert.equal(onGh.find((d) => d.id === '05').icon, 'jigsaw');
  assert.equal(onGh.find((d) => d.id === '07').icon, 'dev-board');
});

test('FC-R79 a drawer removed on one device and changed on the other is kept', () => {
  const base = reg();
  const local = { ...base, drawers: base.drawers.filter((d) => d.id !== '05') };
  const remote = withRow(base, '05', { contents: 'More' });
  const m = mergeRecords(base, local, remote);
  assert.equal(m.conflicts.length, 0);
  assert.equal(m.record.drawers.find((d) => d.id === '05').contents, 'More');
  const added = { ...base, drawers: [...base.drawers, { ...base.drawers[0], uid: 'u-new', id: '11', name: 'NEW', icon: 'nut' }] };
  assert.equal(mergeRecords(base, added, base).record.drawers.at(-1).id, '11');
  assert.equal(waiting(base, added), 1);
});

test('FC-A45 a revoked token: plain words, and the change waits on the device', async () => {
  const g = fakeGitHub({ status: 401 }); const gh = client(REPO, TOKEN, g.fetchFn);
  const local = withRow(reg(), '05', { name: 'PARTS' });
  const r = await syncOnce({ gh, repo: REPO, local, base: reg(), sha: 'v0' });
  assert.equal(r.status, 'error'); assert.equal(r.error.kind, 'auth'); assert.match(r.error.text, /new one/);
  assert.equal(local.drawers.find((d) => d.id === '05').name, 'PARTS');
  const off = client(REPO, TOKEN, async () => { throw new TypeError('offline'); });
  assert.equal((await syncOnce({ gh: off, repo: REPO, local, base: reg(), sha: 'v0' })).error.kind, 'offline');
});

test('FC-A46 a public repo is reported by check', async () => {
  const c = await client(REPO, TOKEN, fakeGitHub({ isPrivate: false }).fetchFn).check();
  assert.equal(c.private, false);
  assert.equal((await client(REPO, TOKEN, fakeGitHub().fetchFn).check()).private, true);
});

test('FC-A47 a read-only token reads and never writes', async () => {
  const text = recordText(withRow(reg(), '05', { name: 'PARTS' }));
  const g = fakeGitHub({ files: { [RECORD_PATH]: text }, push: false }); const gh = client(REPO, TOKEN, g.fetchFn);
  assert.equal((await gh.check()).canWrite, false);
  const r = await syncOnce({ gh, repo: REPO, local: reg(), base: reg(), sha: 'old', readOnly: true });
  assert.equal(r.status, 'synced'); assert.equal(r.record.drawers.find((d) => d.id === '05').name, 'PARTS');
  assert.equal(g.log.filter((e) => e.opts.method === 'PUT').length, 0);
  const empty = await syncOnce({ gh: client(REPO, TOKEN, fakeGitHub({ push: false }).fetchFn), repo: REPO, local: reg(), base: null, sha: null, readOnly: true });
  assert.equal(empty.error.kind, 'empty');
});

test('FC-R86 a hand-edited file that breaks the rules changes nothing', async () => {
  const bad = { standard: 'bisley', drawers: [...reg().drawers, { ...reg().drawers[0], id: '99' }] };
  const g = fakeGitHub({ files: { [RECORD_PATH]: JSON.stringify(bad) } }); const gh = client(REPO, TOKEN, g.fetchFn);
  const r = await syncOnce({ gh, repo: REPO, local: reg(), base: reg(), sha: 'v0' });
  assert.equal(r.status, 'error'); assert.equal(r.error.kind, 'unreadable');
  g.edit(RECORD_PATH, 'not json');
  assert.equal((await syncOnce({ gh, repo: REPO, local: reg(), base: reg(), sha: 'v0' })).error.kind, 'unreadable');
});

test('FC-R79 a write that loses a race merges and goes again', async () => {
  const g = fakeGitHub(); const gh = client(REPO, TOKEN, g.fetchFn);
  const first = await syncOnce({ gh, repo: REPO, local: reg(), base: null, sha: null });
  // Another device writes between this device's read and write
  let raced = false;
  const racing = client(REPO, TOKEN, async (url, opts = {}) => {
    if (opts.method === 'PUT' && !raced) { raced = true; g.edit(RECORD_PATH, recordText(withRow(first.record, '01', { contents: 'Other device' }))); }
    return g.fetchFn(url, opts);
  });
  const s = await syncOnce({ gh: racing, repo: REPO, local: withRow(first.record, '05', { name: 'PARTS' }), base: first.base, sha: first.sha });
  assert.equal(s.status, 'synced');
  const onGh = JSON.parse(g.store[RECORD_PATH].text).drawers;
  assert.equal(onGh.find((d) => d.id === '01').contents, 'Other device');
  assert.equal(onGh.find((d) => d.id === '05').name, 'PARTS');
});
