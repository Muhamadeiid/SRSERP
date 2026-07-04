import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import api from '../../services/axios'
import SignaturePad from '../../components/hr/SignaturePad'
import { saveUserSignature } from '../../services/leaveService'
import { useLookups } from '../../hooks/useLookups'

// ── Constants (kept as fallback / for permission gating; actual dropdown values come from lookups) ─
const EMPTY_FORM  = { name: '', email: '', password: '', role: 'staff', department: 'admin', manager_id: '', is_team_manager: false }

const ROLE_CFG = {
  admin:         { label: 'Super Admin',   bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-400'    },
  depot_manager: { label: 'Depot Manager', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-400'   },
  manager:       { label: 'Manager',       bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400'  },
  hr:            { label: 'HR',            bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-400' },
  staff:         { label: 'Staff',         bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-400'  },
}

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  back:      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />,
  edit:      <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.586 3.586a2 2 0 112.828 2.828L12 14.828l-4 1 1-4 8.586-8.242z"/></>,
  key:       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />,
  sig:       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />,
  link:      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
  trash:     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
  chevron:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />,
  search:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />,
  users:     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  check:     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />,
}

const Svg = ({ d, cls = 'w-4 h-4' }) => (
  <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">{d}</svg>
)

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Users() {
  const navigate     = useNavigate()
  const { user: me } = useSelector(s => s.auth)
  const { departments: lookupDepts, roles: lookupRoles } = useLookups()
  const deptLabel    = (key) => lookupDepts.find(d => d.key === key)?.label_en ?? key

  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [modal,        setModal]        = useState(null)
  const [selected,     setSelected]     = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [error,        setError]        = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sigTarget,    setSigTarget]    = useState(null)
  const [linkTarget,   setLinkTarget]   = useState(null)
  const [menuOpen,     setMenuOpen]     = useState(null)  // row id with open action menu

  useEffect(() => {
    if (me?.role !== 'admin') navigate('/', { replace: true })
    else loadUsers()
  }, [])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  const loadUsers = async () => {
    setLoading(true)
    try { const { data } = await api.get('/users'); setUsers(data) }
    catch { setError('Failed to load users') }
    finally { setLoading(false) }
  }

  const openCreate = () => { setForm(EMPTY_FORM); setError(null); setModal('create') }
  const openEdit   = u  => { setSelected(u); setForm({ name: u.name, email: u.email, role: u.role, department: u.department, manager_id: u.manager_id ?? '', is_team_manager: !!u.is_team_manager }); setError(null); setModal('edit') }
  const openReset  = u  => { setSelected(u); setForm({ password: '', password_confirmation: '' }); setError(null); setModal('reset') }
  const closeModal = ()  => { setModal(null); setSelected(null); setError(null) }
  const set        = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async e => {
    e.preventDefault(); setSaving(true); setError(null)
    try { const { data } = await api.post('/users', form); setUsers(u => [...u, data]); closeModal() }
    catch (err) { setError(err.response?.data?.message || 'Failed to create user') }
    finally { setSaving(false) }
  }

  const handleEdit = async e => {
    e.preventDefault(); setSaving(true); setError(null)
    try { const { data } = await api.put(`/users/${selected.id}`, form); setUsers(u => u.map(x => x.id === selected.id ? data : x)); closeModal() }
    catch (err) { setError(err.response?.data?.message || 'Failed to update user') }
    finally { setSaving(false) }
  }

  const handleReset = async e => {
    e.preventDefault(); setSaving(true); setError(null)
    try { await api.post(`/users/${selected.id}/reset-password`, form); closeModal() }
    catch (err) { setError(err.response?.data?.message || 'Failed to reset password') }
    finally { setSaving(false) }
  }

  const handleToggleActive = async u => {
    try { const { data } = await api.put(`/users/${u.id}`, { is_active: !u.is_active }); setUsers(prev => prev.map(x => x.id === u.id ? data : x)) }
    catch { alert('Failed to update status') }
  }

  const handleDelete = async () => {
    try { await api.delete(`/users/${deleteTarget.id}`); setUsers(u => u.filter(x => x.id !== deleteTarget.id)); setDeleteTarget(null) }
    catch (err) { alert(err.response?.data?.message || 'Failed to delete user') }
  }

  // Stats
  const total   = users.length
  const active  = users.filter(u => u.is_active).length
  const managers = users.filter(u => ['admin','depot_manager','manager'].includes(u.role)).length
  const linked  = users.filter(u => u.linked_employee).length

  // Filtered list
  const filtered = users.filter(u =>
    !search.trim() ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#f4f5f7]">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-[#e2e4ea] px-4 sm:px-7 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#e2e4ea] bg-white hover:bg-[#f4f5f7] text-[#4a5073] transition-all">
            <Svg d={Icon.back} cls="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-[#1a1f36] tracking-tight">User Management</h1>
            <p className="text-xs text-[#8892ab]">Manage accounts, roles &amp; access</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Svg d={Icon.search} cls="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b0b7c9] pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="pl-9 pr-4 py-2 text-sm bg-[#f4f5f7] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#e2e4ea] transition-all w-52" />
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e2d5a] hover:bg-[#253468] text-white text-sm font-semibold rounded-xl transition-all shadow-sm">
            <span className="text-lg leading-none">+</span> New User
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-7 space-y-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Total Users',    val: total,    color: 'text-[#1e2d5a]', icon: Icon.users },
            { label: 'Active',         val: active,   color: 'text-emerald-600', icon: Icon.check },
            { label: 'Manager Roles',  val: managers, color: 'text-blue-600',   icon: Icon.users },
            { label: 'Linked to HR',   val: linked,   color: 'text-violet-600', icon: Icon.link  },
          ].map(({ label, val, color, icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#e2e4ea] px-5 py-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl bg-[#f4f5f7] flex items-center justify-center ${color}`}>
                <Svg d={icon} cls="w-5 h-5" />
              </div>
              <div>
                <p className={`text-2xl font-black ${color}`}>{val}</p>
                <p className="text-xs text-[#8892ab] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-[#e2e4ea] rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-2 border-[#1e2d5a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#8892ab]">Loading users…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#f4f5f7] flex items-center justify-center mx-auto mb-4">
                <Svg d={Icon.users} cls="w-7 h-7 text-[#b0b7c9]" />
              </div>
              <p className="text-sm font-semibold text-[#4a5073]">No users found</p>
              {search && <p className="text-xs text-[#8892ab] mt-1">Try a different search term</p>}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-[#f8f9fb] border-b border-[#e2e4ea]">
                  {['User', 'Role', 'Department', 'Reports To', 'HR Record', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-[#8892ab] uppercase tracking-widest px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f4f5f7]">
                {filtered.map(u => {
                  const role = ROLE_CFG[u.role] ?? { label: u.role, bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200', dot: 'bg-neutral-400' }
                  return (
                    <tr key={u.id} className="group hover:bg-[#fafbfc] transition-colors">

                      {/* User */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1e2d5a] to-[#3a4f8f] flex items-center justify-center text-white text-sm font-bold">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${u.is_active ? 'bg-emerald-400' : 'bg-[#d1d5de]'}`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#1a1f36]">{u.name}</p>
                            <p className="text-xs text-[#8892ab]">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${role.bg} ${role.text} ${role.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${role.dot}`} />
                          {role.label}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-[#4a5073]">{deptLabel(u.department)}</span>
                      </td>

                      {/* Reports To (manager) */}
                      <td className="px-5 py-3.5">
                        {u.manager ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#e8eaf6] flex items-center justify-center text-[#1e2d5a] text-[10px] font-bold shrink-0">
                              {u.manager.name?.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-[#4a5073] truncate max-w-[110px]">{u.manager.name}</span>
                          </div>
                        ) : (
                          <span className="text-[#d1d5de] text-xs">—</span>
                        )}
                      </td>

                      {/* Linked HR Record */}
                      <td className="px-5 py-3.5">
                        {u.linked_employee ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-[10px] font-bold shrink-0">
                              {u.linked_employee.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-[#1a1f36] truncate max-w-[110px]">{u.linked_employee.name}</p>
                              <p className="text-[10px] text-[#8892ab] truncate max-w-[110px]">{u.linked_employee.position}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#d1d5de] text-xs">Not linked</span>
                        )}
                      </td>

                      {/* Status toggle */}
                      <td className="px-5 py-3.5">
                        <button onClick={() => handleToggleActive(u)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                            u.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca] hover:bg-red-100'
                          }`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">

                          <ActionBtn title="Edit user" onClick={() => openEdit(u)} color="hover:bg-blue-50 hover:text-blue-600">
                            <Svg d={Icon.edit} cls="w-3.5 h-3.5" />
                          </ActionBtn>

                          <ActionBtn title="Reset password" onClick={() => openReset(u)} color="hover:bg-amber-50 hover:text-amber-600">
                            <Svg d={Icon.key} cls="w-3.5 h-3.5" />
                          </ActionBtn>

                          <ActionBtn
                            title={u.e_signature ? 'Signature set — click to update' : 'No signature — click to add'}
                            onClick={() => setSigTarget(u)}
                            color={u.e_signature ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'text-[#b0b7c9] hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200'}>
                            <Svg d={Icon.sig} cls="w-3.5 h-3.5" />
                          </ActionBtn>

                          <ActionBtn
                            title={u.linked_employee ? `Linked: ${u.linked_employee.name} — click to change` : 'Not linked — click to link employee'}
                            onClick={() => setLinkTarget(u)}
                            color={u.linked_employee ? 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100' : 'text-[#b0b7c9] hover:bg-violet-50 hover:text-violet-500 hover:border-violet-200'}>
                            <Svg d={Icon.link} cls="w-3.5 h-3.5" />
                          </ActionBtn>

                          {u.id !== me?.id && (
                            <ActionBtn title="Delete user" onClick={() => setDeleteTarget(u)} color="hover:bg-red-50 hover:text-red-500">
                              <Svg d={Icon.trash} cls="w-3.5 h-3.5" />
                            </ActionBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Subordinates Panel ── */}
        {me?.role === 'admin' && <SubordinatesPanel users={users} />}
      </div>

      {/* ══ Modals ══════════════════════════════════════════════════════════════ */}

      {/* Create / Edit */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Create New User' : 'Edit User'} onClose={closeModal}>
          <form onSubmit={modal === 'create' ? handleCreate : handleEdit} className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" span>
                <Input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Full name" />
              </Field>
              <Field label="Email" span>
                <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="email@srs.com" />
              </Field>
              {modal === 'create' && (
                <Field label="Password" span>
                  <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Min 8 characters" />
                </Field>
              )}
              <Field label="Role">
                <Select value={form.role} onChange={e => set('role', e.target.value)}>
                  {lookupRoles.map(r => <option key={r.key} value={r.key}>{r.label_en}</option>)}
                </Select>
              </Field>
              <Field label="Department">
                <Select value={form.department} onChange={e => set('department', e.target.value)}>
                  {lookupDepts.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Reports to (Manager)">
              <ManagerSelect users={users} value={form.manager_id} onChange={v => set('manager_id', v)} excludeId={modal === 'edit' ? selected?.id : null} />
            </Field>

            {/* Team manager toggle — decides whether this user shows up in Manager Account Assignments */}
            <div className="rounded-xl border border-[#e5e7eb] bg-[#fafbff] p-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('is_team_manager', !form.is_team_manager)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${form.is_team_manager ? 'bg-[#185FA5]' : 'bg-[#cbd0da]'}`}
                aria-label="Toggle team manager"
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_team_manager ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1a1f36]">Team manager</p>
                <p className="text-[11px] text-[#8892ab] mt-0.5">
                  {form.is_team_manager
                    ? 'Will appear in Manager Account Assignments — employees can be assigned to them.'
                    : 'Regular user — will NOT show up in Manager Account Assignments.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[#f0f1f5]">
              <CancelBtn onClick={closeModal} />
              <SubmitBtn loading={saving}>{modal === 'create' ? 'Create User' : 'Save Changes'}</SubmitBtn>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset Password */}
      {modal === 'reset' && (
        <Modal title="Reset Password" subtitle={selected?.name} onClose={closeModal}>
          <form onSubmit={handleReset} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <Field label="New Password">
              <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Min 8 characters" />
            </Field>
            <Field label="Confirm Password">
              <Input type="password" value={form.password_confirmation} onChange={e => set('password_confirmation', e.target.value)} required placeholder="Repeat password" />
            </Field>
            <div className="flex justify-end gap-3 pt-2 border-t border-[#f0f1f5]">
              <CancelBtn onClick={closeModal} />
              <SubmitBtn loading={saving}>Reset Password</SubmitBtn>
            </div>
          </form>
        </Modal>
      )}

      {/* Signature */}
      {sigTarget && (
        <SignatureModal
          user={sigTarget}
          onClose={() => setSigTarget(null)}
          onSaved={sig => { setUsers(prev => prev.map(u => u.id === sigTarget.id ? { ...u, e_signature: sig } : u)); setSigTarget(null) }}
        />
      )}

      {/* Link Employee */}
      {linkTarget && (
        <LinkEmployeeModal
          user={linkTarget}
          onClose={() => setLinkTarget(null)}
          onSaved={emp => { setUsers(prev => prev.map(u => u.id === linkTarget.id ? { ...u, linked_employee: emp } : u)); setLinkTarget(null) }}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete User" onClose={() => setDeleteTarget(null)} size="sm">
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <Svg d={Icon.trash} cls="w-7 h-7 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1a1f36]">Delete "{deleteTarget.name}"?</p>
              <p className="text-xs text-[#8892ab] mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-[#4a5073] hover:text-[#1a1f36] rounded-xl hover:bg-[#f0f1f5] border border-[#e2e4ea] transition-all">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-sm">
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Reusable small components ──────────────────────────────────────────────────

function ActionBtn({ title, onClick, color = '', children }) {
  return (
    <button title={title} onClick={onClick}
      className={`relative w-8 h-8 flex items-center justify-center rounded-xl text-[#8892ab] border border-transparent hover:border-[#e2e4ea] transition-all ${color}`}>
      {children}
    </button>
  )
}

function Modal({ title, subtitle, onClose, children, size = 'md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden ${size === 'sm' ? 'max-w-sm' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f1f5]">
          <div>
            <h2 className="text-sm font-bold text-[#1a1f36]">{title}</h2>
            {subtitle && <p className="text-xs text-[#8892ab] mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8892ab] hover:text-[#1a1f36] hover:bg-[#f4f5f7] transition-all text-lg">
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children, span }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-bold text-[#8892ab] uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const Input = ({ className = '', ...props }) => (
  <input className={`w-full px-3 py-2.5 text-sm bg-[#f8f9fb] border border-[#e2e4ea] rounded-xl text-[#1a1f36] outline-none focus:bg-white focus:border-[#1e2d5a] focus:ring-2 focus:ring-[#1e2d5a]/10 transition-all ${className}`} {...props} />
)

const Select = ({ children, ...props }) => (
  <select className="w-full px-3 py-2.5 text-sm bg-[#f8f9fb] border border-[#e2e4ea] rounded-xl text-[#1a1f36] outline-none focus:bg-white focus:border-[#1e2d5a] transition-all" {...props}>{children}</select>
)

const Alert = ({ children }) => (
  <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">{children}</div>
)

const CancelBtn = ({ onClick }) => (
  <button type="button" onClick={onClick}
    className="px-4 py-2.5 text-sm font-semibold text-[#4a5073] hover:text-[#1a1f36] rounded-xl hover:bg-[#f0f1f5] border border-[#e2e4ea] transition-all">
    Cancel
  </button>
)

const SubmitBtn = ({ loading, children }) => (
  <button type="submit" disabled={loading}
    className="px-5 py-2.5 text-sm font-semibold bg-[#1e2d5a] hover:bg-[#253468] text-white rounded-xl transition-all disabled:opacity-60 shadow-sm">
    {loading ? 'Saving…' : children}
  </button>
)

// ── Searchable Manager dropdown ───────────────────────────────────────────────
function ManagerSelect({ users, value, onChange, excludeId }) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const options  = users.filter(u => u.id !== excludeId && u.name.toLowerCase().includes(query.toLowerCase()))
  const selUser  = users.find(u => u.id === Number(value))

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2.5 text-sm bg-[#f8f9fb] border border-[#e2e4ea] rounded-xl text-left flex items-center justify-between outline-none focus:bg-white focus:border-[#1e2d5a] transition-all">
        {selUser ? (
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#1e2d5a] text-white text-[10px] font-bold flex items-center justify-center">{selUser.name?.charAt(0).toUpperCase()}</span>
            <span className="text-[#1a1f36]">{selUser.name}</span>
          </span>
        ) : <span className="text-[#b0b7c9]">No manager</span>}
        <Svg d={Icon.chevron} cls={`w-4 h-4 text-[#8892ab] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#e2e4ea] rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[#f0f1f5]">
            <div className="relative">
              <Svg d={Icon.search} cls="absolute left-2.5 top-2 w-3.5 h-3.5 text-[#b0b7c9] pointer-events-none" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onClick={e => e.stopPropagation()}
                placeholder="Search…" className="w-full pl-7 pr-3 py-1.5 text-sm bg-[#f8f9fb] border border-[#e2e4ea] rounded-lg outline-none focus:border-[#1e2d5a]" />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            <li onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              className="px-3 py-2 text-sm text-[#8892ab] hover:bg-[#f8f9fb] cursor-pointer italic">— No manager</li>
            {options.map(u => (
              <li key={u.id} onClick={() => { onChange(u.id); setOpen(false); setQuery('') }}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2.5 hover:bg-[#f8f9fb] transition-colors ${Number(value) === u.id ? 'bg-blue-50 text-blue-700' : 'text-[#1a1f36]'}`}>
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1e2d5a] to-[#3a4f8f] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{u.name?.charAt(0).toUpperCase()}</span>
                <span className="flex-1">{u.name}</span>
                <span className="text-[10px] text-[#8892ab] capitalize">{u.role?.replace('_', ' ')}</span>
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-4 text-xs text-[#8892ab] text-center">No users found</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Link Employee Modal ───────────────────────────────────────────────────────
function LinkEmployeeModal({ user, onClose, onSaved }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/employees?search=${encodeURIComponent(query)}&limit=8`)
        setResults(Array.isArray(data) ? data : (data.data ?? []))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 350)
  }, [query])

  const link = async (emp) => {
    setSaving(true); setError(null)
    try { await api.post(`/users/${user.id}/link-employee`, { employee_id: emp?.id ?? null }); onSaved(emp ?? null) }
    catch (err) { setError(err.response?.data?.message || 'Failed'); setSaving(false) }
  }

  return (
    <Modal title="Link Employee Record" subtitle={`Account: ${user.name}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {/* Description */}
        <p className="text-xs text-[#8892ab] leading-relaxed bg-[#f8f9fb] rounded-xl px-4 py-3 border border-[#e2e4ea]">
          Link this user account to their employee record in HR. This enables their <strong className="text-[#4a5073]">position, department, and e-signature</strong> to appear correctly on leave request forms.
        </p>

        {/* Current link */}
        {user.linked_employee && (
          <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 font-bold shrink-0">
              {user.linked_employee.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-800">{user.linked_employee.name}</p>
              <p className="text-xs text-violet-500">{user.linked_employee.position} · {user.linked_employee.department}</p>
            </div>
            <button onClick={() => link(null)} disabled={saving}
              className="text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 border border-red-100 transition-all shrink-0">
              Unlink
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Svg d={Icon.search} cls="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b0b7c9] pointer-events-none" />
          <Input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or IBS code…"
            className="pl-9"
          />
          {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#1e2d5a] border-t-transparent rounded-full animate-spin" />}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="border border-[#e2e4ea] rounded-xl overflow-hidden divide-y divide-[#f4f5f7]">
            {results.map(emp => (
              <button key={emp.id} onClick={() => link(emp)} disabled={saving}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f8f9fb] transition-colors text-left group/row">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1e2d5a] to-[#3a4f8f] text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {emp.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1a1f36] truncate">{emp.name}</p>
                  <p className="text-xs text-[#8892ab]">{emp.ibs_code} · {emp.position}</p>
                </div>
                <span className="text-xs font-semibold text-[#1e2d5a] px-3 py-1.5 rounded-lg bg-[#1e2d5a]/5 group-hover/row:bg-[#1e2d5a] group-hover/row:text-white transition-all shrink-0">
                  Select
                </span>
              </button>
            ))}
          </div>
        )}

        {query && results.length === 0 && !loading && (
          <p className="text-xs text-center text-[#8892ab] py-3">No employees found for "{query}"</p>
        )}

        <div className="flex justify-end pt-1">
          <CancelBtn onClick={onClose} />
        </div>
      </div>
    </Modal>
  )
}

// ── Signature Modal ───────────────────────────────────────────────────────────
function SignatureModal({ user, onClose, onSaved }) {
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [cleared, setCleared] = useState(false)

  const handleSave = async dataURL => {
    setSaving(true); setError(null)
    try { await saveUserSignature(user.id, dataURL); onSaved(dataURL) }
    catch (err) { setError(err.message ?? 'Failed to save'); setSaving(false) }
  }

  return (
    <Modal title="E-Signature" subtitle={`${user.name} · ${user.role?.replace('_', ' ')}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {user.e_signature && !cleared && (
          <div>
            <p className="text-[11px] font-bold text-[#8892ab] uppercase tracking-widest mb-2">Current Signature</p>
            <div className="flex items-center gap-3 p-4 bg-[#f8f9fb] border border-[#e2e4ea] rounded-xl">
              <img src={user.e_signature} alt="Signature" className="h-14 object-contain flex-1" />
              <button onClick={() => setCleared(true)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 border border-red-100 transition-all shrink-0">
                Replace
              </button>
            </div>
          </div>
        )}

        {(!user.e_signature || cleared) && (
          <div>
            <p className="text-[11px] font-bold text-[#8892ab] uppercase tracking-widest mb-2">
              {user.e_signature ? 'New Signature' : 'Draw Signature'}
            </p>
            <SignaturePad key={cleared ? 'cleared' : 'initial'} initialSignature={null}
              label="Draw or upload signature image" onSave={handleSave} />
          </div>
        )}

        {saving && <p className="text-xs text-center text-[#8892ab] animate-pulse">Saving…</p>}
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-[#f0f1f5]">
        <CancelBtn onClick={onClose} />
      </div>
    </Modal>
  )
}

// ── Subordinates Panel ────────────────────────────────────────────────────────
function SubordinatesPanel({ users }) {
  const [expanded, setExpanded] = useState(null)

  const managerMap = {}
  users.forEach(u => {
    if (u.manager_id) {
      if (!managerMap[u.manager_id]) managerMap[u.manager_id] = []
      managerMap[u.manager_id].push(u)
    }
  })

  const managers = users.filter(u => managerMap[u.id])
  if (managers.length === 0) return null

  return (
    <div>
      <p className="text-[11px] font-bold text-[#8892ab] uppercase tracking-widest mb-3">Reporting Structure</p>
      <div className="space-y-2">
        {managers.map(mgr => {
          const subs  = managerMap[mgr.id] ?? []
          const isOpen = expanded === mgr.id
          const role   = ROLE_CFG[mgr.role] ?? {}
          return (
            <div key={mgr.id} className="bg-white border border-[#e2e4ea] rounded-2xl overflow-hidden shadow-sm">
              <button onClick={() => setExpanded(isOpen ? null : mgr.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#f8f9fb] transition-colors text-left">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1e2d5a] to-[#3a4f8f] flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {mgr.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1a1f36]">{mgr.name}</p>
                  <p className="text-xs text-[#8892ab] capitalize">{mgr.role?.replace('_', ' ')}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${role.bg} ${role.text} ${role.border}`}>
                  {subs.length} {subs.length === 1 ? 'report' : 'reports'}
                </span>
                <Svg d={Icon.chevron} cls={`w-4 h-4 text-[#8892ab] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-[#f4f5f7]">
                  {subs.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 bg-[#fafbfc] hover:bg-[#f4f5f7] transition-colors">
                      <div className="w-7 h-7 rounded-full bg-[#e8eaf6] flex items-center justify-center text-[#1e2d5a] text-xs font-bold shrink-0">
                        {s.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-[#1a1f36] font-medium flex-1">{s.name}</span>
                      <span className="text-xs text-[#8892ab] capitalize">{s.role?.replace('_', ' ')}</span>
                      <span className="text-xs text-[#b0b7c9]">{s.department}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
