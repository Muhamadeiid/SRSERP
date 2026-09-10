import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const META_COLUMNS = [
  ['k6', 'K6'], ['k5', 'K5'], ['c_col', 'C'], ['k19', 'K19'], ['remark', 'Remark'],
]
const SUMMARY_CODES = ['A', 'B1', 'B2', 'B3', 'G', 'C']
const argb = hex => `FF${String(hex || '#FFFFFF').replace('#', '').toUpperCase()}`
const border = { style: 'thin', color: { argb: 'FF808080' } }

export async function exportMaintenanceSchedule({ schedule, entries, meta, year, month }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SRS ERP'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(`${year}-${String(month).padStart(2, '0')}`, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }],
  })

  const trains = schedule.trains || []
  const codes = Object.fromEntries((schedule.codes || []).map(item => [item.code, item]))
  const headers = ['No', 'Date', 'D', ...trains.map(train => train.id), ...META_COLUMNS.map(([, label]) => label)]
  const title = `Preventive Maintenance Schedule - ${new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`

  sheet.mergeCells(1, 1, 1, headers.length)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF405864' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 28

  const headerRow = sheet.addRow(headers)
  headerRow.height = 25
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF405864' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: border, left: border, bottom: border, right: border }
  })

  for (let day = 1; day <= schedule.days_in_month; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dateObject = new Date(year, month - 1, day)
    const friday = dateObject.getDay() === 5
    const row = sheet.addRow([
      day,
      `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
      dateObject.toLocaleDateString('en-US', { weekday: 'short' }),
      ...trains.map(train => entries[date]?.[train.id] || ''),
      ...META_COLUMNS.map(([key]) => meta[date]?.[key] || ''),
    ])
    row.height = 22
    row.eachCell((cell, column) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: border, left: border, bottom: border, right: border }
      if (friday) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA6A6A6' } }
      if (!friday && column > 3 && column <= 3 + trains.length) {
        const code = String(cell.value || '')
        if (code) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(codes[code]?.color_hex) } }
          cell.font = { bold: true, color: { argb: ['G', '9Y', 'A+C'].includes(code) ? 'FFFFFFFF' : 'FF111111' } }
        }
      }
    })
  }

  sheet.addRow([])
  const summaryStart = sheet.rowCount + 1
  const summaryHeader = sheet.addRow(['Check', ...trains.map(train => train.id)])
  summaryHeader.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF405864' } }
    cell.alignment = { horizontal: 'center' }
    cell.border = { top: border, left: border, bottom: border, right: border }
  })

  const trainCodes = train => Array.from({ length: schedule.days_in_month }, (_, index) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
    return entries[date]?.[train.id] || ''
  })
  SUMMARY_CODES.forEach(code => {
    const row = sheet.addRow([code, ...trains.map(train => trainCodes(train).filter(value => value === code).length)])
    row.eachCell(cell => { cell.alignment = { horizontal: 'center' }; cell.border = { top: border, left: border, bottom: border, right: border } })
  })
  const totalRow = sheet.addRow(['TO', ...trains.map(train => trainCodes(train).filter(code => ['A', 'B1', 'B2', 'B3', 'G'].includes(code)).length)])
  totalRow.font = { bold: true }
  totalRow.eachCell(cell => { cell.alignment = { horizontal: 'center' }; cell.border = { top: border, left: border, bottom: border, right: border } })
  const gapRow = sheet.addRow(['Maintenance gaps', ...trains.map(train => {
    const routineDays = trainCodes(train).map((code, index) => ['A', 'B1', 'B2', 'B3', 'G'].includes(code) ? index + 1 : null).filter(Boolean)
    return routineDays.slice(1).map((day, index) => day - routineDays[index]).join(', ') || '-'
  })])
  gapRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } }
  gapRow.eachCell(cell => { cell.alignment = { horizontal: 'center' }; cell.border = { top: border, left: border, bottom: border, right: border } })

  sheet.getColumn(1).width = 7
  sheet.getColumn(2).width = 13
  sheet.getColumn(3).width = 8
  trains.forEach((_, index) => { sheet.getColumn(4 + index).width = 7 })
  META_COLUMNS.forEach(([key], index) => { sheet.getColumn(4 + trains.length + index).width = key === 'remark' ? 32 : 9 })
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + schedule.days_in_month, column: headers.length } }
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(headers.length).letter}${sheet.rowCount}`
  sheet.pageSetup.repeatRows = '1:2'
  sheet.getRow(summaryStart).height = 22

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `PM_Schedule_${year}_${String(month).padStart(2, '0')}.xlsx`)
}
