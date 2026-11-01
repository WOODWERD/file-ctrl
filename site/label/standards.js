// Cabinet standards. Everything specific to a make of cabinet lives here, so a new one is data (FC-R13).
export const STANDARDS = [
  {
    key: 'bisley',
    name: 'BISLEY',
    prefix: 'BISLEY',
    card: { w: 47, h: 25 },     // the card that slides into the holder
    window: { w: 42, h: 18 },   // the opening in the steel holder; all ink stays inside it
    border: 1.5,                // the Liene adds this per side in Separate mode
    dpi: 300
  }
];

export const standardByKey = (key) => STANDARDS.find((s) => s.key === key) || STANDARDS[0];
