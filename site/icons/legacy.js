// Registries from x0.0.3 and earlier name Tabler icons (FC-R56). The 16 seed names move to their Icon Ctrl keys.
// Any other old name is kept, draws nothing, and holds the drawer until a new icon is picked (FC-K10).
import { ICONS } from './icons.js';

export const TABLER_TO_ICONCTRL = {
  'circuit-voltmeter': 'multimeter', flame: 'hot-air-station', usb: 'usb-cable', pencil: 'pen',
  tool: 'pliers-cutter', droplet: 'soldering-iron', tools: 'screwdriver', 'circuit-resistor': 'resistor',
  'circuit-diode': 'chip', cpu: 'dev-board', 'plug-connected': 'connector', route: 'wire-spool',
  hexagon: 'screw', 'grid-dots': 'breadboard', box: 'kit', folders: 'folder'
};

export const isOldIcon = (d) => !!d.icon && d.icon_source !== 'custom' && !ICONS[d.icon];

export function migrate(d) {
  const to = TABLER_TO_ICONCTRL[d.icon];
  if (d.icon_source === 'custom') return d;
  if (isOldIcon(d) && to) return { ...d, icon: to, icon_source: 'iconctrl', icon_weak: false };
  return { ...d, icon_source: 'iconctrl' };
}
