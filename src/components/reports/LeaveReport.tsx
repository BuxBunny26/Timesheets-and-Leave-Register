import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import TeamScopeToggle from './TeamScopeToggle'
import { useTeamScope } from '../../hooks/useTeamScope'
import { exportToExcel, printReport } from '../../lib/reportExports'
import StatusBadge from '../StatusBadge'
import type { Profile, LeaveType, LeaveStatus } from '../../types'

interface LeaveRow {
  employee_name: string
  employee_code: string
  leave_type: string
  start_date: string
  end_date: string
  total_days: number
  status: LeaveStatus
  reason: string | null
}

export default function LeaveReport() {
  const { profile } = useAuth()
  const isPlainEmployee = profile?.role === 'employee'
  const { scope, isAdmin, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [leaveType, setLeaveType] = useState('')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleEmployee(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    let q = supabase.from('profiles').select('id, first_name, surname, employee_code').eq('status', 'active').order('first_name')
    if (scope) q = q.in('id', scope)
    q.then(({ data }) => { if (data) setEmployees(data as Profile[]) })
  }, [scope])

  async function runReport() {
    setLoading(true)
    let query = supabase
      .from('leave_requests')
      .select(`leave_type, start_date, end_date, total_days, status, final_status, reason,
        employee:profiles!employee_id(first_name, surname, employee_code)`)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .order('start_date')

    if (leaveType) query = query.eq('leave_type', leaveType)
    if (selectedEmployee) query = query.eq('employee_id', selectedEmployee)
    if (scope) query = query.in('employee_id', scope)

    const { data } = await query

    const result: LeaveRow[] = (data ?? [])
      .map((d: unknown) => {
        const r = d as { leave_type: string; start_date: string; end_date: string; total_days: number; status: LeaveStatus; final_status?: string | null; reason: string | null; employee: { first_name: string; surname: string; employee_code: string | null } }
        // Roll stage-1 + stage-2 into a single display status so the report
        // doesn't show "approved" for items still awaiting manager sign-off.
        let displayStatus: string = r.status
        if (r.status === 'approved' && r.final_status && r.final_status !== 'approved') {
          displayStatus = 'awaiting_final'
        }
        return {
          employee_name: `${r.employee.first_name} ${r.employee.surname}`,
          employee_code: r.employee.employee_code ?? '',
          leave_type: r.leave_type,
          start_date: r.start_date,
          end_date: r.end_date,
          total_days: r.total_days,
          status: displayStatus as LeaveStatus,
          reason: r.reason,
        }
      })
    setRows(result)
    setExpanded(new Set())
    setLoading(false)
  }

  return (
    <ReportShell
      title="Leave Report"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({
        'Employee': r.employee_name, 'Code': r.employee_code,
        'Type': r.leave_type, 'From': r.start_date, 'To': r.end_date,
        'Days': r.total_days, 'Status': r.status, 'Reason': r.reason ?? '',
      })), `leave-report-${startDate}-${endDate}`) : undefined}
      onPrint={rows.length ? () => printReport('leave-report') : undefined}
      loading={loading} reportId="leave-report"
    >
      <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} onRun={runReport} loading={loading}>
        {!isPlainEmployee && (
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Employee (optional)</label>
            <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
              className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
              <option value="">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.surname}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Leave type</label>
          <select value={leaveType} onChange={e => setLeaveType(e.target.value)}
            className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
            <option value="">All types</option>
            {(['annual', 'sick', 'family', 'study', 'unpaid', 'other'] as LeaveType[]).map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <TeamScopeToggle show={isAdmin} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
      </DateRangeFilter>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          {(() => {
            type Group = { key: string; name: string; code: string; totalDays: number; rows: LeaveRow[] }
            const groupMap = new Map<string, Group>()
            for (const r of rows) {
              const key = `${r.employee_name}|${r.employee_code}`
              const g = groupMap.get(key)
              if (g) {
                g.rows.push(r)
                g.totalDays += r.total_days
              } else {
                groupMap.set(key, { key, name: r.employee_name, code: r.employee_code, totalDays: r.total_days, rows: [r] })
              }
            }
            const groups = Array.from(groupMap.values())
            groups.forEach(g => g.rows.sort((a, b) => a.start_date.localeCompare(b.start_date)))
            groups.sort((a, b) => a.name.localeCompare(b.name))
            const grandTotal = rows.reduce((s, r) => s + r.total_days, 0)
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-secondary)]">
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left w-8" />
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Employee</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Code</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Type</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">From</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">To</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-center">Days</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {groups.map(g => {
                    const isOpen = expanded.has(g.key)
                    return (
                      <Fragment key={g.key}>
                        <tr
                          onClick={() => toggleEmployee(g.key)}
                          className="hover:bg-[var(--surface-secondary)] cursor-pointer bg-gray-50/50 font-medium"
                        >
                          <td className="px-3 py-2 text-[var(--text-muted)] select-none">
                            <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                          </td>
                          <td className="px-3 py-2 text-[var(--text-primary)]">{g.name}</td>
                          <td className="px-3 py-2 text-[var(--text-muted)]">{g.code}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {g.rows.length} {g.rows.length === 1 ? 'request' : 'requests'}
                          </td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-center font-semibold text-[var(--text-primary)]">{g.totalDays}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {isOpen ? 'Click to collapse' : 'Click to expand'}
                          </td>
                        </tr>
                        {g.rows.map((r, i) => (
                          <tr
                            key={`${g.key}-${i}`}
                            className={`hover:bg-[var(--surface-secondary)] ${isOpen ? '' : 'hidden print:table-row'}`}
                          >
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-[var(--text-secondary)] pl-8">↳</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{r.employee_code}</td>
                            <td className="px-3 py-2 capitalize text-[var(--text-secondary)]">{r.leave_type}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{r.start_date}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{r.end_date}</td>
                            <td className="px-3 py-2 text-center text-[var(--text-primary)]">{r.total_days}</td>
                            <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-semibold text-sm">
                    <td colSpan={6} className="px-3 py-2 text-[var(--text-secondary)]">Total days</td>
                    <td className="px-3 py-2 text-center text-[var(--text-primary)]">{grandTotal}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )
          })()}
        </div>
      )}
    </ReportShell>
  )
}
