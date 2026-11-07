// The label as a list of drawing steps, so SVG, PNG, proof and PDF all come from one source (FC-R10).
// Label v4. Coordinates are 300 dpi pixels from the top-left of FILE. renderLabel returns SVG sized in mm.
import { derive } from './geometry.js';
import { fitLabel, textArea, advance } from './fit.js';
import { inkFor } from './colour.js';

const ICON_MM = 14, ID_AT = 0.6, ID_PT = 5, ID_EM = 0.08, NAME_EM = 0.04;
const DIVIDER_INSET = 2.5, GAP_MM = 1, LINE = 1.22, NAME_LINE = 1.08;

const inkTop = (font, text, size) => -font.getPath(text, 0, 0, size).getBoundingBox().y1;

function tracked(font, text, x, y, size, em) {
  let d = '';
  for (const c of text) {
    d += font.getPath(c, x, y, size).toPathData(2);
    x += advance(font, c, size) + size * em;
  }
  return d;
}

export function labelOps(fonts, std, drawer, iconPath) {
  const g = derive(std);
  const fit = fitLabel(fonts, g, drawer.name, drawer.contents);
  const ops = [], k = inkFor(drawer.ground);   // FC-R105: the ink follows the ground
  const BK = k.full, GY1 = k.contents, GY2 = k.id, GY3 = k.rule;
  const sx = g.X(g.icon);
  ops.push({ t: 'rect', x: sx - 1, y: g.Y(DIVIDER_INSET), w: 2, h: g.Y(std.window.h - DIVIDER_INSET) - g.Y(DIVIDER_INSET) + 1, fill: GY3 });
  if (drawer.id) {
    const size = g.pt(ID_PT);
    ops.push({ t: 'fill', d: tracked(fonts.bold, drawer.id, g.X(ID_AT), g.Y(ID_AT) + inkTop(fonts.bold, drawer.id, size), size, ID_EM), fill: GY2 });
  }
  if (iconPath) {
    const s = g.px(ICON_MM);
    const x = Math.round(g.X(0) + (g.px(g.icon) - s) / 2);
    const y = Math.round(g.Y(0) + (g.px(std.window.h) - s) / 2);
    ops.push({ t: 'icon', d: iconPath, x, y, scale: s / 24, fill: BK });
  }
  const nameSize = g.pt(fit.namePt), contentsSize = g.pt(fit.contentsPt);
  const cap = fonts.bold.tables.os2.sCapHeight / fonts.bold.unitsPerEm * nameSize;
  const step = nameSize * NAME_LINE, lh = contentsSize * LINE, gap = g.px(GAP_MM);
  const { start, width } = textArea(g);
  const named = fit.nameLines.length;
  const rule = fit.lines.length ? gap + 2 + gap : 0;
  let y = g.Y(0) + (g.px(std.window.h) - (cap + (named - 1) * step + rule + lh * fit.lines.length)) / 2 + cap;
  fit.nameLines.forEach((line, i) => ops.push({ t: 'fill', d: tracked(fonts.bold, line, start, y + i * step, nameSize, NAME_EM), fill: BK }));
  y += (named - 1) * step;
  if (fit.lines.length) {
    y += gap;
    ops.push({ t: 'rect', x: start, y, w: width, h: 2, fill: GY3 });
    y += 2 + gap;
  }
  for (const line of fit.lines) {
    ops.push({ t: 'fill', d: fonts.regular.getPath(line, start, y + inkTop(fonts.regular, line, contentsSize), contentsSize).toPathData(2), fill: GY1 });
    y += lh;
  }
  return { ops, fit, geo: g, ground: k.ground, paint: k.ground === '#FFFFFF' ? '#fff' : k.ground };
}

export function opsToSvg(ops) {
  return ops.map((o) => {
    if (o.t === 'rect') return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill}"/>`;
    if (o.t === 'fill') return `<path fill="${o.fill}" d="${o.d}"/>`;
    return `<path transform="translate(${o.x} ${o.y}) scale(${o.scale})" fill="${o.fill}" fill-rule="evenodd" d="${o.d}"/>`;
  }).join('');
}

const mm = (v) => Math.round(v * 1000) / 1000;

// viewBox in print pixels, physical size in mm
export function renderLabel(fonts, std, drawer, iconPath) {
  const { ops, geo: g, paint } = labelOps(fonts, std, drawer, iconPath);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(g.file.w)}mm" height="${mm(g.file.h)}mm" viewBox="0 0 ${g.W} ${g.H}"><rect width="${g.W}" height="${g.H}" fill="${paint}"/>${opsToSvg(ops)}</svg>`;
}

// The label on its card, with the steel frame over it (FC-R35)
export function renderProof(fonts, std, drawer, iconPath) {
  const { ops, geo: g, paint } = labelOps(fonts, std, drawer, iconPath);
  const wx = (g.CW - g.px(std.window.w)) / 2, wy = (g.CH - g.px(std.window.h)) / 2;
  const ww = g.px(std.window.w), wh = g.px(std.window.h);
  const frame = `M0 0H${g.CW}V${g.CH}H0ZM${wx} ${wy}V${wy + wh}H${wx + ww}V${wy}Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.CW} ${g.CH}"><rect width="${g.CW}" height="${g.CH}" fill="${paint}"/><g transform="translate(${g.B} ${g.B})">${opsToSvg(ops)}</g><path fill="#969696" fill-opacity=".78" fill-rule="evenodd" d="${frame}"/></svg>`;
}
