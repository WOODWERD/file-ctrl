// The 16 labels in label-registry.md (FC-R22), with Icon Ctrl icons (FC-R55). Generic drawer categories, no home details.
const row = (id, name, contents, icon) => ({ uid: 'd-' + id, id, name, contents, icon, icon_source: 'iconctrl', custom_svg: '', icon_weak: false, version: 'v4', status: 'built', updated: '2026-11-04' });

const ROWS = [
  row('D1', 'Test', 'Meter, leads, logic analyzer, calipers', 'multimeter'),
  row('D2', 'Rework', 'Hot air nozzles, PCB vise, loupe', 'hot-air-station'),
  row('D3', 'Power', 'USB cables, UART, programmers, PSU leads', 'usb-cable'),
  row('01', 'Desk', 'Pens, notes, tape, label tape', 'pen'),
  row('02', 'Hand tools', 'Strippers, flush cutters, pliers, tweezers', 'pliers-cutter'),
  row('03', 'Solder', 'Solder, flux, wick, tips, heat shrink', 'soldering-iron'),
  row('04', 'Drivers', 'Bits, spudgers, pry tools, ESD strap', 'screwdriver'),
  row('05', 'Passives', 'Resistors, capacitors, inductors, pots', 'resistor'),
  row('06', 'Semis', 'LEDs, diodes, transistors, ICs, regulators', 'chip'),
  row('07', 'Boards', 'ESP32, CYD, sensors, displays, modules', 'dev-board'),
  row('08', 'Connectors', 'Headers, JST, Dupont, terminals', 'connector'),
  row('09', 'Wire', 'Hookup wire, jumpers, ribbon, silicone', 'wire-spool'),
  row('10', 'Fasteners', 'M2–M5 screws, standoffs, inserts, magnets', 'screw'),
  row('F1', 'Proto', 'Breadboards, perfboard, refill stock', 'breadboard'),
  row('F2', 'Projects', 'WIP kits, enclosures, LiPo bag', 'kit'),
  row('F3', 'Files', 'Datasheets, manuals, project folders', 'folder')
];

// Units belong to the seeded registry, not the standard (FC-R17)
export const UNITS = [
  { key: 'multi', name: '10-drawer', test: (id) => /^(0[1-9]|10)$/.test(id), measured: true, size: 'multidrawer', slots: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] },
  { key: 'desk', name: 'Desktop 3-drawer', test: (id) => /^D[1-3]$/.test(id), measured: true, size: 'multidrawer', slots: ['D1', 'D2', 'D3'] },
  { key: 'file', name: 'File cabinet', test: (id) => /^F[1-3]$/.test(id), measured: true, size: 'file', slots: ['F1', 'F2', 'F3'] }
];

// A drawer's card size, or its unit's when it has none (FC-R20)
export const sizeKeyFor = (d, units = UNITS) => d.size || units.find((u) => u.test(d.id))?.size || 'multidrawer';
export const withSizes = (list, units = UNITS) => list.map((d) => ({ ...d, size: sizeKeyFor(d, units) }));

export const SEED = withSizes(ROWS);
