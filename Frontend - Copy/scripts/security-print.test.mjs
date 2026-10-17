import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { escapeHtml } from '../src/utils/escapeHtml.js'
import { terminateSession } from '../src/utils/terminateSession.js'

function printer(file, name, blocked = false) {
  const source = readFileSync(new URL(`../src/components/hr/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start) + 2
  assert.ok(start >= 0 && end > start)
  let html = '', printed = false
  const popup = { document: { write: value => { html = value }, close() {} }, focus() {}, print() { printed = true } }
  const context = {
    esc: escapeHtml, window: { location: { origin: 'https://erp.example.test' }, open: () => blocked ? null : popup },
    setTimeout: callback => callback(), pad: number => String(number).padStart(2, '0'),
    fmtDate: value => value, ATTENDANCE_POLICY_DEFAULTS: {},
    policyTimeMin: () => 19 * 60, policyNumber: () => 540,
    attendancePolicyTime: () => '08:00', isInterventionEmployee: () => false,
  }
  vm.runInNewContext(`${source.slice(start, end)}; this.run = ${name}`, context)
  return { run: context.run, result: () => ({ html, printed }) }
}

const attacks = ['<img src=x onerror="window.compromised=true">', '</title><script>window.compromised=true</script>', "Arabic & <text> 'quoted'"]

test('attendance printing keeps notes, employee fields and date strings inert', () => {
  for (const payload of attacks) {
    const print = printer('AttendanceTab.jsx', 'printReport')
    const employee = Object.fromEntries(['name', 'ibs_code', 'employee_id', 'department', 'position', 'work_location', 'no_warning_letters'].map(key => [key, payload]))
    print.run(employee, { annual: payload }, payload, payload, [{ dateStr: payload, dayName: payload, record: { notes: payload, status: 'present', work_hours: 9 } }])
    const result = print.result()
    assert.ok(result.printed)
    assert.ok(!result.html.includes(payload), payload)
    assert.ok(result.html.includes(escapeHtml(payload)))
    assert.ok(result.html.includes('A4 landscape'))
  }
})

test('clearance printing keeps all stored asset and employee text inert', () => {
  for (const payload of attacks) {
    const print = printer('AssetsTab.jsx', 'printClearance')
    const employee = Object.fromEntries(['name', 'ibs_code', 'department', 'position'].map(key => [key, payload]))
    print.run({ employee, by_department: [{ department: payload, count: 1, assets: [{ asset_name: payload, asset_category: payload, asset_code: payload, condition: payload }] }], active_count: 1, returned_count: 0, generated_at: '2026-10-17' })
    const result = print.result()
    assert.ok(result.printed)
    assert.ok(!result.html.includes(payload), payload)
    assert.ok(result.html.includes(escapeHtml(payload)))
    assert.ok(result.html.includes('A4 portrait'))
  }
})

test('ordinary text, empty clearance and blocked popups still work', () => {
  assert.equal(escapeHtml('Ahmed / محمد'), 'Ahmed / محمد')
  const clear = printer('AssetsTab.jsx', 'printClearance')
  clear.run({ employee: { name: 'Ahmed' }, by_department: [], active_count: 0, returned_count: 2 })
  assert.ok(clear.result().html.includes('All Clear'))
  assert.ok(clear.result().printed)
  printer('AssetsTab.jsx', 'printClearance', true).run({ employee: {}, by_department: [], active_count: 0 })
  printer('AttendanceTab.jsx', 'printReport', true).run({ name: 'Ahmed' }, {}, '', '', [])
})

test('logout revokes the captured token while clearing browser identity immediately', async () => {
  const events = []
  const result = await terminateSession('captured-token', {
    clear: () => events.push('clear'),
    revoke: async token => events.push(token),
    onUnconfirmed: () => assert.fail('Revocation succeeded'),
  })
  assert.equal(result, true)
  assert.deepEqual(events, ['clear', 'captured-token'])
})

test('logout failures are explicit and never retain browser identity', async () => {
  let cleared = 0, warned = 0
  const options = { clear: () => cleared++, onUnconfirmed: () => warned++, revoke: async () => { throw new Error('offline') } }
  assert.equal(await terminateSession('token', options), false)
  assert.equal(cleared, 1)
  assert.equal(warned, 1)
  options.revoke = async () => { throw { response: { status: 401 } } }
  assert.equal(await terminateSession('expired-token', options), true)
  assert.equal(warned, 1)
  assert.equal(await terminateSession(null, options), true)
  assert.equal(cleared, 3)
})
