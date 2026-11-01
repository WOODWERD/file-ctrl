# File Ctrl

Make drawer-front labels for file cabinets, starting with BISLEY. Enter a drawer's ID, name and contents. File Ctrl checks the name, finds an icon no other drawer uses, shows the label as it looks through the holder, and saves files ready to print.

Everything runs in your browser. It makes no network requests after it loads, and your registry never leaves your computer.

Live at https://woodwerd.github.io/file-ctrl/ once published. To run it locally:

```bash
python3 -m http.server 8141 --directory site
```

## The BISLEY standard

Card 47 × 25 mm, window 42 × 18 mm. All ink stays inside the window. The size lives in `site/label/standards.js`, so another cabinet standard is data, not code.

## The registry

Export CSV or JSON is your real save. Browser storage is only a convenience, and it can be cleared.

| Column | Meaning |
| --- | --- |
| `id` | Required. One row per ID |
| `name` | Required. No two rows share a name |
| `contents` | Comma-separated items, 3 to 5 reads best |
| `icon` | A Tabler outline name, or a `custom-` name. No two rows share an icon |
| `icon_source` | `tabler` or `custom` |
| `custom_svg` | The SVG for a custom icon |
| `icon_weak` | `true` flags an icon you'd like to replace |
| `version` | Label layout version |
| `status` | `built`, `printed` or `installed` |
| `updated` | ISO date |

## Custom icons

Paste an SVG in Tabler's style: 24 × 24 viewBox, fill none, stroke `currentColor`, stroke-width 2, round caps and joins, artwork within 2 to 22, and no text. The app names anything that doesn't fit, and only shape elements are accepted.

## Printing

**Liene PixCut S1, whole sheets.** Up to 9 labels on one PNG. Import the sheet, lock aspect, type W 90, H 170, X 0, Y 0. Cutting mode Separate, not Overall, border 1.5. Don't use AI remove BG. Print one sheet before a full run.

**Liene PixCut S1, singles.** The Mac app ignores file dpi, so type the size for every label: W 22 × H 44 rotated, W 44 × H 22 upright. Separate mode adds 1.5 mm per side, so 22 × 44 prints at 25 × 47. Keep everything inside 90 × 170 with at least 4 mm between stickers.

**Any printer.** Save a Letter or A4 PDF and print at 100 % with Fit to page off. Check the 50 mm bar with a ruler, then cut on the marks.

## Development

No build step. `site/` is what Pages publishes.

```bash
npm test
```

`npm test` runs the rule tests, with no dependencies to install. `tools/make-icons.py` rewrites `site/icons/tabler.json` from an unpacked `@tabler/icons` package. Bump `VERSION` in `site/sw.js` and the version strings with each release.

MIT licence. See `THIRD_PARTY_NOTICES.md` for fonts, icons and libraries.
