// Cabinet standards. Everything specific to a make of cabinet lives here, so a new one is data (FC-R13).
export const STANDARDS = [
  {
    key: 'bisley',
    name: 'BISLEY',
    prefix: 'BISLEY',
    // BISLEY finishes for label grounds (FC-R102). Only finishes Drew confirms go here (Q19): name, BISLEY code and RAL where
    // known, a start colour, and where it came from. Start colours are estimates until a test strip matches them.
    finishes: [
      // Drew's file cabinet, 2026-11-06. Sampled from the drawer fronts in a BISLEY product photo, so not matched yet.
      { key: 'golden-sunflower-yellow', name: 'Golden Sunflower Yellow', code: '', ral: '', hex: '#E7AF28', source: 'BISLEY 3-drawer flush front product photo, drawer fronts' }
    ],
    border: 1.5,                // the Liene adds this per side in Separate mode
    dpi: 300,
    // Card sizes (FC-R18). card is what's cut; window is where ink may go: the holder's opening, or with no holder the whole FILE.
    sizes: [
      { key: 'multidrawer', name: 'MultiDrawer', slug: '', card: { w: 47, h: 25 }, window: { w: 42, h: 18 }, windowMeasured: true },
      // No holder (Q12): the card sticks on the front in the handle area, so ink uses the whole FILE.
      // Layout B (FC-R19): the icon panel matches the MultiDrawer card, so it's split from that 42 mm window
      { key: 'file', name: 'File cabinet', slug: 'FileCabinet_', card: { w: 95, h: 25 }, window: { w: 92, h: 22 }, windowMeasured: true, holder: false, iconWindow: 42 }
    ]
  }
];

// A standard resolved to one card size. With no size it is the first, so callers that ignore sizes keep working.
export function withSize(std, key) {
  const size = std.sizes.find((s) => s.key === key) || std.sizes[0];
  return { ...std, ...size, key: std.key, name: std.name, size: size.key, sizeName: size.name };
}

export const standardByKey = (key) => withSize(STANDARDS.find((s) => s.key === key) || STANDARDS[0]);
