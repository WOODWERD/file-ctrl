// Pure layouts for Liene sheets and PDF pages. Sizes come from the standard (FC-R66, FC-R67, FC-R69).
import { derive } from '../label/geometry.js';
import { labelOps, opsToSvg } from '../label/render.js';

export const SHEET = { w: 90, h: 170 };
const STICKER_GAP = 4;   // between finished stickers, from the Liene profile

export function sheetLayout(std) {
  const g = derive(std);
  // Labels sit on their side, so the file's height runs across the sheet
  const across = g.file.h, down = g.file.w, pitchX = across + 2 * std.border + STICKER_GAP, pitchY = down + 2 * std.border + STICKER_GAP;
  const cols = Math.floor((SHEET.w + STICKER_GAP) / pitchX), rows = Math.floor((SHEET.h + STICKER_GAP) / pitchY);
  const fit = (n, size, pitch, each) => (size - (n * each + (n - 1) * (pitch - each))) / 2;
  return { across, down, pitchX, pitchY, cols, rows, perSheet: cols * rows, mx: fit(cols, SHEET.w, pitchX, across), my: fit(rows, SHEET.h, pitchY, down) };
}

export const sheetCount = (std, n) => Math.ceil(n / sheetLayout(std).perSheet);

export function sheetPixels(std) {
  const g = derive(std);
  return { w: g.px(SHEET.w), h: g.px(SHEET.h) };
}

// One sheet: white labels on transparent. Rotated the way wwlabel.py rotates a single label.
export function renderSheet(fonts, std, drawers, iconOf) {
  const g = derive(std), l = sheetLayout(std), s = sheetPixels(std);
  const parts = drawers.map((d, i) => {
    const x = g.px(l.mx + (i % l.cols) * l.pitchX), y = g.px(l.my + Math.floor(i / l.cols) * l.pitchY);
    const { ops } = labelOps(fonts, std, d, iconOf(d));
    return `<g transform="translate(${x} ${y + g.W}) rotate(-90)"><rect width="${g.W}" height="${g.H}" fill="#fff"/>${opsToSvg(ops)}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.w}mm" height="${SHEET.h}mm" viewBox="0 0 ${s.w} ${s.h}">${parts.join('')}</svg>`;
}

export const PAGES = {
  letter: { key: 'letter', name: 'Letter', w: 215.9, h: 279.4 },
  a4: { key: 'a4', name: 'A4', w: 210, h: 297 }
};
const PAGE_MARGIN = 6.35, CARD_GAP = 3;

export function pageLayout(std, page) {
  const { w, h } = std.card, pad = 2 * PAGE_MARGIN;
  const cols = Math.floor((page.w - pad + CARD_GAP) / (w + CARD_GAP));
  const rows = Math.floor((page.h - pad + CARD_GAP) / (h + CARD_GAP));
  const tw = cols * w + (cols - 1) * CARD_GAP, th = rows * h + (rows - 1) * CARD_GAP;
  return { cols, rows, perPage: cols * rows, gap: CARD_GAP, x: (page.w - tw) / 2, y: (page.h - th) / 2, tw, th };
}

// A small picture of a PDF page for the Print area
export function renderPagePreview(fonts, std, drawers, iconOf, page) {
  const g = derive(std), l = pageLayout(std, page);
  const parts = drawers.slice(0, l.perPage).map((d, i) => {
    const x = g.px(l.x + (i % l.cols) * (std.card.w + l.gap) + std.border), y = g.px(l.y + Math.floor(i / l.cols) * (std.card.h + l.gap) + std.border);
    return `<g transform="translate(${x} ${y})">${opsToSvg(labelOps(fonts, std, d, iconOf(d)).ops)}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.px(page.w)} ${g.px(page.h)}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`;
}
