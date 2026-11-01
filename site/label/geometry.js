// Every value here is derived from the standard (FC-R01). Rounding follows wwlabel.py.
const PHI = (1 + Math.sqrt(5)) / 2;

// Python's round() goes to the even number on exact halves
const pyRound = (v) => {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5 || (d === 0.5 && f % 2 !== 0)) return f + 1;
  return f;
};

export function derive(std) {
  const px = (mm) => pyRound(mm / 25.4 * std.dpi);
  const file = { w: std.card.w - 2 * std.border, h: std.card.h - 2 * std.border };
  const off = { x: (file.w - std.window.w) / 2, y: (file.h - std.window.h) / 2 };
  const icon = std.window.w / (PHI * PHI);
  return {
    std, px, file, off, icon,
    text: std.window.w - icon,
    X: (v) => px(off.x + v),
    Y: (v) => px(off.y + v),
    W: px(file.w), H: px(file.h),
    CW: px(std.card.w), CH: px(std.card.h),
    B: px(std.border),
    pt: (p) => pyRound(p / 72 * std.dpi)
  };
}
