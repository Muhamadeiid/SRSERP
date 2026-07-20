import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeightRule, TableLayoutType, ImageRun, Header, Footer,
} from 'docx'
import { saveAs } from 'file-saver'
import { getEmployee, getEmployees } from '../services/employeeService'

// Convert base64 PNG string → Uint8Array for docx ImageRun
function base64ToBytes(b64) {
  const raw = atob(b64.replace(/^data:image\/\w+;base64,/, ''))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Put the signature on a clean canvas while preserving its original aspect
// ratio. Wide handwritten signatures use the available cell width instead of
// being squeezed into a square.
async function signatureToCleanImage(value) {
  if (!value) return null
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = value
    })
    const sourceRatio = Math.max(0.25, Math.min(8, img.width / img.height))
    const canvasWidth = 600
    const canvasHeight = Math.max(100, Math.round(canvasWidth / sourceRatio))
    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)

    // Fill the usable signature cell area (after its left/right padding) while
    // still keeping the handwritten signature's natural proportions.
    const maxWidth = 160
    const maxHeight = 48
    let width = maxWidth
    let height = width / sourceRatio
    if (height > maxHeight) {
      height = maxHeight
      width = height * sourceRatio
    }
    return {
      data: base64ToBytes(canvas.toDataURL('image/png')),
      type: 'png',
      width: Math.round(width),
      height: Math.round(height),
    }
  } catch {
    return null
  }
}

async function loadLogoBytes() {
  try {
    const res = await fetch('/logo.png')
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

// ── constants ──────────────────────────────────────────────────────────────
const PAGE_W   = 11906
const PAGE_H   = 16838
const MARGIN   = 500
const CONTENT_W = PAGE_W - MARGIN * 2

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const FORM_BORDER = { style: BorderStyle.SINGLE, size: 8, color: '000000' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDERS  = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

function normalizeOTRData(raw) {
  const employee = raw?.employee || raw?.employee_data || {}
  const directManager = employee?.direct_manager || employee?.directManager || null
  const department = raw?.department_label || raw?.department || employee.department_label || employee.department || ''

  return {
    ...raw,
    employee_name: raw?.employee_name || employee?.name || '',
    job_title: raw?.job_title || raw?.position || employee?.position || employee?.job_title || '',
    department: raw?.department || employee?.department || '',
    department_label: department,
    tracking_no: raw?.tracking_no || raw?.trackingNo || '',
    ot_date: raw?.ot_date || raw?.date || raw?.request_date || '',
    start_time: raw?.start_time || raw?.from_time || '',
    end_time: raw?.end_time || raw?.to_time || '',
    hours: raw?.hours ?? raw?.overtime_hours ?? '',
    explanation: raw?.explanation || raw?.purpose || raw?.reason || '',
    overtime_results: raw?.overtime_results || raw?.results || '',
    manager_signature: raw?.manager_signature || employee?.manager_signature || null,
    hr_signature: raw?.hr_signature || null,
    depot_signature: raw?.depot_signature || null,
    direct_manager_name: raw?.direct_manager_name || directManager?.name || raw?.manager_approver?.name || raw?.managerApprover?.name || raw?.manager_name || '',
    hr_name: raw?.hr_name || raw?.hr_approver?.name || 'Hazem Khaled',
    depot_manager_name: raw?.depot_manager_name || raw?.approver?.name || 'Mohamed Awaad',
    manager_approved_at: raw?.manager_approved_at || '',
    approved_at: raw?.approved_at || '',
    status: raw?.status || 'pending',
    created_at: raw?.created_at || '',
    reject_reason: raw?.reject_reason || raw?.reason || '',
    reschedule_reason: raw?.reschedule_reason || '',
  }
}

async function enrichOTRData(raw) {
  const data = normalizeOTRData(raw)
  const signatureParties = raw?.signature_parties || raw?.signatureParties || {}

  let employee = raw?.employee || raw?.employee_data || null
  if (!employee && raw?.employee_id) {
    try {
      employee = await getEmployee(raw.employee_id)
    } catch {
      employee = null
    }
  }

  let employees = []
  try {
    const res = await getEmployees({ per_page: 500 })
    employees = Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
  } catch {
    employees = []
  }

  const firstByPosition = (matcher) =>
    employees.find((emp) => matcher((emp?.position || '').toLowerCase())) || null

  const hrEmployee = firstByPosition((position) => position.includes('hr'))
  const depotEmployee = firstByPosition((position) => position.includes('depot manager'))
  const workforceEmployee = employees.find((emp) => emp?.id === (employee?.id || raw?.employee_id)) || employee
  const directManager = signatureParties?.direct_manager || signatureParties?.directManager || workforceEmployee?.direct_manager || workforceEmployee?.directManager || employees.find((emp) => emp?.id === workforceEmployee?.direct_manager_id) || null
  const hrParty = signatureParties?.hr || null
  const depotParty = signatureParties?.depot_manager || signatureParties?.depotManager || null
  const managerApprover = raw?.manager_approver || raw?.managerApprover || null
  const depotApprover = raw?.approver || null
  const managerIsDepot = directManager?.role === 'depot_manager'
    || directManager?.user?.role === 'depot_manager'

  return {
    ...data,
    manager_is_depot_manager: Boolean(managerIsDepot),
    direct_manager_name: managerIsDepot ? '' : (data.direct_manager_name || directManager?.name || managerApprover?.name || ''),
    manager_signature: !managerIsDepot && ['manager_approved', 'hr_approved', 'approved'].includes(data.status)
      ? (directManager?.e_signature || data.manager_signature || raw?.manager_approver?.e_signature || raw?.managerApprover?.e_signature || null)
      : null,
    hr_name: hrParty?.name || data.hr_name || hrEmployee?.name || '',
    hr_signature: ['hr_approved', 'approved'].includes(data.status)
      ? (hrParty?.e_signature || data.hr_signature || hrEmployee?.e_signature || null)
      : null,
    depot_manager_name: depotParty?.name || data.depot_manager_name || depotEmployee?.name || '',
    depot_signature: data.status === 'approved'
      ? (depotParty?.e_signature || data.depot_signature || depotEmployee?.e_signature || null)
      : null,
  }
}

const OTR_RESULT_OPTIONS = ['Task is done', 'Task is still pending']

function overtimeResultParagraphs(value) {
  return [para(value || '', {
    size: 18,
    bold: OTR_RESULT_OPTIONS.includes(value),
    align: AlignmentType.CENTER,
  })]
}

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, ' ')  // e.g. "05 Apr 2026"
}

// Simple bilingual paragraph helper: EN bold on top, AR bold below
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

// Single text paragraph
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

// Table cell helper
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

// ── main export ────────────────────────────────────────────────────────────
export async function generateOTR(d, { download = true } = {}) {
  const data = await enrichOTRData(d)
  const logoBytes = await loadLogoBytes()

  // Exact Leave Request header geometry: bottom rule only + logo/title divider.
  const HDR_ONLY_BOTTOM = {
    top: NO_BORDERS.top,
    bottom: FORM_BORDER,
    left: NO_BORDERS.left,
    right: NO_BORDERS.right,
  }
  const HDR_LOGO_CELL = {
    top: NO_BORDERS.top,
    bottom: FORM_BORDER,
    left: NO_BORDERS.left,
    right: FORM_BORDER,
  }
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [2400, CONTENT_W - 2400],
    layout: TableLayoutType.FIXED,
    borders: {
      top: NO_BORDERS.top,
      bottom: FORM_BORDER,
      left: NO_BORDERS.left,
      right: NO_BORDERS.right,
      insideHorizontal: FORM_BORDER,
      insideVertical: FORM_BORDER,
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
              : [para('Rotem SRS Egypt', { bold: true, size: 20, align: AlignmentType.CENTER })],
            { width: 2400, vAlign: VerticalAlign.CENTER, borders: HDR_LOGO_CELL }
          ),
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40, before: 0 },
                children: [new TextRun({ text: 'Overtime Request Form', bold: true, size: 30, font: 'Arial' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, before: 0 },
                children: [new TextRun({ text: 'إذن عمل ساعات إضافيه', bold: true, size: 24, font: 'Arial', rightToLeft: true })],
              }),
            ],
            { width: CONTENT_W - 2400, vAlign: VerticalAlign.CENTER, borders: HDR_ONLY_BOTTOM }
          ),
        ],
      }),
    ],
  })

  // ── Tracking No paragraph ───────────────────────────────────────────────
  const trackingPara = new Paragraph({
    spacing: { before: 120, after: 80 },
    children: [
      new TextRun({
        text: 'Tracking No: ',
        bold: true,
        size: 22,
        font: 'Arial',
      }),
      new TextRun({
        text: data.tracking_no || '__________',
        bold: !!data.tracking_no,
        size: 22,
        font: 'Arial',
        color: data.tracking_no ? '000000' : '888888',
      }),
    ],
  })

  // The source form uses a 16-unit grid so each row can merge cells differently.
  const gridUnit = Math.floor(CONTENT_W / 16)
  const GRID = [...Array(15).fill(gridUnit), CONTENT_W - gridUnit * 15]
  const spanWidth = units => units === 16 ? CONTENT_W : Math.round((CONTENT_W * units) / 16)

  const spacerRow = () => new TableRow({
    height: { value: 220, rule: HeightRule.EXACT },
    children: [cell([para('', { size: 2 })], { width: CONTENT_W, colspan: 16 })],
  })

  // Row 1: source-form cream section header
  const row1 = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'Overtime Request', bold: true, size: 22, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
    
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'طلب ساعات اضافيه', bold: true, size: 20, font: 'Arial', rightToLeft: true })],
          }),
        ],
        { width: CONTENT_W, colspan: 16, shading: 'FFF2CC', vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 2: Employee Name | value | Date | value
  const row2 = new TableRow({
    children: [
      cell(biPara('Employee Name', 'إسم الموظف'), { width: spanWidth(3), colspan: 3, shading: 'E2F0D9' }),
      cell([para(data.employee_name || '', { size: 20 })], { width: spanWidth(5), colspan: 5 }),
      cell(biPara('Date', 'التاريخ'), { width: spanWidth(3), colspan: 3, shading: 'E2F0D9' }),
      cell([para(fmtDate(data.ot_date), { size: 20 })], { width: spanWidth(5), colspan: 5 }),
    ],
  })

  // Row 3: Title | value | Department | value
  const row3 = new TableRow({
    children: [
      cell(biPara('Title', 'المسمى الوظيفي'), { width: spanWidth(3), colspan: 3, shading: 'E2F0D9' }),
      cell([para(data.job_title || '', { size: 20 })], { width: spanWidth(5), colspan: 5 }),
      cell(biPara('Department', 'الإداره'), { width: spanWidth(3), colspan: 3, shading: 'E2F0D9' }),
      cell([para(data.department_label || data.department || '', { size: 20 })], { width: spanWidth(5), colspan: 5 }),
    ],
  })

  // Row 4: source grid is 5/16, 3/16, 5/16, 3/16.
  const timingCell = (enText, arText, value, units, shaded = false) => cell(
    [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 30, before: 0 },
        children: [new TextRun({ text: enText, bold: true, size: 17, font: 'Arial' })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,

        spacing: { after: 40, before: 0 },
        children: [new TextRun({ text: arText, bold: true, size: 16, font: 'Arial', rightToLeft: true })],
      }),
      ...(value !== undefined ? [para(value, { bold: true, size: 20 })] : []),
    ],
    {
      width: spanWidth(units),
      colspan: units,
      shading: shaded ? 'E2F0D9' : undefined,
      vAlign: VerticalAlign.TOP,
    }
  )

  const row4 = new TableRow({
    children: [
      timingCell('Overtime needed from', 'العمل الإضافي من :', data.start_time || '', 5, true),
      timingCell('To', 'إلي', data.end_time || '', 3),
      timingCell('Total overtime not to exceed', 'إجمالي ساعات العمل لا يتخطي', undefined, 5, true),
      timingCell('Hours', 'ساعه', data.hours != null ? String(data.hours) : '', 3),
    ],
  })

  // Row 5: Explanation label row — EN left, AR right on separate line
  const row5 = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'Detailed Explanation why over time is required:', bold: true, size: 18, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
    
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'تفسير سبب إحتياج العمل لساعات إضافيه', bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
        ],
        { width: CONTENT_W, colspan: 16, shading: 'E2F0D9', vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Keep both free-text boxes the same height while fitting the whole form on one page.
  const row6 = new TableRow({
    height: { value: 1860, rule: HeightRule.ATLEAST },
    children: [
      cell(
        [para(data.explanation || '', { size: 18, align: AlignmentType.CENTER })],
        { width: CONTENT_W, colspan: 16, vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 7: Overtime Results label — EN left, AR right on separate line
  const row7 = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'Overtime Results', bold: true, size: 18, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
    
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'نتائج العمل لساعات إضافيه', bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
        ],
        { width: CONTENT_W, colspan: 16, shading: 'E2F0D9', vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 8: results body (tall)
  const row8 = new TableRow({
    height: { value: 1860, rule: HeightRule.ATLEAST },
    children: [
      cell(
        overtimeResultParagraphs(data.overtime_results || ''),
        { width: CONTENT_W, colspan: 16, vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  const [managerSignatureImage, hrSignatureImage, depotSignatureImage] = await Promise.all([
    signatureToCleanImage(data.manager_is_depot_manager ? null : data.manager_signature),
    signatureToCleanImage(data.hr_signature),
    signatureToCleanImage(data.depot_signature),
  ])

  // Four separate cells exactly as the approved signature-table layout.
  // Names are deliberately omitted: the E-Signature is the identity mark.
  const sigRow = (enLabel, arLabel, signatureImage, dateValue) => {
    const labelChildren = [
      new Paragraph({ spacing: { after: 0, before: 0 }, children: [new TextRun({ text: enLabel, bold: true, size: 18, font: 'Arial' })] }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0, before: 0 },
        children: [new TextRun({ text: arLabel, bold: true, size: 16, font: 'Arial', rightToLeft: true })],
      }),
    ]
    const signatureChildren = []

    if (signatureImage) {
      try {
        signatureChildren.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0, before: 0 },
          children: [new ImageRun({
            data: signatureImage.data,
            type: signatureImage.type,
            transformation: { width: signatureImage.width, height: signatureImage.height },
          })],
        }))
      } catch (_) {
        // Leave the slot blank when a legacy signature image is malformed.
      }
    }
    if (!signatureChildren.length) signatureChildren.push(para('', { size: 2 }))

    return new TableRow({
      height: { value: 680, rule: HeightRule.ATLEAST },
      children: [
        cell(labelChildren, { width: spanWidth(4), colspan: 4, shading: 'E2F0D9', vAlign: VerticalAlign.CENTER }),
        cell(signatureChildren, { width: spanWidth(4), colspan: 4, vAlign: VerticalAlign.CENTER }),
        cell(biPara('Date', 'التاريخ'), { width: spanWidth(4), colspan: 4, shading: 'E2F0D9' }),
        cell([para(dateValue || '', { size: 18 })], { width: spanWidth(4), colspan: 4 }),
      ],
    })
  }

  const row9  = sigRow(
    'Direct Manager Signature',
    'توقيع مدير المباشر',
    managerSignatureImage,
    !data.manager_is_depot_manager && data.manager_approved_at ? fmtApprovalDate(data.manager_approved_at) : ''
  )
  const row10 = sigRow('HR Signature', 'توقيع الموارد البشرية', hrSignatureImage, data.hr_approved_at ? fmtApprovalDate(data.hr_approved_at) : '')
  const row11 = sigRow('Depot Manager Signature', 'توقيع مدير الموقع', depotSignatureImage, data.approved_at ? fmtApprovalDate(data.approved_at) : '')

  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: GRID,
    layout: TableLayoutType.FIXED,
    rows: [
      row1,
      row2, spacerRow(),
      row3, spacerRow(),
      row4, spacerRow(),
      row5, row6,
      row7, row8,
      row9, row10, row11,
    ],
  })

  // ── Footer paragraph ────────────────────────────────────────────────────
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
              top: FORM_BORDER,
              bottom: NO_BORDERS.bottom,
              left: NO_BORDERS.left,
              right: NO_BORDERS.right,
            },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Document No: ', bold: true, size: 16, font: 'Arial' }),
                  new TextRun({ text: 'SRS-HR-P02-F03', bold: true, size: 16, font: 'Arial', color: 'CC0000' }),
                  new TextRun({ text: '  |  ', bold: true, size: 16, font: 'Arial' }),
                  new TextRun({ text: 'Rev.: 02', bold: true, size: 16, font: 'Arial', color: 'CC0000' }),
                  new TextRun({ text: '  |  Rev. Date: 04-May-2025', bold: true, size: 16, font: 'Arial' }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 1500, type: WidthType.DXA },
            borders: {
              top: FORM_BORDER,
              bottom: NO_BORDERS.bottom,
              left: NO_BORDERS.left,
              right: NO_BORDERS.right,
            },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: 'Page 1 of 1', bold: true, size: 16, font: 'Arial' })],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  const footer = new Footer({
    children: [footerTable],
  })

  const header = new Header({
    children: [headerTable],
  })

  // ── Document assembly ────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: 1650, right: MARGIN, bottom: 900, left: MARGIN, header: 300, footer: 760 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: [
          trackingPara,
          mainTable,
        ],
      },
    ],
  })

  const packedBlob = await Packer.toBlob(doc)
  const blob = new Blob([packedBlob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const trackingNo = String(data.tracking_no || 'export').trim()
  const fileName = /^OTR-/i.test(trackingNo) ? trackingNo : `OTR-${trackingNo}`
  if (download) saveAs(blob, `${fileName}.docx`)
  return blob
}

function fmtApprovalDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
}
