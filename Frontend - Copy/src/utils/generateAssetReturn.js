import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { saveAs } from 'file-saver'

const PAGE_W = 12240
const PAGE_H = 15840
const PAGE_MARGIN = 850
const CONTENT_W = PAGE_W - 2040

const BORDER = { style: BorderStyle.SINGLE, size: 8, color: '000000' }
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const EMPTY_ASSET_ROWS = 1

function allBorders(border = BORDER) {
  return {
    top: border,
    bottom: border,
    left: border,
    right: border,
  }
}

function tableBorders(outer = BORDER, inner = THIN_BORDER) {
  return {
    top: outer,
    bottom: outer,
    left: outer,
    right: outer,
    insideHorizontal: inner,
    insideVertical: inner,
  }
}

function text(textValue, options = {}) {
  return new TextRun({
    text: textValue ?? '',
    bold: options.bold ?? false,
    size: options.size ?? 20,
    font: options.font ?? 'Arial',
    rightToLeft: options.rtl ?? false,
    break: options.break ?? 0,
  })
}

function paragraph(children, options = {}) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.LEFT,
    bidirectional: options.rtl ?? false,
    spacing: options.spacing ?? { before: 0, after: 0 },
    children: Array.isArray(children) ? children : [children],
  })
}

function cell(children, options = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    columnSpan: options.columnSpan,
    verticalAlign: options.verticalAlign ?? VerticalAlign.CENTER,
    borders: options.borders ?? allBorders(),
    margins: options.margins ?? { top: 70, bottom: 70, left: 110, right: 110 },
    children: Array.isArray(children) ? children : [children],
  })
}

function sanitizeFileName(value) {
  return (value || 'employee')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

function formatDate(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleDateString('en-GB')
}

function makeBlankLine(length = 34) {
  return '_'.repeat(length)
}

function flattenAssets(clearanceData) {
  return (clearanceData?.by_department || [])
    .flatMap((group) => group.assets || [])
    .filter((asset) => asset.status !== 'Returned')
}

function normalizeClearance(clearanceData) {
  if (!clearanceData) return {}
  return clearanceData.data && !clearanceData.by_department
    ? clearanceData.data
    : clearanceData
}

async function loadLogo() {
  try {
    const response = await fetch('/asset-return-logo.png')
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

function employeeTable(employee) {
  const rows = [
    ['Employee name', 'اسم الموظف', employee?.name || ''],
    ['Job tittle', 'المسمى الوظيفي', employee?.position || employee?.job_title || ''],
    ['Department', 'الادارة', employee?.department || ''],
  ]

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [3394, 6786],
    borders: tableBorders(),
    rows: rows.map(([english, arabic, value]) => new TableRow({
      children: [
        cell([
          paragraph([text(english, { bold: true })]),
          paragraph([text(arabic, { bold: true, rtl: true })], { align: AlignmentType.RIGHT, rtl: true }),
        ], { width: 3394 }),
        cell(paragraph(text(value)), { width: 6786 }),
      ],
    })),
  })
}

function assetTable(assets) {
  const rows = assets.length > 0
    ? assets.map((asset, index) => new TableRow({
        children: [
          cell(paragraph(text(String(index + 1))), { width: 611 }),
          cell(paragraph(text(asset.asset_name || asset.asset_description || '')), { width: 3258 }),
          cell(paragraph(text(asset.asset_code || '')), { width: 1832 }),
          cell(paragraph(text(asset.serial_number || asset.asset_serial_no || asset.asset_code || '')), { width: 2647 }),
          cell(paragraph(text(asset.notes || asset.condition || '')), { width: 1832 }),
        ],
      }))
    : Array.from({ length: EMPTY_ASSET_ROWS }, () => new TableRow({
        children: [
          cell(paragraph(text('')), { width: 611 }),
          cell(paragraph(text('')), { width: 3258 }),
          cell(paragraph(text('')), { width: 1832 }),
          cell(paragraph(text('')), { width: 2647 }),
          cell(paragraph(text('')), { width: 1832 }),
        ],
      }))

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [611, 3258, 1832, 2647, 1832],
    borders: tableBorders(),
    rows: [
      new TableRow({
        children: [
          cell(paragraph(text('#', { bold: true }), { align: AlignmentType.CENTER }), { width: 611 }),
          cell(paragraph(text('Asset Description', { bold: true }), { align: AlignmentType.CENTER }), { width: 3258 }),
          cell(paragraph(text('Asset Code', { bold: true }), { align: AlignmentType.CENTER }), { width: 1832 }),
          cell(paragraph(text('Asset Serial No.', { bold: true }), { align: AlignmentType.CENTER }), { width: 2647 }),
          cell(paragraph(text('Remarks', { bold: true }), { align: AlignmentType.CENTER }), { width: 1832 }),
        ],
      }),
      ...rows,
    ],
  })
}

function signatureTable() {
  const headerRow = ['Employee (Receiver)', 'Material Controller', 'Manager']
  const regularCell = (value) => cell(paragraph(text(value)), { width: 3394, verticalAlign: VerticalAlign.TOP })

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [3394, 3393, 3393],
    borders: tableBorders(),
    rows: [
      new TableRow({
        children: headerRow.map((title) =>
          cell(paragraph(text(title, { bold: true }), { align: AlignmentType.CENTER }), { width: 3394 })
        ),
      }),
      new TableRow({
        children: [regularCell('Name/'), regularCell('Name/'), regularCell('Name/')],
      }),
      new TableRow({
        children: [
          cell(paragraph(text('Signature/')), { width: 3394, verticalAlign: VerticalAlign.TOP, margins: { top: 100, bottom: 620, left: 110, right: 110 } }),
          cell(paragraph(text('Signature/')), { width: 3393, verticalAlign: VerticalAlign.TOP, margins: { top: 100, bottom: 620, left: 110, right: 110 } }),
          cell(paragraph(text('Signature/')), { width: 3393, verticalAlign: VerticalAlign.TOP, margins: { top: 100, bottom: 620, left: 110, right: 110 } }),
        ],
      }),
      new TableRow({
        children: [regularCell('Date/'), regularCell('Date/'), regularCell('Date/')],
      }),
    ],
  })
}

function footerTable() {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [CONTENT_W - 1700, 1700],
    borders: {
      top: BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          cell(paragraph(text('Document No: SRS HR P05 F05|Rev.: 02|Rev. Date: 04/05/2025', { bold: true, size: 17 })), {
            width: CONTENT_W - 1700,
            borders: { top: BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
          }),
          cell(paragraph(text('| Page 1 of 1', { bold: true, size: 17 }), { align: AlignmentType.RIGHT }), {
            width: 1700,
            borders: { top: BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            margins: { top: 60, bottom: 0, left: 0, right: 0 },
          }),
        ],
      }),
    ],
  })
}

export async function generateAssetReturnReport({ employee, clearanceData }) {
  const normalizedClearance = normalizeClearance(clearanceData)
  const activeAssets = flattenAssets(normalizedClearance)
  const logoBytes = await loadLogo()
  const today = formatDate(new Date())

  const header = new Header({
    children: [
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [2496, 7704],
        borders: {
          top: NO_BORDER,
          bottom: BORDER,
          left: NO_BORDER,
          right: NO_BORDER,
          insideHorizontal: BORDER,
          insideVertical: BORDER,
        },
        rows: [
          new TableRow({
            children: [
              cell(
                logoBytes
                  ? paragraph(new ImageRun({ data: logoBytes, transformation: { width: 108, height: 34 } }), { align: AlignmentType.LEFT })
                  : paragraph(text('Rotem SRS', { bold: true })),
                {
                  width: 2496,
                  borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: BORDER },
                }
              ),
              cell([
                paragraph(text('Asset Return Form', { bold: true, size: 36 }), { align: AlignmentType.CENTER }),
                paragraph(text('نموذج رد عهده', { size: 24, rtl: true }), { align: AlignmentType.CENTER, rtl: true }),
              ], {
                width: 7704,
                borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
              }),
            ],
          }),
        ],
      }),
    ],
  })

  const footer = new Footer({
    children: [footerTable()],
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: PAGE_MARGIN, right: 1020, bottom: PAGE_MARGIN, left: 1020, header: 720, footer: 720 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: [
          paragraph(text('Tracking No:  ', { bold: true, size: 21 }), { spacing: { before: 120, after: 100 } }),
          paragraph([
            text('■ Document purpose: ', { bold: true, size: 24 }),
            text('الغرض من المستند', { bold: true, size: 24, rtl: true }),
          ], { spacing: { before: 0, after: 60 } }),
          paragraph(text(
            'This form should be used by employees to return company property to the organization. The form should include the employee`s name, date, asset name, asset ID, Serial number, Condition of asset, and any additional notes. The employee and recipient should sign the form to acknowledge that the asset has been returned.',
            { size: 19 }
          ), { spacing: { before: 0, after: 60 } }),
          paragraph(text(
            'يجب استخدام هذا النموذج من قبل الموظفين لإعادة ممتلكات الشركة إلى الشركه. يجب أن يتضمن النموذج اسم الموظف وتاريخه واسم الأصل ومعرف الأصل والرقم التسلسلي وحالة الأصل وأي ملاحظات إضافية. يجب على الموظف والمستلم التوقيع على النموذج للإقرار بأن الأصل قد تم إرجاعه..',
            { size: 19, rtl: true }
          ), { rtl: true, align: AlignmentType.RIGHT, spacing: { before: 0, after: 140 } }),
          paragraph(text('■ Employee Details:', { bold: true, size: 24 }), { spacing: { before: 0, after: 60 } }),
          employeeTable(employee),
          paragraph(text(''), { spacing: { before: 120, after: 0 } }),
          paragraph(text('■ Asset Details:', { bold: true, size: 24 }), { spacing: { before: 0, after: 60 } }),
          paragraph([
            text('I, ', { size: 19 }),
            text(employee?.name || makeBlankLine(20), { size: 19 }),
            text(' hereby acknowledge that I have handed over the below mentioned assets to Material Controller "Referred to Receiver". I understand that this asset belongs to Rotem SRS Egypt and was under my possession. I hereby assure that I had taken care of the assets of the company to the best possible extend.', { size: 19 }),
          ], { spacing: { before: 0, after: 60 } }),
          paragraph([
            text('أقرأنا ', { size: 19, rtl: true }),
            text(employee?.name || makeBlankLine(20), { size: 19, rtl: true }),
            text(' بموجب هذا بأنني قمت بتسليم الأصول المذكورة أدناه إلى مراقب المواد "المحال إلى المستلم". أفهم أن هذه الأصول تخص روتم إس آر إس إيجيبت وكانت تحت حوزتي. أوكد بموجب هذا أنني اعتنيت بأصول الشركة إلى أقصى حد ممكن..', { size: 19, rtl: true }),
          ], { rtl: true, align: AlignmentType.RIGHT, spacing: { before: 0, after: 90 } }),
          assetTable(activeAssets),
          paragraph(text('■ Reason Of Receiving:', { bold: true, size: 24 }), { spacing: { before: 120, after: 60 } }),
          signatureTable(),
          paragraph(text(`Generated on ${today}`, { size: 16 }), { spacing: { before: 120, after: 0 } }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `Asset_Return_${sanitizeFileName(employee?.name)}.docx`)
}
