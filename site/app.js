// File Ctrl interface. Three Areas: Drawers, Label, Print (FC-U05). State IDs in comments match the spec.
import { STANDARDS, standardByKey, withSize, forLiene } from './label/standards.js';
import { derive } from './label/geometry.js';
import { fitLabel } from './label/fit.js';
import { loadFonts } from './label/fonts.js';
import { renderLabel, renderProof } from './label/render.js';
import { SEED, UNITS, sizeKeyFor, withSizes } from './registry/seed.js';
import * as store from './registry/store.js';
import { toCsv, readRegistry, withUid, newUid } from './registry/csv.js';
import { planMove, applyMove, slotsFor, slotOrder, unitOf } from './registry/move.js';
import { duplicates, iconUsedBy } from './registry/uniqueness.js';
import { nameCheck, items } from './check/namecheck.js';
import { checkSvg } from './check/svgrules.js';
import { checks, blocked } from './check/checks.js';
import { sheetLayout, sheetPixels, renderSheet, renderPagePreview, pageLayout, PAGES } from './export/sheet.js';
import { buildPdf } from './export/pdf.js';
import { svgToCanvas, canvasToPng } from './export/png.js';
import { ICONS } from './icons/icons.js';
import { migrate } from './icons/legacy.js';
import { client, repoError, toRecord, SETUP_URL, TOKEN_URL } from './registry/github.js';
import { syncOnce, resolve, same, waiting } from './registry/sync.js';
import { normHex, isWhite, readability, stripShades, isMatched, baseName } from './label/colour.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const say = (t) => { $('live').textContent = t; };

let fonts;
const S = {
  std: STANDARDS[0], drawers: [], units: true, examples: true, storageOk: true,
  status: 'all', weakOnly: false, picked: new Set(), showLib: false,
  flow: null, importing: null, importError: '', confirmFresh: false, undo: null, move: null,
  colour: null, strip: null,   // FC-S31 colour preview and FC-S33 test strip pick
  route: 'sheet', upright: false, job: null,
  // GitHub storage (FC-R71 to FC-R88). conn is saved apart from the registry; the rest lives only while the page is open.
  gh: { conn: null, form: null, canWrite: true, isPrivate: true, state: 'off', error: null, conflict: null, hold: null, choice: null, busy: false, again: false, at: '', note: '' }
};

const iconOf = (d) => (d.icon_source === 'custom' ? checkSvg(d.custom_svg).d : ICONS[d.icon]?.f) || '';
const glyph = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${path}"></path></svg>`;
const unitsNow = () => (S.units ? UNITS : []);
const sd = (d) => withSize(S.std, d.size);
const proof = (d) => renderProof(fonts, sd(d), d, iconOf(d));
const persist = () => {
  S.storageOk = store.save({ standard: S.std.key, drawers: S.drawers, units: S.units, examples: S.examples, route: S.route });
};
const changed = () => { S.examples = false; persist(); syncSoon(); };
const readOnly = () => !!S.gh.conn && !S.gh.canWrite;

/* ---- GitHub storage ---- */
const record = () => toRecord(S.std.key, S.drawers);
function applyRecord(rec) {
  S.std = standardByKey(rec.standard);
  S.units = rec.drawers.every((d) => UNITS.some((u) => u.test(d.id)));
  S.drawers = withSizes(rec.drawers.map(migrate).map(withUid), unitsNow());
  S.examples = false; S.picked.clear(); S.undo = null; S.move = null; S.colour = null; S.strip = null;
  persist();
}
const ghClient = () => client(S.gh.conn.repo, S.gh.conn.token);
const clock = () => new Date().toTimeString().slice(0, 5);
let syncTimer = 0;
function syncSoon() {
  if (!S.gh.conn || readOnly()) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 3000);
}
function showError(e) {
  S.gh.error = e; S.gh.state = e.kind === 'offline' ? 'offline' : 'attention';
}
async function syncNow() {
  const g = S.gh;
  if (!g.conn || g.conflict) return;
  if (g.busy) { g.again = true; return; }
  g.busy = true; g.state = 'saving'; draw();
  try {
    const gh = ghClient(), c = await gh.check();
    if (c.error) { showError(c.error); return; }
    g.isPrivate = c.private; g.canWrite = c.canWrite;
    const st = store.loadSync();
    const r = await syncOnce({ gh, repo: g.conn.repo, local: record(), base: st?.repo === g.conn.repo ? st.base : null, sha: st?.repo === g.conn.repo ? st.sha : null, readOnly: !c.canWrite });
    g.error = null; g.hold = null;
    if (r.status === 'synced') {
      if (!same(r.record, record())) applyRecord(r.record);
      store.saveSync({ repo: g.conn.repo, sha: r.sha, base: r.base });
      g.state = c.canWrite ? 'synced' : 'readonly'; g.at = clock();
      if (r.wrote) say('Synced to GitHub');
    } else if (r.status === 'conflict') {
      g.conflict = { ...r, keep: r.conflicts.map(() => 'mine') }; g.state = 'attention';
    } else if (r.status === 'hold') {
      applyRecord(r.record); store.saveSync({ repo: g.conn.repo, sha: r.sha, base: r.base });
      g.hold = r.dups; g.state = 'attention';
    } else {
      if (r.record) { applyRecord(r.record); store.saveSync({ repo: g.conn.repo, sha: r.sha, base: r.base }); }
      showError(r.error);
    }
  } finally {
    g.busy = false; draw();
    if (g.again) { g.again = false; syncSoon(); }
  }
}

// Connect (FC-S24) and the first-connect choice (FC-S27)
async function connect() {
  const g = S.gh, f = g.form, repo = f.repo.trim(), token = f.token.trim();
  f.error = repoError(repo) || (token ? '' : 'Paste the token you made on GitHub.');
  if (f.error) { draw(); return; }
  f.busy = true; draw();
  const gh = client(repo, token), c = await gh.check();
  f.busy = false;
  if (c.error) { f.error = c.error.text; draw(); return; }
  g.conn = { repo, token }; g.canWrite = c.canWrite; g.isPrivate = c.private; g.form = null; g.error = null;
  g.note = store.saveGitHub(g.conn) ? '' : "This browser won't keep the token, so the connection lasts until you close this page.";
  const st = store.loadSync();
  if (st?.repo === repo && st.base) { await syncNow(); return; } // FC-R82: same repo, carry on
  store.saveSync(null);
  const rem = await gh.readRecord();
  if (rem.error) { showError(rem.error); draw(); return; }
  if (rem.missing || same(rem.record, record()) || !c.canWrite || S.examples) {
    if (!rem.missing) { if (S.examples) applyRecord(rem.record); store.saveSync({ repo, sha: rem.sha, base: rem.record }); }
    await syncNow(); return;
  }
  g.choice = { remote: rem.record, sha: rem.sha }; g.state = 'attention'; draw();
}
async function choose(mine) {
  const g = S.gh, ch = g.choice;
  g.choice = null;
  if (mine) {
    const w = await ghClient().writeRecord(record(), ch.sha, "File Ctrl: replaced with this device's registry");
    if (w.error || w.stale) { showError(w.error || { kind: 'busy', text: 'GitHub changed while you chose. Connect again.' }); draw(); return; }
    store.saveSync({ repo: g.conn.repo, sha: w.sha, base: record() });
  } else {
    applyRecord(ch.remote); store.saveSync({ repo: g.conn.repo, sha: ch.sha, base: ch.remote });
  }
  await syncNow();
}
function disconnect() {
  clearTimeout(syncTimer);
  store.saveGitHub(null); store.saveSync(null);
  Object.assign(S.gh, { conn: null, form: null, canWrite: true, isPrivate: true, state: 'off', error: null, conflict: null, hold: null, choice: null, note: '' });
  say('Disconnected from GitHub. The token is deleted from this browser.');
}

const shortVal = (v) => (v === true ? 'Yes' : v === false ? 'No' : String(v ?? '').length > 60 ? String(v).slice(0, 57) + '…' : String(v ?? '') || 'blank');
const FIELD = { id: 'Drawer ID', name: 'Name', contents: 'Contents', icon: 'Icon', icon_source: 'Icon source', custom_svg: 'Custom icon', icon_weak: 'Weak icon', version: 'Label version', status: 'Status', size: 'Card size', ground: 'Label colour', ground_name: 'Colour name' };

function githubArea() {
  const g = S.gh, link = `<a href="${SETUP_URL}">Set up GitHub</a>`;
  let h = '';
  if (!g.conn) {
    if (!g.form) return `<div class="gh" id="github"><div class="ghrow"><b>GitHub</b><span class="small">Optional. Keep the registry in your own private GitHub repo, so it syncs between devices and keeps a history.</span><button class="key" type="button" data-act="gh-open">Connect to GitHub</button></div></div>`;
    const f = g.form;
    return `<div class="gh" id="github"><div class="ghrow"><b>Connect to GitHub</b><span class="small">Use a private repo just for File Ctrl, and a fine-grained token for that one repo with Contents read and write. A read-only token makes this device look-only. New to GitHub? Follow ${link}, step by step, or see <a href="guide.html#github">the guide</a>.</span></div>
      <div class="ghform"><label class="f"><span>Repo</span><input class="in m" id="ghRepo" value="${esc(f.repo)}" placeholder="your-name/file-ctrl-data" autocomplete="off" spellcheck="false"></label>
      <label class="f"><span>Token</span><input class="in m" id="ghToken" type="password" value="${esc(f.token)}" autocomplete="off" spellcheck="false"></label></div>
      ${f.error ? `<div class="health bad" role="alert"><b>Not connected</b><span>${esc(f.error)}</span></div>` : ''}
      <div class="tools"><button class="key" type="button" data-act="gh-connect" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Checking' : 'Connect'}</button><a class="key" href="${TOKEN_URL}" target="_blank" rel="noopener">Make a token on GitHub</a><button class="key" type="button" data-act="gh-cancel">Cancel</button></div></div>`;
  }
  const st = store.loadSync(), n = st?.base ? waiting(st.base, record()) : 0;
  const words = { saving: 'Syncing', synced: `Synced${g.at ? ' at ' + g.at : ''}`, offline: `Offline · ${n} waiting`, readonly: `Read only${g.at ? ' · fetched at ' + g.at : ''}`, attention: 'Needs attention', off: 'Not synced yet' };
  h += `<div class="ghrow"><b>GitHub</b><span class="small"><span class="mono">${esc(g.conn.repo)}</span> · ${words[g.state] || ''}</span>
    <button class="key" type="button" data-act="gh-sync" ${g.busy || g.conflict || g.choice ? 'disabled' : ''}>Sync now</button><button class="key" type="button" data-act="gh-off">Disconnect</button></div>`;
  if (g.note) h += `<div class="health warn" role="status"><b>Token not kept</b><span>${esc(g.note)}</span></div>`;
  if (!g.isPrivate) h += `<div class="health warn" role="alert"><b>This repo is public</b><span>Anyone can see the registry in ${esc(g.conn.repo)}. On GitHub, open the repo's Settings and change its visibility to private.</span></div>`;
  if (readOnly()) h += `<div class="health" role="status"><b>Look-only</b><span>This token can only read, so this device shows the registry without changing it.</span></div>`;
  if (g.error) h += `<div class="health ${g.error.kind === 'offline' ? 'warn' : 'bad'}" role="alert"><b>${g.error.kind === 'offline' ? 'Offline' : 'Sync problem'}</b><span>${esc(g.error.text)} Your changes are kept on this device.</span></div>${['auth', 'rights', 'missing'].includes(g.error.kind) ? `<div class="tools"><button class="key" type="button" data-act="gh-retoken">Enter a new token</button></div>` : ''}`;
  if (g.choice) {
    const a = g.choice.remote.drawers.length, b = S.drawers.length;
    h += `<div class="health warn" role="status"><b>${esc(g.conn.repo)} already has a registry</b><span>GitHub has ${a} ${a === 1 ? 'drawer' : 'drawers'}. This device has ${b}. Use one; the other is replaced. GitHub's history keeps its old version.</span></div>
      <div class="tools"><button class="key" type="button" data-act="gh-usegh">Use GitHub's ${a}</button><button class="key" type="button" data-act="gh-usemine">Replace with this device's ${b}</button></div>`;
  }
  if (g.conflict) {
    const c = g.conflict;
    h += `<div class="health warn" role="status"><b>Changed on two devices</b><span>Choose which to keep for each. Nothing goes to GitHub until you do.</span></div><div class="conflicts">${c.conflicts.map((x, i) => `<div class="cf"><span class="small"><span class="mono">${esc(x.id)}</span> · ${esc(FIELD[x.field] || x.field)}</span>
      <div class="segc" role="group" aria-label="Keep for ${esc(x.id)} ${esc(FIELD[x.field] || x.field)}"><button type="button" data-act="gh-keep" data-i="${i}" data-v="mine" aria-pressed="${c.keep[i] === 'mine'}">This device: ${esc(shortVal(x.mine))}</button><button type="button" data-act="gh-keep" data-i="${i}" data-v="theirs" aria-pressed="${c.keep[i] === 'theirs'}">GitHub: ${esc(shortVal(x.theirs))}</button></div></div>`).join('')}</div>
      <div class="tools"><button class="key" type="button" data-act="gh-keepall" data-v="mine">This device for all</button><button class="key" type="button" data-act="gh-keepall" data-v="theirs">GitHub for all</button><button class="key" type="button" data-act="gh-resolve">Keep these and sync</button></div>`;
  }
  if (g.hold) h += `<div class="health bad" role="alert"><b>Same ID, name or icon on two drawers</b><span>Another device's change and one here now clash. ${esc(g.hold.join(' '))} Move or change one of them, and it syncs.</span></div>`;
  return `<div class="gh" id="github">${h}</div>`;
}

/* ---- Label colour (FC-R100 to FC-R111) ---- */
const swatch = (hex, big) => `<i class="sw${big ? ' big' : ''}${isWhite(hex) ? ' white' : ''}" style="background:${isWhite(hex) ? '#FFFFFF' : hex}" aria-hidden="true"></i>`;
const colourName = (d) => (isWhite(d.ground) ? 'White' : d.ground_name || normHex(d.ground));
// The pull-down: White, the standard's finishes, colours already on other drawers, then Custom (FC-R101 to FC-R103)
function colourChoices() {
  const out = [{ v: 'white', name: 'White', hex: '' }];
  for (const f of S.std.finishes || []) out.push({ v: 'f:' + f.key, name: f.name, hex: normHex(f.hex), note: 'not matched yet' });
  const seen = new Set(out.map((c) => c.hex + '|' + c.name));
  for (const d of S.drawers) {
    if (isWhite(d.ground)) continue;
    const k = normHex(d.ground) + '|' + colourName(d);
    if (seen.has(k)) continue;
    seen.add(k); out.push({ v: 'u:' + out.length, name: colourName(d), hex: normHex(d.ground), note: isMatched(d.ground_name) ? '' : 'not matched yet' });
  }
  out.push({ v: 'custom', name: 'Custom', hex: '' });
  return out;
}
const choiceLabel = (c) => c.name + (c.hex && c.hex !== c.name ? ` · ${c.hex}` : '') + (c.note ? ` · ${c.note}` : '');
const unitDrawers = (key) => (key === 'all' ? S.drawers : S.drawers.filter((d) => unitOf(d.id, unitsNow())?.key === key));
const unitName = (key) => (key === 'all' ? 'Drawers' : UNITS.find((u) => u.key === key)?.name || key);
function unitColour(key) {
  const list = unitDrawers(key);
  if (!list.length) return { hex: '', name: 'White', mixed: false };
  const a = list[0], mixed = list.some((d) => normHex(d.ground) !== normHex(a.ground) || colourName(d) !== colourName(a));
  return mixed ? { hex: '', name: 'Mixed', mixed: true } : { hex: normHex(a.ground), name: colourName(a), mixed: false };
}
// The colour a new drawer takes: what most of its unit's drawers have (FC-R101)
function usualColour(id) {
  const u = unitOf(id, unitsNow()), list = u ? unitDrawers(u.key) : S.units ? [] : S.drawers, n = new Map();
  for (const d of list) { const k = normHex(d.ground) + '|' + (d.ground_name || ''); n.set(k, (n.get(k) || 0) + 1); }
  const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return { ground: '', ground_name: '' };
  const [ground, ground_name] = best[0].split('|');
  return { ground, ground_name: ground ? ground_name : '' };
}

function colourCtl(key) {
  const c = unitColour(key);
  const head = `<span class="gcol">${c.mixed ? '<i class="sw mixed" aria-hidden="true"></i>' : swatch(c.hex)}<span>${esc(c.name)}</span>`;
  if (readOnly()) return head + '</span>';
  const opts = colourChoices().map((x) => `<option value="${esc(x.v)}">${esc(choiceLabel(x))}</option>`).join('');
  return head + `<select class="in" data-act="ucolour" data-unit="${esc(key)}" aria-label="Label colour for ${esc(unitName(key))}"><option value="" selected>Change colour</option>${opts}</select></span>`;
}

// FC-S31: the unit's labels in the new colour before anything changes
function colourPreview(key) {
  const c = S.colour;
  if (!c || c.unit !== key) return '';
  const hex = c.custom ? normHex(c.customHex) : c.hex, name = c.custom ? (hex || 'Custom') : c.name;
  const list = unitDrawers(key), n = list.filter((d) => normHex(d.ground) !== hex || colourName(d) !== (hex ? name : 'White')).length;
  const r = hex ? readability(hex) : { level: 'ok' };
  const custom = c.custom ? `<div class="tools"><label class="f"><span>Hex colour</span><input class="in m" id="cHex" value="${esc(c.customHex || '')}" placeholder="#A8ADA8" autocomplete="off" spellcheck="false"></label><label class="f"><span>Pick</span><input type="color" id="cPick" value="${hex || '#FFFFFF'}" aria-label="Pick a colour"></label></div>` : '';
  const shown = list.slice(0, 3).map((d) => `<span class="lbl mini${sd(d).size === 'file' ? ' wide' : ''}">${proof({ ...d, ground: hex, ground_name: hex ? name : '' })}</span>`).join('');
  const warn = r.level === 'hold' ? `<div class="health bad" role="alert"><b>The names won't read on this colour</b><span>Pick a lighter or darker one.</span></div>` : r.level === 'note' ? `<div class="health warn" role="status"><b>Faint on this colour</b><span>The names read at ${r.ratio.toFixed(1)} : 1. A lighter or darker shade reads better.</span></div>` : '';
  const ready = c.custom ? !!hex : true;
  return `<div class="cprev"><div class="health warn" role="status"><b>${swatch(hex, true)}Set ${esc(unitName(key))} to ${esc(hex ? name : 'White')}?</b><span>${n} ${n === 1 ? 'label' : 'labels'} to reprint. Each goes back to Built and is selected for printing.${hex && !isMatched(name) ? ' Not matched to your drawer yet, so print a test strip first.' : ''}</span></div>
    ${custom}<div class="minis">${shown}</div>${warn}
    <div class="tools"><button class="key" type="button" data-act="colour-yes" ${ready && r.level !== 'hold' && n ? '' : 'disabled'}>Apply to ${n} ${n === 1 ? 'label' : 'labels'}</button>${hex ? `<button class="key" type="button" data-act="strip" data-unit="${esc(key)}">Print a test strip</button>` : ''}<button class="key" type="button" data-act="colour-no">Cancel</button></div></div>`;
}

function setColour(key, hex, name, picked) {
  const before = { drawers: S.drawers.map((d) => ({ ...d })), picked: [...S.picked] };
  const nm = hex ? name : '';
  const ids = [];
  for (const d of unitDrawers(key)) {
    if (normHex(d.ground) === hex && (d.ground_name || '') === nm) continue;
    d.ground = hex; d.ground_name = nm; d.status = 'built'; d.updated = today(); S.picked.add(d.id); ids.push(d.id);
  }
  const n = ids.length, text = `${unitName(key)} set to ${hex ? name : 'White'}${picked ? ` (${picked})` : ''} · ${n} ${n === 1 ? 'label' : 'labels'} to reprint`;
  S.undo = { kind: 'colour', before, text };
  S.colour = null; S.strip = null; S.job = null; followFlow(); changed(); say(text);
}

// FC-S33: pick the closest shade from a printed strip
function stripPick(key) {
  const t = S.strip;
  if (!t || t.unit !== key) return '';
  const shades = stripShades(t.hex, t.step);
  return `<div class="cprev"><div class="health" role="status"><b>Which shade matches the drawer?</b><span>Print it ${S.route === 'letter' || S.route === 'a4' ? 'at 100 %' : 'on the Liene with Border −1'}, hold it against a ${esc(unitName(key))} drawer in daylight and pick the closest code. B2 is ${esc(t.name)} as it is now.</span></div>
    <div class="strip" role="group" aria-label="Test strip shades">${shades.map((x) => `<button type="button" class="shade" data-act="strip-pick" data-v="${x.code}" aria-pressed="${t.pick === x.code}">${swatch(x.hex, true)}<span class="mono">${x.code}</span><em class="mono">${x.hex}</em></button>`).join('')}</div>
    <div class="tools"><button class="key" type="button" data-act="strip-use" ${t.pick ? '' : 'disabled'}>Use ${t.pick || 'this one'}</button><button class="key" type="button" data-act="strip-finer" ${t.pick ? '' : 'disabled'}>Print a finer strip</button><button class="key" type="button" data-act="strip-no">Cancel</button></div></div>`;
}

async function printStrip(key, hex, name, step) {
  const d = unitDrawers(key)[0] || S.drawers[0];
  if (!d) return;
  const pdfStrip = S.route === 'letter' || S.route === 'a4';
  const std = forLiene(withSize(S.std, 'multidrawer'), !pdfStrip);
  const shades = stripShades(hex, step).map((x) => ({ ...d, uid: 'strip-' + x.code, id: x.code, ground: x.hex, ground_name: name, size: 'multidrawer' }));
  const pdf = S.route === 'letter' || S.route === 'a4';
  S.job = { busy: true, at: 0, of: 9 }; draw();
  try {
    let file;
    if (pdf) {
      await loadScript('vendor/pdf-lib.min.js');
      const bytes = await buildPdf(window.PDFLib, fonts, [{ std, drawers: shades }], iconOf, PAGES[S.route]);
      file = `${S.std.prefix}_TestStrip_${slug(name)}_${PAGES[S.route].name}.pdf`;
      download(new Blob([bytes], { type: 'application/pdf' }), file);
    } else {
      const p = sheetPixels(std), c = await svgToCanvas(renderSheet(fonts, std, shades, iconOf), p.w, p.h);
      file = `${S.std.prefix}_TestStrip_${slug(name)}.png`;
      download(await canvasToPng(c), file);
    }
    S.job = null;
    S.strip = { unit: key, hex, name, step, pick: '' }; S.colour = null;
    say(`Saved ${file}. Print it, then pick the closest shade.`);
  } catch (e) {
    S.job = { error: e.message || 'The browser stopped the download. Allow downloads for this page and try again.' };
  }
  draw();
}

/* ---- Drawers (Area 1) ---- */
function allChecks() {
  let notes = 0, holds = 0;
  for (const d of S.drawers) {
    const c = checks(fonts, sd(d), d, S.drawers, unitsNow());
    notes += c.filter((x) => x.level === 'note').length;
    holds += c.filter((x) => x.level === 'hold').length;
  }
  return { notes, holds };
}

function statusLine() {
  const n = S.drawers.length;
  if (!n) return { text: 'No drawers', cls: 'idle' };
  const { notes, holds } = allChecks();
  const word = n === 1 ? 'label' : 'labels';
  if (holds) return { text: `${n} ${word} · ${holds} won't print`, cls: 'warn' };
  if (notes) return { text: `${n} ${word} · ${notes} ${notes === 1 ? 'note' : 'notes'}`, cls: 'warn' };
  return { text: `${n} ${word} · ready`, cls: 'ok' };
}

const shown = () => S.drawers.filter((d) => (S.status === 'all' || d.status === S.status) && (!S.weakOnly || d.icon_weak));

// The ID is the grip: drag it to another slot, or press it to open Move to (FC-R93, FC-U15)
const grip = (d) => (readOnly() ? `<span class="id">${esc(d.id)}</span>` : `<button class="id grip" type="button" data-act="grip" data-id="${esc(d.id)}" aria-label="Move drawer ${esc(d.id)} ${esc(d.name)}">${esc(d.id)}</button>`);

function card(d) {
  if (d.empty) return `<div class="card slot${d.wide ? ' wide' : ''}" data-slot="${esc(d.id)}" data-unit="${d.unit}"><span class="mono">${esc(d.id)}</span><span>empty</span></div>`;
  const on = S.picked.has(d.id), u = unitOf(d.id, unitsNow());
  return `<div class="card${on ? ' on' : ''}${sd(d).size === 'file' ? ' wide' : ''}" data-slot="${esc(d.id)}" data-unit="${u ? u.key : ''}">
    <button class="open" type="button" data-act="edit" data-id="${esc(d.id)}" aria-label="Edit drawer ${esc(d.id)} ${esc(d.name)}"><span class="lbl">${proof(d)}</span></button>
    <div class="cmeta">
      ${grip(d)}
      <input type="checkbox" data-act="pick" data-id="${esc(d.id)}" ${on ? 'checked' : ''} aria-label="Select drawer ${esc(d.id)} to print">
      ${d.icon_weak ? '<span class="wk">Weak icon</span>' : ''}
      <select data-act="status" data-id="${esc(d.id)}" ${readOnly() ? 'disabled' : ''} aria-label="Status of drawer ${esc(d.id)}">${['built', 'printed', 'installed'].map((s) => `<option value="${s}"${d.status === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
    </div>
  </div>`;
}

function groups(list) {
  if (!S.units) return [{ name: 'Drawers', unit: 'all', note: '', items: list }];
  // Slot order, with each empty slot as a drop target while dragging (FC-R96, FC-S30)
  const empty = (u) => u.slots.filter((id) => !S.drawers.some((d) => d.id === id)).map((id) => ({ empty: true, id, unit: u.key, wide: u.size === 'file' }));
  const out = UNITS.map((u) => ({ name: u.name, unit: u.key, note: u.measured ? '' : "Card size isn't measured yet", items: slotOrder([...list.filter((d) => u.test(d.id)), ...(readOnly() ? [] : empty(u))], u) }));
  const rest = list.filter((d) => !UNITS.some((u) => u.test(d.id)));
  if (rest.length) out.push({ name: 'Other', note: '', items: rest });
  return out.filter((g) => g.items.some((d) => !d.empty));
}

function area1() {
  if (S.flow && !S.showLib) {
    return `<section class="tier shut"><div class="tier-h"><span class="n">1</span><h2>Drawers</h2><span class="tier-d">${esc(S.std.name)} · ${S.drawers.length} drawers</span><button class="key" style="margin-left:auto;background:transparent;color:var(--band-ink);border-color:var(--band-line)" type="button" data-act="showlib">Show library</button></div></section>`;
  }
  const st = statusLine(), list = shown();
  const seg = (v, t) => `<button type="button" data-act="filter" data-v="${v}" aria-pressed="${S.status === v}">${t}</button>`;
  let body = '';
  if (!S.storageOk) body += `<div class="health warn" role="status"><b>Not saving</b><span>This browser won't keep your registry. Export before you close it.</span></div>`;
  if (S.importError) body += `<div class="health bad" role="alert"><b>Import refused</b><span>${esc(S.importError)} Your registry hasn't changed.</span></div><div class="tools"><button class="key" type="button" data-act="dismiss">Dismiss</button></div>`;
  if (S.importing) body += `<div class="health warn" role="status"><b>Replace the registry?</b><span>${esc(S.importing.file)} has ${S.importing.rows.length} drawers with no repeated names or icons. It replaces the ${S.drawers.length} here${S.gh.conn ? `, and on GitHub too. GitHub's history keeps the old one` : ''}. Export first if you want to keep them.</span></div><div class="tools"><button class="key" type="button" data-act="import-yes">Replace ${S.drawers.length} with ${S.importing.rows.length}</button><button class="key" type="button" data-act="import-no">Cancel</button></div>`;
  if (S.confirmFresh) body += `<div class="health warn" role="status"><b>Start fresh?</b><span>This clears all ${S.drawers.length} drawers from this browser${S.gh.conn ? `, and from GitHub too. GitHub's history keeps the old registry` : ''}. Export first if you want to keep them.</span></div><div class="tools"><button class="key danger" type="button" data-act="fresh-yes">Clear ${S.drawers.length} drawers</button><button class="key" type="button" data-act="fresh-no">Cancel</button></div>`;
  if (S.undo) body += `<div class="health" role="status"><b>${S.undo.text ? esc(S.undo.text) : `Removed ${esc(S.undo.d.id)} ${esc(S.undo.d.name)}`}</b><span></span><button class="key" type="button" data-act="undo">Undo</button></div>`;   // FC-S29
  if (S.move?.where === 'lib') body += movePreview();
  if (S.examples && S.drawers.length) body += `<div class="health" role="status"><b>Example drawers</b><span>These ${S.drawers.length} show how labels look. Edit them, or use Start fresh to begin your own list.</span></div>`;
  if (!S.drawers.length) {
    body += `<div class="stack" style="align-items:flex-start;padding-block:34px"><p style="margin:0">No drawers yet. Add the first one or import a registry.</p>${readOnly() ? '' : '<div class="tools"><button class="key go" type="button" data-act="new">New drawer</button><label class="key">Import<input class="sr" type="file" accept=".csv,.json" data-act="import"></label></div>'}</div>`;
  } else {
    body += `<div class="tools" role="group" aria-label="Filters"><div class="segc" role="group" aria-label="Status">${seg('all', 'All')}${seg('built', 'Built')}${seg('printed', 'Printed')}${seg('installed', 'Installed')}</div>
      <label class="small" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" data-act="weak" ${S.weakOnly ? 'checked' : ''} style="margin:0;accent-color:var(--ink)"> Weak icons only</label>
      <span class="sp"></span><button class="key" type="button" data-act="pickall">${list.length && list.every((d) => S.picked.has(d.id)) ? 'Clear selection' : 'Select all to print'}</button>
      ${readOnly() ? '' : '<button class="key go" type="button" data-act="new" style="height:34px;font-size:var(--t-cap)">New drawer</button>'}</div>`;
    if (!list.length) body += `<div class="stack" style="align-items:flex-start;padding-block:34px"><p style="margin:0">Nothing matches these filters.</p><button class="key" type="button" data-act="clearfilter">Clear filters</button></div>`;
    for (const g of groups(list)) body += `<div class="group" data-unit="${g.unit || ''}"><div class="ghead"><b>${esc(g.name)}</b><span>${g.note}</span>${g.unit ? colourCtl(g.unit) : ''}</div>${g.unit ? colourPreview(g.unit) + stripPick(g.unit) : ''}<div class="grid">${g.items.map(card).join('')}</div></div>`;
  }
  return `<section class="tier" aria-labelledby="a1">
    <div class="tier-h"><span class="n">1</span><h2 id="a1">Drawers</h2><span class="tier-d">Every label made, by cabinet</span><span class="tier-s ${st.cls}">${st.text}</span></div>
    <div class="pad">
      <div class="std">
        <label class="f"><span>Cabinet standard</span><select class="in" data-act="standard" aria-label="Cabinet standard">${STANDARDS.map((s) => `<option value="${s.key}"${s === S.std ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        ${S.std.sizes.map((z) => `<div class="rd"><span>${esc(z.name)}</span><b>${z.card.w} × ${z.card.h} · ${z.holder === false ? 'no holder, label uses the whole card' : `window ${z.window.w} × ${z.window.h}`}${z.windowMeasured ? '' : ', not measured'}</b></div>`).join('')}
        <div class="tools" style="justify-content:flex-end">
          ${readOnly() ? '' : '<label class="key">Import<input class="sr" type="file" accept=".csv,.json" data-act="import"></label>'}
          <button class="key" type="button" data-act="csv">Export CSV</button>
          <button class="key" type="button" data-act="json">Export JSON</button>
          ${readOnly() ? '' : '<button class="key" type="button" data-act="fresh">Start fresh</button>'}
        </div>
      </div>
      ${githubArea()}
      ${body}
    </div>
  </section>`;
}

/* ---- Moving a drawer (FC-R89 to FC-R96) ---- */
function movePlan() {
  const m = S.move, units = unitsNow(), d = m && S.drawers.find((x) => x.uid === m.uid);
  if (!d) return null;
  const u = unitOf(d.id, units), canShift = !!u && u === unitOf(m.to, units);
  const target = S.drawers.find((x) => x.id === m.to), mode = canShift ? m.mode : 'swap';
  return { d, target, canShift, mode, changes: planMove(S.drawers, m.uid, m.to, mode, units) };
}

// FC-S28
function movePreview() {
  const p = movePlan();
  if (!p || !p.changes.length) return '';
  const name = (uid) => S.drawers.find((x) => x.uid === uid).name, n = p.changes.length;
  const alt = p.target && p.canShift ? `<button class="key" type="button" data-act="move-mode">${p.mode === 'swap' ? 'Shift instead' : 'Swap instead'}</button>` : '';
  return `<div class="health warn" role="status"><b>Move ${esc(p.d.id)} ${esc(p.d.name)} to ${esc(S.move.to)}?</b><span>${n} ${n === 1 ? 'label' : 'labels'} to reprint. Each goes back to Built and is selected for printing.</span></div>
    <ul class="moves">${p.changes.map((c) => `<li><span class="mono">${esc(c.from)}</span> ${esc(name(c.uid))} → <span class="mono">${esc(c.to)}</span></li>`).join('')}</ul>
    <div class="tools"><button class="key" type="button" data-act="move-yes">Move</button>${alt}<button class="key" type="button" data-act="move-no">Cancel</button></div>`;
}

// Step 1 when editing: the ID, and Move to (FC-R90)
function moveCtl(f) {
  const d = S.drawers.find((x) => x.id === f.editingId);
  if (!d || readOnly()) return '';
  if (S.move?.where === 'flow') return movePreview();
  const moved = S.undo?.kind === 'move' ? `<div class="health ok" role="status"><b>${esc(S.undo.text)}</b><span></span><button class="key" type="button" data-act="undo">Undo</button></div>` : '';   // FC-S29
  const slots = slotsFor(S.drawers, d.id, unitsNow());
  if (slots.length) return moved + `<label class="f"><span>Move to</span><select class="in m" id="fMove" data-act="moveto" aria-label="Move drawer ${esc(d.id)} to">${slots.map((x) => `<option value="${esc(x.id)}"${x.id === d.id ? ' selected' : ''}>${esc(x.id)} · ${x.id === d.id ? 'here now' : x.drawer ? esc(x.drawer.name) : 'empty'}</option>`).join('')}</select></label>`;
  return moved + `<label class="f"><span>Move to</span><input class="in m" id="fMove" value="${esc(f.moveTo || '')}" placeholder="New ID" autocomplete="off"></label><div class="tools"><button class="key" type="button" data-act="moveid">Move</button></div>`;
}

// Keep an open flow on its drawer after a move or its undo
function followFlow() {
  const f = S.flow;
  if (!f || f.isNew) return;
  const d = S.drawers.find((x) => x.uid === f.draft.uid);
  if (d) { f.editingId = d.id; f.draft.id = d.id; f.draft.status = d.status; f.draft.updated = d.updated; }
}

function doMove() {
  const p = movePlan();
  if (!p || !p.changes.length) { S.move = null; return; }
  const before = { drawers: S.drawers.map((d) => ({ ...d })), picked: [...S.picked] };
  const keep = new Set(S.drawers.filter((d) => S.picked.has(d.id)).map((d) => d.uid));
  p.changes.forEach((c) => keep.add(c.uid));
  S.drawers = applyMove(S.drawers, p.changes, today());
  S.picked = new Set(S.drawers.filter((d) => keep.has(d.uid)).map((d) => d.id));
  const n = p.changes.length, text = `Moved ${p.d.id} ${p.d.name} to ${S.move.to} · ${n} ${n === 1 ? 'label' : 'labels'} to reprint`;
  S.undo = { kind: 'move', before, text };
  followFlow(); S.move = null; S.job = null; changed(); say(text);
}

/* ---- Label flow (Area 2) ---- */
const blank = () => ({ id: '', name: '', contents: '', icon: '', icon_source: 'iconctrl', custom_svg: '', icon_weak: false, version: 'v4', status: 'built', updated: '', size: '', ground: '', ground_name: '' });

function startFlow(d) {
  S.flow = { step: d ? 2 : 1, isNew: !d, inUse: false, draft: d ? { ...d } : blank(), result: null, query: '', custom: false, svgText: '', svgFails: [] };
  S.showLib = false;
}

const fitNow = (d) => fitLabel(fonts, derive(sd(d)), d.name, d.contents);
const fits9 = (d) => fitNow(d).namePt >= 9;

function iconResults(q) {
  const words = q.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1).map((w) => w.replace(/s$/, ''));
  if (!words.length) return [];
  const hits = [];
  for (const { key: name, words: tags } of Object.values(ICONS)) {
    const tagList = tags.split(' ');
    let score = 0;
    for (const w of words) {
      if (name === w) score += 5;
      else if (name.includes(w)) score += 3;
      else if (tagList.some((t) => t.startsWith(w))) score += 1;
    }
    if (score) hits.push([score, name]);
  }
  return hits.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])).slice(0, 40).map((h) => h[1]);
}

function pickIcon(name) {
  const f = S.flow, d = f.draft;
  d.icon = name; d.icon_source = 'iconctrl'; d.custom_svg = ''; d.icon_weak = false;
}

// One drawer's own colour, in step 2 (FC-R101)
function drawerColour(f) {
  const d = f.draft, list = colourChoices();
  const cur = f.customColour ? 'custom' : isWhite(d.ground) ? 'white' : list.find((x) => x.hex === normHex(d.ground) && x.name === colourName(d))?.v || 'custom';
  const custom = cur === 'custom' ? `<label class="f"><span>Hex colour</span><input class="in m" id="fGround" value="${esc(f.groundText ?? normHex(d.ground))}" placeholder="#A8ADA8" autocomplete="off" spellcheck="false"></label>` : '';
  return `<label class="f"><span>Label colour</span><select class="in" data-act="dcolour" aria-label="Label colour">${list.map((x) => `<option value="${esc(x.v)}"${x.v === cur ? ' selected' : ''}>${esc(choiceLabel(x))}</option>`).join('')}</select></label>${custom}`;
}

const stepRow = (n, title, val, inner, cur) => `<div class="step${n < cur ? ' done' : n === cur ? ' now' : ''}"><span class="dot">${n}</span><div class="sb"><div class="sh"><b>${title}</b><span class="sv">${val}</span></div>${n === cur ? inner : ''}</div></div>`;

function resultStrip(f) {
  const r = f.result, d = f.draft;
  if (!r) return `<div class="health" role="status"><b>Not checked yet</b><span>Choose Check the name.</span></div>`;   // FC-S08
  if (r.kind === 'ok') return `<div class="health ok" role="status"><b>Name fits the contents</b><span>${esc(d.name)} matches these items, and no other drawer holds them.</span></div><div class="tools"><button class="key" type="button" data-act="next">Next</button></div>`;   // FC-S09
  if (r.kind === 'unknown') return `<div class="health" role="status"><b>Not checked</b><span>${esc(r.reason)} It's your call.</span></div><div class="tools"><button class="key" type="button" data-act="next">Next</button></div>`;   // FC-S11
  const useIt = r.suggestion ? `<button class="key" type="button" data-act="use" data-v="${esc(r.suggestion)}">Use ${esc(r.suggestion)}</button>` : '';
  if (r.kind === 'overlap') return `<div class="health warn" role="status"><b>${esc(r.reason)}</b><span>Keep your name only if this drawer holds something different.</span></div><div class="tools"><button class="key" type="button" data-act="edit" data-id="${esc(r.other.id)}">Open ${esc(r.other.id)} ${esc(r.other.name)}</button><button class="key" type="button" data-act="next">Keep ${esc(d.name)}</button></div>`;
  if (r.kind === 'duplicate') return `<div class="health warn" role="status"><b>${esc(r.reason)}</b><span>No two drawers can share a name.</span></div><div class="tools">${useIt}<button class="key" type="button" data-act="back">Change the name</button></div>`;
  return `<div class="health warn" role="status"><b>${esc(r.reason)}</b><span></span></div><div class="tools">${useIt}<button class="key" type="button" data-act="next">Keep ${esc(d.name)}</button></div>`;   // FC-S10
}

function iconPanel(f) {
  const d = f.draft;
  const self = f.editingId;
  if (f.custom) {
    const fails = f.svgFails.length ? `<div class="health bad" role="alert"><b>This SVG doesn't fit the label style</b><span>Fix the ${f.svgFails.length === 1 ? 'item' : f.svgFails.length + ' items'} below and check it again.</span></div><ul class="fails">${f.svgFails.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    return `<label class="f"><span>Paste SVG</span><textarea class="in m${f.svgFails.length ? ' bad' : ''}" id="svgText" spellcheck="false">${esc(f.svgText)}</textarea></label>${fails}<div class="tools"><button class="key" type="button" data-act="svgcheck">Check this SVG</button><button class="key" type="button" data-act="svgoff">Back to search</button></div>`;
  }
  const list = iconResults(f.query);
  const btn = (n) => {
    const u = iconUsedBy(S.drawers, n, self);
    const tag = u ? `Used by ${u.id}` : n === d.icon ? 'Selected' : '';
    return `<button class="icb" type="button" data-act="icon" data-v="${n}" ${u ? 'disabled' : ''} aria-pressed="${n === d.icon}" aria-label="${esc(ICONS[n].name)}${tag ? ', ' + tag : ''}">${glyph(ICONS[n].f)}<span>${n}</span><em>${tag}</em></button>`;
  };
  const size = iconOf(d) ? `<div class="ten">${glyph(iconOf(d))}<span>Shown at 14 mm, the size it prints. Actual size on screen depends on your display.</span></div>` : '';
  const none = !list.length ? `<p class="small">No icons match. Try another word or paste your own.</p>` : '';   // FC-S13
  return `<label class="f"><span>Search icons</span><input class="in" id="iconQ" value="${esc(f.query)}"></label>
    <div id="iconResults"><div class="icons">${list.map(btn).join('')}</div>${none}</div>${size}
    <label class="small" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" data-act="weakflag" ${d.icon_weak ? 'checked' : ''} style="margin:0;accent-color:var(--ink)"> Flag this icon as weak</label>
    <div class="tools"><button class="key" type="button" data-act="next" ${d.icon ? '' : 'disabled'}>Next</button><button class="key" type="button" data-act="svgon">Paste your own SVG</button></div>`;
}

function checkList(d) {
  const list = checks(fonts, sd(d), d, S.drawers, unitsNow());
  return list.map((c) => `<div class="health ${c.level === 'hold' ? 'warn' : ''}" role="status"><b>${c.level === 'hold' ? 'Can\'t save yet' : 'Note'}</b><span>${esc(c.text)}</span></div>`).join('');
}

function previewFig(f) {
  const d = f.draft;
  if (!d.name && !d.contents && !d.icon && !f.inUse) return `<div style="aspect-ratio:47/25;border:1px dashed var(--strong);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:var(--t-cap);color:var(--soft)">The label appears here</div><figcaption class="small">Nothing to show yet.</figcaption>`;
  const show = f.inUse ? S.drawers.find((x) => x.id === d.id) : d;
  const r = fitNow(show);
  return `<span class="lbl">${proof(show)}</span><figcaption class="small">${f.inUse ? `Current label for drawer ${esc(d.id)}.` : `Live proof, as it looks in the holder. The gray is the steel frame.${isWhite(show.ground) ? '' : ` Colour: ${esc(colourName(show))}.`}`}</figcaption><p class="small mono">Name ${r.namePt} pt · Contents ${r.contentsPt} pt · ${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}</p>`;
}

function area2() {
  const f = S.flow;
  if (!f) return `<section class="tier shut"><div class="tier-h"><span class="n">2</span><h2>Label</h2><span class="tier-d">Name a drawer, pick its icon, check the proof</span><span class="tier-s idle">Pick a drawer or start a new one</span></div></section>`;
  const d = f.draft, cur = f.step, held = blocked(checks(fonts, sd(d), d, S.drawers, unitsNow()));
  const n = items(d.contents).length, lines = fitNow(d).lines.length;
  const s1 = f.inUse
    ? `<label class="f"><span>ID</span><input class="in m" id="fId" value="${esc(d.id)}"></label><div class="health warn" role="status"><b>${esc(d.id)} already has a label</b><span>${esc(S.drawers.find((x) => x.id === d.id)?.name)}, shown here. Replacing it keeps the ID and overwrites the rest.</span></div><div class="tools"><button class="key" type="button" data-act="replace">Replace ${esc(d.id)}</button><button class="key" type="button" data-act="otherid">Pick another ID</button></div>`
    : `<label class="f"><span>ID</span><input class="in m" id="fId" value="${esc(d.id)}" placeholder="01"></label><div class="tools"><button class="key" type="button" data-act="idnext" ${d.id ? '' : 'disabled'}>Next</button></div>`;
  const s2 = `<label class="f"><span>Card size</span><select class="in" data-act="size" aria-label="Card size">${S.std.sizes.map((z) => `<option value="${z.key}"${sd(d).size === z.key ? ' selected' : ''}>${esc(z.name)} · ${z.card.w} × ${z.card.h}</option>`).join('')}</select></label>${drawerColour(f)}<label class="f"><span>Name</span><input class="in" id="fName" value="${esc(d.name)}"></label><label class="f"><span>Contents</span><input class="in" id="fContents" value="${esc(d.contents)}"></label><div class="tools"><button class="key" type="button" data-act="check" ${d.name ? '' : 'disabled'}>Check the name</button></div>`;
  const s4 = `<label class="f"><span>Contents</span><input class="in" id="fContents" value="${esc(d.contents)}"></label><p class="small" id="trimLine">Aim for 3 to 5 items, comma-separated, within 2 lines. This one has ${n} ${n === 1 ? 'item' : 'items'} on ${lines} ${lines === 1 ? 'line' : 'lines'}.</p><div class="tools"><button class="key" type="button" data-act="next">Next</button></div>`;
  const s6 = `<p class="small">The gray is the steel frame. Only the ${isWhite(d.ground) ? 'white' : 'coloured'} area shows in the holder.</p><div class="stack" style="gap:5px">${checkList(d)}</div><div class="tools"><button class="key go" type="button" data-act="save" ${held ? 'disabled' : ''}>Save drawer ${esc(d.id)}</button><button class="key" type="button" data-act="back">Back</button>${f.isNew ? '' : '<button class="key danger" type="button" data-act="remove">Remove</button>'}</div>`;
  const rstate = !f.result ? (cur > 2 ? '' : 'Not checked yet') : f.result.kind === 'unknown' ? 'Not checked' : f.result.kind === 'ok' ? 'Name fits the contents' : 'Your call';
  const state = f.inUse ? ['ID in use', 'warn'] : held && cur >= 6 ? ["Can't save yet", 'warn'] : f.svgFails.length ? ['SVG rejected', 'bad'] : f.result && cur === 3 && !['ok', 'unknown'].includes(f.result.kind) ? ['One suggestion', 'warn'] : f.isNew && cur === 1 ? ['New drawer', 'idle'] : ['In progress', 'idle'];
  return `<section class="tier" aria-labelledby="a2">
    <div class="tier-h"><span class="n">2</span><h2 id="a2">Label</h2><span class="tier-d">${f.isNew ? (d.id ? 'New drawer ' + esc(d.id) : 'Name a drawer, pick its icon, check the proof') : 'Editing drawer ' + esc(f.editingId)}</span><span class="tier-s ${state[1]}">${state[0]}</span></div>
    <div class="pad"><div class="split">
      <div class="steps">
        ${f.isNew ? stepRow(1, 'Drawer ID', `<span class="mono">${cur > 1 ? esc(d.id) : ''}</span>`, s1, cur) : `<div class="step done"><span class="dot">1</span><div class="sb"><div class="sh"><b>Drawer ID</b><span class="sv"><span class="mono">${esc(f.editingId)}</span></span></div>${moveCtl(f)}</div></div>`}
        ${stepRow(2, 'Name and contents', cur > 2 ? esc(d.name) : '', s2, cur)}
        ${stepRow(3, 'Name check', rstate, resultStrip(f), cur)}
        ${stepRow(4, 'Contents trim', cur > 4 ? `${n} items · ${lines} ${lines === 1 ? 'line' : 'lines'}` : '', s4, cur)}
        ${stepRow(5, 'Icon', cur > 5 ? esc(d.icon) : '', iconPanel(f), cur)}
        ${stepRow(6, 'Proof and save', '', s6, cur)}
      </div>
      <figure class="proof" id="flowPreview">${previewFig(f)}</figure>
    </div><div class="tools"><button class="key" type="button" data-act="cancel">Cancel</button></div></div>
  </section>`;
}

/* ---- Print (Area 3) ---- */
function queue() {
  const list = S.picked.size ? S.drawers.filter((d) => S.picked.has(d.id)) : S.drawers;
  const ok = [], held = [];
  for (const d of list) (blocked(checks(fonts, sd(d), d, S.drawers, unitsNow())) ? held : ok).push(d);
  return { ok, held };
}

// One group per card size, in the standard's order (FC-R59)
const bySize = (list) => S.std.sizes.map((z) => ({ std: withSize(S.std, z.key), drawers: list.filter((d) => sd(d).size === z.key) })).filter((g) => g.drawers.length);
// Liene groups: one per card size and per white or coloured, since the border differs (FC-R104)
const lieneGroups = (list) => S.std.sizes.flatMap((z) => [false, true].map((c) => ({ std: forLiene(withSize(S.std, z.key), c), drawers: list.filter((d) => sd(d).size === z.key && !isWhite(d.ground) === c) }))).filter((g) => g.drawers.length);
const groupName = (g) => g.std.sizeName + (g.std.coloured ? ', coloured' : '');
const lieneStd = (d) => forLiene(sd(d), !isWhite(d.ground));
function borderStep(groups, word) {
  const kinds = new Set(groups.map((g) => !!g.std.coloured));
  if (kinds.size === 2) return `Border 1.5 for white ${word}, −1 for coloured ${word}. Coloured file names include Colour.`;
  return kinds.has(true) ? 'Border −1, so the colour runs past the cut.' : 'Border 1.5.';
}
const sheetsFor = (groups) => groups.reduce((n, g) => n + Math.ceil(g.drawers.length / sheetLayout(g.std).perSheet), 0);

const slug = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '');
const fileName = (d) => `${S.std.prefix}_Label_${d.id}_${slug(d.name)}.png`;

function area3() {
  if (S.flow) return `<section class="tier shut"><div class="tier-h"><span class="n">3</span><h2>Print</h2><span class="tier-d">Save files for your printer</span><span class="tier-s idle">Save this drawer first</span></div></section>`;
  if (!S.drawers.length) return `<section class="tier shut"><div class="tier-h"><span class="n">3</span><h2>Print</h2><span class="tier-d">Save files for your printer</span><span class="tier-s idle">Nothing to print yet</span></div></section>`;
  const { ok, held } = queue(), j = S.job, r = S.route, n = ok.length, groups = r === 'sheet' || r === 'single' ? lieneGroups(ok) : bySize(ok);
  const sheets = sheetsFor(groups);
  const pdf = r === 'letter' || r === 'a4', page = PAGES[r];
  const seg = (v, t) => `<button type="button" data-act="route" data-v="${v}" aria-pressed="${r === v}">${t}</button>`;
  const save = r === 'sheet' ? `Save ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}` : r === 'single' ? `Save ${n} ${n === 1 ? 'label' : 'labels'}` : `Save ${page.name} PDF`;
  const state = j?.busy ? ['Saving', 'busy'] : j?.done ? ['Saved', 'ok'] : j?.error ? ["Couldn't save", 'bad'] : [`${n} ${n === 1 ? 'label' : 'labels'} ready`, 'idle'];
  const side = r === 'sheet'
    ? `<div class="health warn" role="status"><b>Print one sheet first</b><span>Sheet cutting is new at this size. Check one before a full run.</span></div><div class="setv"><div>W<b>90</b></div><div>H<b>170</b></div><div>X<b>0</b></div><div>Y<b>0</b></div></div><ol class="setl"><li>Import the sheet.</li><li>Lock aspect, then type the sizes above.</li><li>Cutting mode: Separate, not Overall. ${borderStep(groups.length ? groups : [{ std: {} }], 'sheets')}</li><li>Don't use AI remove BG.</li></ol>`
    : r === 'single'
      ? `<div class="tools"><div class="segc" role="group" aria-label="Orientation"><button type="button" data-act="orient" data-v="r" aria-pressed="${!S.upright}">Rotated</button><button type="button" data-act="orient" data-v="u" aria-pressed="${S.upright}">Upright</button></div></div>${(groups.length ? groups : lieneGroups(S.drawers)).map((g) => { const f = derive(g.std).file; return `<div class="setv"><div>${esc(groupName(g))}</div><div>W<b>${S.upright ? f.w : f.h}</b> H<b>${S.upright ? f.h : f.w}</b></div></div>`; }).join('')}<ol class="setl"><li>Import each label as its own image.</li><li>Lock on, then type the size above for every label.</li><li>Cutting mode: Separate, not Overall. ${borderStep(groups.length ? groups : lieneGroups(S.drawers), 'labels')}</li><li>Keep inside 90 × 170, at least 4 mm between stickers.</li><li>Don't use AI remove BG.</li></ol>`
      : `<div class="setv">${(groups.length ? groups : bySize(S.drawers)).map((g) => `<div>${esc(g.std.sizeName)} per page<b>${pdf ? pageLayout(g.std, page).perPage : ''}</b></div>`).join('')}<div>Scale<b>100 %</b></div></div><ol class="setl"><li>Print at 100 %. Turn off Fit to page.</li><li>Check the 50 mm bar with a ruler.</li><li>Print on card, then cut on the marks.</li></ol>`;
  const tinted = ok.some((d) => !isWhite(d.ground));
  const tested = pdf ? `Works on any printer. Sizes need checking with a ruler.${tinted ? ' Colours were matched on the Liene. Print a test strip on this printer first.' : ''}` : 'Tested on the Liene PixCut S1 with the Liene Photo Mac app.';
  const jobUi = j?.busy ? `<div class="stack" role="status" style="gap:5px"><div class="bar"><i style="width:${Math.round(j.at / j.of * 100)}%"></i></div><p class="small mono">Saving ${j.at} of ${j.of}</p></div>`
    : j?.done ? `<div class="health ok" role="status"><b>Saved</b><span>${esc(j.file)}${j.held ? `. ${j.held} held back` : ''}, in your downloads.</span></div><div class="tools"><button class="key" type="button" data-act="markprinted">Mark ${j.ids.length} as printed</button><button class="key" type="button" data-act="notyet">Not yet</button></div>`
      : j?.error ? `<div class="health bad" role="alert"><b>Couldn't save</b><span>${esc(j.error)} Nothing was marked printed.</span></div>` : '';
  const heldLine = held.length ? `<div class="health warn" role="status"><b>${held.length} won't print</b><span>${held.map((d) => esc(d.id)).join(', ')} need a fix first. Open each one to see why.</span></div>` : '';
  let pv = '';
  if (r === 'sheet') {
    let k = 0;
    for (const g of groups) {
      const l = sheetLayout(g.std), count = Math.ceil(g.drawers.length / l.perSheet);
      for (let i = 0; i < count && k < 2; i++, k++) pv += `<figure class="sheet"><div class="pg"><span class="lbl">${renderSheet(fonts, g.std, g.drawers.slice(i * l.perSheet, (i + 1) * l.perSheet), iconOf)}</span></div><figcaption class="small">${esc(groupName(g))} sheet ${i + 1} of ${count} · ${Math.min(g.drawers.length - i * l.perSheet, l.perSheet)} labels</figcaption></figure>`;
    }
  } else if (r === 'single') {
    if (ok[0]) pv = `<figure class="sheet"><div class="proof" style="width:233px"><span class="lbl">${renderLabel(fonts, lieneStd(ok[0]), ok[0], iconOf(ok[0]))}</span></div><figcaption class="small mono">${esc(fileName(ok[0]))}</figcaption></figure>`;
  } else if (ok.length) pv = `<figure class="sheet"><div class="pdf"><span class="lbl">${renderPagePreview(fonts, groups[0].std, groups[0].drawers, iconOf, page)}</span></div><figcaption class="small">Page 1 · crop marks and scale bar are added to the PDF</figcaption></figure>`;
  return `<section class="tier" aria-labelledby="a3">
    <div class="tier-h"><span class="n">3</span><h2 id="a3">Print</h2><span class="tier-d">Save files for your printer</span><span class="tier-s ${state[1]}">${state[0]}</span></div>
    <div class="pad">
      <div class="segc" role="group" aria-label="Print route">${seg('sheet', 'Liene sheet')}${seg('single', 'Liene singles')}${seg('letter', 'Letter PDF')}${seg('a4', 'A4 PDF')}</div>
      <div class="split">
        <div class="stack">${side}<p class="small">${tested}</p>${heldLine}${jobUi}
          <div class="tools"><button class="key go" type="button" data-act="export" ${j?.busy || !n ? 'disabled' : ''}>${save}</button><span class="small">${S.picked.size ? `${n} selected` : `All ${n} labels. Select drawers above to choose.`}</span></div>
        </div>
        <div class="stack"><div class="sheets">${pv}</div></div>
      </div>
    </div>
  </section>`;
}

/* ---- Saving files ---- */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const scripts = {};
const loadScript = (src) => (scripts[src] ||= new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => no(new Error('A print library could not be loaded. Reload the page while online.'));
  document.head.append(s);
}));

function printTxt(route, groups) {
  const sheet = ['Liene PixCut S1, Mac app', '', 'Whole sheets', '1. Import the sheet.', '2. Lock aspect. Type W 90, H 170, X 0, Y 0.', `3. Cutting mode: Separate, not Overall. ${borderStep(groups, 'sheets')}`, "4. Don't use AI remove BG.", '', 'Print one sheet before a full run.'];
  const single = ['Liene PixCut S1, Mac app', '', '1. Import each label as its own image.', '2. Lock on. Type the size for every label. The app ignores file dpi.', ...groups.map((g) => { const f = derive(g.std).file; return `   ${groupName(g)}: W ${S.upright ? `${f.w} x H ${f.h}` : `${f.h} x H ${f.w}`}, border ${g.std.coloured ? '-1' : '1.5'}, prints at ${g.std.card.w} x ${g.std.card.h} mm`; }), '3. Cutting mode: Separate, not Overall, with the border above.', '4. File names start BISLEY_Label_ and the drawer ID. Coloured labels end in _Colour.', '5. Keep everything inside 90 x 170, at least 4 mm between stickers.', "6. Don't use AI remove BG."];
  return (route === 'sheet' ? sheet : single).join('\n') + '\n';
}

const tick = () => new Promise((r) => setTimeout(r));

async function exportNow() {
  const { ok, held } = queue(), r = S.route, groups = r === 'sheet' || r === 'single' ? lieneGroups(ok) : bySize(ok);
  S.job = { busy: true, at: 0, of: ok.length };
  draw();
  try {
    let file;
    if (r === 'letter' || r === 'a4') {
      await loadScript('vendor/pdf-lib.min.js');
      const bytes = await buildPdf(window.PDFLib, fonts, groups, iconOf, PAGES[r]);
      file = `${S.std.prefix}_Labels_${PAGES[r].name}.pdf`;
      download(new Blob([bytes], { type: 'application/pdf' }), file);
    } else {
      const out = [];
      if (r === 'sheet') {
        let done = 0;
        for (const g of groups) {
          const l = sheetLayout(g.std), p = sheetPixels(g.std), count = Math.ceil(g.drawers.length / l.perSheet);
          for (let i = 0; i < count; i++) {
            const part = g.drawers.slice(i * l.perSheet, (i + 1) * l.perSheet);
            const c = await svgToCanvas(renderSheet(fonts, g.std, part, iconOf), p.w, p.h);
            out.push([`${g.std.prefix}_${g.std.slug}${g.std.coloured ? 'Colour' : ''}Sheet_${i + 1}-of-${count}.png`, await canvasToPng(c)]);
            done += part.length; S.job.at = done; draw(); await tick();
          }
        }
      } else {
        for (const [i, d] of ok.entries()) {
          const ls = lieneStd(d), g = derive(ls);
          const c = await svgToCanvas(renderLabel(fonts, ls, d, iconOf(d)), g.W, g.H, !S.upright);
          out.push([ls.coloured ? fileName(d).replace(/\.png$/, '_Colour.png') : fileName(d), await canvasToPng(c)]);
          S.job.at = i + 1; if (i % 4 === 0) { draw(); await tick(); }
        }
      }
      if (out.length === 1) { file = out[0][0]; download(out[0][1], file); }
      else {
        await loadScript('vendor/jszip.min.js');
        const zip = new window.JSZip();
        for (const [n, b] of out) zip.file(n, b);
        zip.file('PRINT.txt', printTxt(r, groups));
        file = `${S.std.prefix}_Labels_${r === 'sheet' ? 'Sheets' : 'Singles'}.zip`;
        download(await zip.generateAsync({ type: 'blob' }), file);
      }
    }
    S.job = { done: true, file, held: held.length, ids: ok.map((d) => d.id) };
    say('Saved ' + file);
  } catch (e) {
    S.job = { error: e.message || 'The browser stopped the download. Allow downloads for this page and save again.' };
  }
  draw();
}

function exportRegistry(kind) {
  const stamp = today();
  if (kind === 'csv') download(new Blob([toCsv(S.drawers)], { type: 'text/csv' }), `file-ctrl-registry-${stamp}.csv`);
  else download(new Blob([JSON.stringify({ standard: S.std.key, drawers: S.drawers }, null, 2)], { type: 'application/json' }), `file-ctrl-registry-${stamp}.json`);
}

async function importFile(file) {
  S.importError = ''; S.importing = null;
  try {
    const rows = readRegistry(await file.text(), file.name);
    const dup = duplicates(rows);
    if (dup.length) throw new Error(dup.join(' ') + ' Fix these in the file and import again.');
    const bad = rows.filter((r) => r.icon_source === 'custom' && !checkSvg(r.custom_svg).ok).map((r) => r.id);
    if (bad.length) throw new Error(`Custom icons for ${bad.join(', ')} don't fit the label style.`);
    S.importing = { rows, file: file.name };
  } catch (e) { S.importError = e.message; }
  draw();
}

/* ---- Events ---- */
const keepFocus = (sel) => requestAnimationFrame(() => { const el = sel && document.querySelector(sel); if (el) { el.focus(); if (el.setSelectionRange && el.value !== undefined) el.setSelectionRange(el.value.length, el.value.length); } });

const actions = {
  new: () => { startFlow(null); keepFocus('#fId'); },
  edit: (el) => {
    const d = S.drawers.find((x) => x.id === el.dataset.id);
    startFlow(d); S.flow.editingId = d.id; S.move = null; keepFocus('#fName');
  },
  grip: (el) => { const d = S.drawers.find((x) => x.id === el.dataset.id); startFlow(d); S.flow.editingId = d.id; S.move = null; keepFocus('#fMove'); },
  moveid: () => {
    const f = S.flow, to = (f.moveTo || '').trim();
    if (to && to !== f.editingId) S.move = { uid: f.draft.uid, to, mode: 'shift', where: 'flow' };
    keepFocus('[data-act=move-yes]');
  },
  'move-yes': () => doMove(),
  'colour-yes': () => { const c = S.colour, hex = c.custom ? normHex(c.customHex) : c.hex; setColour(c.unit, hex, c.custom ? hex : c.name); },
  'colour-no': () => { S.colour = null; },
  strip: (el) => { const c = S.colour, hex = c.custom ? normHex(c.customHex) : c.hex; return printStrip(el.dataset.unit, hex, baseName(c.custom ? hex : c.name), 4); },
  'strip-pick': (el) => { S.strip.pick = el.dataset.v; },
  'strip-use': () => { const t = S.strip, x = stripShades(t.hex, t.step).find((s) => s.code === t.pick); setColour(t.unit, x.hex, `${baseName(t.name)}, tuned ${t.pick}`, `test strip ${t.pick}`); },
  'strip-finer': () => { const t = S.strip, x = stripShades(t.hex, t.step).find((s) => s.code === t.pick); return printStrip(t.unit, x.hex, t.name, Math.max(1, t.step / 2)); },
  'strip-no': () => { S.strip = null; },
  'move-mode': () => { S.move.mode = S.move.mode === 'swap' ? 'shift' : 'swap'; },
  'move-no': () => { const back = S.move?.where === 'flow'; S.move = null; if (back) keepFocus('#fMove'); },
  showlib: () => { S.showLib = !S.showLib; },
  cancel: () => { S.flow = null; S.move = null; },
  idnext: () => {
    if (!S.flow.sizeSet) S.flow.draft.size = sizeKeyFor({ id: S.flow.draft.id.trim() }, unitsNow());
    if (!S.flow.colourSet) Object.assign(S.flow.draft, usualColour(S.flow.draft.id.trim()));
    const f = S.flow, id = f.draft.id.trim();
    if (S.drawers.some((x) => x.id === id)) { f.inUse = true; return; }
    f.step = 2; keepFocus('#fName');
  },
  replace: () => { const f = S.flow, d = S.drawers.find((x) => x.id === f.draft.id); f.inUse = false; f.isNew = false; f.editingId = d.id; f.draft = { ...d }; f.step = 2; keepFocus('#fName'); },
  otherid: () => { const f = S.flow; f.inUse = false; f.draft.id = ''; keepFocus('#fId'); },
  check: () => {
    const f = S.flow;
    f.result = nameCheck(f.draft, S.drawers, fits9(f.draft));
    f.step = 3;
  },
  use: (el) => { const f = S.flow; f.draft.name = el.dataset.v; f.result = nameCheck(f.draft, S.drawers, fits9(f.draft)); },
  next: () => {
    const f = S.flow;
    if (f.step === 4 && !f.query) f.query = [f.draft.name, ...items(f.draft.contents).slice(0, 2)].join(', ');
    f.step += 1;
    if (f.step === 5) keepFocus('#iconQ');
  },
  back: () => { const f = S.flow; f.step = f.step === 6 ? 5 : 2; f.result = f.step === 2 ? null : f.result; },
  icon: (el) => { pickIcon(el.dataset.v); },
  svgon: () => { S.flow.custom = true; S.flow.svgFails = []; keepFocus('#svgText'); },
  svgoff: () => { S.flow.custom = false; S.flow.svgFails = []; },
  svgcheck: () => {
    const f = S.flow, r = checkSvg(f.svgText);
    f.svgFails = r.fails;
    if (r.ok) {
      const used = iconUsedBy(S.drawers, 'custom-' + f.draft.id, f.editingId);
      f.draft.icon = used ? 'custom-' + Date.now() : 'custom-' + f.draft.id; f.draft.icon_source = 'custom'; f.draft.custom_svg = f.svgText; f.draft.icon_weak = false;
      f.custom = false;
    }
  },
  save: () => {
    const f = S.flow, d = { ...f.draft, uid: f.draft.uid || newUid(), id: f.draft.id.trim(), name: f.draft.name.trim(), updated: today(), status: 'built', version: 'v4' };
    const at = S.drawers.findIndex((x) => x.id === (f.editingId ?? d.id));
    if (at >= 0) S.drawers[at] = d; else S.drawers.push(d);
    S.flow = null; S.job = null; changed(); say(`Saved drawer ${d.id}`);
  },
  remove: () => {
    const f = S.flow, at = S.drawers.findIndex((x) => x.id === f.editingId);
    S.undo = { kind: 'remove', d: S.drawers[at], at };
    S.drawers.splice(at, 1); S.picked.delete(f.editingId); S.flow = null; changed();
  },
  undo: () => {
    const u = S.undo;
    if (u.kind === 'move' || u.kind === 'colour') { S.drawers = u.before.drawers; S.picked = new Set(u.before.picked); followFlow(); } else S.drawers.splice(u.at, 0, u.d);
    S.undo = null; changed();
  },
  filter: (el) => { S.status = el.dataset.v; },
  clearfilter: () => { S.status = 'all'; S.weakOnly = false; },
  pickall: () => { const list = shown(); const all = list.every((d) => S.picked.has(d.id)); list.forEach((d) => (all ? S.picked.delete(d.id) : S.picked.add(d.id))); S.job = null; },
  route: (el) => { S.route = el.dataset.v; S.job = null; persist(); },
  orient: (el) => { S.upright = el.dataset.v === 'u'; },
  export: () => exportNow(),
  markprinted: () => { for (const d of S.drawers) if (S.job.ids.includes(d.id)) { d.status = 'printed'; d.updated = today(); } S.job = null; changed(); },
  notyet: () => { S.job = null; },
  csv: () => exportRegistry('csv'),
  json: () => exportRegistry('json'),
  fresh: () => { S.confirmFresh = true; },
  'fresh-no': () => { S.confirmFresh = false; },
  'fresh-yes': () => { S.drawers = []; S.units = false; S.examples = false; S.confirmFresh = false; S.picked.clear(); S.undo = null; persist(); syncSoon(); },
  'import-yes': () => { S.units = S.importing.rows.every((d) => UNITS.some((u) => u.test(d.id))); S.drawers = withSizes(S.importing.rows, unitsNow()); S.importing = null; S.examples = false; S.picked.clear(); persist(); syncSoon(); },
  'import-no': () => { S.importing = null; },
  dismiss: () => { S.importError = ''; },
  'gh-open': () => { S.gh.form = { repo: store.loadSync()?.repo || '', token: '', error: '', busy: false }; keepFocus('#ghRepo'); },
  'gh-cancel': () => { S.gh.form = null; },
  'gh-connect': () => connect(),
  'gh-sync': () => syncNow(),
  'gh-off': () => disconnect(),
  'gh-retoken': () => { const repo = S.gh.conn.repo; clearTimeout(syncTimer); S.gh.conn = null; S.gh.error = null; S.gh.state = 'off'; S.gh.form = { repo, token: '', error: '', busy: false }; keepFocus('#ghToken'); },
  'gh-usegh': () => choose(false),
  'gh-usemine': () => choose(true),
  'gh-keep': (el) => { S.gh.conflict.keep[+el.dataset.i] = el.dataset.v; },
  'gh-keepall': (el) => { S.gh.conflict.keep = S.gh.conflict.keep.map(() => el.dataset.v); },
  'gh-resolve': () => {
    const c = S.gh.conflict, kept = resolve(c.merged, c.conflicts, c.keep);
    applyRecord(kept); store.saveSync({ repo: S.gh.conn.repo, sha: c.remoteSha, base: c.remote });
    S.gh.conflict = null; return syncNow();
  }
};
// FC-R83: a look-only device can't change the registry
const EDITS = new Set(['new', 'edit', 'save', 'remove', 'undo', 'fresh', 'fresh-yes', 'import-yes', 'markprinted', 'grip', 'moveid', 'move-yes', 'move-mode', 'colour-yes', 'strip', 'strip-use', 'strip-finer']);

app.addEventListener('click', (e) => {
  const el = e.target.closest('button[data-act]');
  if (!el || el.disabled) return;
  const act = actions[el.dataset.act];
  if (!act || (readOnly() && EDITS.has(el.dataset.act))) return;
  if (el.dataset.act === 'grip' && dragged) { dragged = false; return; }
  S.undo = el.dataset.act === 'undo' || el.dataset.act === 'remove' ? S.undo : null;
  const r = act(el);
  if (!(r instanceof Promise)) draw();
});

app.addEventListener('change', (e) => {
  const el = e.target, a = el.dataset.act;
  if (a === 'pick') { el.checked ? S.picked.add(el.dataset.id) : S.picked.delete(el.dataset.id); S.job = null; draw(); }
  else if (a === 'weak') { S.weakOnly = el.checked; draw(); }
  else if (a === 'weakflag') { S.flow.draft.icon_weak = el.checked; }
  else if (a === 'size') { S.flow.draft.size = el.value; S.flow.sizeSet = true; $('flowPreview').innerHTML = previewFig(S.flow); }
  else if (a === 'status' && !readOnly()) { const d = S.drawers.find((x) => x.id === el.dataset.id); d.status = el.value; d.updated = today(); changed(); draw(); }
  else if (a === 'moveto' && !readOnly() && el.value !== S.flow.editingId) { S.move = { uid: S.flow.draft.uid, to: el.value, mode: 'shift', where: 'flow' }; draw(); keepFocus('[data-act=move-yes]'); }
  else if (a === 'ucolour' && !readOnly() && el.value) {
    const c = colourChoices().find((x) => x.v === el.value);
    S.strip = null; S.undo = null;
    S.colour = c.v === 'custom' ? { unit: el.dataset.unit, custom: true, customHex: unitColour(el.dataset.unit).hex } : { unit: el.dataset.unit, hex: c.hex, name: c.name };
    draw(); keepFocus(c.v === 'custom' ? '#cHex' : '[data-act=colour-yes]');
  } else if (a === 'dcolour') {
    const f = S.flow, c = colourChoices().find((x) => x.v === el.value);
    f.colourSet = true; f.customColour = c.v === 'custom'; f.groundText = undefined;
    if (c.v !== 'custom') { f.draft.ground = c.hex; f.draft.ground_name = c.hex ? c.name : ''; }
    draw(); if (f.customColour) keepFocus('#fGround');
  } else if (el.id === 'cPick') { S.colour.customHex = el.value.toUpperCase(); draw(); keepFocus('#cPick'); }
  else if (a === 'standard') { S.std = standardByKey(el.value); persist(); syncSoon(); draw(); }
  else if (a === 'import' && el.files[0]) importFile(el.files[0]);
});

app.addEventListener('input', (e) => {
  const f = S.flow, el = e.target;
  if (el.id === 'ghRepo' || el.id === 'ghToken') { S.gh.form[el.id === 'ghRepo' ? 'repo' : 'token'] = el.value; return; }
  if (el.id === 'cHex' && S.colour) { S.colour.customHex = el.value; clearTimeout(S.colour.t); S.colour.t = setTimeout(() => { draw(); keepFocus('#cHex'); }, 250); return; }
  if (!f) return;
  const set = (k) => {
    f.draft[k] = el.value;
    $('flowPreview').innerHTML = previewFig(f);
  };
  if (el.id === 'fMove') { f.moveTo = el.value; return; }
  if (el.id === 'fGround') { f.groundText = el.value; const h = normHex(el.value); f.draft.ground = h; f.draft.ground_name = h; $('flowPreview').innerHTML = previewFig(f); return; }
  if (el.id === 'fId') { f.draft.id = el.value; const b = app.querySelector('[data-act=idnext]'); if (b) b.disabled = !el.value.trim(); }
  else if (el.id === 'fName') { set('name'); f.result = null; const b = app.querySelector('[data-act=check]'); if (b) b.disabled = !el.value.trim(); }
  else if (el.id === 'fContents') {
    set('contents'); f.result = f.step === 2 ? null : f.result;
    const t = $('trimLine'); if (t) { const n = items(f.draft.contents).length, l = fitNow(f.draft).lines.length; t.textContent = `Aim for 3 to 5 items, comma-separated, within 2 lines. This one has ${n} ${n === 1 ? 'item' : 'items'} on ${l} ${l === 1 ? 'line' : 'lines'}.`; }
  } else if (el.id === 'iconQ') { f.query = el.value; clearTimeout(f.t); f.t = setTimeout(() => { draw(); keepFocus('#iconQ'); }, 200); }
  else if (el.id === 'svgText') { f.svgText = el.value; }
});

// Dragging a drawer by its ID (FC-R93, FC-S30). Pointer events, so a mouse and a finger work alike.
let drag = null, dragged = false;
function endDrag() {
  if (!drag) return;
  app.querySelectorAll('.dragging, .lifted, .drop').forEach((x) => x.classList.remove('dragging', 'lifted', 'drop'));
  drag = null;
}
app.addEventListener('pointerdown', (e) => {
  const g = e.target.closest('[data-act=grip]');
  if (!g || readOnly() || e.button > 0) return;
  const c = g.closest('.card'), d = S.drawers.find((x) => x.id === g.dataset.id);
  drag = { uid: d.uid, id: d.id, unit: c.dataset.unit, card: c, x: e.clientX, y: e.clientY, on: false, over: null };
  dragged = false;
  g.setPointerCapture(e.pointerId);
});
app.addEventListener('pointermove', (e) => {
  if (!drag || drag.cancel) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.on = true; drag.card.classList.add('lifted'); drag.card.closest('.group').classList.add('dragging');
  }
  const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
  const ok = t && t.dataset.unit === drag.unit && t.dataset.slot !== drag.id && t.closest('.group') === drag.card.closest('.group');
  app.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
  if (ok) t.classList.add('drop');
  drag.over = ok ? t.dataset.slot : null;
});
app.addEventListener('pointerup', () => {
  if (!drag) return;
  const { on, over, uid, cancel } = drag;
  endDrag();
  if (!on && !cancel) return;   // a press, not a drag: the click opens Move to
  dragged = true; setTimeout(() => { dragged = false; });   // only swallows the click this drag makes
  if (over && !cancel) { S.undo = null; S.move = { uid, to: over, mode: 'shift', where: 'lib' }; draw(); keepFocus('[data-act=move-yes]'); }
});
app.addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drag) { app.querySelectorAll('.dragging, .lifted, .drop').forEach((x) => x.classList.remove('dragging', 'lifted', 'drop')); drag.cancel = true; drag.on = false; }
  else if (S.move) { S.move = null; draw(); }
  else if (S.colour || S.strip) { S.colour = null; S.strip = null; draw(); }
});

function led(id, c) { $('led-' + id).className = 'led' + (c ? ' on-' + c : ''); }

function draw() {
  const had = document.activeElement?.dataset?.act;
  app.innerHTML = `<div class="bench" style="max-width:none">${area1()}${area2()}${area3()}</div>`;
  const { notes, holds } = S.drawers.length ? allChecks() : { notes: 0, holds: 0 };
  led('drawers', S.drawers.length ? 'ok' : '');
  led('checks', !S.drawers.length ? '' : holds ? 'fault' : notes ? 'busy' : 'ok');
  led('print', S.job?.busy ? 'busy' : S.job?.done ? 'ok' : S.job?.error ? 'fault' : '');
  // FC-U13
  const g = S.gh, n = g.conn && store.loadSync()?.base ? waiting(store.loadSync().base, record()) : 0;
  led('sync', !g.conn ? '' : g.state === 'synced' || g.state === 'readonly' ? 'ok' : g.state === 'attention' ? 'fault' : 'busy');
  $('sync-word').textContent = !g.conn ? 'Sync off' : { saving: 'Saving', synced: n ? 'Saving' : 'Synced', offline: `Offline · ${n} waiting`, readonly: 'Read only', attention: 'Needs attention' }[g.state] || 'Sync';
  if (had) app.querySelector(`[data-act="${had}"]`)?.focus();
}

async function start() {
  try {
    fonts = await loadFonts();
  } catch {
    app.innerHTML = `<div class="health bad" role="alert"><b>Couldn't load</b><span>The label fonts or icons didn't load. Reload while online once.</span></div>`;
    return;
  }
  const { data, ok } = store.load();
  S.storageOk = ok && store.save(data || { probe: true });
  if (data?.drawers) {
    S.units = data.units !== false;
    S.drawers = data.examples ? SEED.map((d) => ({ ...d })) : withSizes(data.drawers.map(migrate).map(withUid), unitsNow()); S.examples = !!data.examples; S.std = standardByKey(data.standard);
    if (data.route) S.route = data.route;
  } else {
    S.drawers = SEED.map((d) => ({ ...d }));
    if (S.storageOk) store.clear();
  }
  const conn = store.loadGitHub();
  if (conn?.repo && conn?.token) { S.gh.conn = conn; S.gh.state = 'saving'; }
  draw();
  if (S.gh.conn) syncNow();
  addEventListener('online', () => { if (S.gh.conn) syncNow(); });
}
start();
