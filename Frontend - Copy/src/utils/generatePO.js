import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, ImageRun,
} from 'docx'
import { saveAs } from 'file-saver'

// ── Page constants (A4 landscape) ─────────────────────────────────────────
const PAGE_W    = 16838
const PAGE_H    = 11906
const MARGIN    = 720
const CONTENT_W = PAGE_W - MARGIN * 2

const BORDER     = { style: BorderStyle.SINGLE, size: 4,  color: '000000' }
const THIN       = { style: BorderStyle.SINGLE, size: 2,  color: 'CCCCCC' }
const ALL_B      = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const THIN_B     = { top: THIN,   bottom: THIN,   left: THIN,   right: THIN   }
const NO_B       = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }

const HEADER_GREY  = 'D9D9D9'
const LIGHT_GREY   = 'F2F2F2'

const fmt = (n) => (n == null || n === '' ? '-' : Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

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
  return new Paragraph({ children: Array.isArray(children) ? children : [children], alignment, spacing: { before: 0, after: 0 } })
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
export async function generatePO(po) {
  const logoBytes = await loadLogoBytes()
  const items     = po.items ?? []
  const subtotal  = items.reduce((s, it) => s + (it.total ?? 0), 0)
  const grandTotal = subtotal + (po.tax ?? 0) - (po.withholding_tax ?? 0)

  // ── Title row ────────────────────────────────────────────────────────────
  const titleRow = new TableRow({
    height: { value: 500, rule: HeightRule.EXACT },
    children: [
      // Logo cell
      cell(
        logoBytes
          ? [new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 90, height: 30 } })], spacing: { before: 0, after: 0 } })]
          : [para([bold('Rotem SRS', 18)])],
        { width: Math.round(CONTENT_W * 0.20), borders: ALL_B, shade: 'FFFFFF' }
      ),
      // Title
      cell(
        [para([bold('Purchase Order', 26)], AlignmentType.CENTER)],
        { width: Math.round(CONTENT_W * 0.50), borders: ALL_B, shade: 'FFFFFF' }
      ),
      // Arabic title
      cell(
        [para([bold('طلب شراء', 22)], AlignmentType.RIGHT)],
        { width: Math.round(CONTENT_W * 0.30), borders: ALL_B, shade: 'FFFFFF' }
      ),
    ],
  })

  // ── PO number / date / category ──────────────────────────────────────────
  const infoRow = new TableRow({
    height: { value: 380, rule: HeightRule.AT_LEAST },
    children: [
      // Address left
      cell([
        para([bold('Address:', 17)]),
        para([normal('Office 211, P5, Podium 1, CFC', 16)]),
      ], { width: Math.round(CONTENT_W * 0.40), borders: ALL_B }),
      // Labels
      cell([
        para([bold('PO', 17)]),
        para([bold('Date', 17)]),
        para([bold('CATEGORY', 17)]),
      ], { width: Math.round(CONTENT_W * 0.15), borders: ALL_B, shade: LIGHT_GREY }),
      // Values
      cell([
        para([bold(po.po_number ?? '', 17)]),
        para([normal(fmtDate(po.date), 17)]),
        para([normal(po.category ?? '', 17)]),
      ], { width: Math.round(CONTENT_W * 0.45), borders: ALL_B }),
    ],
  })

  // ── Vendor / Ship To ─────────────────────────────────────────────────────
  const vendorRow = new TableRow({
    height: { value: 500, rule: HeightRule.AT_LEAST },
    children: [
      cell([
        para([bold('Vendor :', 17)]),
        para([normal(po.vendor ?? '', 17)]),
      ], { width: Math.round(CONTENT_W * 0.40), borders: ALL_B, shade: LIGHT_GREY }),
      cell([
        para([bold('Ship To :', 17)]),
        para([bold('Rotem SRS :', 17)]),
        para([normal('Shipping Address: 250 ST-Degla', 16)]),
        para([normal('Phone no: 201060604163', 16)]),
      ], { width: Math.round(CONTENT_W * 0.60), borders: ALL_B }),
    ],
  })

  // ── Items table ──────────────────────────────────────────────────────────
  const COL_W = [
    Math.round(CONTENT_W * 0.04),   // NO
    Math.round(CONTENT_W * 0.22),   // Item Description
    Math.round(CONTENT_W * 0.08),   // Stock
    Math.round(CONTENT_W * 0.09),   // Average Con
    Math.round(CONTENT_W * 0.07),   // QTY
    Math.round(CONTENT_W * 0.06),   // Unit
    Math.round(CONTENT_W * 0.10),   // Unit Price
    Math.round(CONTENT_W * 0.14),   // Total
    Math.round(CONTENT_W * 0.20),   // Remark
  ]

  const itemHeaderRow = new TableRow({
    height: { value: 380, rule: HeightRule.EXACT },
    tableHeader: true,
    children: ['NO', 'Item Description', 'Stock', 'Average Con', 'QTY', 'Unit', 'Unit Price', 'Total', 'Remark']
      .map((h, i) => cell([para([bold(h, 16)], AlignmentType.CENTER)], { width: COL_W[i], borders: ALL_B, shade: HEADER_GREY })),
  })

  const itemRows = items.map((it, idx) =>
    new TableRow({
      height: { value: 350, rule: HeightRule.AT_LEAST },
      children: [
        cell([para([normal(String(it.no ?? idx + 1), 16)], AlignmentType.CENTER)], { width: COL_W[0], borders: ALL_B }),
        cell([para([normal(it.item_description ?? '', 16)])],                       { width: COL_W[1], borders: ALL_B }),
        cell([para([normal(it.stock ?? '', 16)], AlignmentType.CENTER)],            { width: COL_W[2], borders: ALL_B }),
        cell([para([normal(it.average_con ?? '', 16)], AlignmentType.CENTER)],      { width: COL_W[3], borders: ALL_B }),
        cell([para([normal(String(it.qty ?? ''), 16)], AlignmentType.CENTER)],      { width: COL_W[4], borders: ALL_B }),
        cell([para([normal(it.unit ?? '', 16)], AlignmentType.CENTER)],             { width: COL_W[5], borders: ALL_B }),
        cell([para([normal(`EGP  ${fmt(it.unit_price)}`, 16)], AlignmentType.RIGHT)],{ width: COL_W[6], borders: ALL_B }),
        cell([para([normal(`EGP  ${fmt(it.total)}`, 16)], AlignmentType.RIGHT)],    { width: COL_W[7], borders: ALL_B }),
        cell([para([normal(it.remark ?? '', 16)])],                                  { width: COL_W[8], borders: ALL_B }),
      ],
    })
  )

  // ── Totals section ───────────────────────────────────────────────────────
  const totalsRows = [
    ['TAX',             fmt(po.tax)],
    ['Withholding tax', fmt(po.withholding_tax)],
    ['TOTAL',           `EGP  ${fmt(grandTotal)}`],
  ].map(([label, value]) =>
    new TableRow({
      height: { value: 340, rule: HeightRule.EXACT },
      children: [
        cell([para([normal('')])], { width: COL_W[0] + COL_W[1] + COL_W[2] + COL_W[3] + COL_W[4] + COL_W[5], borders: ALL_B, colSpan: 6 }),
        cell([para([bold(label, 16)])], { width: COL_W[6], borders: ALL_B, shade: LIGHT_GREY }),
        cell([para([bold('EGP', 16)])], { width: Math.round(COL_W[7] * 0.3), borders: ALL_B }),
        cell([para([bold(value, 16)], AlignmentType.RIGHT)], { width: Math.round(COL_W[7] * 0.7) + COL_W[8], borders: ALL_B, colSpan: 2 }),
      ],
    })
  )

  // ── Delivery terms row ───────────────────────────────────────────────────
  const deliveryRow = new TableRow({
    height: { value: 600, rule: HeightRule.AT_LEAST },
    children: [
      cell([
        para([bold('Delivery terms:', 16)]),
        para([normal(`Delivery period : ${po.delivery_period ?? 'Week'}`, 16)]),
        para([normal(`Payment Terms : ${po.payment_terms ?? '100% After Received'}`, 16)]),
        para([normal(`Receipt location : ${po.receipt_location ?? 'Company Warehouse'}`, 16)]),
      ], { width: Math.round(CONTENT_W * 0.45), borders: ALL_B }),
      cell([para([bold('Comments or Special Instructions', 16)])], { width: Math.round(CONTENT_W * 0.10), borders: ALL_B, shade: LIGHT_GREY }),
      cell([para([normal(po.comments ?? 'Banking Transfer', 16)])], { width: Math.round(CONTENT_W * 0.45), borders: ALL_B }),
    ],
  })

  // ── Signatures row ───────────────────────────────────────────────────────
  const sigLabels  = ['Requester', 'Procurement', 'Logistics Manager /', 'Depot Manager', 'MD']
  const sigValues  = [
    po.prf?.requester?.name ?? '',
    po.creator?.name ?? '',
    '',
    '',
    '',
  ]
  const sigColW = Math.round(CONTENT_W / 5)

  const sigLabelRow = new TableRow({
    height: { value: 380, rule: HeightRule.EXACT },
    children: sigLabels.map((l, i) =>
      cell([para([bold(l, 16)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B, shade: HEADER_GREY })
    ),
  })

  const sigNameRow = new TableRow({
    height: { value: 380, rule: HeightRule.AT_LEAST },
    children: sigValues.map((v, i) =>
      cell([para([normal(v, 15)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B })
    ),
  })

  const prf_number = po.prf?.prf_number ?? ''
  const year       = po.date ? new Date(po.date).getFullYear() : new Date().getFullYear()

  const sigDateRow = new TableRow({
    height: { value: 380, rule: HeightRule.EXACT },
    children: [
      cell([para([normal(`PRF (${prf_number})`, 15)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B }),
      cell([para([normal(`/${year}`, 15)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B }),
      cell([para([normal(`/${year}`, 15)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B }),
      cell([para([normal(`/${year}`, 15)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B }),
      cell([para([normal(`/${year}`, 15)], AlignmentType.CENTER)], { width: sigColW, borders: ALL_B }),
    ],
  })

  // ── Assemble main table ──────────────────────────────────────────────────
  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      titleRow,
      infoRow,
      vendorRow,
      itemHeaderRow,
      ...itemRows,
      ...totalsRows,
      deliveryRow,
      sigLabelRow,
      sigNameRow,
      sigDateRow,
    ],
  })

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      children: [mainTable],
    }],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${po.po_number ?? 'PO'}.docx`)
}
