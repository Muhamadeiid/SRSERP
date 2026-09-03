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
const GREY = 'D9D9D9'
const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const borders = { top: border, bottom: border, left: border, right: border }

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
  borders,
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
  try { return new Uint8Array(await (await getIncidentPicture(report.id, slot)).arrayBuffer()) } catch { return null }
}

function signatureCell(user, signedDate, width) {
  const children = []
  if (user?.signatureBytes) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
      children: [new ImageRun({ data: user.signatureBytes, type: 'png', transformation: { width: 72, height: 24 } })],
    }))
  } else children.push(p('Sign: __________________', { size: 13 }))
  return [cell(children, { width }), cell(p(`Date:  ${date(signedDate)}`, { size: 13 }), { width: 1800 })]
}

export async function generateIncidentReport(report) {
  const [logo, picture1, picture2] = await Promise.all([
    fetch('/logo.png').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)).catch(() => null),
    attachment(report, 1), attachment(report, 2),
  ])
  for (const relation of ['requester', 'follow_up_user', 'hr_generalist', 'depot_manager']) {
    const user = report?.[relation]
    if (user?.e_signature) user.signatureBytes = await bytesFromUrl(user.e_signature)
  }

  const header = new Header({ children: [new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2050, CONTENT_W - 2050], layout: TableLayoutType.FIXED,
    rows: [row([
      cell(logo ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 92, height: 34 } })] }) : p('Rotem SRS', { bold: true }), { width: 2050 }),
      cell(p('Management Conflict Incident Report', { bold: true, size: 20, color: '7F7F7F', alignment: AlignmentType.CENTER }), { width: CONTENT_W - 2050 }),
    ], 600)],
  })] })

  const pictureCell = (bytes, label) => cell(bytes
    ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, type: 'png', transformation: { width: 270, height: 120 } })] })
    : p(label, { alignment: AlignmentType.CENTER, color: '999999' }), { width: CONTENT_W / 2, columnSpan: 2 })

  const requesterSign = signatureCell(report.requester, report.report_date, 1800)
  const followSign = signatureCell(report.follow_up_user, report.follow_up_date, 1800)
  const hrSign = signatureCell(report.hr_generalist, report.hr_signed_at, 1800)
  const depotSign = signatureCell(report.depot_manager, report.depot_manager_signed_at, 1800)

  const main = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2300, 2500, 2300, 2500], layout: TableLayoutType.FIXED,
    rows: [
      row([cell(p('Classification of Incident', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 2, fill: CREAM }), cell(p('Concerned Area/department', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 2, fill: CREAM })]),
      row([
        cell([p(`${checked(report.classification === 'ethical')}  Ethical`), p(`${checked(report.classification === 'other')}  Other: ${report.classification_other || ''}`)], { columnSpan: 1 }),
        cell(p(`${checked(report.classification === 'process_workflow')}  Process/Workflow`)),
        cell(p(report.concerned_area_department || '', { alignment: AlignmentType.CENTER }), { columnSpan: 2 }),
      ], 780),
      row([cell(p('(1) Description of the Incident (mention the reference and evidence)', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 4, fill: MINT })]),
      row([cell(p(report.description || ''), { columnSpan: 4 })], 1750),
      row([
        cell(p('Requester', { bold: true })), cell(p(report.requester?.name || '')),
        ...requesterSign,
      ], 380),
      row([cell(p('Picture 1 (If Needed)', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 2, fill: MINT }), cell(p('Picture 2 (If Needed)', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 2, fill: MINT })]),
      row([pictureCell(picture1, 'No picture'), pictureCell(picture2, 'No picture')], 1900),
      row([cell(p('(2) Investigation', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 4, fill: MINT })]),
      row([
        cell([p(`${checked(report.needs_investigation === true)}  Need Investigation`), p(`${checked(report.needs_investigation === false)}  Doesn’t Need Investigation`)], { columnSpan: 2, fill: GREY }),
        cell([p('Notes:', { bold: true }), p(report.investigation_notes || '')], { columnSpan: 2 }),
      ], 920),
      row([cell(p('Follow up by', { bold: true })), cell(p(report.follow_up_user?.name || '')), ...followSign], 400),
      row([cell(p('(3) Warning Letter', { bold: true, alignment: AlignmentType.CENTER }), { columnSpan: 4, fill: MINT })]),
      row([cell([
        p(`Frequency/severity of the case: ${report.case_frequency_severity || ''}`),
        p(`${checked(report.warning_letter_required === false)} No need for Warning Letter          ${checked(report.warning_letter_required === true)} Warning Letter No ${report.warning_letter_no || '____________'}`),
      ], { columnSpan: 4 })], 760),
      row([cell(p('HR Generalist', { bold: true })), cell(p(report.hr_generalist?.name || '')), ...hrSign], 390),
      row([cell(p('Depot Manager', { bold: true })), cell(p(report.depot_manager?.name || '')), ...depotSign], 390),
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
