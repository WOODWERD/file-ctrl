// Vector PDF of full cards with crop marks and a 50 mm scale bar (FC-R69, FC-R70).
import { labelOps } from '../label/render.js';
import { pageLayout } from './sheet.js';

const PT = 72 / 25.4;
const hex = (lib, h) => lib.rgb(...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));

function drawOps(lib, page, ops, ox, oy, pageH) {
  const k = 72 / 300;                     // print pixels to points
  const top = pageH - oy;
  for (const o of ops) {
    if (o.t === 'rect') page.drawRectangle({ x: ox + o.x * k, y: top - (o.y + o.h) * k, width: o.w * k, height: o.h * k, color: hex(lib, o.fill) });
    else if (o.t === 'fill') page.drawSvgPath(o.d, { x: ox, y: top, scale: k, color: hex(lib, o.fill), borderWidth: 0 });
    else page.pushOperators(...evenOdd(lib, o.d, { x: ox + o.x * k, y: top - o.y * k, scale: k * o.scale, rotate: lib.degrees(0), color: hex(lib, o.fill), borderWidth: 0 }));
  }
}

// Icon Ctrl icons have holes, so they fill with the even-odd rule. pdf-lib's drawSvgPath only fills non-zero.
function evenOdd(lib, d, opts) {
  const N = lib.PDFOperatorNames;
  return lib.drawSvgPath(d, opts).map((op) => (op.name === N.FillNonZero ? lib.PDFOperator.of(N.FillEvenOdd) : op));
}

export async function buildPdf(lib, fonts, std, drawers, iconOf, pageSize) {
  const doc = await lib.PDFDocument.create();
  doc.setTitle(std.name + ' drawer labels');
  doc.setCreator('File Ctrl');
  const l = pageLayout(std, pageSize);
  const w = pageSize.w * PT, h = pageSize.h * PT, ink = lib.rgb(0.063, 0.063, 0.063);
  const line = (p, x1, y1, x2, y2) => p.drawLine({ start: { x: x1 * PT, y: h - y1 * PT }, end: { x: x2 * PT, y: h - y2 * PT }, thickness: 0.35, color: ink });
  for (let start = 0; start < drawers.length; start += l.perPage) {
    const page = doc.addPage([w, h]);
    const on = drawers.slice(start, start + l.perPage);
    on.forEach((d, i) => {
      const cx = l.x + (i % l.cols) * (std.card.w + l.gap), cy = l.y + Math.floor(i / l.cols) * (std.card.h + l.gap);
      const { ops } = labelOps(fonts, std, d, iconOf(d));
      drawOps(lib, page, ops, (cx + std.border) * PT, (cy + std.border) * PT, h);
    });
    // Crop marks run in the page margin, one per cut line
    for (let c = 0; c < l.cols; c++) for (const e of [0, std.card.w]) {
      const x = l.x + c * (std.card.w + l.gap) + e;
      line(page, x, l.y - 3, x, l.y - 1);
      line(page, x, l.y + l.th + 1, x, l.y + l.th + 3);
    }
    for (let r = 0; r < l.rows; r++) for (const e of [0, std.card.h]) {
      const y = l.y + r * (std.card.h + l.gap) + e;
      line(page, l.x - 3, y, l.x - 1, y);
      line(page, l.x + l.tw + 1, y, l.x + l.tw + 3, y);
    }
    const by = l.y + l.th + 5.5;
    line(page, l.x, by, l.x + 50, by);
    line(page, l.x, by - 1, l.x, by + 1);
    line(page, l.x + 50, by - 1, l.x + 50, by + 1);
    page.drawText('50 mm. Print at 100 %.', { x: (l.x + 52) * PT, y: h - (by + 0.9) * PT, size: 6, color: ink });
  }
  return doc.save();
}
