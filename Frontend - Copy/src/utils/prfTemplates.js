// Pre-defined item templates per material category.
// Used in PrfNewPage to let users one-click-add common items offline.

export const PRF_TEMPLATES = {
  'Safety Equipment': [
    { description: 'Safety Helmet',              technical_specifications: 'EN397 certified, adjustable ratchet suspension',       unit: 'pcs',  quantity: 1,  ehs_requirements: 'Must meet EN397 standard; inspect before issue' },
    { description: 'Safety Shoes',               technical_specifications: 'S3 steel-toe, anti-slip, EN ISO 20345',                unit: 'pair', quantity: 1,  ehs_requirements: 'EN ISO 20345 S3 rated minimum' },
    { description: 'Safety Gloves (Cut-Resistant)', technical_specifications: 'Cut level C, EN388, nitrile palm coating',          unit: 'pair', quantity: 4,  ehs_requirements: 'Minimum cut protection level C (EN388)' },
    { description: 'High-Visibility Vest',       technical_specifications: 'Class 2, EN471 / EN ISO 20471, yellow or orange',      unit: 'pcs',  quantity: 2,  ehs_requirements: 'Class 2 minimum per EN ISO 20471' },
    { description: 'Full Body Safety Harness',   technical_specifications: 'EN361 certified, dorsal D-ring, adjustable straps',   unit: 'pcs',  quantity: 1,  ehs_requirements: 'EN361 certified; inspect before every use' },
    { description: 'Safety Goggles',             technical_specifications: 'EN166 certified, anti-fog, indirect ventilation',     unit: 'pcs',  quantity: 2,  ehs_requirements: 'EN166 certified' },
    { description: 'Dust / FFP2 Respirator',     technical_specifications: 'FFP2 NR D rated, valved preferred',                   unit: 'pcs',  quantity: 20, ehs_requirements: 'FFP2 rating minimum; single-use' },
    { description: 'Ear Muffs / Ear Protection', technical_specifications: 'SNR ≥ 30 dB, EN352-1',                               unit: 'pcs',  quantity: 4,  ehs_requirements: 'Required in areas > 85 dB; SNR ≥ 30 dB' },
  ],

  'Consumables': [
    { description: 'Multi-Purpose Lubricating Grease', technical_specifications: 'NLGI Grade 2, lithium complex, -20°C to +140°C', unit: 'kg',   quantity: 5,  ehs_requirements: 'Avoid skin contact; use gloves' },
    { description: 'Hydraulic Oil ISO VG 46',    technical_specifications: 'ISO VG 46, anti-wear, mineral-based',                 unit: 'L',    quantity: 20, ehs_requirements: 'Flammable; store away from heat sources' },
    { description: 'Penetrating / Release Oil Spray', technical_specifications: '400 ml aerosol, anti-rust formula',             unit: 'can',  quantity: 12, ehs_requirements: 'Flammable aerosol; no open flame nearby' },
    { description: 'Industrial Cleaning Solvent', technical_specifications: 'Non-chlorinated degreaser, biodegradable',          unit: 'L',    quantity: 10, ehs_requirements: 'Use in ventilated area; PPE gloves required' },
    { description: 'Cotton Wipers / Industrial Rags', technical_specifications: 'White cotton, 500 g/pack, lint-free',           unit: 'pack', quantity: 5,  ehs_requirements: 'Dispose of solvent-soaked rags in sealed metal bins' },
    { description: 'Cable Ties (Assorted)',       technical_specifications: '100 mm / 200 mm / 300 mm mixed, nylon 66',           unit: 'pack', quantity: 3,  ehs_requirements: '' },
    { description: 'Electrical Insulation Tape', technical_specifications: 'PVC, 19mm × 20m, 600V rated, black',                 unit: 'roll', quantity: 10, ehs_requirements: '' },
    { description: 'Anti-Seize Compound',        technical_specifications: 'Copper-based, temperature range up to 1100°C',       unit: 'tube', quantity: 3,  ehs_requirements: 'Avoid eye contact; wear gloves' },
  ],

  'Tools and Equipment': [
    { description: 'Combination Spanner Set',    technical_specifications: '8–32 mm, CR-V steel, 15 pcs',                        unit: 'set',  quantity: 1,  ehs_requirements: 'Inspect for cracks before use' },
    { description: 'Torque Wrench',              technical_specifications: '40–200 Nm range, 1/2" drive, click-type',            unit: 'pcs',  quantity: 1,  ehs_requirements: 'Calibrate every 12 months or 5000 cycles' },
    { description: 'Digital Multimeter',         technical_specifications: 'CAT III 600V, AC/DC voltage, current, resistance',   unit: 'pcs',  quantity: 1,  ehs_requirements: 'Rated CAT III minimum for electrical work' },
    { description: 'Hydraulic Floor Jack',       technical_specifications: '5-ton capacity, min height 130 mm, max 500 mm',      unit: 'pcs',  quantity: 1,  ehs_requirements: 'Never work under vehicle without safety stands' },
    { description: 'Angle Grinder 115 mm',       technical_specifications: '850W, 11,000 RPM, M14 spindle, with guard',          unit: 'pcs',  quantity: 1,  ehs_requirements: 'Mandatory face shield + gloves; guard must be fitted' },
    { description: 'Cordless Drill / Driver',    technical_specifications: '18V Li-ion, 2-speed, 13 mm chuck, 2× batteries',    unit: 'pcs',  quantity: 1,  ehs_requirements: '' },
    { description: 'Measuring Tape',             technical_specifications: '10 m × 25 mm, auto-lock, metric/imperial',           unit: 'pcs',  quantity: 2,  ehs_requirements: '' },
    { description: 'Spirit Level',               technical_specifications: '600 mm aluminum, 3 vials (horizontal, vertical, 45°)', unit: 'pcs', quantity: 1, ehs_requirements: '' },
  ],

  'Components and Parts': [
    { description: 'Deep Groove Ball Bearing',   technical_specifications: 'Specify part number / dimensions (ID × OD × Width)', unit: 'pcs',  quantity: 2,  ehs_requirements: 'Store in dry location; handle with clean gloves' },
    { description: 'O-Ring Assortment Kit',      technical_specifications: 'NBR / Viton, mixed sizes, 200+ pcs',                 unit: 'set',  quantity: 1,  ehs_requirements: '' },
    { description: 'Hydraulic Seal / Repair Kit',technical_specifications: 'Specify cylinder model / equipment ID',              unit: 'set',  quantity: 1,  ehs_requirements: '' },
    { description: 'V-Belt',                     technical_specifications: 'Specify cross-section (A/B/C) and length',           unit: 'pcs',  quantity: 2,  ehs_requirements: 'Ensure machine is locked out before replacement' },
    { description: 'Gasket Set',                 technical_specifications: 'Specify equipment / engine model',                   unit: 'set',  quantity: 1,  ehs_requirements: 'Follow torque specs on reassembly' },
    { description: 'Solenoid Valve',             technical_specifications: 'Specify voltage (24VDC/230VAC), port size, Cv',      unit: 'pcs',  quantity: 1,  ehs_requirements: 'De-energise and depressurise before installation' },
    { description: 'Contactor',                  technical_specifications: 'Specify voltage and current rating (e.g. 24VDC, 40A)', unit: 'pcs', quantity: 2,  ehs_requirements: 'Isolate supply before installation' },
    { description: 'Relay Module',               technical_specifications: 'Specify coil voltage and contact rating',            unit: 'pcs',  quantity: 4,  ehs_requirements: '' },
  ],

  'Electronics': [
    { description: 'Proximity Sensor (NPN)',     technical_specifications: 'M18, NPN NO, 8 mm sensing range, 10–30VDC',         unit: 'pcs',  quantity: 2,  ehs_requirements: '' },
    { description: 'Temperature Sensor PT100',   technical_specifications: '3-wire PT100 RTD, 4 mm dia, specify length',        unit: 'pcs',  quantity: 2,  ehs_requirements: '' },
    { description: 'Control Cable',              technical_specifications: 'Specify cross-section (e.g. 4×1.5 mm²), screened',   unit: 'm',    quantity: 50, ehs_requirements: 'Label both ends after installation' },
    { description: 'Power Cable 4×6 mm²',        technical_specifications: 'NYY-J 4×6 mm², 0.6/1 kV rated',                    unit: 'm',    quantity: 50, ehs_requirements: 'Check current-carrying capacity before installation' },
    { description: 'MCB Circuit Breaker',        technical_specifications: 'Specify rating (A) and curve (B/C/D), 230/400V',     unit: 'pcs',  quantity: 4,  ehs_requirements: 'Isolate supply before installation' },
    { description: 'Fuse Set (Assorted)',        technical_specifications: '5×20 mm glass fuses: 1A / 2A / 5A / 10A assorted', unit: 'set',  quantity: 2,  ehs_requirements: '' },
    { description: 'LED Panel Indicator Lamp',   technical_specifications: '22 mm, 24VDC, red/green/amber (specify colour)',     unit: 'pcs',  quantity: 6,  ehs_requirements: '' },
    { description: 'DIN Rail Terminal Block Set',technical_specifications: '4 mm² screw-type, grey + end caps + markers',       unit: 'set',  quantity: 2,  ehs_requirements: '' },
  ],

  'IT Equipment': [
    { description: 'Desktop Computer',           technical_specifications: 'Core i5 13th Gen, 16 GB RAM, 512 GB SSD, Win 11 Pro', unit: 'pcs', quantity: 1, ehs_requirements: '' },
    { description: 'Monitor 24"',                technical_specifications: 'Full HD 1920×1080, IPS panel, HDMI + VGA',            unit: 'pcs', quantity: 1, ehs_requirements: '' },
    { description: 'UPS 1000 VA',                technical_specifications: '1000 VA / 600W, line-interactive, 4× IEC outlets',    unit: 'pcs', quantity: 1, ehs_requirements: 'Keep ventilated; do not stack' },
    { description: 'Network Switch 8-Port',      technical_specifications: '8×1 Gbps unmanaged, metal housing, DIN-rail mount',   unit: 'pcs', quantity: 1, ehs_requirements: '' },
    { description: 'Laptop',                     technical_specifications: 'Core i5, 8 GB RAM, 256 GB SSD, 15.6", Win 11 Pro',    unit: 'pcs', quantity: 1, ehs_requirements: '' },
    { description: 'External Hard Drive 2 TB',   technical_specifications: 'USB 3.0, 2 TB, portable, shock-resistant casing',     unit: 'pcs', quantity: 1, ehs_requirements: '' },
    { description: 'Wireless Keyboard + Mouse Set', technical_specifications: '2.4 GHz USB dongle, Arabic/English layout',      unit: 'set', quantity: 1, ehs_requirements: '' },
    { description: 'Toner / Ink Cartridge',      technical_specifications: 'Specify printer model and cartridge reference',       unit: 'pcs', quantity: 2, ehs_requirements: 'Recycle empty cartridges via vendor' },
  ],

  'Office Supply / Furniture': [
    { description: 'A4 Copy Paper 80 gsm',       technical_specifications: 'White, 80 gsm, 500 sheets/ream, acid-free',          unit: 'ream', quantity: 10, ehs_requirements: '' },
    { description: 'Ballpoint Pens',             technical_specifications: 'Blue ink, medium tip, 0.7 mm (box of 50)',            unit: 'box',  quantity: 2,  ehs_requirements: '' },
    { description: 'Office Chair',               technical_specifications: 'Adjustable height, lumbar support, 5-star base, 120 kg rated', unit: 'pcs', quantity: 1, ehs_requirements: '' },
    { description: 'Steel Filing Cabinet 4-Drawer', technical_specifications: 'A4 lateral, steel, lockable, 132 cm H',          unit: 'pcs',  quantity: 1,  ehs_requirements: '' },
    { description: 'A4 Ring Binder Folders',     technical_specifications: '4D-ring, 70 mm, hard cover',                         unit: 'pcs',  quantity: 10, ehs_requirements: '' },
    { description: 'Whiteboard Markers (Assorted)', technical_specifications: 'Dry-erase, 4 colours (black/red/blue/green), chisel tip', unit: 'box', quantity: 2, ehs_requirements: '' },
    { description: 'Stapler + Staples',          technical_specifications: 'Heavy-duty stapler + 5000 staples (26/6)',            unit: 'set',  quantity: 2,  ehs_requirements: '' },
    { description: 'Desk Organiser Set',         technical_specifications: '5-piece acrylic desk set (pen holder, tray, etc.)',   unit: 'set',  quantity: 1,  ehs_requirements: '' },
  ],
}
