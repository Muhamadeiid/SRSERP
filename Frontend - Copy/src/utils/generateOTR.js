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

// ── constants ──────────────────────────────────────────────────────────────
const PAGE_W   = 11906
const PAGE_H   = 16838
const MARGIN   = 720
const CONTENT_W = PAGE_W - MARGIN * 2   // 10466

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDERS  = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

async function loadLogoBytes() {
  try {
    const res = await fetch('/asset-return-logo.png')
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

function normalizeOTRData(raw) {
  const employee = raw?.employee || raw?.employee_data || {}
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
    direct_manager_name: raw?.direct_manager_name || employee?.direct_manager?.name || raw?.manager_approver?.name || raw?.manager_name || '',
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
  const directManager = employees.find((emp) => emp?.id === workforceEmployee?.direct_manager_id) || null

  return {
    ...data,
    direct_manager_name: data.direct_manager_name || directManager?.name || '',
    manager_signature: ['manager_approved', 'approved'].includes(data.status)
      ? (data.manager_signature || directManager?.e_signature || null)
      : null,
    hr_name: hrEmployee?.name || data.hr_name,
    hr_signature: data.status === 'approved'
      ? (data.hr_signature || hrEmployee?.e_signature || null)
      : null,
    depot_manager_name: depotEmployee?.name || data.depot_manager_name,
    depot_signature: data.status === 'approved'
      ? (data.depot_signature || depotEmployee?.e_signature || null)
      : null,
  }
}

function statusLabel(status) {
  const labels = {
    pending: 'Pending',
    manager_approved: 'Manager Approved',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    rescheduled: 'Rescheduled',
  }
  return labels[status] || status || ''
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
export async function generateOTR(d) {
  const data = await enrichOTRData(d)
  const logoBytes = await loadLogoBytes()

  // ── Header table: 2 cols [1800, 8666] ──────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [1800, 8666],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          // Logo cell
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
            {
              width: 1800,
              vAlign: VerticalAlign.CENTER,
              borders: {
                top: BORDER, bottom: BORDER, left: BORDER,
                right: BORDER,
              },
            }
          ),
          // Title cell
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40, before: 0 },
                children: [
                  new TextRun({ text: 'Overtime Request Form', bold: true, size: 32, font: 'Arial' }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
        
                spacing: { after: 0, before: 0 },
                children: [
                  new TextRun({ text: 'إذن عمل ساعات إضافيه', bold: true, size: 24, font: 'Arial', rightToLeft: true }),
                ],
              }),
            ],
            { width: 8666, vAlign: VerticalAlign.CENTER }
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
        text: `Tracking No: ${data.tracking_no || 'OTR-EG1-'}`,
        bold: true,
        size: 22,
        font: 'Arial',
      }),
    ],
  })

  // ── Main table: 4 cols — From/To wider so time values fit ──────────────
  const C = [3100, 3100, 2766, 1500]  // summing to 10466

  // Row 1: section header (colspan 4, green bg)
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
        { width: CONTENT_W, colspan: 4, shading: 'D6ECDA', vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 2: Employee Name | value | Date | value
  const row2 = new TableRow({
    children: [
      cell(biPara('Employee Name', 'إسم الموظف'),        { width: C[0] }),
      cell([para(data.employee_name || '', { size: 20 })],  { width: C[1] }),
      cell(biPara('Date', 'التاريخ'),                    { width: C[2] }),
      cell([para(fmtDate(data.ot_date), { size: 20 })],     { width: C[3] }),
    ],
  })

  // Row 3: Title | value | Department | value
  const row3 = new TableRow({
    children: [
      cell(biPara('Title', 'المسمى الوظيفي'),                          { width: C[0] }),
      cell([para(data.job_title || '', { size: 20 })],                 { width: C[1] }),
      cell(biPara('Department', 'الإداره'),                            { width: C[2] }),
      cell([para(data.department_label || data.department || '', { size: 20 })], { width: C[3] }),
    ],
  })

  // Row 4: timing row — label on top + value below in each cell
  const timingCell = (enText, arText, value) => cell(
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
    { vAlign: VerticalAlign.TOP }
  )

  const row4 = new TableRow({
    children: [
      new TableCell({
        width: { size: C[0], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'Overtime needed from', bold: true, size: 17, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
    
            spacing: { after: 40, before: 0 },
            children: [new TextRun({ text: 'العمل الإضافي من :', bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
          para(data.start_time || '', { bold: true, size: 20 }),
        ],
      }),
      new TableCell({
        width: { size: C[1], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'To', bold: true, size: 17, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
    
            spacing: { after: 40, before: 0 },
            children: [new TextRun({ text: 'إلي', bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
          para(data.end_time || '', { bold: true, size: 20 }),
        ],
      }),
      new TableCell({
        width: { size: C[2], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'Total overtime not to exceed', bold: true, size: 17, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
    
            spacing: { after: 0, before: 0 },
            children: [new TextRun({ text: 'إجمالي ساعات العمل لا يتخطي', bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: C[3], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: ALL_BORDERS,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 30, before: 0 },
            children: [new TextRun({ text: 'Hours', bold: true, size: 17, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
    
            spacing: { after: 40, before: 0 },
            children: [new TextRun({ text: 'ساعه', bold: true, size: 16, font: 'Arial', rightToLeft: true })],
          }),
          para(data.hours != null ? String(data.hours) : '', { bold: true, size: 20 }),
        ],
      }),
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
        { width: CONTENT_W, colspan: 4, vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 6: explanation value (tall ~75px = ~1350 DXA)
  const row6 = new TableRow({
    height: { value: 1800, rule: HeightRule.ATLEAST },
    children: [
      cell(
        [para(data.explanation || '', { size: 18, align: AlignmentType.CENTER })],
        { width: CONTENT_W, colspan: 4, vAlign: VerticalAlign.CENTER }
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
        { width: CONTENT_W, colspan: 4, vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Row 8: results body (tall)
  const row8 = new TableRow({
    height: { value: 1800, rule: HeightRule.ATLEAST },
    children: [
      cell(
        [para(data.overtime_results || '', { size: 18, align: AlignmentType.CENTER })],
        { width: CONTENT_W, colspan: 4, vAlign: VerticalAlign.CENTER }
      ),
    ],
  })

  // Signature row: label cell (colspan 2) | signature image cell | date cell
  const sigRow = (enLabel, arLabel, sigBase64, dateValue, heightVal = 1000) => {
    const sigChildren = []
    if (sigBase64) {
      try {
        sigChildren.push(new Paragraph({
          spacing: { after: 0, before: 0 },
          children: [new ImageRun({ data: base64ToBytes(sigBase64), transformation: { width: 120, height: 50 } })],
        }))
      } catch (_) {
        sigChildren.push(para('', { size: 18 }))
      }
    } else {
      sigChildren.push(para('', { size: 18 }))
    }

    return new TableRow({
      height: { value: heightVal, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({
          width: { size: C[0], type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: ALL_BORDERS,
          shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({
              spacing: { after: 20, before: 0 },
              children: [new TextRun({ text: enLabel, bold: true, size: 18, font: 'Arial' })],
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 60, before: 0 },
              children: [new TextRun({ text: arLabel, bold: true, size: 16, font: 'Arial', rightToLeft: true })],
            }),
          ],
        }),
        new TableCell({
          width: { size: C[1], type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: ALL_BORDERS,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: sigChildren.length ? sigChildren : [para('')],
        }),
        new TableCell({
          width: { size: C[2], type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: ALL_BORDERS,
          shading: { type: ShadingType.CLEAR, fill: 'E2F0D9', color: 'auto' },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: biPara('Date', 'التاريخ'),
        }),
        new TableCell({
          width: { size: C[3], type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: ALL_BORDERS,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [para(dateValue || '', { size: 18 })],
        }),
      ],
    })
  }

  const row9  = sigRow('Direct Manager Signature', 'توقيع مدير المباشر', data.manager_signature ?? null, data.manager_approved_at ? fmtDate(data.manager_approved_at) : '')
  const row10 = sigRow('HR Signature', 'توقيع الموارد البشرية', data.hr_signature ?? null, data.approved_at ? fmtDate(data.approved_at) : '')
  const row11 = sigRow('Depot Manager Signature', 'توقيع مدير الموقع', data.depot_signature ?? null, data.approved_at ? fmtDate(data.approved_at) : '')

  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: C,
    layout: TableLayoutType.FIXED,
    rows: [row1, row2, row3, row4, row5, row6, row7, row8, row9, row10, row11],
  })

  // ── Footer paragraph ────────────────────────────────────────────────────
  const footerLeft  = 'Document No: SRS-HR-P02-F03  |  Rev.: 02  |  Rev. Date: 04-May-2025'
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

  const header = new Header({
    children: [headerTable],
  })

  const footer = new Footer({
    children: [footerTable],
  })

  // ── Document assembly ────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 720, footer: 720 },
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

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `OTR-${data.tracking_no || 'export'}.docx`)
}
