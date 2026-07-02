import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, TableLayoutType, Header, Footer,
} from 'docx'
import { saveAs } from 'file-saver'

// ── constants ──────────────────────────────────────────────────────────────
const PAGE_W    = 11906
const PAGE_H    = 16838
const MARGIN    = 720
const CONTENT_W = PAGE_W - MARGIN * 2

const CREAM = 'FFF2CC'
const MINT  = 'E2EFDA'

const BORDER = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const BORDER_THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const ALL_BORDERS_THIN = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
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
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
function fmtDateAr(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return `${dt.getDate()} ${AR_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}

async function loadLogoBytes() {
  try {
    const res = await fetch('/logo.png')
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch { return null }
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
        size: opts.size || 20,
        font: opts.font || 'Arial',
        rightToLeft: opts.rtl || false,
        color: opts.color || '000000',
      }),
    ],
  })
}

// Label cell with EN (bold) on top-left + AR (small) below-right
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
      children: [new TextRun({ text: ar, size: 15, font: 'Arial', rightToLeft: true })],
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
    borders: opts.borders || ALL_BORDERS_THIN,
    children: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  })
}

// ── main export ────────────────────────────────────────────────────────────
export async function generateERF(d) {
  const logoBytes = await loadLogoBytes()

  // ── Header (logo + title) ──────────────────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [2400, CONTENT_W - 2400],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell(
            logoBytes
              ? [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0, before: 0 },
                  children: [new ImageRun({ data: logoBytes, type: 'png', transformation: { width: 130, height: 45 } })],
                })]
              : [
                  para('Rotem SRS', { bold: true, size: 22, align: AlignmentType.CENTER }),
                  para('EGYPT',     { bold: true, size: 18, align: AlignmentType.CENTER, color: 'CC0000' }),
                ],
            { width: 2400, vAlign: VerticalAlign.CENTER, borders: ALL_BORDERS }
          ),
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60, before: 0 },
                children: [new TextRun({ text: 'Employee Resignation Letter', bold: true, size: 30, font: 'Arial' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, before: 0 },
                children: [new TextRun({ text: 'نموذج إستقالة موظف', bold: true, size: 24, font: 'Arial', rightToLeft: true })],
              }),
            ],
            { width: CONTENT_W - 2400, vAlign: VerticalAlign.CENTER, shading: CREAM, borders: ALL_BORDERS }
          ),
        ],
      }),
    ],
  })

  // ── Tracking No ─────────────────────────────────────────────────────────
  const trackingPara = new Paragraph({
    spacing: { before: 160, after: 100 },
    children: [
      new TextRun({
        text: `Tracking No: ${d.tracking_no || 'ERF-XXX-XXX'}`,
        bold: true,
        size: 22,
        font: 'Arial',
      }),
    ],
  })

  // ── Details table (4 columns) ──────────────────────────────────────────
  const COL_LBL = Math.round(CONTENT_W * 0.22)
  const COL_VAL = Math.round(CONTENT_W * 0.28)
  const COL_LBL2 = Math.round(CONTENT_W * 0.22)
  const COL_VAL2 = CONTENT_W - COL_LBL - COL_VAL - COL_LBL2

  const titleBarRow = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'Employee Resignation Letter', bold: true, size: 22, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'نموذج إستقالة موظف', bold: true, size: 20, font: 'Arial', rightToLeft: true })],
          }),
        ],
        { colspan: 4, shading: CREAM, borders: ALL_BORDERS }
      ),
    ],
  })

  const fullNameRow = new TableRow({
    children: [
      cell(labelPara('Full name', 'الإسم بالكامل رباعي'), { width: COL_LBL, shading: MINT }),
      cell([para(d.full_name || '', { size: 20 })], { colspan: 3 }),
    ],
  })

  const deptTitleRow = new TableRow({
    children: [
      cell(labelPara('Department', 'الإدارة'), { width: COL_LBL, shading: MINT }),
      cell([para(d.department_label || d.department || '', { size: 20 })], { width: COL_VAL }),
      cell(labelPara('Current Title', 'المسمى الوظيفي'), { width: COL_LBL2, shading: MINT }),
      cell([para(d.current_title || '', { size: 20 })], { width: COL_VAL2 }),
    ],
  })

  const datesRow = new TableRow({
    children: [
      cell(labelPara('Resign Start date', 'تاريخ بداية الإستقالة'), { width: COL_LBL, shading: MINT }),
      cell([para(fmtDate(d.resign_start_date), { size: 20 })], { width: COL_VAL }),
      cell(labelPara('Last Working Date', 'تاريخ آخر يوم عمل'), { width: COL_LBL2, shading: MINT }),
      cell([para(fmtDate(d.last_working_date), { size: 20 })], { width: COL_VAL2 }),
    ],
  })

  const detailsTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COL_LBL, COL_VAL, COL_LBL2, COL_VAL2],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [titleBarRow, fullNameRow, deptTitleRow, datesRow],
  })

  // ── Letter body ─────────────────────────────────────────────────────────
  const positionText   = d.current_title || '____________________'
  const positionTextAr = d.current_title_ar || d.current_title || '____________________'
  const lastDay        = fmtDate(d.last_working_date) || '____________________'
  const lastDayAr      = fmtDateAr(d.last_working_date) || '____________________'

  const letterBody = [
    new Paragraph({
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: 'Dears,', bold: true, size: 20, font: 'Arial' })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'Please Accept this letter as formal notice of resignation from my position as ', size: 20, font: 'Arial' }),
        new TextRun({ text: positionText, bold: true, size: 20, font: 'Arial' }),
        new TextRun({ text: ' with Rotem SRS Egypt.', size: 20, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: `My last working day will be ${lastDay}.`, bold: true, size: 20, font: 'Arial' }),
        new TextRun({ text: ' It is my intention to complete all of the Shifts scheduled for me during this period.', size: 20, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text: 'I would like to use this opportunity to thank you for the mentorship and support you have Provided while working here at Rotem SRS Egypt. I wish you and the organization continued Success.',
        size: 20, font: 'Arial',
      })],
    }),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: 'السيد المدير المباشر . شركة Rotem SRS Egypt', bold: true, size: 20, font: 'Arial', rightToLeft: true })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      children: [
        new TextRun({
          text: `يرجى قبول هذه الرسالة كإشعار رسمي بالاستقالة من منصبي ك${positionTextAr} من شركة Rotem SRS Egypt وأن آخر يوم عمل لي سيكون ${lastDayAr}، وأنني إلتزم بإستكمال كافة مناوبات وأيام العمل المقررة لي خلال هذه الفترة وأن أي مخالفة لذلك بدون موافقة الشركة سيكون للشركة الحق في إحتفاظ الشركة بحقها الكامل في توقيع جزاء علي بما تراه مناسبا مع خصم قيمة أيام العمل هذه.`,
          size: 20, font: 'Arial', rightToLeft: true,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      children: [
        new TextRun({
          text: 'أود أن انتهز الفرصة وأن اتقدم بالشكر لك على التوجيه والدعم الذي قدمته لشخصي أثناء العمل مع شركة Rotem SRS Egypt وأتمنى لك وللمنظمة الاستمرار في النجاح.',
          size: 20, font: 'Arial', rightToLeft: true,
        }),
      ],
    }),
  ]

  // ── Signature table (4 stacked rows) ───────────────────────────────────
  const SIG_LBL_W = Math.round(CONTENT_W * 0.34)
  const SIG_VAL_W = CONTENT_W - SIG_LBL_W

  const sigRow = (en, ar, val = '', tall = false) => new TableRow({
    height: tall ? { value: 700, rule: HeightRule.ATLEAST } : undefined,
    children: [
      cell(labelPara(en, ar), { width: SIG_LBL_W, shading: MINT }),
      cell([para(val, { size: 20 })], { width: SIG_VAL_W }),
    ],
  })

  const sigTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [SIG_LBL_W, SIG_VAL_W],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [
      sigRow('Employee Full Name',    'إسم الموظف رباعي بالكامل', d.full_name || ''),
      sigRow('Employee Signature',    'توقيع الموظف',              '', true),
      sigRow('Depot Manager Name',    'إسم مدير الموقع',           d.depot_manager_name || ''),
      sigRow('Depot Manger Signature', 'توقيع مدير الموقع',        '', true),
    ],
  })

  // ── Declaration ────────────────────────────────────────────────────────
  const DECL_COL_W = Math.round(CONTENT_W / 4)

  const declHeaderRow = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            spacing: { after: 0, before: 0 },
            children: [
              new TextRun({ text: 'Declaration Form', bold: true, size: 22, font: 'Arial' }),
              new TextRun({ text: '\t\t\t\t\t\t\t\t\t\t\t', size: 22, font: 'Arial' }),
              new TextRun({ text: 'إقرار وتعهد', bold: true, size: 22, font: 'Arial', rightToLeft: true }),
            ],
          }),
        ],
        { colspan: 4, shading: CREAM, borders: ALL_BORDERS }
      ),
    ],
  })

  const declStmtRow = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            spacing: { after: 40, before: 0 },
            children: [new TextRun({ text: 'I certify that this resignation is executed by me voluntarily and of my own free will.', bold: true, size: 19, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'أشهد بأن هذه الإستقالة قد تم تنفيذها بمحض إرادتي وبإرادتي الحرة', bold: true, size: 19, font: 'Arial', rightToLeft: true })],
          }),
        ],
        { colspan: 4, shading: MINT, borders: ALL_BORDERS }
      ),
    ],
  })

  const declLblRow = new TableRow({
    children: [
      cell(labelPara('Name:', 'الاسم:'), { width: DECL_COL_W, shading: MINT }),
      cell(labelPara('Signature:', 'التوقيع:'), { width: DECL_COL_W, shading: MINT }),
      cell(labelPara('ID No.:', 'الرقم القومي:'), { width: DECL_COL_W, shading: MINT }),
      cell(labelPara('Date:', 'التاريخ:'), { width: DECL_COL_W, shading: MINT }),
    ],
  })

  const declValRow = new TableRow({
    height: { value: 700, rule: HeightRule.ATLEAST },
    children: [
      cell([para(d.declaration_name || d.full_name || '', { size: 20 })], { width: DECL_COL_W }),
      cell([para('', { size: 20 })], { width: DECL_COL_W }),
      cell([para(d.national_id || '', { size: 20 })], { width: DECL_COL_W }),
      cell([para(fmtDate(d.declaration_date) || fmtDate(new Date()), { size: 20 })], { width: DECL_COL_W }),
    ],
  })

  const declTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [DECL_COL_W, DECL_COL_W, DECL_COL_W, DECL_COL_W],
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [declHeaderRow, declStmtRow, declLblRow, declValRow],
  })

  // ── Page footer (real Word footer — repeats on every page) ─────────────
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
              new TextRun({ text: 'SRS-HR-P05-F01', bold: true, size: 16, font: 'Arial', color: 'CC0000' }),
              new TextRun({ text: '  |  ', bold: true, size: 16, font: 'Arial' }),
              new TextRun({ text: 'Rev.: 04', bold: true, size: 16, font: 'Arial', color: 'CC0000' }),
              new TextRun({ text: '  |  Rev. Date: 30/06/2026', bold: true, size: 16, font: 'Arial' }),
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

  // ── Document assembly ──────────────────────────────────────────────────
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
          trackingPara,
          detailsTable,
          ...letterBody,
          new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),
          sigTable,
          new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
          declTable,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `ERF-${d.tracking_no || 'export'}.docx`)
}
