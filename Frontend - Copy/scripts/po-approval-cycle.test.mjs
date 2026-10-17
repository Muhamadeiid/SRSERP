import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as docx from 'docx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { poApprovalCycle } from '../src/utils/poApprovalCycle.js'

const decision = (id, stage, action = 'approve') => ({ id, stage, action, acted_at: '2026-10-17T10:00:00Z', approver: { name: `Signer${id}` } })
const history = [decision(1, 'procurement'), decision(2, 'depot_manager'), decision(3, 'managing_director', 'reject')]
const po = (status, approvals = history) => ({ approval_status: status, approvals, items: [], creator: { name: 'OldCreator' } })

test('never-rejected approval behavior stays unchanged', () => {
  const cycle = poApprovalCycle(po('pending_depot', [history[0]]))
  assert.equal(cycle.approval('procurement'), history[0])
  assert.equal(cycle.hasRejection, false)
  assert.equal(cycle.isDraft, false)
})

test('rejected and resubmitted cycles exclude old approvals without deleting history', () => {
  for (const status of ['rejected', 'pending_procurement', 'draft']) {
    const input = po(status)
    const before = JSON.stringify(input)
    const cycle = poApprovalCycle(input)
    assert.equal(cycle.approval('procurement'), undefined)
    assert.equal(cycle.approval('depot_manager'), undefined)
    assert.equal(cycle.isDraft, true)
    assert.equal(JSON.stringify(input), before)
  }
})

test('same-second reapproval and shuffled history use decision IDs', () => {
  const current = decision('4', 'procurement')
  const cycle = poApprovalCycle(po('pending_depot', [current, ...history].reverse()))
  assert.equal(cycle.approval('procurement'), current)
  assert.equal(cycle.approval('depot_manager'), undefined)
  assert.equal(poApprovalCycle(po('approved', [...history, current])).isDraft, false)
})

test('repeated rejection and incomplete rejected history fail closed', () => {
  assert.equal(poApprovalCycle(po('pending_procurement', [...history, decision(4, 'procurement'), decision(5, 'depot_manager', 'reject')])).approval('procurement'), undefined)
  assert.equal(poApprovalCycle(po('rejected', [])).approval('procurement'), undefined)
  assert.equal(poApprovalCycle(po('pending_procurement', [{ action: 'reject' }, history[0]])).approval('procurement'), undefined)
})

async function exportDocument(file, name, input) {
  let saved
  let source = readFileSync(new URL(`../src/utils/${file}`, import.meta.url), 'utf8')
  source = source.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/g, '')
    .replace('export async function', 'async function')
    .replace("const ExcelJS = (await import('exceljs')).default", '')
  const context = { ...docx, Math, ExcelJS, poApprovalCycle, saveAs: blob => { saved = blob }, Blob, Uint8Array, atob, fetch: async () => ({ ok: false }) }
  vm.runInNewContext(`${source}; this.run = ${name}`, context)
  await context.run(input)
  return saved.arrayBuffer()
}

test('actual Word export excludes historical signers and marks only rejected-cycle drafts', async () => {
  for (const status of ['rejected', 'pending_procurement', 'approved']) {
    const zip = await JSZip.loadAsync(await exportDocument('generatePO.js', 'generatePO', po(status)))
    const xml = await zip.file('word/document.xml').async('string')
    assert.ok(!xml.includes('Signer1'))
    assert.ok(!xml.includes('Signer2'))
    assert.equal(xml.includes('DRAFT'), status !== 'approved')
  }
  const zip = await JSZip.loadAsync(await exportDocument('generatePO.js', 'generatePO', po('pending_depot', [history[0]])))
  const xml = await zip.file('word/document.xml').async('string')
  assert.ok(xml.includes('Signer1'))
  assert.ok(!xml.includes('DRAFT'))
})

test('actual Excel export removes old creator attribution only after rejection', async () => {
  for (const rejected of [true, false]) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await exportDocument('generatePO_Excel.js', 'generatePO_Excel', po('pending_procurement', rejected ? history : [])))
    const values = []
    wb.worksheets[0].eachRow(row => row.eachCell(cell => values.push(String(cell.value))))
    assert.equal(values.includes('OldCreator'), !rejected)
    assert.equal(values.includes('Purchase Order - DRAFT'), rejected)
  }
})

test('successful rejection invalidates the displayed snapshot even if refresh fails', async () => {
  const source = readFileSync(new URL('../src/pages/PoDetail.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  const approvalDecision = async action => {')
  const end = source.indexOf('\n  const saveDispatch', start)
  assert.ok(start >= 0 && end > start)
  for (const fail of [true, false]) {
    let snapshot = po('pending_management')
    const fresh = po('rejected')
    const context = { id: 1, setBusy() {}, alert() {}, setPo: value => { snapshot = value }, decidePo: async () => ({}), getPo: async () => { assert.equal(snapshot, null); if (fail) throw new Error('offline'); return { data: fresh } } }
    vm.runInNewContext(`${source.slice(start, end)}; this.run = approvalDecision`, context)
    await context.run('reject')
    assert.equal(snapshot, fail ? null : fresh)
  }
})
