// Common terms the name check knows beyond the registry's own words (FC-R40).
// A category here may be suggested as a name only if no drawer uses it yet (FC-R43).
export const CATEGORIES = {
  Adhesives: ['glue', 'epoxy', 'super glue', 'hot glue', 'adhesive', 'threadlocker'],
  Batteries: ['battery', 'coin cell', 'aa', 'aaa', '18650', 'lipo', 'charger'],
  Cables: ['cable', 'lead', 'adapter', 'patch cord', 'hdmi', 'ethernet'],
  Measuring: ['ruler', 'square', 'tape measure', 'gauge', 'feeler gauge', 'caliper'],
  Mechanical: ['bearing', 'gear', 'belt', 'pulley', 'shaft', 'spring'],
  Motors: ['motor', 'servo', 'stepper', 'driver board'],
  Office: ['pen', 'pencil', 'marker', 'stapler', 'paper clip', 'sticky note', 'scissors'],
  Optics: ['lens', 'loupe', 'magnifier', 'microscope'],
  Paper: ['paper', 'notebook', 'label sheet', 'envelope', 'card stock'],
  Safety: ['glove', 'goggle', 'mask', 'respirator', 'earplug'],
  Tape: ['tape', 'kapton', 'electrical tape', 'masking tape', 'gaffer tape'],
  Tools: ['plier', 'cutter', 'tweezer', 'wrench', 'hammer', 'screwdriver']
};

// Shorthand that should read as a word already in the registry
export const SHORTHAND = {
  cap: 'capacitor', caps: 'capacitor', res: 'resistor', pot: 'pot', ind: 'inductor', mosfet: 'transistor', ic: 'ic', mcu: 'esp32',
  dev: 'board', devboard: 'board', 'jumper wire': 'jumper', 'hook-up wire': 'hookup wire', shrink: 'heat shrink', iron: 'solder'
};
