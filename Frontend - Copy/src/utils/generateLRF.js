import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, TableLayoutType,
} from 'docx'
import { saveAs } from 'file-saver'

// ── constants ──────────────────────────────────────────────────────────────
const PAGE_W    = 11906
const PAGE_H    = 16838
const MARGIN    = 720
const CONTENT_W = PAGE_W - MARGIN * 2   // 10466

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDERS  = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, ' ')
}

function biPara(en, ar, opts = {}) {
  const paras = []
  paras.push(
    new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { after: 0, before: 0 },
      children: [
        new TextRun({ text: en, bold: true, size: 18, font: 'Arial' }),
      ],
    })
  )
  if (ar) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0, before: 0 },
        children: [
          new TextRun({ text: ar, bold: true, size: 16, font: 'Arial', rightToLeft: true }),
        ],
      })
    )
  }
  return paras
}

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    bidirectional: opts.rtl || false,
    spacing: { after: 0, before: 0 },
    children: [
      new TextRun({
        text: text || '',
        bold: opts.bold || false,
        size: opts.size || 20,
        font: opts.font || 'Arial',
        rightToLeft: opts.rtl || false,
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
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  })
}

// ── Leave type label ───────────────────────────────────────────────────────
function leaveTypeLabel(type) {
  const map = {
    annual:  'Annual Leave / إجازة سنوية',
    casual:  'Casual Leave / إجازة عارضة',
    sick:    'Sick Leave / إجازة مرضية',
    early:   'Early Leave / إذن مبكر',
  }
  return map[type] ?? (type || '')
}

// ── main export ────────────────────────────────────────────────────────────
export async function generateLRF(d) {
  // ── Column widths ──────────────────────────────────────────────────────
  const LBL_W = 3600   // label col
  const VAL_W = CONTENT_W - LBL_W  // value col  (6866)

  // ── Header table ──────────────────────────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [1800, CONTENT_W - 1800],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para('Rotem SRS', { bold: true, size: 22, align: AlignmentType.CENTER }),
              para('EGYPT',     { bold: true, size: 18, align: AlignmentType.CENTER, color: 'CC0000' }),
            ],
            {
              width: 1800,
              vAlign: VerticalAlign.CENTER,
              borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
            }
          ),
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40, before: 0 },
                children: [
                  new TextRun({ text: 'Leave Request Form (LRF)', bold: true, size: 32, font: 'Arial' }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, before: 0 },
                children: [
                  new TextRun({ text: 'نموذج طلب اجازة', bold: true, size: 24, font: 'Arial', rightToLeft: true }),
                ],
              }),
            ],
            { width: CONTENT_W - 1800, vAlign: VerticalAlign.CENTER }
          ),
        ],
      }),
    ],
  })

  // ── Tracking No paragraph ─────────────────────────────────────────────
  const trackingPara = new Paragraph({
    spacing: { before: 120, after: 80 },
    children: [
      new TextRun({
        text: `Tracking No: ${d.tracking_no || 'LRF-GZ-'}`,
        bold: true,
        size: 22,
        font: 'Arial',
      }),
    ],
  })

  // ── Main details table ────────────────────────────────────────────────
  // Row 1: section header
  const row1 = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'Leave Request Details', bold: true, size: 22, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'تفاصيل طلب الاجازة', bold: true, size: 20, font: 'Arial', rightToLeft: true })],
          }),
        ],
        { width: CONTENT_W, colspan: 2, shading: 'D6ECDA', vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 2: Employee Name | Date of Request
  const row2 = new TableRow({
    children: [
      cell(biPara('Employee Name', 'إسم الموظف'), { width: LBL_W }),
      cell([para(d.employee_name || '', { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 3: Job Title
  const row3 = new TableRow({
    children: [
      cell(biPara('Job Title', 'المسمى الوظيفى'), { width: LBL_W }),
      cell([para(d.job_title || '', { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 4: Department
  const row4 = new TableRow({
    children: [
      cell(biPara('Department', 'الإداره'), { width: LBL_W }),
      cell([para(d.department_label || d.department || '', { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 5: Date of Request
  const row5 = new TableRow({
    children: [
      cell(biPara('Date of Request', 'تاريخ الطلب'), { width: LBL_W }),
      cell([para(fmtDate(d.request_date), { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 6: Leave Type
  const row6 = new TableRow({
    children: [
      cell(biPara('Leave Type', 'نوع الاجازة'), { width: LBL_W }),
      cell([para(leaveTypeLabel(d.leave_type), { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 7: Period (From / To / Days)
  const periodText = d.leave_type === 'early'
    ? `From ${d.early_from || ''} To ${d.early_to || ''}`
    : `From ${fmtDate(d.start_date)}  To  ${fmtDate(d.end_date)}  —  ${d.days ?? ''} Day(s)`

  const row7 = new TableRow({
    children: [
      cell(biPara('Period', 'الفترة'), { width: LBL_W }),
      cell([para(periodText, { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 8: Paid / Unpaid
  const row8 = new TableRow({
    children: [
      cell(biPara('Paid / Unpaid', 'مدفوع / غير مدفوع'), { width: LBL_W }),
      cell([para(d.paid === true ? 'Paid' : d.paid === false ? 'Unpaid' : '', { size: 20 })], { width: VAL_W }),
    ],
  })

  // Row 9: Purpose / Reason (tall cell)
  const row9 = new TableRow({
    height: { value: 1800, rule: HeightRule.ATLEAST },
    children: [
      cell(biPara('Purpose / Reason', 'الغرض'), { width: LBL_W, vAlign: VerticalAlign.TOP }),
      cell([para(d.purpose || '', { size: 18 })], { width: VAL_W, vAlign: VerticalAlign.TOP }),
    ],
  })

  // ── Signature row helper ──────────────────────────────────────────────
  // C column layout for sig rows: [LBL_W | C1 | C2 | C3]
  const SC = [LBL_W, 3000, 2066, 1800]  // label | sig area | "Date" | date value

  const sigRow = (enLabel, arLabel, dateValue = '') => new TableRow({
    height: { value: 900, rule: HeightRule.ATLEAST },
    children: [
      new TableCell({
        width: { size: SC[0], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            spacing: { after: 20, before: 0 },
            children: [new TextRun({ text: enLabel, bold: true, size: 18, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: arLabel, bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: SC[1], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [para('')],
      }),
      new TableCell({
        width: { size: SC[2], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: biPara('Date', 'التاريخ'),
      }),
      new TableCell({
        width: { size: SC[3], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [para(dateValue || '', { size: 18 })],
      }),
    ],
  })

  const sigRow1 = sigRow('Employee Signature',       'توقيع الموظف',          '')
  const sigRow2 = sigRow('Direct Manager Signature', 'توقيع المدير المباشر',  '')
  const sigRow3 = sigRow('HR Signature',             'توقيع الموارد البشرية', '')
  const sigRow4 = sigRow('Depot Manager Signature',  'توقيع مدير الموقع',
    d.status === 'approved' ? fmtDate(d.approved_at) : ''
  )

  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [LBL_W, SC[1], SC[2], SC[3]],
    layout: TableLayoutType.FIXED,
    rows: [row1, row2, row3, row4, row5, row6, row7, row8, row9, sigRow1, sigRow2, sigRow3, sigRow4],
  })

  // ── Footer ────────────────────────────────────────────────────────────
  const footerLeft  = 'Document No: SRS-HR-P02-F02  |  Rev.: 02  |  Rev. Date: 04-May-2025'
  const footerRight = 'Page 1 of 1'

  const footerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W - 1500, 1500],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W - 1500, type: WidthType.DXA },
            borders: {
              top: BORDER,
              bottom: NO_BORDERS.bottom,
              left: NO_BORDERS.left,
              right: NO_BORDERS.right,
            },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: footerLeft, bold: true, size: 14, font: 'Arial' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 1500, type: WidthType.DXA },
            borders: {
              top: BORDER,
              bottom: NO_BORDERS.bottom,
              left: NO_BORDERS.left,
              right: NO_BORDERS.right,
            },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: footerRight, bold: true, size: 14, font: 'Arial' })],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  // ── Document assembly ─────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children: [
          headerTable,
          trackingPara,
          mainTable,
          new Paragraph({ spacing: { before: 80, after: 0 }, children: [] }),
          footerTable,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `LRF-${d.tracking_no || 'export'}.docx`)
}
