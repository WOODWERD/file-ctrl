// Name fit and contents wrap, as wwlabel.py does them (FC-R06 to FC-R08, FC-R11).
const NAME_START = 9, NAME_MIN = 6, CONTENTS_START = 4.75, CONTENTS_MIN = 4, STEP = 0.25, NAME_EM = 0.04;

export const advance = (font, ch, size) => font.getAdvanceWidth(ch, size, { kerning: false });

// Name width: letter by letter, no kerning, plus tracking
export const nameWidth = (fonts, text, size) =>
  [...text].reduce((w, c) => w + advance(fonts.bold, c, size), 0) + size * NAME_EM * ([...text].length - 1);

export function wrap(fonts, text, size, width) {
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = (cur + ' ' + word).trim();
    if (fonts.regular.getAdvanceWidth(next, size, { kerning: true }) <= width || !cur) cur = next;
    else { lines.push(cur); cur = word; }
  }
  return [...lines, cur];
}

export function textArea(geo) {
  const start = geo.X(geo.icon) + geo.px(1.8);
  return { start, width: geo.X(geo.std.window.w) - geo.px(0.4) - start };
}

export function fitLabel(fonts, geo, name, contents) {
  const { width } = textArea(geo);
  const upper = (name || '').toUpperCase();
  let namePt = NAME_START;
  while (nameWidth(fonts, upper, geo.pt(namePt)) > width && namePt > NAME_MIN) namePt -= STEP;
  let contentsPt = CONTENTS_START;
  let lines = contents ? wrap(fonts, contents, geo.pt(contentsPt), width) : [];
  while (lines.length > 2 && contentsPt > CONTENTS_MIN) {
    contentsPt -= STEP;
    lines = wrap(fonts, contents, geo.pt(contentsPt), width);
  }
  return {
    upper, namePt, contentsPt, lines,
    nameOver: nameWidth(fonts, upper, geo.pt(namePt)) > width,
    fitsAtStart: nameWidth(fonts, upper, geo.pt(NAME_START)) <= width,
    contentsOver: lines.length > 2
  };
}
