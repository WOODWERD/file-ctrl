// Label colour (FC-R100 to FC-R112). Pure maths, no page code, so it's tested on its own.
// A label's ground is a hex colour, or '' for white. The ink follows the ground (FC-R105).

// Today's label colours on white (FC-R03 to FC-R08). A white ground uses exactly these (FC-R112).
export const WHITE_INK = { full: '#101010', contents: '#4A4A4A', id: '#7C7C7C', rule: '#B4B4B4' };
// Each grey as a strength of ink over white: (255 - grey) / (255 - 16), so white gives the greys back exactly
const STRENGTH = { contents: 181 / 239, id: 131 / 239, rule: 75 / 239 };
const DARK_INK = 0x10, PAPER = 0xff;

// '#abc', 'abc', '#AABBCC' or 'aabbcc' all read as '#AABBCC'. Anything else is '' (white).
export function normHex(v) {
  let s = String(v ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : '';
}
export const isWhite = (g) => { const h = normHex(g); return !h || h === '#FFFFFF'; };

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

// WCAG relative luminance and contrast ratio
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = (h) => { const [r, g, b] = rgb(normHex(h) || '#FFFFFF').map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The ink for a ground: black on light, bare paper (white) on dark, whichever has more contrast
export function inkFor(ground) {
  if (isWhite(ground)) return { ...WHITE_INK, ground: '#FFFFFF', dark: false };
  const g = normHex(ground), gc = rgb(g);
  const dark = contrast('#FFFFFF', g) > contrast('#101010', g);
  const ink = dark ? PAPER : DARK_INK;
  const mix = (s) => toHex(gc.map((v) => v + (ink - v) * s));
  return { full: dark ? '#FFFFFF' : '#101010', contents: mix(STRENGTH.contents), id: mix(STRENGTH.id), rule: mix(STRENGTH.rule), ground: g, dark };
}

// FC-R106: the name and icon need 4.5 : 1. Below 3 : 1 holds.
export function readability(ground) {
  const k = inkFor(ground), ratio = contrast(k.full, k.ground);
  return { ratio, level: ratio < 3 ? 'hold' : ratio < 4.5 ? 'note' : 'ok' };
}

/* CIE Lab, so test strip steps look even to the eye */
const D65 = [0.95047, 1, 1.08883];
function toLab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const xyz = [0.4124 * r + 0.3576 * g + 0.1805 * b, 0.2126 * r + 0.7152 * g + 0.0722 * b, 0.0193 * r + 0.1192 * g + 0.9505 * b].map((v, i) => v / D65[i]);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function fromLab([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const [x, y, z] = [inv(fx), inv(fy), inv(fz)].map((v, i) => v * D65[i]);
  const lr = [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z];
  const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return toHex(lr.map((v) => gam(Math.max(0, Math.min(1, v)))));
}

// FC-R107: nine shades, A1 to C3. Rows go lighter, same, darker; columns go warmer, same, cooler. B2 is the colour itself.
export function stripShades(hex, step = 4) {
  const base = toLab(normHex(hex) || '#FFFFFF'), out = [];
  ['A', 'B', 'C'].forEach((row, r) => [1, 2, 3].forEach((col, c) => {
    const dL = (1 - r) * step, warm = (1 - c) * step;
    out.push({ code: row + col, hex: r === 1 && c === 1 ? normHex(hex) : fromLab([base[0] + dL, base[1] + warm / 4, base[2] + warm]) });
  }));
  return out;
}

// The nearest lighter and darker shades that read at 4.5 : 1, for FC-K12's message
export function nearestReadable(hex) {
  const [L, a, b] = toLab(normHex(hex) || '#FFFFFF'), find = (dir) => {
    for (let d = 1; d <= 60; d++) {
      const L2 = L + dir * d;
      if (L2 < 0 || L2 > 100) return '';
      const h = fromLab([L2, a, b]);
      if (readability(h).level === 'ok') return h;
    }
    return '';
  };
  return { lighter: find(1), darker: find(-1) };
}

// A ground name counts as matched once a test strip has picked it (FC-R102)
export const isMatched = (name) => /, tuned [A-C][1-3]$/.test(String(name || ''));
export const baseName = (name) => String(name || '').replace(/, tuned [A-C][1-3]$/, '');
