import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconScale, IconFlag, IconShield, IconCheck, IconXMark, IconPlus } from '../components/Icons'
import type { LeaveBalance, AuditLog, TimesheetVerification, Profile, BalanceLeaveType } from '../types'

type AdminTab = 'balances' | 'disputes' | 'audit'

const BALANCE_LEAVE_TYPES: { value: BalanceLeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'family', label: 'Family Responsibility' },
  { value: 'study', label: 'Study Leave' },
]

const ACTION_LABELS: Record<string, string> = {
  timesheet_status_change: 'Timesheet status changed',
  ot_approved:             'OT approved',
  ot_denied:               'OT denied',
  leave_approved:          'Leave approved',
  leave_denied:            'Leave denied',
  leave_cancelled:         'Leave cancelled',
  leave_balance_set:       'Leave balance set',
  leave_balance_updated:   'Leave balance updated',
  ot_threshold_reached:    'OT threshold reached',
}

type EmployeeSummary = Pick<Profile, 'id' | 'first_name' | 'surname' | 'employee_code' | 'department' | 'site' | 'division' | 'job_title'>

interface BalanceRow extends Omit<LeaveBalance, 'employee'> {
  employee?: EmployeeSummary
}

interface EditState {
  id: string | null       // null = new row
  employee_id: string
  leave_type: BalanceLeaveType
  year: number
  total_days: string
  used_days: string
}

const EMPTY_EDIT: EditState = {
  id: null,
  employee_id: '',
  leave_type: 'annual',
  year: new Date().getFullYear(),
  total_days: '0',
  used_days: '0',
}

export default function AdminPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<AdminTab>('balances')

  // ── Balances ──────────────────────────────────────
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear())
  const [balanceFilter, setBalanceFilter] = useState({ search: '', department: '', site: '', division: '', jobTitle: '' })
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [employees, setEmployees] = useState<Pick<Profile, 'id' | 'first_name' | 'surname' | 'employee_code'>[]>([])

  // ── Disputes ──────────────────────────────────────
  const [disputes, setDisputes] = useState<TimesheetVerification[]>([])
  const [loadingDisputes, setLoadingDisputes] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // ── Audit log ─────────────────────────────────────
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [logFilter, setLogFilter] = useState({ from: '', to: '', entity: '' })
  const [logPage, setLogPage] = useState(0)
  const LOG_PAGE_SIZE = 50

  // ── Toast ─────────────────────────────────────────
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  // Guard: admin only
  const isAdmin = profile?.role === 'admin_manager' || profile?.role === 'system_admin'

  useEffect(() => {
    if (!isAdmin) return
    fetchEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    if (tab === 'balances') fetchBalances()
    if (tab === 'disputes') fetchDisputes()
    if (tab === 'audit') fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, balanceYear, isAdmin])

  async function fetchEmployees() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, surname, employee_code')
      .eq('status', 'active')
      .order('surname')
    setEmployees((data ?? []) as typeof employees)
  }

  const fetchBalances = useCallback(async () => {
    setLoadingBalances(true)
    const { data, error } = await supabase
      .from('leave_balances')
      .select('*, employee:profiles!leave_balances_employee_id_fkey(id, first_name, surname, employee_code, job_title, department:departments(name), site:sites(name), division:divisions(name))')
      .eq('year', balanceYear)
      .order('employee_id')
    if (error) console.error(error)
    setBalances((data as BalanceRow[]) ?? [])
    setLoadingBalances(false)
  }, [balanceYear])

  async function fetchDisputes() {
    setLoadingDisputes(true)
    const { data, error } = await supabase
      .from('timesheet_verifications')
      .select('*, employee:profiles!timesheet_verifications_employee_id_fkey(id, first_name, surname, employee_code)')
      .eq('status', 'disputed')
      .order('updated_at', { ascending: false })
    if (error) console.error(error)
    setDisputes((data as TimesheetVerification[]) ?? [])
    setLoadingDisputes(false)
  }

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    let q = supabase
      .from('audit_log')
      .select('*, actor:profiles!audit_log_actor_id_fkey(id, first_name, surname)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1)

    if (logFilter.from) q = q.gte('created_at', logFilter.from)
    if (logFilter.to)   q = q.lte('created_at', logFilter.to + 'T23:59:59')
    if (logFilter.entity) q = q.eq('entity_type', logFilter.entity)

    const { data, error } = await q
    if (error) console.error(error)
    setLogs((data as AuditLog[]) ?? [])
    setLoadingLogs(false)
  }, [logFilter, logPage])

  // ── Balance CRUD ──────────────────────────────────
  function openNewBalance() {
    setEdit({ ...EMPTY_EDIT })
  }

  function openEditBalance(b: BalanceRow) {
    setEdit({
      id: b.id,
      employee_id: b.employee_id,
      leave_type: b.leave_type,
      year: b.year,
      total_days: String(b.total_days),
      used_days: String(b.used_days),
    })
  }

  async function saveBalance() {
    if (!edit) return
    setSaving(true)
    const payload = {
      employee_id: edit.employee_id,
      leave_type: edit.leave_type,
      year: edit.year,
      total_days: parseFloat(edit.total_days) || 0,
      used_days: parseFloat(edit.used_days) || 0,
    }
    try {
      if (edit.id) {
        const { error } = await supabase.from('leave_balances').update(payload).eq('id', edit.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('leave_balances').upsert(payload, { onConflict: 'employee_id,leave_type,year' })
        if (error) throw error
      }
      showToast('success', 'Balance saved.')
      setEdit(null)
      await fetchBalances()
    } catch (err: unknown) {
      showToast('error', 'Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  // ── Dispute resolution ────────────────────────────
  async function resolveDispute(id: string, action: 'reopen' | 'verify') {
    setResolvingId(id)
    const status = action === 'reopen' ? 'pending' : 'verified'
    const { error } = await supabase
      .from('timesheet_verifications')
      .update({ status, ...(action === 'verify' ? { verified_at: new Date().toISOString() } : {}) })
      .eq('id', id)
    if (error) showToast('error', 'Failed to resolve dispute.')
    else {
      showToast('success', action === 'reopen' ? 'Reopened for employee to re-verify.' : 'Marked as verified.')
      setDisputes(prev => prev.filter(d => d.id !== id))
    }
    setResolvingId(null)
  }

  // ── Derived balance filter options + filtered list ──────────────────────
  const departmentOptions = [...new Set(balances.map(b => b.employee?.department?.name).filter((v): v is string => !!v))].sort()
  const siteOptions       = [...new Set(balances.map(b => b.employee?.site?.name).filter((v): v is string => !!v))].sort()
  const divisionOptions   = [...new Set(balances.map(b => b.employee?.division?.name).filter((v): v is string => !!v))].sort()
  const jobTitleOptions   = [...new Set(balances.map(b => b.employee?.job_title).filter((v): v is string => !!v))].sort()

  const filteredBalances = balances.filter(b => {
    const emp = b.employee
    if (!emp) return true
    const search = balanceFilter.search.toLowerCase()
    if (search) {
      const name = `${emp.first_name} ${emp.surname}`.toLowerCase()
      const code = (emp.employee_code ?? '').toLowerCase()
      if (!name.includes(search) && !code.includes(search)) return false
    }
    if (balanceFilter.department && emp.department?.name !== balanceFilter.department) return false
    if (balanceFilter.site && emp.site?.name !== balanceFilter.site) return false
    if (balanceFilter.division && emp.division?.name !== balanceFilter.division) return false
    if (balanceFilter.jobTitle && emp.job_title !== balanceFilter.jobTitle) return false
    return true
  })

  const hasFilter = !!(balanceFilter.search || balanceFilter.department || balanceFilter.site || balanceFilter.division || balanceFilter.jobTitle)

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center text-[var(--text-muted)]">
        <IconShield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="text-lg font-medium text-[var(--text-secondary)]">Admin access required</p>
        <p className="text-sm mt-1">This page is only accessible to Admin Managers and System Admins.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Administration</h1>
        <p className="text-[var(--text-muted)] text-sm mt-0.5">Manage leave balances, resolve disputes, and review the audit trail</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium mb-4 ${
          toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <IconCheck className="w-4 h-4 flex-shrink-0" /> : <IconXMark className="w-4 h-4 flex-shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--surface-secondary)] rounded-lg p-1 w-fit">
        {([
          { key: 'balances', label: 'Leave Balances', icon: <IconScale className="w-4 h-4" /> },
          { key: 'disputes', label: 'Disputes', icon: <IconFlag className="w-4 h-4" /> },
          { key: 'audit',    label: 'Audit Log',   icon: <IconShield className="w-4 h-4" /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--tab-inactive-hover-text)]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── LEAVE BALANCES ─────────────────────────── */}
      {tab === 'balances' && (
        <div>
          {/* Controls */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--text-secondary)]">Year</label>
              <select
                value={balanceYear}
                onChange={e => setBalanceYear(Number(e.target.value))}
                className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <button
              onClick={openNewBalance}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1B5EA6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <IconPlus className="w-4 h-4" />
              Add / Set Balance
            </button>
          </div>

          {/* Filters */}
          {balances.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm px-4 py-3">
              <input
                type="search"
                placeholder="Search name or code…"
                value={balanceFilter.search}
                onChange={e => setBalanceFilter(f => ({ ...f, search: e.target.value }))}
                className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
              {departmentOptions.length > 0 && (
                <select
                  value={balanceFilter.department}
                  onChange={e => setBalanceFilter(f => ({ ...f, department: e.target.value }))}
                  className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All departments</option>
                  {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {siteOptions.length > 0 && (
                <select
                  value={balanceFilter.site}
                  onChange={e => setBalanceFilter(f => ({ ...f, site: e.target.value }))}
                  className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All sites</option>
                  {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {divisionOptions.length > 0 && (
                <select
                  value={balanceFilter.division}
                  onChange={e => setBalanceFilter(f => ({ ...f, division: e.target.value }))}
                  className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All divisions</option>
                  {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {jobTitleOptions.length > 0 && (
                <select
                  value={balanceFilter.jobTitle}
                  onChange={e => setBalanceFilter(f => ({ ...f, jobTitle: e.target.value }))}
                  className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All job titles</option>
                  {jobTitleOptions.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              )}
              {hasFilter && (
                <button
                  onClick={() => setBalanceFilter({ search: '', department: '', site: '', division: '', jobTitle: '' })}
                  className="text-sm text-[var(--text-muted)] hover:text-gray-600 px-2 py-1.5"
                >
                  Clear
                </button>
              )}
              {hasFilter && (
                <span className="text-xs text-[var(--text-muted)] ml-auto">{filteredBalances.length} of {balances.length}</span>
              )}
            </div>
          )}

          {/* Edit modal */}
          {edit !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-[var(--surface)] rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">
                  {edit.id ? 'Edit Leave Balance' : 'Set Leave Balance'}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Employee</label>
                    <select
                      value={edit.employee_id}
                      onChange={e => setEdit(prev => prev ? { ...prev, employee_id: e.target.value } : prev)}
                      disabled={!!edit.id}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                    >
                      <option value="">Select employee…</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.surname}{emp.employee_code ? ` (${emp.employee_code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Leave Type</label>
                      <select
                        value={edit.leave_type}
                        onChange={e => setEdit(prev => prev ? { ...prev, leave_type: e.target.value as BalanceLeaveType } : prev)}
                        disabled={!!edit.id}
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      >
                        {BALANCE_LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Year</label>
                      <input
                        type="number"
                        value={edit.year}
                        onChange={e => setEdit(prev => prev ? { ...prev, year: Number(e.target.value) } : prev)}
                        disabled={!!edit.id}
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Total Days Allocated</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={edit.total_days}
                        onChange={e => setEdit(prev => prev ? { ...prev, total_days: e.target.value } : prev)}
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Used Days</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={edit.used_days}
                        onChange={e => setEdit(prev => prev ? { ...prev, used_days: e.target.value } : prev)}
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-5">
                  <button
                    onClick={() => setEdit(null)}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveBalance}
                    disabled={saving || !edit.employee_id}
                    className="px-5 py-2 bg-[#1B5EA6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Balances table */}
          <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm overflow-hidden">
            {loadingBalances ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : balances.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)]">
                <IconScale className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>No leave balances set for {balanceYear}.</p>
                <p className="text-xs mt-1">Click "Add / Set Balance" to create records for employees.</p>
              </div>
            ) : filteredBalances.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <p className="text-sm">No employees match the current filters.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="bg-[var(--surface-secondary)]">
                  <tr>
                    {['Employee', 'Department', 'Site', 'Type', 'Total', 'Used', 'Remaining', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredBalances.map(b => {
                    const remaining = Math.max(0, b.total_days - b.used_days)
                    const pct = b.total_days > 0 ? (remaining / b.total_days) * 100 : 0
                    return (
                      <tr key={b.id} className="hover:bg-[var(--surface-secondary)] transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{b.employee?.first_name} {b.employee?.surname}</p>
                          {b.employee?.employee_code && <p className="text-xs text-[var(--text-muted)]">{b.employee.employee_code}</p>}
                          {b.employee?.job_title && <p className="text-xs text-[var(--text-muted)] italic">{b.employee.job_title}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{b.employee?.department?.name ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{b.employee?.site?.name ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] capitalize">{b.leave_type}</td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{b.total_days}</td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{b.used_days}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${remaining <= 2 ? 'text-red-600' : remaining <= 5 ? 'text-amber-600' : 'text-green-600'}`}>
                              {remaining}
                            </span>
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${remaining <= 2 ? 'bg-red-400' : remaining <= 5 ? 'bg-amber-400' : 'bg-green-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openEditBalance(b)}
                            className="text-xs text-[#1B5EA6] hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── DISPUTES ───────────────────────────────── */}
      {tab === 'disputes' && (
        <div>
          {loadingDisputes ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : disputes.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm text-center py-16 text-[var(--text-muted)]">
              <IconFlag className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-[var(--text-secondary)] font-medium">No open disputes</p>
              <p className="text-xs mt-1">All monthly verifications are clear.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {disputes.map(d => {
                const emp = d.employee as Profile | undefined
                return (
                  <div key={d.id} className="bg-[var(--surface)] rounded-lg border border-amber-200 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{emp?.first_name} {emp?.surname}</p>
                        {emp?.employee_code && <p className="text-xs text-[var(--text-muted)]">{emp.employee_code}</p>}
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                          Period: <span className="font-medium text-[var(--text-secondary)]">{d.period_month}</span>
                        </p>
                        {d.dispute_note && (
                          <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-800">
                            <span className="font-medium">Employee note: </span>{d.dispute_note}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => resolveDispute(d.id, 'reopen')}
                          disabled={resolvingId === d.id}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50 transition-colors"
                        >
                          Re-open for employee
                        </button>
                        <button
                          onClick={() => resolveDispute(d.id, 'verify')}
                          disabled={resolvingId === d.id}
                          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          Force verify
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── AUDIT LOG ──────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm p-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">From</label>
              <input
                type="date"
                value={logFilter.from}
                onChange={e => { setLogPage(0); setLogFilter(f => ({ ...f, from: e.target.value })) }}
                className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">To</label>
              <input
                type="date"
                value={logFilter.to}
                onChange={e => { setLogPage(0); setLogFilter(f => ({ ...f, to: e.target.value })) }}
                className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Entity</label>
              <select
                value={logFilter.entity}
                onChange={e => { setLogPage(0); setLogFilter(f => ({ ...f, entity: e.target.value })) }}
                className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {['timesheet_week','ot_approval','leave_request','leave_balance','employee'].map(v => (
                  <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => { setLogPage(0); fetchLogs() }}
              className="px-3 py-1.5 bg-[#1B5EA6] text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm text-center py-16 text-[var(--text-muted)]">
              <IconShield className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No audit log entries found.</p>
            </div>
          ) : (
            <>
              <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                  <thead className="bg-[var(--surface-secondary)]">
                    <tr>
                      {['Timestamp', 'Actor', 'Action', 'Entity', 'Change'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {logs.map(l => {
                      const actor = l.actor as Profile | undefined
                      return (
                        <tr key={l.id} className="hover:bg-[var(--surface-secondary)]">
                          <td className="px-4 py-3 whitespace-nowrap text-[var(--text-muted)] text-xs">
                            {new Date(l.created_at).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {actor ? `${actor.first_name} ${actor.surname}` : <span className="text-[var(--text-muted)] italic">system</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                              {ACTION_LABELS[l.action_type] ?? l.action_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[var(--text-muted)] text-xs capitalize">{l.entity_type?.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                            {l.old_value && <span className="text-red-500 line-through mr-1">{JSON.stringify(l.old_value)}</span>}
                            {l.new_value && <span className="text-green-600">{JSON.stringify(l.new_value)}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-3 text-sm text-[var(--text-muted)]">
                <span>Page {logPage + 1}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLogPage(p => Math.max(0, p - 1))}
                    disabled={logPage === 0}
                    className="px-3 py-1.5 border border-[var(--border)] rounded-lg hover:bg-[var(--surface-secondary)] disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setLogPage(p => p + 1)}
                    disabled={logs.length < LOG_PAGE_SIZE}
                    className="px-3 py-1.5 border border-[var(--border)] rounded-lg hover:bg-[var(--surface-secondary)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
