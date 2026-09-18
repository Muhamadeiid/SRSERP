import { saveAs } from 'file-saver'

const date = value => value ? new Date(value).toLocaleDateString('en-GB') : ''

function styleSheet(ws) {
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5073' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  ws.getRow(1).height = 28
  ws.columns.forEach(column => { column.width = Math.max(12, Math.min(34, column.width || 18)) })
}

export async function generateProcurementRegister({ suppliers = [], budgets = [], rejected = [], log = [] }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Rotem SRS Procurement'

  const vendors = wb.addWorksheet('F03 Vendor Master List')
  vendors.addRow(['NSA Number','Supplier Name','Specialities','Interface','Successful Deliveries','Performance %','Origin','Contacts','Contact No.','Status','Next Evaluation'])
  suppliers.forEach(s => vendors.addRow([s.supplier_number,s.company_name,s.specialties,s.interface_person,s.successful_deliveries,s.latest_performance_percentage,s.origin,s.phone_email,s.contact_number,s.status,date(s.next_evaluation_at)]))
  styleSheet(vendors)

  const evaluations = wb.addWorksheet('F02 Vendor Evaluations')
  evaluations.addRow(['VE Number','Supplier','Date','C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','Grand Total','Performance %','Outcome','Notes'])
  suppliers.forEach(s => (s.evaluations || []).forEach(e => evaluations.addRow([e.evaluation_number,s.company_name,date(e.evaluation_date),...['c01','c02','c03','c04','c05','c06','c07','c08','c09','c10'].map(k=>e.ratings?.[k]),e.grand_total,e.percentage,e.outcome,e.notes])))
  styleSheet(evaluations)

  const budget = wb.addWorksheet('F05 Monthly Budget')
  budget.addRow(['Year','Month','Category','Description','Delivery Term','Stock','Average Usage','Quantity','Unit','Unit Price','VAT %','Withholding %','Total','Plan Status'])
  budgets.forEach(b => (b.items || []).forEach(i => budget.addRow([b.year,b.month,i.category,i.description,i.delivery_term,i.stock,i.average_usage,i.quantity,i.unit,i.unit_price,i.vat_rate,i.withholding_rate,i.total,b.status])))
  styleSheet(budget)

  const rejects = wb.addWorksheet('F08 Rejected Goods')
  rejects.addRow(['RGF Number','PO Number','Delivery Date','Item','Part / Batch No.','Quantity','Rejecting Date','Reason','Status','Supplier Acknowledged','Returned'])
  rejected.forEach(r => rejects.addRow([r.rejection_number,r.igi?.po?.po_number,date(r.delivery_date),r.item_description,r.part_number,r.quantity_affected,date(r.rejecting_date),r.reason,r.status,date(r.supplier_acknowledged_at),date(r.returned_at)]))
  styleSheet(rejects)

  const control = wb.addWorksheet('F09 PO PR Control')
  control.addRow(['PRF','Requester','PRF Date','Required By','PRF Status','PO','Supplier','PO Date','PO Approval','PO Status','Dispatched','Dispatched To','Dispatch Reference','IGI','Delivery','IGI Status','Payment','Payment Method','Payment Reference','Paid At'])
  log.forEach(x => control.addRow([x.prf_number,x.requester,date(x.prf_date),date(x.required_by_date),x.prf_status,x.po_number,x.supplier,date(x.po_date),x.approval_status,x.po_status,date(x.dispatched_at),x.dispatched_to,x.dispatch_reference,x.igi_number,date(x.delivery_date),x.igi_status,x.payment_status,x.payment_method,x.payment_reference,date(x.paid_at)]))
  styleSheet(control)

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `SRS-Procurement-Control-${new Date().toISOString().slice(0,10)}.xlsx`)
}
