import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const HEADER_GREY = 'FFD9D9D9'
const LIGHT_GREY  = 'FFF2F2F2'
const WHITE       = 'FFFFFFFF'

const BORDER_MED = { style: 'medium', color: { argb: 'FF000000' } }
const BORDER_THIN = { style: 'thin',  color: { argb: 'FF000000' } }
const ALL_MED  = { top: BORDER_MED,  bottom: BORDER_MED,  left: BORDER_MED,  right: BORDER_MED  }
const ALL_THIN = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }

const center  = { horizontal: 'center',  vertical: 'middle', wrapText: true }
const left    = { horizontal: 'left',    vertical: 'middle', wrapText: true }
const right   = { horizontal: 'right',   vertical: 'middle', wrapText: true }

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const boldFont   = (size = 11) => ({ name: 'Calibri', bold: true,  size })
const normalFont = (size = 10) => ({ name: 'Calibri', bold: false, size })

const fmt = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

function applyBorder(ws, startRow, startCol, endRow, endCol, borderStyle = ALL_THIN) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c)
      const top    = r === startRow ? BORDER_MED  : BORDER_THIN
      const bottom = r === endRow   ? BORDER_MED  : BORDER_THIN
      const left_  = c === startCol ? BORDER_MED  : BORDER_THIN
      const right_ = c === endCol   ? BORDER_MED  : BORDER_THIN
      cell.border = { top, bottom, left: left_, right: right_ }
    }
  }
}

// col indices: A=1 … I=9
// Columns: NO(1) | Description(2) | Stock(3) | AvgCon(4) | QTY(5) | Unit(6) | UnitPrice(7) | Total(8) | Remark(9)
const COLS = [4, 22, 8, 9, 7, 6, 10, 10, 12]  // widths in chars

export async function generatePO_Excel(po) {
  const wb  = new ExcelJS.Workbook()
  wb.creator = 'Rotem SRS'

  const ws = wb.addWorksheet('Purchase Order', {
    pageSetup: {
      paperSize: 9,            // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  })

  // Column widths
  ws.columns = COLS.map(w => ({ width: w }))

  const items     = po.items ?? []
  const subtotal  = items.reduce((s, it) => s + (it.total ?? 0), 0)
  const grandTotal = subtotal + (po.tax ?? 0) - (po.withholding_tax ?? 0)

  let row = 1

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws.mergeCells(row, 1, row, 2)   // Logo / company name
  ws.mergeCells(row, 3, row, 6)   // Title
  ws.mergeCells(row, 7, row, 9)   // Arabic

  const c11 = ws.getCell(row, 1)
  c11.value = 'Rotem SRS'
  c11.font      = boldFont(14)
  c11.alignment = center
  c11.fill      = fill(WHITE)
  c11.border    = ALL_MED

  const c13 = ws.getCell(row, 3)
  c13.value = 'Purchase Order'
  c13.font      = boldFont(18)
  c13.alignment = center
  c13.fill      = fill(WHITE)
  c13.border    = ALL_MED

  const c17 = ws.getCell(row, 7)
  c17.value = 'طلب شراء'
  c17.font      = boldFont(14)
  c17.alignment = { ...center, readingOrder: 2 }
  c17.fill      = fill(WHITE)
  c17.border    = ALL_MED

  ws.getRow(row).height = 36
  row++

  // ── Row 2: PO / Date / Category ──────────────────────────────────────────
  ws.mergeCells(row, 1, row, 4)   // Address
  ws.mergeCells(row, 5, row, 6)   // Labels col
  ws.mergeCells(row, 7, row, 9)   // Values col — we'll do 3 sub-rows via manual approach

  // Actually do 3 rows for this section
  // row 2: Address | PO label | PO value
  // row 3: (cont)  | Date label | Date value
  // row 4: (cont)  | Category label | Category value
  ws.unMergeCells(row, 1, row, 4)
  ws.unMergeCells(row, 5, row, 6)
  ws.unMergeCells(row, 7, row, 9)

  // address block spans 3 rows
  ws.mergeCells(row, 1, row + 2, 4)
  const addr = ws.getCell(row, 1)
  addr.value = 'Address:\nOffice 211, P5, Podium 1, CFC'
  addr.font      = normalFont(10)
  addr.alignment = { ...left, wrapText: true }
  addr.fill      = fill(WHITE)

  const infoLabels = ['PO', 'Date', 'CATEGORY']
  const infoValues = [po.po_number ?? '', fmtDate(po.date), po.category ?? '']

  for (let i = 0; i < 3; i++) {
    ws.mergeCells(row + i, 5, row + i, 6)
    ws.mergeCells(row + i, 7, row + i, 9)

    const lbl = ws.getCell(row + i, 5)
    lbl.value     = infoLabels[i]
    lbl.font      = boldFont(10)
    lbl.alignment = left
    lbl.fill      = fill(LIGHT_GREY)

    const val = ws.getCell(row + i, 7)
    val.value     = infoValues[i]
    val.font      = normalFont(10)
    val.alignment = left
    val.fill      = fill(WHITE)

    ws.getRow(row + i).height = 18
  }

  applyBorder(ws, row, 1, row + 2, 4)
  applyBorder(ws, row, 5, row + 2, 6)
  applyBorder(ws, row, 7, row + 2, 9)
  row += 3

  // ── Vendor / Ship To ─────────────────────────────────────────────────────
  ws.mergeCells(row, 1, row, 4)
  ws.mergeCells(row, 5, row, 9)

  const vend = ws.getCell(row, 1)
  vend.value = `Vendor :\n${po.vendor ?? ''}`
  vend.font      = normalFont(10)
  vend.alignment = { ...left, wrapText: true }
  vend.fill      = fill(LIGHT_GREY)
  vend.border    = ALL_MED

  const ship = ws.getCell(row, 5)
  ship.value = 'Ship To :  Rotem SRS\nShipping Address: 250 ST-Degla\nPhone no: 201060604163'
  ship.font      = normalFont(10)
  ship.alignment = { ...left, wrapText: true }
  ship.fill      = fill(WHITE)
  ship.border    = ALL_MED

  ws.getRow(row).height = 42
  row++

  // ── Items Header ─────────────────────────────────────────────────────────
  const itemHdrs = ['NO', 'Item Description', 'Stock', 'Average Con', 'QTY', 'Unit', 'Unit Price', 'Total', 'Remark']
  const hRow = ws.getRow(row)
  hRow.height = 22
  itemHdrs.forEach((h, i) => {
    const c = ws.getCell(row, i + 1)
    c.value     = h
    c.font      = boldFont(10)
    c.alignment = center
    c.fill      = fill(HEADER_GREY)
    c.border    = ALL_THIN
  })
  row++

  // ── Items ─────────────────────────────────────────────────────────────────
  items.forEach((it, idx) => {
    const iRow = ws.getRow(row)
    iRow.height = 18

    const vals = [
      it.no ?? idx + 1,
      it.item_description ?? '',
      it.stock ?? '',
      it.average_con ?? '',
      it.qty ?? '',
      it.unit ?? '',
      `EGP  ${fmt(it.unit_price)}`,
      `EGP  ${fmt(it.total)}`,
      it.remark ?? '',
    ]
    const aligns = [center, left, center, center, center, center, right, right, left]

    vals.forEach((v, i) => {
      const c = ws.getCell(row, i + 1)
      c.value     = v
      c.font      = normalFont(10)
      c.alignment = aligns[i]
      c.fill      = fill(WHITE)
      c.border    = ALL_THIN
    })
    row++
  })

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = [
    ['TAX',             fmt(po.tax)],
    ['Withholding Tax', fmt(po.withholding_tax)],
    ['TOTAL',           `EGP  ${fmt(grandTotal)}`],
  ]
  totals.forEach(([label, value]) => {
    ws.mergeCells(row, 1, row, 6)
    ws.mergeCells(row, 8, row, 9)

    const blank = ws.getCell(row, 1)
    blank.value  = ''
    blank.fill   = fill(WHITE)
    blank.border = ALL_THIN

    const lbl = ws.getCell(row, 7)
    lbl.value     = label
    lbl.font      = boldFont(10)
    lbl.alignment = center
    lbl.fill      = fill(LIGHT_GREY)
    lbl.border    = ALL_THIN

    const egp = ws.getCell(row, 8)
    egp.value     = value
    egp.font      = boldFont(10)
    egp.alignment = right
    egp.fill      = fill(WHITE)
    egp.border    = ALL_THIN

    ws.getRow(row).height = 18
    row++
  })

  // ── Delivery Terms ────────────────────────────────────────────────────────
  ws.mergeCells(row, 1, row, 4)
  ws.mergeCells(row, 5, row, 6)
  ws.mergeCells(row, 7, row, 9)

  const deliv = ws.getCell(row, 1)
  deliv.value = [
    'Delivery terms:',
    `Delivery period : ${po.delivery_period ?? 'Week'}`,
    `Payment Terms : ${po.payment_terms ?? '100% After Received'}`,
    `Receipt location : ${po.receipt_location ?? 'Company Warehouse'}`,
  ].join('\n')
  deliv.font      = normalFont(10)
  deliv.alignment = { ...left, wrapText: true }
  deliv.fill      = fill(WHITE)
  deliv.border    = ALL_MED

  const commLbl = ws.getCell(row, 5)
  commLbl.value     = 'Comments or Special Instructions'
  commLbl.font      = boldFont(10)
  commLbl.alignment = { ...center, wrapText: true }
  commLbl.fill      = fill(LIGHT_GREY)
  commLbl.border    = ALL_MED

  const commVal = ws.getCell(row, 7)
  commVal.value     = po.comments ?? 'Banking Transfer'
  commVal.font      = normalFont(10)
  commVal.alignment = { ...left, wrapText: true }
  commVal.fill      = fill(WHITE)
  commVal.border    = ALL_MED

  ws.getRow(row).height = 54
  row++

  // ── Signatures ────────────────────────────────────────────────────────────
  const sigLabels = ['Requester', 'Procurement', 'Logistics Manager /', 'Depot Manager', 'MD']
  const sigValues = [
    po.prf?.requester?.name ?? '',
    po.creator?.name ?? '',
    '',
    '',
    '',
  ]

  // Each sig takes ~2 cols — 9 cols / 5 sigs ≈ 1.8, so we do manual per-cell
  // 5 equal sections in 9 columns: cols 1-2, 3-4, 5-6, 7-8, 9 (last gets 1 col)
  // Better: merge each pair, last col expands
  const sigRanges = [[1,2],[3,4],[5,6],[7,8],[9,9]]

  // Label row
  sigRanges.forEach(([s, e], i) => {
    if (s !== e) ws.mergeCells(row, s, row, e)
    const c = ws.getCell(row, s)
    c.value     = sigLabels[i]
    c.font      = boldFont(10)
    c.alignment = center
    c.fill      = fill(HEADER_GREY)
    c.border    = ALL_THIN
  })
  ws.getRow(row).height = 20
  row++

  // Name row
  sigRanges.forEach(([s, e], i) => {
    if (s !== e) ws.mergeCells(row, s, row, e)
    const c = ws.getCell(row, s)
    c.value     = sigValues[i]
    c.font      = normalFont(10)
    c.alignment = center
    c.fill      = fill(WHITE)
    c.border    = ALL_THIN
  })
  ws.getRow(row).height = 28
  row++

  // Year row
  const year = po.date ? new Date(po.date).getFullYear() : new Date().getFullYear()
  const prf_number = po.prf?.prf_number ?? ''
  const yearVals = [`PRF (${prf_number})`, `/${year}`, `/${year}`, `/${year}`, `/${year}`]
  sigRanges.forEach(([s, e], i) => {
    if (s !== e) ws.mergeCells(row, s, row, e)
    const c = ws.getCell(row, s)
    c.value     = yearVals[i]
    c.font      = normalFont(10)
    c.alignment = center
    c.fill      = fill(WHITE)
    c.border    = ALL_THIN
  })
  ws.getRow(row).height = 18

  // ── Save ──────────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${po.po_number ?? 'PO'}.xlsx`)
}
