import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
  TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { saveAs } from 'file-saver'

// ── Page geometry ────────────────────────────────────────────────────────────
// SRS-INV-P01-F06 is an A4 LANDSCAPE form. Every width below is measured off
// the source document and kept in DXA so the generated file lands on the same
// grid as the original, cell for cell.
// docx swaps the pair when orientation is landscape, so these stay in A4
// portrait order and Word receives 16838 x 11906.
const A4_W = 11906
const A4_H = 16838
const MARGIN = 810
const PAGE_W = A4_H
const CONTENT_W = PAGE_W - MARGIN * 2   // 15218

const CREAM = 'FFF2CC'   // header band: PRN / Date / Type / Status / Reason
const MINT  = 'E2EFDA'   // green bands: Trainset, items header, signatures

const black = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const grey  = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' }
const borders = { top: black, bottom: black, left: black, right: black }
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
// The letterhead band is open on three sides — only the rule under it prints.
const headLeftBorders  = { top: none, left: none, bottom: grey, right: grey }
const headRightBorders = { top: none, left: none, bottom: grey, right: none }

// Column grids — each array sums to CONTENT_W.
const HEAD_COLS  = [3012, 12206]
const META_COLS  = [1763, 1427, 693, 991, 693, 1010, 872, 892, 634, 1922, 4321]
const ASSET_COLS = [4042, 3705, 4082, 3389]
const ITEM_COLS  = [654, 1229, 1902, 1070, 1585, 1466, 1506, 1783, 1803, 2220]
const SIGN_COLS  = [2794, 3051, 1942, 3012, 2378, 2041]

// Row heights, measured off the source form.
const H_HEADER    = 537
const H_META_HEAD = 373
const H_META_BODY = 328
const H_ASSET     = 328
const H_ITEM_HEAD = 418
const H_ITEM_BODY = 418
const H_SIGN      = 552

/** Paper form prints nine item rows whether or not they are all used. */
const MIN_ITEM_ROWS = 9

const p = (text = '', options = {}) => new Paragraph({
  alignment: options.alignment ?? AlignmentType.CENTER,
  spacing: { before: 0, after: 0, ...(options.line ? { line: options.line } : {}) },
  bidirectional: Boolean(options.rtl),
  children: [new TextRun({
    text: String(text ?? ''),
    font: options.font ?? 'Calibri',
    size: options.size ?? 18,
    bold: options.bold ?? false,
    color: options.color ?? '000000',
    rightToLeft: Boolean(options.rtl),
  })],
})

/** English label above its Arabic translation — the items header style. */
const bilingual = (english, arabic) => [
  p(english, { bold: true, size: 18, line: 200 }),
  p(arabic, { bold: true, size: 16, rtl: true, line: 200 }),
]

const cell = (children, options = {}) => new TableCell({
  width: { size: options.width ?? 0, type: WidthType.DXA },
  columnSpan: options.columnSpan,
  verticalAlign: VerticalAlign.CENTER,
  shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
  borders: options.borders ?? borders,
  margins: { top: 20, bottom: 20, left: 60, right: 60 },
  children: Array.isArray(children) ? children : [children],
})

const row = (cells, height) => new TableRow({
  height: height ? { value: height, rule: 'atLeast' } : undefined,
  children: cells,
})

const table = (columnWidths, rows) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths,
  layout: TableLayoutType.FIXED,
  rows,
})

// Calibri has neither ☐ nor ☒; Segoe UI Symbol draws both, so the ticked box
// stays distinguishable from the empty one.
const checkbox = value => p(value ? '☒' : '☐', { font: 'Segoe UI Symbol', size: 20 })
const num = value => (value === null || value === undefined || value === '' ? '' : String(value))
const day = value => (value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB')
  : '    /    /    ')

async function bytesFromUrl(url) {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

/** "Sign.:" plus the signatory's stored e-signature when one exists. */
function signatureCell(signatureBytes, width) {
  const children = [p('Sign.:', { alignment: AlignmentType.LEFT, size: 17 })]
  if (signatureBytes) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({
        data: signatureBytes, type: 'png', transformation: { width: 84, height: 26 },
      })],
    }))
  }
  return cell(children, { width })
}

export async function generateReleaseNote(note) {
  const items = Array.isArray(note?.items) ? note.items : []
  const requester = note?.requested_by ?? note?.requestedBy ?? null
  const specialist = note?.inventory_specialist ?? note?.inventorySpecialist ?? null

  const [logo, requesterSign, specialistSign] = await Promise.all([
    bytesFromUrl('/logo.png'),
    bytesFromUrl(requester?.e_signature),
    bytesFromUrl(specialist?.e_signature),
  ])

  // ── Page header: logo | "Release Note" ─────────────────────────────────────
  const header = new Header({ children: [table(HEAD_COLS, [row([
    cell(logo
      ? new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 104, height: 36 } })],
      })
      : p('Rotem SRS', { bold: true }), { width: HEAD_COLS[0], borders: headLeftBorders }),
    cell(p('Release Note', { bold: true, size: 26, color: '595959' }),
      { width: HEAD_COLS[1], borders: headRightBorders }),
  ], H_HEADER)])] })

  // ── Band 1: PRN / Date / Type / Status / Reason ────────────────────────────
  const metaTable = table(META_COLS, [
    row([
      cell(p('PRN Number', { bold: true }), { width: META_COLS[0], fill: CREAM }),
      cell(p('Date', { bold: true }), { width: META_COLS[1], fill: CREAM }),
      cell(p('Type', { bold: true }), { width: 3387, columnSpan: 4, fill: CREAM }),
      cell(p('Status', { bold: true }), { width: 4320, columnSpan: 4, fill: CREAM }),
      cell(p("Reason of over plan if it's not in plan", { bold: true }), { width: META_COLS[10], fill: CREAM }),
    ], H_META_HEAD),
    row([
      cell(p(note?.prn_number ?? ''), { width: META_COLS[0] }),
      cell(p(day(note?.date)), { width: META_COLS[1] }),
      cell(checkbox(note?.type === 'pm'), { width: META_COLS[2] }),
      cell(p('PM'), { width: META_COLS[3] }),
      cell(checkbox(note?.type === 'cm'), { width: META_COLS[4] }),
      cell(p('CM'), { width: META_COLS[5] }),
      cell(checkbox(note?.plan_status === 'plan'), { width: META_COLS[6] }),
      cell(p('Plan'), { width: META_COLS[7] }),
      cell(checkbox(note?.plan_status === 'over_plan'), { width: META_COLS[8] }),
      cell(p('Over Plan'), { width: META_COLS[9] }),
      cell(p(note?.over_plan_reason ?? ''), { width: META_COLS[10] }),
    ], H_META_BODY),
  ])

  // ── Band 2: Trainset / Work Order ──────────────────────────────────────────
  const assetTable = table(ASSET_COLS, [
    row([
      cell(p('Trainset/Asset Name', { bold: true, alignment: AlignmentType.LEFT }), { width: ASSET_COLS[0], fill: MINT }),
      cell(p('رقم القطار/ الاصول', { bold: true, alignment: AlignmentType.RIGHT, rtl: true }), { width: ASSET_COLS[1], fill: MINT }),
      cell(p('Work Order if any', { bold: true, alignment: AlignmentType.LEFT }), { width: ASSET_COLS[2], fill: MINT }),
      cell(p('أمر تشغيل', { bold: true, alignment: AlignmentType.RIGHT, rtl: true }), { width: ASSET_COLS[3], fill: MINT }),
    ], H_ASSET),
    row([
      cell(p(note?.trainset_asset_name ?? ''), { width: ASSET_COLS[0] + ASSET_COLS[1], columnSpan: 2 }),
      cell(p(note?.work_order ?? ''), { width: ASSET_COLS[2] + ASSET_COLS[3], columnSpan: 2 }),
    ], H_ASSET),
  ])

  // ── Band 3: the items grid ─────────────────────────────────────────────────
  const itemHeader = row([
    cell(p('NO.', { bold: true }), { width: ITEM_COLS[0], fill: MINT }),
    cell(p('Code', { bold: true }), { width: ITEM_COLS[1], fill: MINT }),
    cell(bilingual('Item name /', 'اسم البند'), { width: ITEM_COLS[2], fill: MINT }),
    cell(bilingual('Unit', 'وحده'), { width: ITEM_COLS[3], fill: MINT }),
    cell(bilingual('Qty. released', 'كميه مصروفة'), { width: ITEM_COLS[4], fill: MINT }),
    cell(bilingual('Qty Returned', 'مرتجع'), { width: ITEM_COLS[5], fill: MINT }),
    cell(bilingual('Actual Qty', 'الكمية الفعلية'), { width: ITEM_COLS[6], fill: MINT }),
    cell(bilingual('Check Type', 'نوع الزيارة'), { width: ITEM_COLS[7], fill: MINT }),
    cell(bilingual('Receiver name', 'اسم المستلم'), { width: ITEM_COLS[8], fill: MINT }),
    cell(bilingual('Title', 'الوظيفة'), { width: ITEM_COLS[9], fill: MINT }),
  ], H_ITEM_HEAD)

  const printedRows = Math.max(items.length, MIN_ITEM_ROWS)
  const itemRows = Array.from({ length: printedRows }, (_, index) => {
    const item = items[index]
    const values = item ? [
      String(item.no ?? index + 1), item.code ?? '', item.item_name ?? '', item.unit ?? '',
      num(item.qty_released), num(item.qty_returned), num(item.actual_qty),
      item.check_type ?? '',
      item.receiver_name ?? item.receiver?.name ?? '',
      item.receiver_title ?? item.receiver?.position ?? '',
    ] : ['', '', '', '', '', '', '', '', '', '']

    return row(values.map((value, column) => cell(
      p(value, { size: 22, alignment: column === 2 ? AlignmentType.LEFT : AlignmentType.CENTER }),
      { width: ITEM_COLS[column] },
    )), H_ITEM_BODY)
  })

  const itemsTable = table(ITEM_COLS, [itemHeader, ...itemRows])

  // ── Band 4: signatures ─────────────────────────────────────────────────────
  const signatureRow = (label, person, name, title, date, signatureBytes) => row([
    cell(p(label, { bold: true, alignment: AlignmentType.LEFT }), { width: SIGN_COLS[0], fill: MINT }),
    cell(p(name ?? person?.name ?? ''), { width: SIGN_COLS[1] }),
    cell(p('Title', { bold: true, alignment: AlignmentType.LEFT }), { width: SIGN_COLS[2], fill: MINT }),
    cell(p(title ?? person?.position ?? ''), { width: SIGN_COLS[3] }),
    signatureCell(signatureBytes, SIGN_COLS[4]),
    cell(p(`Date:  ${day(date)}`, { alignment: AlignmentType.LEFT, size: 17 }), { width: SIGN_COLS[5] }),
  ], H_SIGN)

  const signTable = table(SIGN_COLS, [
    signatureRow('Upon Request of Eng', requester, note?.requested_by_name, note?.requested_by_title,
      note?.requested_by_date, requesterSign),
    signatureRow('Inventory Responsibility', specialist, note?.inventory_specialist_name,
      note?.inventory_specialist_title, note?.inventory_specialist_date, specialistSign),
  ])

  // ── Page footer ────────────────────────────────────────────────────────────
  const footer = new Footer({ children: [new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: '7F7F7F' } },
    tabStops: [{ type: 'right', position: CONTENT_W }],
    spacing: { before: 80, after: 0 },
    children: [
      new TextRun({ text: 'Document No: ', font: 'Calibri', size: 14, color: '666666', bold: true }),
      new TextRun({ text: 'SRS-INV-P01-F06', font: 'Calibri', size: 14, color: 'FF0000', bold: true }),
      new TextRun({ text: '| ', font: 'Calibri', size: 14, color: '666666', bold: true }),
      new TextRun({ text: 'Rev.:03', font: 'Calibri', size: 14, color: 'FF0000', bold: true }),
      new TextRun({ text: ' | Rev. Date: 06/05/2026\t| Page ', font: 'Calibri', size: 14, color: '666666', bold: true }),
      new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 14, color: '666666', bold: true }),
      new TextRun({ text: ' of ', font: 'Calibri', size: 14, color: '666666', bold: true }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 14, color: '666666', bold: true }),
    ],
  })] })

  const gap = () => new Paragraph({ spacing: { before: 0, after: 0, line: 160 }, children: [] })

  const doc = new Document({ sections: [{
    properties: {
      page: {
        size: { width: A4_W, height: A4_H, orientation: 'landscape' },
        margin: { top: 1180, right: MARGIN, bottom: 720, left: MARGIN, header: 340, footer: 300 },
      },
    },
    headers: { default: header },
    footers: { default: footer },
    children: [metaTable, assetTable, gap(), itemsTable, gap(), signTable],
  }] })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${note?.prn_number || 'Release-Note'}.docx`)
}

export default generateReleaseNote
