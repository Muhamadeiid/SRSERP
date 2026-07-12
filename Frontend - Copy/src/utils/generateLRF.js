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

// Convert a signature data URI (PNG or SVG) into { data: Uint8Array, type }
// suitable for docx ImageRun. SVGs are rasterised to PNG via a canvas.
async function signatureToImage(dataUri) {
  if (!dataUri || typeof dataUri !== 'string') return null
  try {
    // Direct PNG/JPEG data URI — decode base64 into bytes
    if (/^data:image\/(png|jpe?g);base64,/i.test(dataUri)) {
      const type = /jpe?g/i.test(dataUri) ? 'jpg' : 'png'
      const b64  = dataUri.split(',', 2)[1] || ''
      const bin  = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { data: bytes, type }
    }
    // SVG or arbitrary image URL → rasterise via <canvas>
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload  = () => resolve(el)
      el.onerror = reject
      el.src = dataUri
    })
    const w = 260, h = 60
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const pngDataUri = canvas.toDataURL('image/png')
    const b64 = pngDataUri.split(',', 2)[1] || ''
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { data: bytes, type: 'png' }
  } catch {
    return null
  }
}

function earlyDays(from, to) {
  const start = normalizeTime(from)
  const end = normalizeTime(to)
  if (!start || !end) return ''
  const [fh, fm] = start.split(':').map(Number)
  const [th, tm] = end.split(':').map(Number)
  const mins = (th * 60 + tm) - (fh * 60 + fm)
  if (mins <= 0) return ''
  return (mins / 60 / 8).toFixed(2).replace(/\.?0+$/, '')
}

function normalizeTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/^(\d{1,2})(?::?(\d{2}))?(?::\d{2})?$/)
  if (!m) return raw
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2] ?? '0', 10)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function formatBalance(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = parseFloat(value)
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.?0+$/, '') : value
}

function twoName(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
}

function lrfTwoNameData(d = {}) {
  return {
    ...d,
    employee_name: twoName(d.employee_name),
    alternate_employee_name: twoName(d.alternate_employee_name),
    direct_manager_name: twoName(d.direct_manager_name),
    manager_approver: d.manager_approver ? { ...d.manager_approver, name: twoName(d.manager_approver.name) } : d.manager_approver,
    hr_approver: d.hr_approver ? { ...d.hr_approver, name: twoName(d.hr_approver.name) } : d.hr_approver,
    approver: d.approver ? { ...d.approver, name: twoName(d.approver.name) } : d.approver,
  }
}

function depotManagerNameFor(d) {
  return d?.approver?.role === 'depot_manager'
    ? twoName(d.approver.name)
    : twoName(d?.depot_manager_name || DEPOT_MGR_FALLBACK)
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
  d = { ...lrfTwoNameData(d), available_balance: formatBalance(d.available_balance) }
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
  const DAYS_W = 820
  const REST  = CONTENT_W - LBL_W - CHK_W * 3 - TXT_W * 3 - DAYS_W

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
      cell([para(`From: ${normalizeTime(d.early_from) || ''}`, { size: 18 })], { colspan: 2 }),
      cell([para(`To: ${normalizeTime(d.early_to) || ''}`, { size: 18 })], { colspan: 2 }),
      cell([para(`( ${d.leave_type === 'early' ? earlyDays(d.early_from, d.early_to) : ''} )`, { size: 14, align: AlignmentType.CENTER })], { width: DAYS_W, margins: { top: 40, bottom: 40, left: 20, right: 20 } }),
      cell([para('Day', { size: 16, align: AlignmentType.CENTER })], { width: REST, margins: { top: 40, bottom: 40, left: 40, right: 40 } }),
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
    alternate: d.alternate_employee_name || twoName(d.alternate_employee?.name) || '',
    direct:    managerIsDepot ? '' : (d.manager_approver?.name || d.direct_manager_name || ''),
    hr:        d.hr_approver?.name || twoName(d.hr_name) || HR_OFFICER_FALLBACK,
    depot:     depotManagerNameFor(d),
  }

  // Resolve each signature slot to a docx image (PNG bytes). Runs in parallel.
  const [empSig, altSig, mgrSig, hrSig, depotSig] = await Promise.all([
    signatureToImage(d.employee?.e_signature),
    signatureToImage(d.alternate_employee?.e_signature),
    signatureToImage(managerIsDepot ? null : d.manager_signature),
    signatureToImage(d.hr_signature),
    signatureToImage(d.depot_signature),
  ])
  const sigImages = { employee: empSig, alternate: altSig, direct: mgrSig, hr: hrSig, depot: depotSig }

  const sigRows = (en, ar, name, image, mode = 'normal') => {
    const compact = mode === 'compact'
    const emptyHeight = compact ? 620 : 840
    const nameHeight = compact ? 390 : 470
    const sigW = compact ? 140 : 180
    const sigH = compact ? 32  : 44

    const sigParagraph = image
      ? new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0, before: 0 },
          children: [new ImageRun({
            data: image.data, type: image.type,
            transformation: { width: sigW, height: sigH },
          })],
        })
      : para('', { size: 18 })

    return [
    new TableRow({
      height: { value: emptyHeight, rule: HeightRule.ATLEAST },
      children: [
        cell(labelPara(en, ar), { width: LBL_W, rowspan: 2, vAlign: VerticalAlign.TOP }),
        cell([sigParagraph], { colspan: 8, vAlign: VerticalAlign.CENTER }),
      ],
    }),
    new TableRow({
      height: { value: nameHeight, rule: HeightRule.ATLEAST },
      children: [
        cell([para(name, { size: 16, italics: true, color: '888888' })], { colspan: 8 }),
      ],
    }),
  ]
  }

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
    ...sigRows('Employee Name / signature:',              'إسم الموظف / توقيعه',           sigNames.employee,  sigImages.employee,  'compact'),
    ...sigRows('Alternate Employee name / signature:',    'إسم الموظف البديل / توقيعه',    sigNames.alternate, sigImages.alternate),
    ...sigRows('Direct manager Name / signature',         'المدير المباشر / التوقيع',       sigNames.direct,    sigImages.direct),
    ...sigRows('Human Resource',                          'موظف الموارد البشريه',           sigNames.hr,        sigImages.hr),
    ...sigRows('Depot Manager Signature',                 'توقيع مدير الموقع',              sigNames.depot,     sigImages.depot),
  ]

  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [LBL_W, CHK_W, TXT_W, CHK_W, TXT_W, CHK_W, TXT_W, DAYS_W, REST],
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
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
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
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
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
            margin: { top: 1650, right: MARGIN, bottom: 900, left: MARGIN, header: 300, footer: 760 },
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
