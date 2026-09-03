import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
  TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { saveAs } from 'file-saver'
import { getIncidentPicture } from '../services/incidentReportService'

const PAGE_W = 11906
const PAGE_H = 16838
const MARGIN = 720
const CONTENT_W = PAGE_W - (MARGIN * 2)
const MINT = 'E2F0D9'
const CREAM = 'FFF2CC'
const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const borders = { top: border, bottom: border, left: border, right: border }
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

const p = (text = '', options = {}) => new Paragraph({
  alignment: options.alignment || AlignmentType.LEFT,
  spacing: { before: 0, after: 0, line: 200 },
  children: [new TextRun({
    text: String(text), font: 'Arial', size: options.size || 14,
    bold: Boolean(options.bold), color: options.color || '000000',
  })],
})

const cell = (children, options = {}) => new TableCell({
  width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
  columnSpan: options.columnSpan,
  verticalAlign: VerticalAlign.CENTER,
  shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
  borders: options.borders || borders,
  margins: { top: 55, bottom: 55, left: 90, right: 90 },
  children: Array.isArray(children) ? children : [children],
})

const row = (cells, height) => new TableRow({
  height: height ? { value: height, rule: 'atLeast' } : undefined,
  children: cells,
})

const checked = value => value ? '☒' : '☐'
const date = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB') : '   /   /   '

async function bytesFromUrl(url) {
  if (!url) return null
  if (url.startsWith('data:')) {
    const response = await fetch(url)
    return new Uint8Array(await response.arrayBuffer())
  }
  const response = await fetch(url)
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
}

async function attachment(report, slot) {
  if (!report?.[`picture_${slot}_path`]) return null
  try {
    const blob = await getIncidentPicture(report.id, slot)
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = objectUrl
    })
    const scale = Math.min(315 / image.naturalWidth, 155 / image.naturalHeight, 1)
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(image, 0, 0, width, height)
    URL.revokeObjectURL(objectUrl)
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    return { bytes: new Uint8Array(await png.arrayBuffer()), width, height }
  } catch { return null }
}

function signatureCell(user, width, columnSpan = 1) {
  const children = []
  if (user?.signatureBytes) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
      children: [new ImageRun({ data: user.signatureBytes, type: 'png', transformation: { width: 72, height: 24 } })],
    }))
  } else children.push(p('Sign:', { size: 13 }))
  return cell(children, { width, columnSpan })
}

export async function generateIncidentReport(report) {
  const requester = report.requester_employee || report.requester
  const [logo, picture1, picture2] = await Promise.all([
    fetch('/logo.png').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)).catch(() => null),
    attachment(report, 1), attachment(report, 2),
  ])
  for (const relation of ['requester_employee', 'requester', 'follow_up_user', 'hr_generalist', 'depot_manager']) {
    const user = report?.[relation]
    if (user?.e_signature) user.signatureBytes = await bytesFromUrl(user.e_signature)
  }

  const header = new Header({ children: [new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2050, CONTENT_W - 2050], layout: TableLayoutType.FIXED,
    rows: [row([
      cell(logo ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 92, height: 34 } })] }) : p('Rotem SRS', { bold: true }), { width: 2050, borders: { top: none, left: none, bottom: border, right: border } }),
      cell(p('Management Conflict Incident Report', { bold: true, size: 20, color: 'A6A6A6', alignment: AlignmentType.CENTER }), { width: CONTENT_W - 2050, borders: { top: none, left: none, bottom: border, right: none } }),
    ], 600)],
  })] })

  const pictureCell = asset => cell(asset
    ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: asset.bytes, type: 'png', transformation: { width: asset.width, height: asset.height } })] })
    : p('', { alignment: AlignmentType.CENTER }), { width: CONTENT_W / 2, columnSpan: 3 })

  const classificationChoices = new Paragraph({
    spacing: { before: 0, after: 0, line: 200 },
    children: [
      new TextRun({ text: `${checked(report.classification === 'ethical')}  Ethical`, font: 'Arial', size: 14 }),
      new TextRun({ text: `                                      ${checked(report.classification === 'process_workflow')}  Process/Workflow`, font: 'Arial', size: 14 }),
      new TextRun({ break: 1, text: `${checked(report.classification === 'other')}  Other: ${report.classification_other || ''}`, font: 'Arial', size: 14 }),
    ],
  })

  const main = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [1800, 900, 2300, 1900, 1600, 1966], layout: TableLayoutType.FIXED,
    rows: [
      row([cell(p('Classification of Incident', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 3, fill: CREAM }), cell(p('Concerned Area/department', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 3, fill: CREAM })]),
      row([
        cell(classificationChoices, { columnSpan: 3 }),
        cell(p(report.concerned_area_department || '', { alignment: AlignmentType.CENTER }), { columnSpan: 3 }),
      ], 820),
      row([cell(p('(1) Description of the Incident (mention the reference and evidence)', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 6, fill: MINT })]),
      row([cell(p(report.description || '', { alignment: AlignmentType.CENTER }), { columnSpan: 6 })], 2500),
      row([
        cell(p('Requester', { bold: true })), cell(p('Name', { bold: true })), cell(p(requester?.name || '')),
        signatureCell(requester, 3500, 2), cell(p(`Date:  ${date(report.report_date)}`, { size: 13 })),
      ], 460),
      row([cell(p('Picture 1 (If Needed)', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 3, fill: MINT }), cell(p('Picture 2 (If Needed)', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 3, fill: MINT })]),
      row([pictureCell(picture1), pictureCell(picture2)], 2800),
      row([cell(p('(2) Investigation', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 6, fill: MINT })]),
      row([
        cell([p(`${checked(report.needs_investigation === true)}  Need Investigation`), p(`${checked(report.needs_investigation === false)}  Doesn’t Need Investigation`)], { columnSpan: 3 }),
        cell([p('Notes:', { bold: true }), p(report.investigation_notes || '', { alignment: AlignmentType.CENTER })], { columnSpan: 3 }),
      ], 1400),
      row([cell(p('Follow up by', { bold: true })), cell(p(report.follow_up_user?.name || ''), { columnSpan: 2 }), signatureCell(report.follow_up_user, 3500, 2), cell(p(`Date:  ${date(report.follow_up_date)}`, { size: 13 }))], 460),
      row([cell(p('(3) Warning Letter', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 6, fill: MINT })]),
      row([cell([
        p(`Frequency/severity of the case: ${report.case_frequency_severity || ''}`),
        p(`${checked(report.warning_letter_required === false)} No need for Warning Letter          ${checked(report.warning_letter_required === true)} Warning Letter No ${report.warning_letter_no || '____________'}`),
      ], { columnSpan: 6 })], 900),
      row([cell(p('HR Generalist', { bold: true }), { fill: MINT }), cell(p(report.hr_generalist?.name || ''), { columnSpan: 2 }), signatureCell(report.hr_generalist, 3500, 2), cell(p(`Date:  ${date(report.hr_signed_at)}`, { size: 13 }))], 460),
      row([cell(p('Depot Manager', { bold: true }), { fill: MINT }), cell(p(report.depot_manager?.name || ''), { columnSpan: 2 }), signatureCell(report.depot_manager, 3500, 2), cell(p(`Date:  ${date(report.depot_manager_signed_at)}`, { size: 13 }))], 460),
    ],
  })

  const footer = new Footer({ children: [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: '7F7F7F' } },
      tabStops: [{ type: 'right', position: CONTENT_W }], spacing: { before: 80, after: 0 },
      children: [
        new TextRun({ text: 'Document No: ', font: 'Arial', size: 12, color: '666666' }),
        new TextRun({ text: 'SRS-HR-P04-F01', font: 'Arial', size: 12, color: 'FF0000' }),
        new TextRun({ text: ' | Rev.: ', font: 'Arial', size: 12, color: '666666' }),
        new TextRun({ text: '02', font: 'Arial', size: 12, color: 'FF0000' }),
        new TextRun({ text: ' | Rev. Date: 04/05/2025\t| Page 1 of ', font: 'Arial', size: 12, color: '666666' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 12, color: '666666' }),
      ],
    }),
  ] })

  const doc = new Document({ sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 850, right: MARGIN, bottom: 800, left: MARGIN, header: 300, footer: 300 } } },
    headers: { default: header }, footers: { default: footer },
    children: [
      new Paragraph({ spacing: { before: 0, after: 80 }, children: [
        new TextRun({ text: `Date:  ${date(report.report_date)}`, font: 'Arial', size: 13 }),
        new TextRun({ text: `                                Management Conflict Incident Report No. ( ${report.report_no || ''} )`, font: 'Arial', size: 13, bold: true }),
      ] }),
      main,
    ],
  }] })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${report.report_no || 'Incident-Report'}.docx`)
}
