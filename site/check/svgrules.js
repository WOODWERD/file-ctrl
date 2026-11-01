// Custom icon rules (FC-R53). Reads the SVG as text, so nothing in it can run. Shapes become one path.
const SHAPES = ['path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect'];
const OK_TAGS = ['svg', 'g', ...SHAPES];
const NUM = (v) => parseFloat(v) || 0;

function attrs(s) {
  const a = {};
  for (const m of s.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"|([a-zA-Z:-]+)\s*=\s*'([^']*)'/g)) a[(m[1] || m[3]).toLowerCase()] = m[2] ?? m[4];
  return a;
}

function toPath(tag, a) {
  if (tag === 'path') return a.d || '';
  if (tag === 'circle' || tag === 'ellipse') {
    const x = NUM(a.cx), y = NUM(a.cy), rx = NUM(a.r ?? a.rx), ry = NUM(a.r ?? a.ry);
    return `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  }
  if (tag === 'line') return `M${NUM(a.x1)} ${NUM(a.y1)}L${NUM(a.x2)} ${NUM(a.y2)}`;
  if (tag === 'rect') { const x = NUM(a.x), y = NUM(a.y), w = NUM(a.width), h = NUM(a.height); return `M${x} ${y}h${w}v${h}h${-w}z`; }
  const p = (a.points || '').trim().split(/[\s,]+/);
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d + (tag === 'polygon' ? 'z' : '');
}

// Bounds from end points and control points. Arcs count their end points only, which is close enough to catch artwork off the grid.
export function pathBounds(d) {
  const t = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g) || [];
  const COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const hit = (a, b) => { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); };
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
    const U = cmd.toUpperCase(), rel = cmd !== U, n = COUNT[U];
    if (n === undefined) return null;
    if (U === 'Z') { x = sx; y = sy; if (i >= t.length || /[a-zA-Z]/.test(t[i])) continue; }
    const v = t.slice(i, i + n).map(Number); i += n;
    const X = (k) => (rel ? x : 0) + v[k], Y = (k) => (rel ? y : 0) + v[k];
    if (U === 'H') { x = X(0); hit(x, y); }
    else if (U === 'V') { y = rel ? y + v[0] : v[0]; hit(x, y); }
    else if (U === 'A') { const a = X(5), b = Y(6); hit(a, b); x = a; y = b; }
    else {
      for (let k = 0; k + 1 < n; k += 2) hit(X(k), Y(k + 1));
      const a = X(n - 2), b = Y(n - 1); x = a; y = b;
    }
    if (U === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
  }
  return { x0, y0, x1, y1 };
}

export function checkSvg(text) {
  const fails = [];
  const src = String(text || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<title>[\s\S]*?<\/title>/gi, '');
  const tags = [...src.matchAll(/<\s*([a-zA-Z][\w:-]*)([^>]*)>/g)].map((m) => ({ tag: m[1].toLowerCase(), a: attrs(m[2]) }));
  const root = tags.find((t) => t.tag === 'svg');
  if (!root) return { ok: false, fails: ["This isn't an SVG. Paste the whole <svg> element."], d: '' };
  const vb = (root.a.viewbox || '').trim().split(/[\s,]+/).join(' ');
  if (vb !== '0 0 24 24') fails.push(`viewBox must be 0 0 24 24. This one is ${vb || 'missing'}.`);
  const others = [...new Set(tags.map((t) => t.tag).filter((t) => !OK_TAGS.includes(t)))];
  if (others.includes('text') || others.includes('tspan')) fails.push('No text. Draw letters as shapes, or use a different icon.');
  const rest = others.filter((t) => t !== 'text' && t !== 'tspan');
  if (rest.length) fails.push(`Only shape elements are allowed. Remove ${rest.join(', ')}.`);
  if (/\son[a-z]+\s*=/i.test(src)) fails.push('Remove event attributes such as onclick.');
  const shapes = tags.filter((t) => SHAPES.includes(t.tag) && !(t.a.stroke === 'none' && (t.a.fill === 'none' || t.a.d === 'M0 0h24v24H0z')));
  if (!shapes.length) fails.push('There is nothing to draw in this SVG.');
  const look = (k) => { const own = shapes.map((s) => s.a[k]).find((v) => v !== undefined); return root.a[k] ?? own; };
  if (root.a.fill !== 'none' || shapes.some((s) => s.a.fill && s.a.fill !== 'none')) fails.push('Use fill none. This one is filled.');
  if (look('stroke') !== 'currentColor') fails.push('Use stroke currentColor, so the icon prints black.');
  if (String(look('stroke-width')) !== '2') fails.push('Use stroke-width 2.');
  if (look('stroke-linecap') !== 'round' || look('stroke-linejoin') !== 'round') fails.push('Use round caps and joins.');
  const d = shapes.map((s) => toPath(s.tag, s.a)).join(' ');
  if (d && vb === '0 0 24 24') {
    const b = pathBounds(d);
    if (!b) fails.push("This path can't be read. Check its data.");
    else if (b.x0 < 2 - 0.01 || b.y0 < 2 - 0.01 || b.x1 > 22 + 0.01 || b.y1 > 22 + 0.01) fails.push('Keep the artwork within 2 to 22.');
  }
  return { ok: fails.length === 0, fails, d };
}
