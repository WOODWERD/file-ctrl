// The person's own data repo (FC-R71 to FC-R88). Talks only to api.github.com, only for that repo, only for File Ctrl's files.
// The token goes in a header, never in an address, and never into the registry, an export or the repo (FC-R73).
import { normalise } from './csv.js';
import { duplicates } from './uniqueness.js';

export const RECORD_PATH = 'file-ctrl.json';
export const README_PATH = 'README.md';
export const APP_URL = 'https://woodwerd.github.io/file-ctrl/';
export const SETUP_URL = 'https://woodwerd.github.io/github.html';
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
const API = 'https://api.github.com';

export const repoError = (r) => (/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(String(r).trim()) ? '' : 'Enter the repo as owner/name, such as WOODWERD/file-ctrl-data.');

export function toB64(text) {
  const bytes = new TextEncoder().encode(text); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// The registry as it's stored: the JSON export's shape, so the file also opens in Import (FC-R75)
export const toRecord = (standard, drawers) => ({ standard, drawers: drawers.map(normalise) });
export const recordText = (rec) => JSON.stringify({ standard: rec.standard, drawers: rec.drawers }, null, 2) + '\n';

// FC-R86: a file edited by hand gets the same checks as Import
export function readRecordText(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { error: "isn't readable JSON" }; }
  if (!j || !Array.isArray(j.drawers)) return { error: 'has no drawers list' };
  const drawers = j.drawers.map(normalise);
  const dup = duplicates(drawers);
  if (dup.length) return { error: 'breaks the one-name, one-icon rule. ' + dup.join(' ') };
  return { record: { standard: typeof j.standard === 'string' ? j.standard : 'bisley', drawers } };
}

// What went wrong, in plain words, and what to do (FC-R81, FC-S26)
export function explain(status, repo, what = '') {
  if (status === 0) return { kind: 'offline', text: "GitHub can't be reached. Changes wait on this device and go when the connection is back." };
  if (status === 401) return { kind: 'auth', text: `GitHub refused the token. It may have expired or been revoked. Make a new one for ${repo} and paste it here.` };
  if (status === 403 || status === 429) return { kind: 'rights', text: `The token can't ${what || 'use'} ${repo}, or GitHub says too many requests. Check the token has Contents access for this repo, or wait a minute and press Sync now.` };
  if (status === 404) return { kind: 'missing', text: `There is no repo ${repo} that this token can see. Check the name, and that the token covers this repo.` };
  return { kind: 'other', text: `GitHub answered ${status}. Nothing changed on this device. Press Sync now in a minute.` };
}

export function client(repo, token, fetchFn = (...a) => fetch(...a)) {
  const call = async (path, opts = {}) => {
    let res;
    try {
      res = await fetchFn(`${API}/repos/${repo}${path}`, { ...opts, cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch { return { status: 0 }; }
    let json = null; try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  };
  // FC-R76: only these two paths are ever asked for
  const path = (p) => { if (p !== RECORD_PATH && p !== README_PATH) throw new Error('File Ctrl only uses its own files'); return `/contents/${p}`; };
  return {
    // FC-R74, FC-R83: is the repo there, is it private, can this token write?
    async check() {
      const r = await call('');
      if (r.status !== 200) return { error: explain(r.status, repo) };
      return { private: !!r.json.private, canWrite: !!r.json.permissions?.push, name: r.json.full_name || repo };
    },
    async read(p) {
      const r = await call(path(p));
      if (r.status === 404) return { missing: true };
      if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
      let b64 = r.json.content;
      if (r.json.encoding === 'none' || !b64) { // files over 1 MB come back by blob
        const b = await call(`/git/blobs/${r.json.sha}`);
        if (b.status !== 200) return { error: explain(b.status, repo, 'read') };
        b64 = b.json.content;
      }
      return { text: fromB64(b64), sha: r.json.sha };
    },
    async readRecord() {
      const f = await this.read(RECORD_PATH);
      if (f.missing || f.error) return f;
      const b = readRecordText(f.text);
      if (b.error) return { error: { kind: 'unreadable', text: `${RECORD_PATH} in ${repo} ${b.error} Nothing on this device changed. Fix or remove the file on GitHub, then press Sync now.` } };
      return { record: b.record, sha: f.sha };
    },
    // FC-R79: GitHub refuses a write based on an old copy (409); the caller merges and tries again
    async write(p, text, sha, message) {
      const r = await call(path(p), { method: 'PUT', body: JSON.stringify({ message, content: toB64(text), ...(sha ? { sha } : {}) }) });
      if (r.status === 200 || r.status === 201) return { sha: r.json.content.sha };
      if (r.status === 409 || (r.status === 422 && /sha/i.test(r.json?.message || ''))) return { stale: true };
      return { error: explain(r.status, repo, 'write to') };
    },
    writeRecord(rec, sha, message) { return this.write(RECORD_PATH, recordText(rec), sha, message); }
  };
}

export const readme = (repo) => `# File Ctrl registry

This private repo holds a [File Ctrl](${APP_URL}) registry: every drawer label, with its name, contents, icon and status.

- \`${RECORD_PATH}\` is written by File Ctrl. Change it there, not by hand, unless you know the format. It opens in File Ctrl's Import too.
- Each sync is one commit, so the history of every change is in this repo's commits.
- Keep this repo private.

Repo: ${repo}
`;
