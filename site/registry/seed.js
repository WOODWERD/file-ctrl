// The 16 labels in label-registry.md (FC-R22). Generic drawer categories, no home details.
const row = (id, name, contents, icon, weak) => ({ id, name, contents, icon, icon_source: 'tabler', custom_svg: '', icon_weak: !!weak, version: 'v3', status: 'built', updated: '2026-10-30' });

export const SEED = [
  row('D1', 'Test', 'Meter, leads, logic analyzer, calipers', 'circuit-voltmeter'),
  row('D2', 'Rework', 'Hot air nozzles, PCB vise, loupe', 'flame'),
  row('D3', 'Power', 'USB cables, UART, programmers, PSU leads', 'usb'),
  row('01', 'Desk', 'Pens, notes, tape, label tape', 'pencil'),
  row('02', 'Hand tools', 'Strippers, flush cutters, pliers, tweezers', 'tool'),
  row('03', 'Solder', 'Solder, flux, wick, tips, heat shrink', 'droplet', true),
  row('04', 'Drivers', 'Bits, spudgers, pry tools, ESD strap', 'tools'),
  row('05', 'Passives', 'Resistors, capacitors, inductors, pots', 'circuit-resistor'),
  row('06', 'Semis', 'LEDs, diodes, transistors, ICs, regulators', 'circuit-diode'),
  row('07', 'Boards', 'ESP32, CYD, sensors, displays, modules', 'cpu'),
  row('08', 'Connectors', 'Headers, JST, Dupont, terminals', 'plug-connected'),
  row('09', 'Wire', 'Hookup wire, jumpers, ribbon, silicone', 'route', true),
  row('10', 'Fasteners', 'M2–M5 screws, standoffs, inserts, magnets', 'hexagon', true),
  row('F1', 'Proto', 'Breadboards, perfboard, refill stock', 'grid-dots'),
  row('F2', 'Projects', 'WIP kits, enclosures, LiPo bag', 'box'),
  row('F3', 'Files', 'Datasheets, manuals, project folders', 'folders')
];

// Units belong to the seeded registry, not the standard (FC-R17)
export const UNITS = [
  { key: 'multi', name: '10-drawer', test: (id) => /^(0[1-9]|10)$/.test(id), measured: true },
  { key: 'desk', name: 'Desktop 3-drawer', test: (id) => /^D[1-3]$/.test(id), measured: false },
  { key: 'file', name: 'File cabinet', test: (id) => /^F[1-3]$/.test(id), measured: false }
];
