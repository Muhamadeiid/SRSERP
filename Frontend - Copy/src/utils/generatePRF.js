import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, TableLayoutType, ImageRun, Header, Footer,
} from 'docx'
import { saveAs } from 'file-saver'
import { MATERIAL_CATEGORIES } from '../services/prfService'

// ── Page constants (A4 portrait) ───────────────────────────────────────────
const PAGE_W    = 11906
const PAGE_H    = 16838
const MARGIN    = 720
const CONTENT_W = PAGE_W - MARGIN * 2          // 10466

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDERS  = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

// PDF uses light green fills for section banners + table headers
const HEADER_GREEN  = 'B6D7A8'   // table header row
const SECTION_GREEN = 'D9EAD3'   // section banner

async function loadLogoBytes() {
  try {
    const res = await fetch('/asset-return-logo.png')
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

const fmtDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── helpers ─────────────────────────────────────────────────────────────────
function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: 0, before: 0 },
    children: [
      new TextRun({
        text: text || '',
        bold: opts.bold || false,
        size: opts.size || 18,
        font: opts.font || 'Arial',
        color: opts.color || '000000',
      }),
    ],
  })
}

function cell(paragraphs, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.colspan,
    rowSpan: opts.rowspan,
    verticalAlign: opts.vAlign || VerticalAlign.CENTER,
    shading: opts.shading
      ? { type: ShadingType.CLEAR, fill: opts.shading, color: 'auto' }
      : undefined,
    borders: opts.borders || ALL_BORDERS,
    children: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
    margins: { top: 30, bottom: 30, left: 80, right: 80 },
  })
}

// Section banner (full-width green strip — slim)
function sectionBanner(title) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        height: { value: 280, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { type: ShadingType.CLEAR, fill: SECTION_GREEN, color: 'auto' },
            borders: ALL_BORDERS,
            margins: { top: 20, bottom: 20, left: 80, right: 80 },
            children: [para(title, { bold: true, size: 18 })],
          }),
        ],
      }),
    ],
  })
}

// Decode a base64 PNG data-URI into bytes for ImageRun
function base64ToBytes(b64) {
  if (!b64) return null
  try {
    const raw = atob(b64.replace(/^data:image\/\w+;base64,/, ''))
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

// ── main export ─────────────────────────────────────────────────────────────
export async function generatePRF(prf) {
  const logoBytes = await loadLogoBytes()

  const requesterName  = prf?.requester?.name ?? '—'
  const items          = Array.isArray(prf?.items) ? prf.items : []
  const approvals      = Array.isArray(prf?.approvals) ? prf.approvals : []
  const findApproval = (role) =>
    approvals.find(a => a.role === role && a.action === 'approved') || null

  const procApprovalA  = findApproval('procurement')
  const ehsApprovalA   = findApproval('ehs')
  const depotApprovalA = findApproval('depot_manager')

  const selectedCats = Array.isArray(prf?.material_category) ? prf.material_category : []
  const isSelected   = (c) => selectedCats.includes(c)

  // ── Header table (logo + title) ────────────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [1800, CONTENT_W - 1800],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell(
            logoBytes
              ? [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0, before: 0 },
                  children: [new ImageRun({ data: logoBytes, transformation: { width: 108, height: 34 } })],
                })]
              : [
                  para('Rotem SRS', { bold: true, size: 22, align: AlignmentType.CENTER }),
                  para('EGYPT',     { bold: true, size: 18, align: AlignmentType.CENTER, color: 'CC0000' }),
                ],
            { width: 1800, vAlign: VerticalAlign.CENTER }
          ),
          cell(
            [new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 40, before: 0 },
              children: [new TextRun({ text: 'Purchase Requesting Form', bold: true, size: 32, font: 'Arial' })],
            })],
            { width: CONTENT_W - 1800, vAlign: VerticalAlign.CENTER }
          ),
        ],
      }),
    ],
  })

  // ── Top row: PRF Number | Date | Requested By ───────────────────────────
  const COL_TOP = [Math.floor(CONTENT_W / 3), Math.floor(CONTENT_W / 3), CONTENT_W - 2 * Math.floor(CONTENT_W / 3)]
  const topInfo = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_TOP,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell([para('PRF Number',   { bold: true, size: 18 })], { width: COL_TOP[0], shading: SECTION_GREEN }),
          cell([para('Date',         { bold: true, size: 18 })], { width: COL_TOP[1], shading: SECTION_GREEN }),
          cell([para('Requested By', { bold: true, size: 18 })], { width: COL_TOP[2], shading: SECTION_GREEN }),
        ],
      }),
      new TableRow({
        height: { value: 360, rule: HeightRule.ATLEAST },
        children: [
          cell([para(prf?.prf_number || '', { bold: true, size: 18, align: AlignmentType.CENTER })], { width: COL_TOP[0] }),
          cell([para(fmtDate(prf?.date),    { size: 18, align: AlignmentType.CENTER })],            { width: COL_TOP[1] }),
          cell([para(requesterName,         { size: 18, align: AlignmentType.CENTER })],            { width: COL_TOP[2] }),
        ],
      }),
    ],
  })

  // ── Material Category — 2 columns × 4 rows of checkbox-style cells ─────
  // ☐ + label, ✓ when selected
  const checkbox = (label, selected) =>
    new Paragraph({
      spacing: { after: 0, before: 0 },
      children: [
        new TextRun({ text: selected ? '☑ ' : '☐ ', bold: true, size: 22, font: 'Segoe UI Symbol' }),
        new TextRun({ text: label, bold: true, size: 18, font: 'Arial' }),
      ],
    })

  const catColW = Math.floor(CONTENT_W / 2)
  const catRows = []
  for (let i = 0; i < MATERIAL_CATEGORIES.length; i += 2) {
    const left  = MATERIAL_CATEGORIES[i]
    const right = MATERIAL_CATEGORIES[i + 1]
    catRows.push(new TableRow({
      children: [
        cell([checkbox(left + (left === 'Others' ? ' : ……………………………' : ''), isSelected(left))], { width: catColW }),
        right
          ? cell([checkbox(right + (right === 'Others' ? ' : ……………………………' : ''), isSelected(right))], { width: CONTENT_W - catColW })
          : cell([para('')], { width: CONTENT_W - catColW }),
      ],
    }))
  }
  const matCatTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [catColW, CONTENT_W - catColW],
    layout: TableLayoutType.FIXED,
    rows: catRows,
  })

  // ── Material Detail / Items table ──────────────────────────────────────
  const ITEM_COLS = [600, 2200, 2700, 800, 700, 2000, CONTENT_W - 600 - 2200 - 2700 - 800 - 700 - 2000]
  const headerCells = ['S/N', 'Description', 'Technical Specifications', 'Quantity', 'Unit', 'EHS Requirements', 'Req. By Date']
    .map((label, i) =>
      cell([para(label, { bold: true, size: 16, align: AlignmentType.CENTER })], {
        width: ITEM_COLS[i], shading: HEADER_GREEN, vAlign: VerticalAlign.CENTER,
      })
    )

  // Render exactly the items the user entered (no empty padding rows — saves space)
  const padded = items.length ? items : [null, null, null]

  const itemRows = padded.map((it, idx) => new TableRow({
    height: { value: 280, rule: HeightRule.ATLEAST },
    children: it ? [
      cell([para(String(it.sn || idx + 1), { size: 15, align: AlignmentType.CENTER })], { width: ITEM_COLS[0], vAlign: VerticalAlign.CENTER }),
      cell([para(it.description || '',           { size: 15 })], { width: ITEM_COLS[1], vAlign: VerticalAlign.CENTER }),
      cell([para(it.technical_specifications || '', { size: 15 })], { width: ITEM_COLS[2], vAlign: VerticalAlign.CENTER }),
      cell([para(String(it.quantity ?? ''),       { size: 15, align: AlignmentType.CENTER })], { width: ITEM_COLS[3], vAlign: VerticalAlign.CENTER }),
      cell([para(it.unit || '',                   { size: 15, align: AlignmentType.CENTER })], { width: ITEM_COLS[4], vAlign: VerticalAlign.CENTER }),
      cell([para(it.ehs_requirements || '',       { size: 15 })], { width: ITEM_COLS[5], vAlign: VerticalAlign.CENTER }),
      cell([para(fmtDate(it.required_by_date),    { size: 15, align: AlignmentType.CENTER })], { width: ITEM_COLS[6], vAlign: VerticalAlign.CENTER }),
    ] : [
      cell([para(String(idx + 1), { size: 15, align: AlignmentType.CENTER, color: 'BDBDBD' })], { width: ITEM_COLS[0] }),
      ...ITEM_COLS.slice(1).map(w => cell([para('')], { width: w })),
    ],
  }))

  const itemsTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: ITEM_COLS,
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: headerCells }), ...itemRows],
  })

  // ── Delivery Information block ─────────────────────────────────────────
  const deliveryTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [Math.floor(CONTENT_W / 2), CONTENT_W - Math.floor(CONTENT_W / 2)],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell([para('Delivery Location', { bold: true, size: 16 })], { shading: HEADER_GREEN }),
          cell([para('Contact',           { bold: true, size: 16 })], { shading: HEADER_GREEN }),
        ],
      }),
      new TableRow({
        height: { value: 320, rule: HeightRule.ATLEAST },
        children: [
          cell([para(prf?.delivery_location || '', { size: 16, align: AlignmentType.CENTER })], { vAlign: VerticalAlign.CENTER }),
          cell([para(prf?.delivery_contact  || '', { size: 16, align: AlignmentType.CENTER })], { vAlign: VerticalAlign.CENTER }),
        ],
      }),
    ],
  })

  // ── Requester's Contact Information ────────────────────────────────────
  const contactTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [Math.floor(CONTENT_W / 2), CONTENT_W - Math.floor(CONTENT_W / 2)],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell([para('Phone', { bold: true, size: 16 })], { shading: HEADER_GREEN }),
          cell([para('Email', { bold: true, size: 16 })], { shading: HEADER_GREEN }),
        ],
      }),
      new TableRow({
        height: { value: 320, rule: HeightRule.ATLEAST },
        children: [
          cell([para(prf?.requester_phone || '', { size: 16, align: AlignmentType.CENTER })], { vAlign: VerticalAlign.CENTER }),
          cell([para(prf?.requester_email || '', { size: 16, align: AlignmentType.CENTER })], { vAlign: VerticalAlign.CENTER }),
        ],
      }),
    ],
  })

  // ── Additional Notes block (text + optional embedded image) ────────────
  const notesChildren = []
  if (prf?.notes) {
    notesChildren.push(para(prf.notes, { size: 16 }))
  }
  const notesImgBytes = base64ToBytes(prf?.notes_image)
  if (notesImgBytes) {
    try {
      notesChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 0 },
        children: [new ImageRun({
          data: notesImgBytes,
          // ~6.5 inches wide (full content width) × ~2 inches tall — keeps single page
          transformation: { width: 480, height: 180 },
        })],
      }))
    } catch {
      // ignore malformed image
    }
  }
  if (notesChildren.length === 0) {
    notesChildren.push(para('', { size: 16 }))
  }

  const notesTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        height: { value: notesImgBytes ? 2800 : 600, rule: HeightRule.ATLEAST },
        children: [cell(notesChildren, { vAlign: VerticalAlign.TOP })],
      }),
    ],
  })

  // ── Approval Section: 4 columns — only signature image (no date, no name underneath)
  const approvalBox = (sigBase64) => {
    const sigBytes = base64ToBytes(sigBase64)
    const children = []

    if (sigBytes) {
      try {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new ImageRun({ data: sigBytes, transformation: { width: 140, height: 56 } })],
        }))
      } catch {
        children.push(new Paragraph({ children: [new TextRun({ text: ' ', size: 18 })] }))
      }
    } else {
      // empty space — keeps boxes aligned visually
      children.push(new Paragraph({ children: [new TextRun({ text: ' ', size: 18 })] }))
    }

    return cell(children, { vAlign: VerticalAlign.CENTER })
  }

  const approvalColW = Math.floor(CONTENT_W / 4)
  const approvalsTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [approvalColW, approvalColW, approvalColW, CONTENT_W - 3 * approvalColW],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell([para('Requester:',     { bold: true, size: 15, align: AlignmentType.CENTER })], { shading: HEADER_GREEN }),
          cell([para('Procurement:',   { bold: true, size: 15, align: AlignmentType.CENTER })], { shading: HEADER_GREEN }),
          cell([para('EHS:',           { bold: true, size: 15, align: AlignmentType.CENTER })], { shading: HEADER_GREEN }),
          cell([para('Depot Manager:', { bold: true, size: 15, align: AlignmentType.CENTER })], { shading: HEADER_GREEN }),
        ],
      }),
      new TableRow({
        height: { value: 1000, rule: HeightRule.ATLEAST },
        children: [
          approvalBox(prf?.requester?.e_signature),
          approvalBox(procApprovalA?.approver?.e_signature),
          approvalBox(ehsApprovalA?.approver?.e_signature),
          approvalBox(depotApprovalA?.approver?.e_signature),
        ],
      }),
    ],
  })

  // ── Footer ─────────────────────────────────────────────────────────────
  const footerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W - 1500, 1500],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W - 1500, type: WidthType.DXA },
            borders: { top: BORDER, bottom: NO_BORDERS.bottom, left: NO_BORDERS.left, right: NO_BORDERS.right },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Document No: SRS-PRC-P01-F04  |  Rev.: 04  |  Rev. Date: 16/12/2025', bold: true, size: 14, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 1500, type: WidthType.DXA },
            borders: { top: BORDER, bottom: NO_BORDERS.bottom, left: NO_BORDERS.left, right: NO_BORDERS.right },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Page 1 of 1', bold: true, size: 14, font: 'Arial' })] })],
          }),
        ],
      }),
    ],
  })

  const header = new Header({ children: [headerTable] })
  const footer = new Footer({ children: [footerTable] })

  const spacer = new Paragraph({ spacing: { before: 60, after: 0 }, children: [new TextRun({ text: '', size: 8 })] })

  // Prominent "PRF Number: …" line under the header — easy to spot when filing
  const prfNumberLine = new Paragraph({
    spacing: { before: 100, after: 80 },
    children: [
      new TextRun({ text: 'PRF Number: ', bold: true, size: 22, font: 'Arial' }),
      new TextRun({
        text: prf?.prf_number || '__________',
        bold: !!prf?.prf_number,
        size: 22, font: 'Arial',
        color: prf?.prf_number ? '000000' : '888888',
      }),
    ],
  })

  // ── Document assembly ────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 720, footer: 720 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: [
          prfNumberLine,
          topInfo,
          spacer,

          sectionBanner('Material Category:'),
          matCatTable,
          spacer,

          sectionBanner('Material Detail:'),
          itemsTable,
          spacer,

          sectionBanner('Delivery Information:'),
          deliveryTable,
          spacer,

          sectionBanner("Requester's Contact Information:"),
          contactTable,
          spacer,

          sectionBanner('Additional Notes / Instructions:'),
          notesTable,
          spacer,

          sectionBanner('Approval Section:'),
          approvalsTable,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${prf?.prf_number || 'PRF'}.docx`)
}
