// Inter Tight loaded for measuring and for drawing text as paths (FC-R10)
import { parse } from '../vendor/opentype.mjs';

export const parseFonts = (boldBuffer, regularBuffer) => ({ bold: parse(boldBuffer), regular: parse(regularBuffer) });

export async function loadFonts(base = 'fonts/') {
  const [b, r] = await Promise.all(['InterTight-700.ttf', 'InterTight-400.ttf'].map((f) => fetch(base + f).then((res) => {
    if (!res.ok) throw new Error('Could not load ' + f);
    return res.arrayBuffer();
  })));
  return parseFonts(b, r);
}
