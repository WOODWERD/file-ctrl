// File Ctrl interface. Three Areas: Drawers, Label, Print (FC-U05). State IDs in comments match the spec.
import { STANDARDS, standardByKey } from './label/standards.js';
import { derive } from './label/geometry.js';
import { fitLabel } from './label/fit.js';
import { loadFonts } from './label/fonts.js';
import { renderLabel, renderProof } from './label/render.js';
import { SEED, UNITS } from './registry/seed.js';
import * as store from './registry/store.js';
import { toCsv, readRegistry } from './registry/csv.js';
import { duplicates, iconUsedBy } from './registry/uniqueness.js';
import { nameCheck, items } from './check/namecheck.js';
import { checkSvg } from './check/svgrules.js';
import { checks, blocked } from './check/checks.js';
import { sheetLayout, sheetPixels, renderSheet, renderPagePreview, PAGES } from './export/sheet.js';
import { buildPdf } from './export/pdf.js';
import { svgToCanvas, canvasToPng } from './export/png.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const say = (t) => { $('live').textContent = t; };

let fonts, icons;
const S = {
  std: STANDARDS[0], drawers: [], units: true, examples: true, storageOk: true,
  status: 'all', weakOnly: false, picked: new Set(), showLib: false,
  flow: null, importing: null, importError: '', confirmFresh: false, undo: null,
  route: 'sheet', upright: false, job: null
};

const iconOf = (d) => (d.icon_source === 'custom' ? checkSvg(d.custom_svg).d : icons[d.icon]?.[0]) || '';
const unitsNow = () => (S.units ? UNITS : []);
const proof = (d) => renderProof(fonts, S.std, d, iconOf(d));
const persist = () => {
  S.storageOk = store.save({ standard: S.std.key, drawers: S.drawers, units: S.units, examples: S.examples, route: S.route });
};
const changed = () => { S.examples = false; persist(); };

/* ---- Drawers (Area 1) ---- */
function allChecks() {
  let notes = 0, holds = 0;
  for (const d of S.drawers) {
    const c = checks(fonts, S.std, d, S.drawers, unitsNow());
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

function card(d) {
  const on = S.picked.has(d.id);
  return `<div class="card${on ? ' on' : ''}">
    <button class="open" type="button" data-act="edit" data-id="${esc(d.id)}" aria-label="Edit drawer ${esc(d.id)} ${esc(d.name)}"><span class="lbl">${proof(d)}</span></button>
    <div class="cmeta">
      <input type="checkbox" data-act="pick" data-id="${esc(d.id)}" ${on ? 'checked' : ''} aria-label="Select drawer ${esc(d.id)} to print">
      <span class="id">${esc(d.id)}</span>
      ${d.icon_weak ? '<span class="wk">Weak icon</span>' : ''}
      <select data-act="status" data-id="${esc(d.id)}" aria-label="Status of drawer ${esc(d.id)}">${['built', 'printed', 'installed'].map((s) => `<option value="${s}"${d.status === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
    </div>
  </div>`;
}

function groups(list) {
  if (!S.units) return [{ name: 'Drawers', note: '', items: list }];
  const out = UNITS.map((u) => ({ name: u.name, note: u.measured ? '' : "Card size isn't measured yet", items: list.filter((d) => u.test(d.id)) }));
  const rest = list.filter((d) => !UNITS.some((u) => u.test(d.id)));
  if (rest.length) out.push({ name: 'Other', note: '', items: rest });
  return out.filter((g) => g.items.length);
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
  if (S.importing) body += `<div class="health warn" role="status"><b>Replace the registry?</b><span>${esc(S.importing.file)} has ${S.importing.rows.length} drawers with no repeated names or icons. It replaces the ${S.drawers.length} here. Export first if you want to keep them.</span></div><div class="tools"><button class="key" type="button" data-act="import-yes">Replace ${S.drawers.length} with ${S.importing.rows.length}</button><button class="key" type="button" data-act="import-no">Cancel</button></div>`;
  if (S.confirmFresh) body += `<div class="health warn" role="status"><b>Start fresh?</b><span>This clears all ${S.drawers.length} drawers from this browser. Export first if you want to keep them.</span></div><div class="tools"><button class="key danger" type="button" data-act="fresh-yes">Clear ${S.drawers.length} drawers</button><button class="key" type="button" data-act="fresh-no">Cancel</button></div>`;
  if (S.undo) body += `<div class="health" role="status"><b>Removed ${esc(S.undo.d.id)} ${esc(S.undo.d.name)}</b><span></span><button class="key" type="button" data-act="undo">Undo</button></div>`;
  if (S.examples && S.drawers.length) body += `<div class="health" role="status"><b>Example drawers</b><span>These ${S.drawers.length} show how labels look. Edit them, or use Start fresh to begin your own list.</span></div>`;
  if (!S.drawers.length) {
    body += `<div class="stack" style="align-items:flex-start;padding-block:34px"><p style="margin:0">No drawers yet. Add the first one or import a registry.</p><div class="tools"><button class="key go" type="button" data-act="new">New drawer</button><label class="key">Import<input class="sr" type="file" accept=".csv,.json" data-act="import"></label></div></div>`;
  } else {
    body += `<div class="tools" role="group" aria-label="Filters"><div class="segc" role="group" aria-label="Status">${seg('all', 'All')}${seg('built', 'Built')}${seg('printed', 'Printed')}${seg('installed', 'Installed')}</div>
      <label class="small" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" data-act="weak" ${S.weakOnly ? 'checked' : ''} style="margin:0;accent-color:var(--ink)"> Weak icons only</label>
      <span class="sp"></span><button class="key" type="button" data-act="pickall">${list.length && list.every((d) => S.picked.has(d.id)) ? 'Clear selection' : 'Select all to print'}</button>
      <button class="key go" type="button" data-act="new" style="height:34px;font-size:var(--t-cap)">New drawer</button></div>`;
    if (!list.length) body += `<div class="stack" style="align-items:flex-start;padding-block:34px"><p style="margin:0">Nothing matches these filters.</p><button class="key" type="button" data-act="clearfilter">Clear filters</button></div>`;
    for (const g of groups(list)) body += `<div class="group"><div class="ghead"><b>${esc(g.name)}</b><span>${g.note}</span></div><div class="grid">${g.items.map(card).join('')}</div></div>`;
  }
  return `<section class="tier" aria-labelledby="a1">
    <div class="tier-h"><span class="n">1</span><h2 id="a1">Drawers</h2><span class="tier-d">Every label made, by cabinet</span><span class="tier-s ${st.cls}">${st.text}</span></div>
    <div class="pad">
      <div class="std">
        <label class="f"><span>Cabinet standard</span><select class="in" data-act="standard" aria-label="Cabinet standard">${STANDARDS.map((s) => `<option value="${s.key}"${s === S.std ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <div class="rd"><span>Card</span><b>${S.std.card.w} × ${S.std.card.h} mm</b></div>
        <div class="rd"><span>Window</span><b>${S.std.window.w} × ${S.std.window.h} mm</b></div>
        <div class="tools" style="justify-content:flex-end">
          <label class="key">Import<input class="sr" type="file" accept=".csv,.json" data-act="import"></label>
          <button class="key" type="button" data-act="csv">Export CSV</button>
          <button class="key" type="button" data-act="json">Export JSON</button>
          <button class="key" type="button" data-act="fresh">Start fresh</button>
        </div>
      </div>
      ${body}
    </div>
  </section>`;
}

/* ---- Label flow (Area 2) ---- */
const blank = () => ({ id: '', name: '', contents: '', icon: '', icon_source: 'tabler', custom_svg: '', icon_weak: false, version: 'v4', status: 'built', updated: '' });

function startFlow(d) {
  S.flow = { step: d ? 2 : 1, isNew: !d, inUse: false, draft: d ? { ...d } : blank(), result: null, query: '', custom: false, svgText: '', svgFails: [] };
  S.showLib = false;
}

const fitNow = (d) => fitLabel(fonts, derive(S.std), d.name, d.contents);
const fits9 = (d) => fitNow(d).namePt >= 9;

function iconResults(q) {
  const words = q.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1).map((w) => w.replace(/s$/, ''));
  if (!words.length) return [];
  const hits = [];
  for (const [name, [, tags]] of Object.entries(icons)) {
    let score = 0;
    for (const w of words) {
      if (name === w) score += 5;
      else if (name.includes(w)) score += 3;
      else if (tags.includes(w)) score += 1;
    }
    if (score) hits.push([score, name]);
  }
  return hits.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])).slice(0, 40).map((h) => h[1]);
}

function pickIcon(name) {
  const f = S.flow, d = f.draft;
  d.icon = name; d.icon_source = 'tabler'; d.custom_svg = ''; d.icon_weak = false;
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
  const names = iconResults(f.query);
  const cand = ['custom-soldering-iron', 'nut'];
  const list = [...names.filter((n) => cand.includes(n)), ...names.filter((n) => !cand.includes(n))];
  const btn = (n) => {
    const u = iconUsedBy(S.drawers, n, self);
    const tag = u ? `Used by ${u.id}` : n === d.icon ? 'Selected' : cand.includes(n) ? 'Candidate' : '';
    return `<button class="icb" type="button" data-act="icon" data-v="${n}" ${u ? 'disabled' : ''} aria-pressed="${n === d.icon}" aria-label="${n}${tag ? ', ' + tag : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[n][0]}"></path></svg><span>${n}</span><em>${tag}</em></button>`;
  };
  const size = d.icon ? `<div class="ten"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconOf(d)}"></path></svg><span>Shown at 14 mm, the size it prints. Actual size on screen depends on your display.</span></div>` : '';
  const none = !list.length ? `<p class="small">No icons match. Try another word or paste your own.</p>` : '';   // FC-S13
  return `<label class="f"><span>Search icons</span><input class="in" id="iconQ" value="${esc(f.query)}"></label>
    <div id="iconResults"><div class="icons">${list.map(btn).join('')}</div>${none}</div>${size}
    <label class="small" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" data-act="weakflag" ${d.icon_weak ? 'checked' : ''} style="margin:0;accent-color:var(--ink)"> Flag this icon as weak</label>
    <div class="tools"><button class="key" type="button" data-act="next" ${d.icon ? '' : 'disabled'}>Next</button><button class="key" type="button" data-act="svgon">Paste your own SVG</button></div>`;
}

function checkList(d) {
  const list = checks(fonts, S.std, d, S.drawers, unitsNow());
  return list.map((c) => `<div class="health ${c.level === 'hold' ? 'warn' : ''}" role="status"><b>${c.level === 'hold' ? 'Can\'t save yet' : 'Note'}</b><span>${esc(c.text)}</span></div>`).join('');
}

function previewFig(f) {
  const d = f.draft;
  if (!d.name && !d.contents && !d.icon && !f.inUse) return `<div style="aspect-ratio:47/25;border:1px dashed var(--strong);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:var(--t-cap);color:var(--soft)">The label appears here</div><figcaption class="small">Nothing to show yet.</figcaption>`;
  const show = f.inUse ? S.drawers.find((x) => x.id === d.id) : d;
  const r = fitNow(show);
  return `<span class="lbl">${proof(show)}</span><figcaption class="small">${f.inUse ? `Current label for drawer ${esc(d.id)}.` : 'Live proof, as it looks in the holder. The gray is the steel frame.'}</figcaption><p class="small mono">Name ${r.namePt} pt · Contents ${r.contentsPt} pt · ${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}</p>`;
}

function area2() {
  const f = S.flow;
  if (!f) return `<section class="tier shut"><div class="tier-h"><span class="n">2</span><h2>Label</h2><span class="tier-d">Name a drawer, pick its icon, check the proof</span><span class="tier-s idle">Pick a drawer or start a new one</span></div></section>`;
  const d = f.draft, cur = f.step, held = blocked(checks(fonts, S.std, d, S.drawers, unitsNow()));
  const n = items(d.contents).length, lines = fitNow(d).lines.length;
  const s1 = f.inUse
    ? `<label class="f"><span>ID</span><input class="in m" id="fId" value="${esc(d.id)}"></label><div class="health warn" role="status"><b>${esc(d.id)} already has a label</b><span>${esc(S.drawers.find((x) => x.id === d.id)?.name)}, shown here. Replacing it keeps the ID and overwrites the rest.</span></div><div class="tools"><button class="key" type="button" data-act="replace">Replace ${esc(d.id)}</button><button class="key" type="button" data-act="otherid">Pick another ID</button></div>`
    : `<label class="f"><span>ID</span><input class="in m" id="fId" value="${esc(d.id)}" placeholder="01"></label><div class="tools"><button class="key" type="button" data-act="idnext" ${d.id ? '' : 'disabled'}>Next</button></div>`;
  const s2 = `<label class="f"><span>Name</span><input class="in" id="fName" value="${esc(d.name)}"></label><label class="f"><span>Contents</span><input class="in" id="fContents" value="${esc(d.contents)}"></label><div class="tools"><button class="key" type="button" data-act="check" ${d.name ? '' : 'disabled'}>Check the name</button></div>`;
  const s4 = `<label class="f"><span>Contents</span><input class="in" id="fContents" value="${esc(d.contents)}"></label><p class="small" id="trimLine">Aim for 3 to 5 items, comma-separated, within 2 lines. This one has ${n} ${n === 1 ? 'item' : 'items'} on ${lines} ${lines === 1 ? 'line' : 'lines'}.</p><div class="tools"><button class="key" type="button" data-act="next">Next</button></div>`;
  const s6 = `<p class="small">The gray is the steel frame. Only the white area shows in the holder.</p><div class="stack" style="gap:5px">${checkList(d)}</div><div class="tools"><button class="key go" type="button" data-act="save" ${held ? 'disabled' : ''}>Save drawer ${esc(d.id)}</button><button class="key" type="button" data-act="back">Back</button>${f.isNew ? '' : '<button class="key danger" type="button" data-act="remove">Remove</button>'}</div>`;
  const rstate = !f.result ? (cur > 2 ? '' : 'Not checked yet') : f.result.kind === 'unknown' ? 'Not checked' : f.result.kind === 'ok' ? 'Name fits the contents' : 'Your call';
  const state = f.inUse ? ['ID in use', 'warn'] : held && cur >= 6 ? ["Can't save yet", 'warn'] : f.svgFails.length ? ['SVG rejected', 'bad'] : f.result && cur === 3 && !['ok', 'unknown'].includes(f.result.kind) ? ['One suggestion', 'warn'] : f.isNew && cur === 1 ? ['New drawer', 'idle'] : ['In progress', 'idle'];
  return `<section class="tier" aria-labelledby="a2">
    <div class="tier-h"><span class="n">2</span><h2 id="a2">Label</h2><span class="tier-d">${f.isNew ? (d.id ? 'New drawer ' + esc(d.id) : 'Name a drawer, pick its icon, check the proof') : 'Editing drawer ' + esc(f.editingId)}</span><span class="tier-s ${state[1]}">${state[0]}</span></div>
    <div class="pad"><div class="split">
      <div class="steps">
        ${stepRow(1, 'Drawer ID', `<span class="mono">${cur > 1 ? esc(d.id) : ''}</span>`, s1, cur)}
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
  for (const d of list) (blocked(checks(fonts, S.std, d, S.drawers, unitsNow())) ? held : ok).push(d);
  return { ok, held };
}

const slug = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '');
const fileName = (d) => `${S.std.prefix}_Label_${d.id}_${slug(d.name)}.png`;

function area3() {
  if (S.flow) return `<section class="tier shut"><div class="tier-h"><span class="n">3</span><h2>Print</h2><span class="tier-d">Save files for your printer</span><span class="tier-s idle">Save this drawer first</span></div></section>`;
  if (!S.drawers.length) return `<section class="tier shut"><div class="tier-h"><span class="n">3</span><h2>Print</h2><span class="tier-d">Save files for your printer</span><span class="tier-s idle">Nothing to print yet</span></div></section>`;
  const { ok, held } = queue(), j = S.job, l = sheetLayout(S.std), r = S.route, n = ok.length;
  const sheets = Math.ceil(n / l.perSheet);
  const pdf = r === 'letter' || r === 'a4', page = PAGES[r];
  const seg = (v, t) => `<button type="button" data-act="route" data-v="${v}" aria-pressed="${r === v}">${t}</button>`;
  const save = r === 'sheet' ? `Save ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}` : r === 'single' ? `Save ${n} ${n === 1 ? 'label' : 'labels'}` : `Save ${page.name} PDF`;
  const state = j?.busy ? ['Saving', 'busy'] : j?.done ? ['Saved', 'ok'] : j?.error ? ["Couldn't save", 'bad'] : [`${n} ${n === 1 ? 'label' : 'labels'} ready`, 'idle'];
  const side = r === 'sheet'
    ? `<div class="health warn" role="status"><b>Print one sheet first</b><span>Sheet cutting is new at this size. Check one before a full run.</span></div><div class="setv"><div>W<b>90</b></div><div>H<b>170</b></div><div>X<b>0</b></div><div>Y<b>0</b></div></div><ol class="setl"><li>Import the sheet.</li><li>Lock aspect, then type the sizes above.</li><li>Cutting mode: Separate, not Overall. Border 1.5.</li><li>Don't use AI remove BG.</li></ol>`
    : r === 'single'
      ? `<div class="tools"><div class="segc" role="group" aria-label="Orientation"><button type="button" data-act="orient" data-v="r" aria-pressed="${!S.upright}">Rotated</button><button type="button" data-act="orient" data-v="u" aria-pressed="${S.upright}">Upright</button></div></div><div class="setv"><div>W<b>${S.upright ? 44 : 22}</b></div><div>H<b>${S.upright ? 22 : 44}</b></div></div><ol class="setl"><li>Import each label as its own image.</li><li>Lock on, then type the size above for every label.</li><li>Cutting mode: Separate, not Overall.</li><li>Keep inside 90 × 170, at least 4 mm between stickers.</li><li>Don't use AI remove BG.</li></ol>`
      : `<div class="setv"><div>Per page<b>${r === 'letter' ? 36 : 40}</b></div><div>Scale<b>100 %</b></div></div><ol class="setl"><li>Print at 100 %. Turn off Fit to page.</li><li>Check the 50 mm bar with a ruler.</li><li>Print on card, then cut on the marks.</li></ol>`;
  const tested = pdf ? 'Works on any printer. Sizes need checking with a ruler.' : 'Tested on the Liene PixCut S1 with the Liene Photo Mac app.';
  const jobUi = j?.busy ? `<div class="stack" role="status" style="gap:5px"><div class="bar"><i style="width:${Math.round(j.at / j.of * 100)}%"></i></div><p class="small mono">Saving ${j.at} of ${j.of}</p></div>`
    : j?.done ? `<div class="health ok" role="status"><b>Saved</b><span>${esc(j.file)}${j.held ? `. ${j.held} held back` : ''}, in your downloads.</span></div><div class="tools"><button class="key" type="button" data-act="markprinted">Mark ${j.ids.length} as printed</button><button class="key" type="button" data-act="notyet">Not yet</button></div>`
      : j?.error ? `<div class="health bad" role="alert"><b>Couldn't save</b><span>${esc(j.error)} Nothing was marked printed.</span></div>` : '';
  const heldLine = held.length ? `<div class="health warn" role="status"><b>${held.length} won't print</b><span>${held.map((d) => esc(d.id)).join(', ')} need a fix first. Open each one to see why.</span></div>` : '';
  let pv = '';
  if (r === 'sheet') {
    for (let i = 0; i < Math.min(sheets, 2); i++) pv += `<figure class="sheet"><div class="pg"><span class="lbl">${renderSheet(fonts, S.std, ok.slice(i * l.perSheet, (i + 1) * l.perSheet), iconOf)}</span></div><figcaption class="small">Sheet ${i + 1} of ${sheets} · ${Math.min(n - i * l.perSheet, l.perSheet)} labels</figcaption></figure>`;
  } else if (r === 'single') {
    if (ok[0]) pv = `<figure class="sheet"><div class="proof" style="width:233px"><span class="lbl">${renderLabel(fonts, S.std, ok[0], iconOf(ok[0]))}</span></div><figcaption class="small mono">${esc(fileName(ok[0]))}</figcaption></figure>`;
  } else if (ok.length) pv = `<figure class="sheet"><div class="pdf"><span class="lbl">${renderPagePreview(fonts, S.std, ok, iconOf, page)}</span></div><figcaption class="small">Page 1 · crop marks and scale bar are added to the PDF</figcaption></figure>`;
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

function printTxt(route) {
  const sheet = ['Liene PixCut S1, Mac app', '', 'Whole sheets', '1. Import the sheet.', '2. Lock aspect. Type W 90, H 170, X 0, Y 0.', '3. Cutting mode: Separate, not Overall. Border 1.5.', "4. Don't use AI remove BG.", '', 'Print one sheet before a full run.'];
  const single = ['Liene PixCut S1, Mac app', '', '1. Import each label as its own image.', `2. Lock on. Type W ${S.upright ? '44 x H 22' : '22 x H 44'} for every label. The app ignores file dpi.`, '3. Cutting mode: Separate, not Overall. It adds 1.5 mm per side.', `4. Each label prints at ${S.std.card.w} x ${S.std.card.h} mm.`, '5. Keep everything inside 90 x 170, at least 4 mm between stickers.', "6. Don't use AI remove BG."];
  return (route === 'sheet' ? sheet : single).join('\n') + '\n';
}

const tick = () => new Promise((r) => setTimeout(r));

async function exportNow() {
  const { ok, held } = queue(), r = S.route, l = sheetLayout(S.std), g = derive(S.std);
  S.job = { busy: true, at: 0, of: ok.length };
  draw();
  try {
    let file;
    if (r === 'letter' || r === 'a4') {
      await loadScript('vendor/pdf-lib.min.js');
      const bytes = await buildPdf(window.PDFLib, fonts, S.std, ok, iconOf, PAGES[r]);
      file = `${S.std.prefix}_Labels_${PAGES[r].name}.pdf`;
      download(new Blob([bytes], { type: 'application/pdf' }), file);
    } else {
      const out = [];
      if (r === 'sheet') {
        const p = sheetPixels(S.std), count = Math.ceil(ok.length / l.perSheet);
        for (let i = 0; i < count; i++) {
          const c = await svgToCanvas(renderSheet(fonts, S.std, ok.slice(i * l.perSheet, (i + 1) * l.perSheet), iconOf), p.w, p.h);
          out.push([`${S.std.prefix}_Sheet_${i + 1}-of-${count}.png`, await canvasToPng(c)]);
          S.job.at = Math.min(ok.length, (i + 1) * l.perSheet); draw(); await tick();
        }
      } else {
        for (const [i, d] of ok.entries()) {
          const c = await svgToCanvas(renderLabel(fonts, S.std, d, iconOf(d)), g.W, g.H, !S.upright);
          out.push([fileName(d), await canvasToPng(c)]);
          S.job.at = i + 1; if (i % 4 === 0) { draw(); await tick(); }
        }
      }
      if (out.length === 1) { file = out[0][0]; download(out[0][1], file); }
      else {
        await loadScript('vendor/jszip.min.js');
        const zip = new window.JSZip();
        for (const [n, b] of out) zip.file(n, b);
        zip.file('PRINT.txt', printTxt(r));
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
    startFlow(d); S.flow.editingId = d.id; keepFocus('#fName');
  },
  showlib: () => { S.showLib = !S.showLib; },
  cancel: () => { S.flow = null; },
  idnext: () => {
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
    const f = S.flow, d = { ...f.draft, id: f.draft.id.trim(), name: f.draft.name.trim(), updated: today(), status: 'built', version: 'v4' };
    const at = S.drawers.findIndex((x) => x.id === (f.editingId ?? d.id));
    if (at >= 0) S.drawers[at] = d; else S.drawers.push(d);
    S.flow = null; S.job = null; changed(); say(`Saved drawer ${d.id}`);
  },
  remove: () => {
    const f = S.flow, at = S.drawers.findIndex((x) => x.id === f.editingId);
    S.undo = { d: S.drawers[at], at };
    S.drawers.splice(at, 1); S.picked.delete(f.editingId); S.flow = null; changed();
  },
  undo: () => { S.drawers.splice(S.undo.at, 0, S.undo.d); S.undo = null; changed(); },
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
  'fresh-yes': () => { S.drawers = []; S.units = false; S.examples = false; S.confirmFresh = false; S.picked.clear(); S.undo = null; persist(); },
  'import-yes': () => { S.drawers = S.importing.rows; S.importing = null; S.examples = false; S.picked.clear(); S.units = S.drawers.every((d) => UNITS.some((u) => u.test(d.id))); persist(); },
  'import-no': () => { S.importing = null; },
  dismiss: () => { S.importError = ''; }
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('button[data-act]');
  if (!el || el.disabled) return;
  const act = actions[el.dataset.act];
  if (!act) return;
  S.undo = el.dataset.act === 'undo' || el.dataset.act === 'remove' ? S.undo : null;
  const r = act(el);
  if (!(r instanceof Promise)) draw();
});

app.addEventListener('change', (e) => {
  const el = e.target, a = el.dataset.act;
  if (a === 'pick') { el.checked ? S.picked.add(el.dataset.id) : S.picked.delete(el.dataset.id); S.job = null; draw(); }
  else if (a === 'weak') { S.weakOnly = el.checked; draw(); }
  else if (a === 'weakflag') { S.flow.draft.icon_weak = el.checked; }
  else if (a === 'status') { const d = S.drawers.find((x) => x.id === el.dataset.id); d.status = el.value; d.updated = today(); changed(); draw(); }
  else if (a === 'standard') { S.std = standardByKey(el.value); persist(); draw(); }
  else if (a === 'import' && el.files[0]) importFile(el.files[0]);
});

app.addEventListener('input', (e) => {
  const f = S.flow, el = e.target;
  if (!f) return;
  const set = (k) => {
    f.draft[k] = el.value;
    $('flowPreview').innerHTML = previewFig(f);
  };
  if (el.id === 'fId') { f.draft.id = el.value; const b = app.querySelector('[data-act=idnext]'); if (b) b.disabled = !el.value.trim(); }
  else if (el.id === 'fName') { set('name'); f.result = null; const b = app.querySelector('[data-act=check]'); if (b) b.disabled = !el.value.trim(); }
  else if (el.id === 'fContents') {
    set('contents'); f.result = f.step === 2 ? null : f.result;
    const t = $('trimLine'); if (t) { const n = items(f.draft.contents).length, l = fitNow(f.draft).lines.length; t.textContent = `Aim for 3 to 5 items, comma-separated, within 2 lines. This one has ${n} ${n === 1 ? 'item' : 'items'} on ${l} ${l === 1 ? 'line' : 'lines'}.`; }
  } else if (el.id === 'iconQ') { f.query = el.value; clearTimeout(f.t); f.t = setTimeout(() => { draw(); keepFocus('#iconQ'); }, 200); }
  else if (el.id === 'svgText') { f.svgText = el.value; }
});

function led(id, c) { $('led-' + id).className = 'led' + (c ? ' on-' + c : ''); }

function draw() {
  const had = document.activeElement?.dataset?.act;
  app.innerHTML = `<div class="bench" style="max-width:none">${area1()}${area2()}${area3()}</div>`;
  const { notes, holds } = S.drawers.length ? allChecks() : { notes: 0, holds: 0 };
  led('drawers', S.drawers.length ? 'ok' : '');
  led('checks', !S.drawers.length ? '' : holds ? 'fault' : notes ? 'busy' : 'ok');
  led('print', S.job?.busy ? 'busy' : S.job?.done ? 'ok' : S.job?.error ? 'fault' : '');
  if (had) app.querySelector(`[data-act="${had}"]`)?.focus();
}

async function start() {
  try {
    [fonts, icons] = await Promise.all([loadFonts(), fetch('icons/tabler.json').then((r) => r.json())]);
  } catch {
    app.innerHTML = `<div class="health bad" role="alert"><b>Couldn't load</b><span>The label fonts or icons didn't load. Reload while online once.</span></div>`;
    return;
  }
  const { data, ok } = store.load();
  S.storageOk = ok && store.save(data || { probe: true });
  if (data?.drawers) {
    S.drawers = data.drawers; S.units = data.units !== false; S.examples = !!data.examples; S.std = standardByKey(data.standard);
    if (data.route) S.route = data.route;
  } else {
    S.drawers = SEED.map((d) => ({ ...d }));
    if (S.storageOk) store.clear();
  }
  draw();
}
start();
