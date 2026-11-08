// Illustrated Parts Catalogue (IPC), Greater Cairo Metro Line No.1.
// Systems are IPC chapters, subsystems are figures; a figure can sit inside
// a parent figure (its "See Figure ... for Parent Assembly" line).
import { buildCylinderHead } from '../components/inventory/models/cylinderHead'

export const CATALOGUE = [
  {
    id: 'brake-pneumatic',
    chapter: 8,
    name: 'Brake and Pneumatic System',
    subsystems: [
      {
        id: 'air-compressor',
        figure: '8-3',
        name: 'Air compressor',
        children: [
          {
            id: 'cylinder-head',
            figure: '8-4',
            name: 'Cylinder head',
            parentFigure: '8-3',
            revision: '01 · May 2016',
            buildModel: buildCylinderHead,
            assembly: {
              description: 'Cylinder head',
              hrc: 'RMA210014AX0',
              partNumber: '8.121.0.181.003.7',
              supplier: 'Knorr-Bremse',
            },
            items: [
              { item: 1, description: 'Disc valve', partNumber: '8.121.0.461.007.6', qty: 1, supplier: 'Knorr-Bremse' },
              { item: 2, description: 'O-ring', partNumber: 'C160077/3', qty: 1, supplier: 'Knorr-Bremse' },
              { item: 3, description: 'O-ring', partNumber: 'C160077/9', qty: 1, supplier: 'Knorr-Bremse' },
              { item: 4, description: 'Cylinder head', partNumber: '8.121.0.181.003.4', qty: 1, supplier: 'Knorr-Bremse' },
              { item: 5, description: 'Machine screw, M6X50L', partNumber: '467560', qty: 1, supplier: 'Knorr-Bremse' },
              { item: 6, description: 'Sealing ring A6.5X9.5', partNumber: '459166', qty: 1, supplier: 'Knorr-Bremse' },
              { item: 7, description: 'Cylindrical head gasket', partNumber: '8.181.0.854.002.4', qty: 1, supplier: 'Knorr-Bremse' },
            ],
          },
        ],
      },
    ],
  },
]

// Sample stock for the trial only: the system has no stock ledger yet.
export const SAMPLE_STOCK = {
  '8.121.0.461.007.6': { onHand: 3, location: 'Rack A-12' },
  'C160077/3': { onHand: 24, location: 'Rack B-04' },
  'C160077/9': { onHand: 0, location: 'Rack B-04' },
  '8.121.0.181.003.4': { onHand: 1, location: 'Rack A-03' },
  '467560': { onHand: 140, location: 'Bin C-21' },
  '459166': { onHand: 6, location: 'Bin C-22' },
  '8.181.0.854.002.4': { onHand: 2, location: 'Rack B-09' },
}
