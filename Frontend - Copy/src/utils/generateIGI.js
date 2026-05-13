import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, ImageRun, PageBreak,
} from 'docx'
import { saveAs } from 'file-saver'

// ── Page constants (A4 portrait) ──────────────────────────────────────────
const PAGE_W    = 11906
const PAGE_H    = 16838
const MARGIN    = 720
const CONTENT_W = PAGE_W - MARGIN * 2

const BORDER    = { style: BorderStyle.SINGLE, size: 4,  color: '000000' }
const THIN      = { style: BorderStyle.SINGLE, size: 2,  color: 'CCCCCC' }
const ALL_B     = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_B      = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

const HEADER_GREY = 'D9D9D9'
const LIGHT_GREY  = 'F2F2F2'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

const yesNo = (v) => {
  if (v === true  || v === 1) return 'Y'
  if (v === false || v === 0) return 'N'
  return ''
}

async function loadLogoBytes() {
  try {
    const res = await fetch('/asset-return-logo.png')
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch { return null }
}

function bold(text, size = 18, color = '000000') {
  return new TextRun({ text: String(text ?? ''), bold: true, size, color, font: 'Calibri' })
}
function normal(text, size = 17, color = '000000') {
  return new TextRun({ text: String(text ?? ''), size, color, font: 'Calibri' })
}
function para(children, alignment = AlignmentType.LEFT) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment,
    spacing: { before: 0, after: 0 },
  })
}

function cell(children, opts = {}) {
  const { width, shade, borders = ALL_B, vAlign = VerticalAlign.CENTER, colSpan, rowSpan } = opts
  return new TableCell({
    children: Array.isArray(children) ? children : [para(children, opts.align ?? AlignmentType.LEFT)],
    borders,
    verticalAlign: vAlign,
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    columnSpan: colSpan,
    rowSpan,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  })
}

// ── Main export ────────────────────────────────────────────────────────────
export async function generateIGI(igi) {
  const logoBytes = await loadLogoBytes()
  const items     = igi.items ?? []
  const po        = igi.po  ?? {}
  const prf       = po.prf  ?? {}

  // ── Document header row (logo + title + doc info) ────────────────────────
  const headerRow = new TableRow({
    height: { value: 550, rule: HeightRule.EXACT },
    children: [
      cell(
        logoBytes
          ? [new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 90, height: 30 } })], spacing: { before: 0, after: 0 } })]
          : [para([bold('Rotem SRS', 18)])],
        { width: Math.round(CONTENT_W * 0.20), borders: ALL_B, shade: 'FFFFFF' }
      ),
      cell(
        [para([bold('INCOMING GOODS INSPECTION', 22)], AlignmentType.CENTER)],
        { width: Math.round(CONTENT_W * 0.50), borders: ALL_B, shade: 'FFFFFF' }
      ),
      cell([
        para([bold('Doc No: ', 15), normal('SRS-PRC-P01-F06', 15)]),
        para([bold('Rev.:  ', 15),  normal('05', 15)]),
        para([bold('Rev. Date: ', 15), normal('16/12/2025', 15)]),
      ], { width: Math.round(CONTENT_W * 0.30), borders: ALL_B, shade: LIGHT_GREY }),
    ],
  })

  // ── IGI info row (tracking no, date, supplier, PR, PO, PO date) ─────────
  const COL_LABEL = Math.round(CONTENT_W * 0.14)
  const COL_VAL   = Math.round(CONTENT_W * 0.19)

  const infoRow = new TableRow({
    height: { value: 420, rule: HeightRule.AT_LEAST },
    children: [
      // Labels column 1
      cell([
        para([bold('IGI Tracking no', 15)]),
        para([bold('IGI Date', 15)]),
      ], { width: COL_LABEL, borders: ALL_B, shade: LIGHT_GREY }),
      // Values column 1
      cell([
        para([bold(igi.igi_number ?? '', 15)]),
        para([normal(fmtDate(igi.date), 15)]),
      ], { width: COL_VAL, borders: ALL_B }),
      // Labels column 2
      cell([
        para([bold('Supplier Name', 15)]),
        para([bold('Delivery Note No', 15)]),
      ], { width: COL_LABEL, borders: ALL_B, shade: LIGHT_GREY }),
      // Values column 2
      cell([
        para([normal(igi.supplier_name ?? '', 15)]),
        para([normal(igi.delivery_note_no ?? '', 15)]),
      ], { width: COL_VAL, borders: ALL_B }),
      // Labels column 3
      cell([
        para([bold('PR Number', 15)]),
        para([bold('PO Number', 15)]),
        para([bold('PO Date', 15)]),
      ], { width: COL_LABEL, borders: ALL_B, shade: LIGHT_GREY }),
      // Values column 3
      cell([
        para([normal(prf.prf_number ?? '', 15)]),
        para([normal(po.po_number   ?? '', 15)]),
        para([normal(fmtDate(po.date), 15)]),
      ], { width: CONTENT_W - COL_LABEL * 3 - COL_VAL * 2, borders: ALL_B }),
    ],
  })

  // ── Items header row ──────────────────────────────────────────────────────
  const ITEM_COLS = [
    Math.round(CONTENT_W * 0.05),   // Item#
    Math.round(CONTENT_W * 0.22),   // Description
    Math.round(CONTENT_W * 0.09),   // System
    Math.round(CONTENT_W * 0.12),   // Batch No
    Math.round(CONTENT_W * 0.09),   // Qty Received
    Math.round(CONTENT_W * 0.07),   // Shelf Life
    Math.round(CONTENT_W * 0.09),   // PO Compliant
    Math.round(CONTENT_W * 0.09),   // Tech Compliant
    Math.round(CONTENT_W * 0.09),   // EHS Compliant
    Math.round(CONTENT_W * 0.09),   // Remarks
  ]

  const ITEM_HEADERS = [
    'Item#',
    'Description of Goods RECEIVED',
    'System',
    'Batch No. / Heat No.',
    'ACTUAL Qty RECEIVED',
    'Shelf Life (Years)',
    'Compliant with PO?\nY / N',
    'Compliant with Technical Req?\nY / N',
    'Compliant with EHS req?\nY / N',
    'Remarks',
  ]

  const itemHeaderRow = new TableRow({
    height: { value: 600, rule: HeightRule.EXACT },
    tableHeader: true,
    children: ITEM_HEADERS.map((h, i) =>
      cell(
        [para([bold(h, 14)], AlignmentType.CENTER)],
        { width: ITEM_COLS[i], borders: ALL_B, shade: HEADER_GREY }
      )
    ),
  })

  const itemRows = items.map((it) =>
    new TableRow({
      height: { value: 380, rule: HeightRule.AT_LEAST },
      children: [
        cell([para([normal(String(it.no ?? ''), 14)], AlignmentType.CENTER)],           { width: ITEM_COLS[0], borders: ALL_B }),
        cell([para([normal(it.description ?? '', 14)])],                                  { width: ITEM_COLS[1], borders: ALL_B }),
        cell([para([normal(it.system ?? '', 14)], AlignmentType.CENTER)],               { width: ITEM_COLS[2], borders: ALL_B }),
        cell([para([normal(it.batch_no ?? '', 14)], AlignmentType.CENTER)],             { width: ITEM_COLS[3], borders: ALL_B }),
        cell([para([normal(String(it.qty_received ?? ''), 14)], AlignmentType.CENTER)], { width: ITEM_COLS[4], borders: ALL_B }),
        cell([para([normal(String(it.shelf_life ?? ''), 14)], AlignmentType.CENTER)],   { width: ITEM_COLS[5], borders: ALL_B }),
        cell([para([bold(yesNo(it.compliant_po), 14)], AlignmentType.CENTER)],           { width: ITEM_COLS[6], borders: ALL_B }),
        cell([para([bold(yesNo(it.compliant_technical), 14)], AlignmentType.CENTER)],   { width: ITEM_COLS[7], borders: ALL_B }),
        cell([para([bold(yesNo(it.compliant_ehs), 14)], AlignmentType.CENTER)],         { width: ITEM_COLS[8], borders: ALL_B }),
        cell([para([normal(it.remarks ?? '', 14)])],                                      { width: ITEM_COLS[9], borders: ALL_B }),
      ],
    })
  )

  // ── Photos row ────────────────────────────────────────────────────────────
  const photoImages = await Promise.all(
    (igi.photos ?? []).slice(0, 8).map(async (dataUrl) => {
      try {
        // dataUrl = "data:image/png;base64,..."
        const base64 = dataUrl.split(',')[1]
        if (!base64) return null
        const ext = (dataUrl.match(/data:image\/(\w+);/) ?? [])[1] ?? 'png'
        const type = ext === 'jpg' ? 'jpeg' : ext
        return { data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)), type }
      } catch { return null }
    })
  )

  const photoChildren = [para([bold('Photos of Goods Received:', 15)])]
  const validPhotos = photoImages.filter(Boolean)
  if (validPhotos.length) {
    // Two photos per paragraph row
    for (let i = 0; i < validPhotos.length; i += 2) {
      const runs = []
      for (let j = i; j < Math.min(i + 2, validPhotos.length); j++) {
        runs.push(new ImageRun({
          data: validPhotos[j].data,
          type: validPhotos[j].type,
          transformation: { width: 200, height: 150 },
        }))
        if (j + 1 < Math.min(i + 2, validPhotos.length)) {
          runs.push(new TextRun({ text: '   ' }))
        }
      }
      photoChildren.push(new Paragraph({ children: runs, spacing: { before: 60, after: 60 } }))
    }
  }
  if (igi.photos_notes) {
    photoChildren.push(para([normal(igi.photos_notes, 14)]))
  }

  const photosRow = new TableRow({
    height: { value: 1200, rule: HeightRule.AT_LEAST },
    children: [
      cell(photoChildren, { width: CONTENT_W, borders: ALL_B, colSpan: ITEM_HEADERS.length }),
    ],
  })

  // ── Signature rows (page 1: Requester, INV, EHS) ─────────────────────────
  const SIG_W = Math.round(CONTENT_W / 3)

  const sig1LabelRow = new TableRow({
    height: { value: 380, rule: HeightRule.EXACT },
    children: [
      cell([para([bold('Requester', 15)], AlignmentType.CENTER)],        { width: SIG_W, borders: ALL_B, shade: HEADER_GREY }),
      cell([para([bold('Inventory (INV)', 15)], AlignmentType.CENTER)],  { width: SIG_W, borders: ALL_B, shade: HEADER_GREY }),
      cell([para([bold('EHS', 15)], AlignmentType.CENTER)],              { width: SIG_W, borders: ALL_B, shade: HEADER_GREY }),
    ],
  })

  const requesterName = prf.requester?.name ?? ''
  const sig1NameRow = new TableRow({
    height: { value: 500, rule: HeightRule.AT_LEAST },
    children: [
      cell([para([normal(requesterName, 14)], AlignmentType.CENTER)], { width: SIG_W, borders: ALL_B }),
      cell([para([normal('', 14)])],                                    { width: SIG_W, borders: ALL_B }),
      cell([para([normal('', 14)])],                                    { width: SIG_W, borders: ALL_B }),
    ],
  })

  const year = igi.date ? new Date(igi.date).getFullYear() : new Date().getFullYear()
  const sig1DateRow = new TableRow({
    height: { value: 340, rule: HeightRule.EXACT },
    children: [
      cell([para([normal(`/${year}`, 14)], AlignmentType.CENTER)], { width: SIG_W, borders: ALL_B }),
      cell([para([normal(`/${year}`, 14)], AlignmentType.CENTER)], { width: SIG_W, borders: ALL_B }),
      cell([para([normal(`/${year}`, 14)], AlignmentType.CENTER)], { width: SIG_W, borders: ALL_B }),
    ],
  })

  // ── Main table (page 1) ──────────────────────────────────────────────────
  const page1Table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      headerRow,
      infoRow,
      itemHeaderRow,
      ...itemRows,
      photosRow,
      sig1LabelRow,
      sig1NameRow,
      sig1DateRow,
    ],
  })

  // ── Page 2: Signature table (QC, Procurement, Management) ────────────────
  const SIG2_W = Math.round(CONTENT_W / 3)

  const sig2HeaderRow = new TableRow({
    height: { value: 500, rule: HeightRule.EXACT },
    children: [
      cell([para([bold('INCOMING GOODS INSPECTION', 18)], AlignmentType.CENTER)],
        { width: CONTENT_W, borders: ALL_B, shade: LIGHT_GREY, colSpan: 3 }),
    ],
  })

  const sig2InfoRow = new TableRow({
    height: { value: 380, rule: HeightRule.EXACT },
    children: [
      cell([para([bold('IGI No: ', 15), normal(igi.igi_number ?? '', 15)])],
        { width: Math.round(CONTENT_W * 0.40), borders: ALL_B }),
      cell([para([bold('Date: ', 15), normal(fmtDate(igi.date), 15)])],
        { width: Math.round(CONTENT_W * 0.30), borders: ALL_B }),
      cell([para([bold('Doc: ', 14), normal('SRS-PRC-P01-F06', 14)])],
        { width: CONTENT_W - Math.round(CONTENT_W * 0.40) - Math.round(CONTENT_W * 0.30), borders: ALL_B }),
    ],
  })

  const sig2LabelRow = new TableRow({
    height: { value: 380, rule: HeightRule.EXACT },
    children: [
      cell([para([bold('Quality Control', 15)], AlignmentType.CENTER)],        { width: SIG2_W, borders: ALL_B, shade: HEADER_GREY }),
      cell([para([bold('Procurement (Purchasing)', 15)], AlignmentType.CENTER)],{ width: SIG2_W, borders: ALL_B, shade: HEADER_GREY }),
      cell([para([bold('Management (D.M)', 15)], AlignmentType.CENTER)],       { width: SIG2_W, borders: ALL_B, shade: HEADER_GREY }),
    ],
  })

  const procName = igi.creator?.name ?? ''
  const sig2NameRow = new TableRow({
    height: { value: 1200, rule: HeightRule.AT_LEAST },
    children: [
      cell([para([normal('', 14)])],         { width: SIG2_W, borders: ALL_B }),
      cell([para([normal(procName, 14)])],   { width: SIG2_W, borders: ALL_B }),
      cell([para([normal('', 14)])],         { width: SIG2_W, borders: ALL_B }),
    ],
  })

  const sig2DateRow = new TableRow({
    height: { value: 340, rule: HeightRule.EXACT },
    children: [
      cell([para([normal(`/${year}`, 14)], AlignmentType.CENTER)], { width: SIG2_W, borders: ALL_B }),
      cell([para([normal(`/${year}`, 14)], AlignmentType.CENTER)], { width: SIG2_W, borders: ALL_B }),
      cell([para([normal(`/${year}`, 14)], AlignmentType.CENTER)], { width: SIG2_W, borders: ALL_B }),
    ],
  })

  const page2Table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [sig2HeaderRow, sig2InfoRow, sig2LabelRow, sig2NameRow, sig2DateRow],
  })

  // ── Assemble document ────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          page1Table,
          new Paragraph({
            children: [new PageBreak()],
            spacing: { before: 0, after: 0 },
          }),
          page2Table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${igi.igi_number ?? 'IGI'}.docx`)
}
