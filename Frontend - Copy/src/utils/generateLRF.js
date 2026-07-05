import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, TableLayoutType, Header, Footer, TabStopType, TabStopPosition,
} from 'docx'
import { saveAs } from 'file-saver'

// ── page constants ─────────────────────────────────────────────────
const PAGE_W    = 11906
const PAGE_H    = 16838
const MARGIN    = 500       // narrower page margins → wider content area
const CONTENT_W = PAGE_W - MARGIN * 2

const BORDER      = { style: BorderStyle.SINGLE, size: 8, color: '000000' }
const BORDER_THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const THIN_BORDERS = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
const NO_BORDERS  = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

// ── helpers ────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

async function loadLogoBytes() {
  try {
    const res = await fetch('/logo.png')
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch { return null }
}

function earlyDays(from, to) {
  if (!from || !to) return ''
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  const mins = (th * 60 + tm) - (fh * 60 + fm)
  if (mins <= 0) return ''
  return (mins / 60 / 8).toFixed(2).replace(/\.?0+$/, '')
}

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    bidirectional: opts.rtl || false,
    spacing: { after: opts.after ?? 0, before: opts.before ?? 0 },
    children: [
      new TextRun({
        text: text || '',
        bold: opts.bold || false,
        italics: opts.italics || false,
        size: opts.size || 20,
        font: opts.font || 'Arial',
        rightToLeft: opts.rtl || false,
        color: opts.color || '000000',
      }),
    ],
  })
}

// Label cell (EN bold on top, AR small below-right)
function labelPara(en, ar) {
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 0, before: 0 },
      children: [new TextRun({ text: en, bold: true, size: 18, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0, before: 0 },
      children: [new TextRun({ text: ar, size: 16, font: 'Arial', rightToLeft: true })],
    }),
  ]
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
    borders: opts.borders || THIN_BORDERS,
    children: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
    margins: opts.margins || { top: 40, bottom: 40, left: 100, right: 100 },
  })
}

const HR_OFFICER_FALLBACK = 'Hazem Khaled'
const DEPOT_MGR_FALLBACK  = 'Mohamed Awaad'

// ── main export ────────────────────────────────────────────────────
export async function generateLRF(d) {
  const logoBytes = await loadLogoBytes()

  // ── Header (logo + title) — only bottom border + divider ──────
  const HDR_ONLY_BOTTOM = {
    top:    NO_BORDERS.top,
    bottom: BORDER,
    left:   NO_BORDERS.left,
    right:  NO_BORDERS.right,
  }
  const HDR_LOGO_CELL = {
    top:    NO_BORDERS.top,
    bottom: BORDER,
    left:   NO_BORDERS.left,
    right:  BORDER,      // vertical divider between logo and title
  }

  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [2400, CONTENT_W - 2400],
    layout: TableLayoutType.FIXED,
    borders: {
      top:             NO_BORDERS.top,
      bottom:          BORDER,
      left:            NO_BORDERS.left,
      right:           NO_BORDERS.right,
      insideHorizontal: BORDER,
      insideVertical:   BORDER,
    },
    rows: [
      new TableRow({
        height: { value: 1100, rule: HeightRule.ATLEAST },
        children: [
          cell(
            logoBytes
              ? [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0, before: 0 },
                  children: [new ImageRun({ data: logoBytes, type: 'png', transformation: { width: 145, height: 50 } })],
                })]
              : [para('Rotem SRS Egypt', { bold: true, size: 22, align: AlignmentType.CENTER })],
            { width: 2400, vAlign: VerticalAlign.CENTER, borders: HDR_LOGO_CELL }
          ),
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60, before: 0 },
                children: [new TextRun({ text: 'Leave Request Form (LRF)', bold: true, size: 30, font: 'Arial' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, before: 0 },
                children: [new TextRun({ text: 'نموذج طلب اجازة', bold: true, size: 24, font: 'Arial', rightToLeft: true })],
              }),
            ],
            { width: CONTENT_W - 2400, vAlign: VerticalAlign.CENTER, borders: HDR_ONLY_BOTTOM }
          ),
        ],
      }),
    ],
  })

  // ── Tracking No line ───────────────────────────────────────────
  const trackingRow = new Paragraph({
    spacing: { before: 80, after: 60 },
    children: [
      new TextRun({ text: `Tracking No: ${d.tracking_no || 'LRF-XX-XX'}`, bold: true, size: 22, font: 'Arial' }),
    ],
  })

  // ── Document purpose line (EN left, AR right — SAME line) ──────
  const purposeHeaderLine = new Paragraph({
    spacing: { after: 20, before: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W - 100 }],
    children: [
      new TextRun({ text: '■ Document purpose:', bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '\t', size: 20, font: 'Arial' }),
      new TextRun({ text: 'الغرض من النموذج :', bold: true, size: 20, font: 'Arial', rightToLeft: true }),
    ],
  })
  const purposeEn = new Paragraph({
    spacing: { after: 20, before: 0 },
    children: [
      new TextRun({
        text: 'This form is for employees to use to take a leave of annual, casual, sick leaves and early leave',
        size: 18, font: 'Arial',
      }),
    ],
  })
  const purposeAr = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 40, before: 0 },
    children: [
      new TextRun({
        text: 'هذا النموذج خاص برصيد الأجازات السنويه، الاجازات العارضه و الاجازات المرضي والأذونات',
        bold: true, size: 18, font: 'Arial', rightToLeft: true,
      }),
    ],
  })
  const detailsHead = new Paragraph({
    spacing: { after: 40, before: 40 },
    children: [
      new TextRun({ text: '■ Details:', bold: true, size: 22, font: 'Arial' }),
    ],
  })

  // ── Main table — 9 columns for flexible layouts ───────────────
  // Layout: LBL | chk | txt | chk | txt | chk | txt | chk | rest
  //   Checkboxes are narrow (500 dxa) — much smaller than text cells
  const LBL_W = Math.round(CONTENT_W * 0.34)
  const CHK_W = 500
  const TXT_W = 1400
  const REST  = CONTENT_W - LBL_W - CHK_W * 4 - TXT_W * 3

  // Simple row: label + value (colspan=8 fills the value area)
  const simpleRow = (en, ar, val) => new TableRow({
    children: [
      cell(labelPara(en, ar), { width: LBL_W }),
      cell([para(val || '', { size: 20 })], { colspan: 8 }),
    ],
  })

  // Leave Type row 1: [chk][Annual][chk][Casual][chk][Sick(colspan=3)]
  const leaveTypeRow1 = new TableRow({
    children: [
      cell(labelPara('Leave Type:', 'نوع الاذن'), {
        width: LBL_W,
        rowspan: 2,
      }),
      cell([para(d.leave_type === 'annual' ? '☒' : '☐', { size: 22, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Annual Leave', { size: 18 })], { width: TXT_W }),
      cell([para(d.leave_type === 'casual' ? '☒' : '☐', { size: 22, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Casual Leave', { size: 18 })], { width: TXT_W }),
      cell([para(d.leave_type === 'sick' ? '☒' : '☐', { size: 22, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Sick Leave', { size: 18 })], { colspan: 3 }),
    ],
  })

  // Leave Type row 2: [chk][Early Leave][From:(cs=2)][To:(cs=2)][( days )][Day]
  const leaveTypeRow2 = new TableRow({
    children: [
      cell([para(d.leave_type === 'early' ? '☒' : '☐', { size: 22, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Early Leave', { size: 18 })], { width: TXT_W }),
      cell([para(`From: ${d.early_from || ''}`, { size: 18 })], { colspan: 2 }),
      cell([para(`To: ${d.early_to || ''}`, { size: 18 })], { colspan: 2 }),
      cell([para(`( ${d.leave_type === 'early' ? earlyDays(d.early_from, d.early_to) : ''} )`, { size: 18, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Day', { size: 18 })], { width: REST }),
    ],
  })

  // Paid/Unpaid row: [chk][Paid(cs=3)][chk][Unpaid(cs=3)]
  const paidRow = new TableRow({
    children: [
      cell(labelPara('Paid/Unpaid:', 'مدفوع الاجر / غير مدفوع الاجر'), { width: LBL_W }),
      cell([para(d.paid === true ? '☒' : '☐', { size: 22, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Paid', { size: 18 })], { colspan: 3 }),
      cell([para(d.paid === false ? '☒' : '☐', { size: 22, align: AlignmentType.CENTER })], { width: CHK_W }),
      cell([para('Unpaid', { size: 18 })], { colspan: 3 }),
    ],
  })

  // ── Signature row: 2 rows per signature (empty | name) ─────────
  // Label uses rowspan=2 to span both rows.
  // When the direct manager IS the depot manager (same user signed both), leave
  // the direct-manager slot blank so the depot only signs the depot row.
  const managerIsDepot = d.manager_approver?.id && d.approver?.id
                          ? d.manager_approver.id === d.approver.id
                          : false;
  const sigNames = {
    employee:  d.employee_name || '',
    alternate: d.alternate_employee_name || '',
    direct:    managerIsDepot ? '' : (d.manager_approver?.name || d.direct_manager_name || ''),
    hr:        HR_OFFICER_FALLBACK,
    depot:     d.approver?.name || DEPOT_MGR_FALLBACK,
  }

  const sigRows = (en, ar, name) => [
    new TableRow({
      height: { value: 800, rule: HeightRule.ATLEAST },
      children: [
        cell(labelPara(en, ar), { width: LBL_W, rowspan: 2, vAlign: VerticalAlign.TOP }),
        cell([para('', { size: 18 })], { colspan: 8 }),
      ],
    }),
    new TableRow({
      height: { value: 450, rule: HeightRule.ATLEAST },
      children: [
        cell([para(name, { size: 16, italics: true, color: '888888' })], { colspan: 8 }),
      ],
    }),
  ]

  const mainRows = [
    simpleRow('Employee Name:', 'إسم الموظف', d.employee_name),
    simpleRow('Job Title:',     'المسمى الوظيفى', d.job_title),
    simpleRow('Department:',    'الإداره', d.department_label || d.department),
    leaveTypeRow1,
    leaveTypeRow2,
    paidRow,
    simpleRow('Available Balance', 'الرصيد المتاح', d.available_balance),
    simpleRow('Annual Leave Request Date:', 'تاريخ طلب الاجازة', fmtDate(d.request_date)),
    simpleRow('Annual Leave start Date:',   'تاريخ بداية الأجازه', fmtDate(d.start_date)),
    simpleRow('Annual Leave End Date:',     'تاريخ انتهاء الأجازه', fmtDate(d.end_date)),
    simpleRow('The purpose:',               'الغرض', d.purpose),
    ...sigRows('Employee Name / signature:',              'إسم الموظف / توقيعه',           sigNames.employee),
    ...sigRows('Alternate Employee name / signature:',    'إسم الموظف البديل / توقيعه',    sigNames.alternate),
    ...sigRows('Direct manager Name / signature',         'المدير المباشر / التوقيع',       sigNames.direct),
    ...sigRows('Human Resource',                          'موظف الموارد البشريه',           sigNames.hr),
    ...sigRows('Depot Manager Signature',                 'توقيع مدير الموقع',              sigNames.depot),
  ]

  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [LBL_W, CHK_W, TXT_W, CHK_W, TXT_W, CHK_W, TXT_W, CHK_W, REST],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: mainRows,
  })

  // ── Footer ─────────────────────────────────────────────────────
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
            children: [new Paragraph({ children: [
              new TextRun({ text: 'Document No: ', bold: true, size: 16, font: 'Arial' }),
              new TextRun({ text: 'SRS-HR-P02-F01', bold: true, size: 16, font: 'Arial', color: 'CC0000' }),
              new TextRun({ text: '  |  ', bold: true, size: 16, font: 'Arial' }),
              new TextRun({ text: 'Rev.: 03', bold: true, size: 16, font: 'Arial', color: 'CC0000' }),
              new TextRun({ text: '  |  Rev. Date: 06/05/2026', bold: true, size: 16, font: 'Arial' }),
            ] })],
          }),
          new TableCell({
            width: { size: 1500, type: WidthType.DXA },
            borders: { top: BORDER, bottom: NO_BORDERS.bottom, left: NO_BORDERS.left, right: NO_BORDERS.right },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Page 1 of 1', bold: true, size: 16, font: 'Arial' })] })],
          }),
        ],
      }),
    ],
  })

  // ── Document assembly ──────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: 1800, right: MARGIN, bottom: 1200, left: MARGIN, header: 360, footer: 360 },
          },
        },
        headers: {
          default: new Header({ children: [headerTable] }),
        },
        footers: {
          default: new Footer({ children: [footerTable] }),
        },
        children: [
          trackingRow,
          purposeHeaderLine,
          purposeEn,
          purposeAr,
          detailsHead,
          mainTable,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `LRF-${d.tracking_no || 'export'}.docx`)
}
