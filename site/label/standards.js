// Cabinet standards. Everything specific to a make of cabinet lives here, so a new one is data (FC-R13).
export const STANDARDS = [
  {
    key: 'bisley',
    name: 'BISLEY',
    prefix: 'BISLEY',
    border: 1.5,                // the Liene adds this per side in Separate mode
    dpi: 300,
    // Card sizes (FC-R18). card slides into the holder; window is the opening, and all ink stays inside it.
    sizes: [
      { key: 'multidrawer', name: 'MultiDrawer', slug: '', card: { w: 47, h: 25 }, window: { w: 42, h: 18 }, windowMeasured: true },
      // Layout B (FC-R19): the icon panel matches the MultiDrawer card, so it's split from that 42 mm window
      { key: 'file', name: 'File cabinet', slug: 'FileCabinet_', card: { w: 95, h: 25 }, window: { w: 90, h: 18 }, windowMeasured: false, iconWindow: 42 }
    ]
  }
];

// A standard resolved to one card size. With no size it is the first, so callers that ignore sizes keep working.
export function withSize(std, key) {
  const size = std.sizes.find((s) => s.key === key) || std.sizes[0];
  return { ...std, ...size, key: std.key, name: std.name, size: size.key, sizeName: size.name };
}

export const standardByKey = (key) => withSize(STANDARDS.find((s) => s.key === key) || STANDARDS[0]);
