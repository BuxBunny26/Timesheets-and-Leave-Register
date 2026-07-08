import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import TeamScopeToggle from './TeamScopeToggle'
import { useTeamScope } from '../../hooks/useTeamScope'
import { exportToExcel, printReport } from '../../lib/reportExports'
import StatusBadge from '../StatusBadge'
import type { Profile } from '../../types'

interface OTRow {
  employee_name: string
  employee_code: string
  date: string
  hours: number
  approval_status: string
}

export default function OvertimeReport() {
  const { profile } = useAuth()
  const isPlainEmployee = profile?.role === 'employee'
  const { scope, isAdmin, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<OTRow[]>([])
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
    const { data } = await supabase
      .from('timesheet_days')
      .select(`date, overtime_hours,
        timesheet_week:timesheet_weeks!timesheet_week_id(employee_id,
          employee:profiles!employee_id(first_name, surname, employee_code)),
        ot_approvals(status, final_status, actioned_at)`)
      .eq('overtime_flag', true)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    // Combine status + final_status into a single display state. If there are
    // multiple ot_approvals rows for a day (legacy duplicates), pick the most
    // "advanced" one so the report reflects the true latest action.
    const rank = (s: string) => s === 'approved' ? 4 : s === 'awaiting_final' ? 3 : s === 'denied' ? 2 : 1
    const toDisplay = (a: { status: string; final_status?: string | null }): string => {
      if (a.status === 'approved' && a.final_status === 'approved') return 'approved'
      if (a.status === 'approved') return 'awaiting_final'
      if (a.status === 'denied') return 'denied'
      return 'pending'
    }

    const result: OTRow[] = []
    for (const d of (data ?? [])) {
      const day = d as unknown as {
        date: string; overtime_hours: number | null;
        timesheet_week: { employee_id: string; employee: { first_name: string; surname: string; employee_code: string | null } };
        ot_approvals: Array<{ status: string; final_status?: string | null; actioned_at?: string | null }>
      }
      if (selectedEmployee && day.timesheet_week?.employee_id !== selectedEmployee) continue
      if (scope && !scope.includes(day.timesheet_week?.employee_id)) continue
      const approvals = day.ot_approvals ?? []
      let displayStatus = 'pending'
      if (approvals.length > 0) {
        const ranked = approvals
          .map(a => ({ disp: toDisplay(a), actioned_at: a.actioned_at }))
          .sort((x, y) => {
            const r = rank(y.disp) - rank(x.disp)
            if (r !== 0) return r
            return (y.actioned_at ?? '').localeCompare(x.actioned_at ?? '')
          })
        displayStatus = ranked[0].disp
      }
      result.push({
        employee_name: `${day.timesheet_week.employee.first_name} ${day.timesheet_week.employee.surname}`,
        employee_code: day.timesheet_week.employee.employee_code ?? '',
        date: day.date,
        hours: day.overtime_hours ?? 0,
        approval_status: displayStatus,
      })
    }
    setRows(result)
    setExpanded(new Set())
    setLoading(false)
  }

  return (
    <ReportShell
      title="Overtime Report"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({
        'Employee': r.employee_name, 'Code': r.employee_code,
        'Date': r.date, 'OT Hours': r.hours, 'Approval Status': r.approval_status,
      })), `overtime-${startDate}-${endDate}`) : undefined}
      onPrint={rows.length ? () => printReport('ot-report') : undefined}
      loading={loading} reportId="ot-report"
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
        <TeamScopeToggle show={isAdmin} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
      </DateRangeFilter>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          {(() => {
            // Group rows by employee (name + code) preserving first-seen order.
            type Group = { key: string; name: string; code: string; totalHours: number; rows: OTRow[] }
            const groupMap = new Map<string, Group>()
            for (const r of rows) {
              const key = `${r.employee_name}|${r.employee_code}`
              const g = groupMap.get(key)
              if (g) {
                g.rows.push(r)
                g.totalHours += r.hours
              } else {
                groupMap.set(key, { key, name: r.employee_name, code: r.employee_code, totalHours: r.hours, rows: [r] })
              }
            }
            const groups = Array.from(groupMap.values())
            groups.forEach(g => g.rows.sort((a, b) => a.date.localeCompare(b.date)))
            groups.sort((a, b) => a.name.localeCompare(b.name))
            const grandTotal = rows.reduce((s, r) => s + r.hours, 0)
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-secondary)]">
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left w-8" />
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Employee</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Code</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Date</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-center">OT Hours</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Approval</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {groups.map(g => {
                    const isOpen = expanded.has(g.key)
                    return (
                      <Fragment key={g.key}>
                        <tr
                          key={g.key}
                          onClick={() => toggleEmployee(g.key)}
                          className="hover:bg-[var(--surface-secondary)] cursor-pointer bg-gray-50/50 font-medium"
                        >
                          <td className="px-3 py-2 text-[var(--text-muted)] select-none">
                            <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                          </td>
                          <td className="px-3 py-2 text-[var(--text-primary)]">{g.name}</td>
                          <td className="px-3 py-2 text-[var(--text-muted)]">{g.code}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {g.rows.length} {g.rows.length === 1 ? 'day' : 'days'}
                          </td>
                          <td className="px-3 py-2 text-center font-semibold text-[var(--text-primary)]">{g.totalHours.toFixed(1)}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {isOpen ? 'Click to collapse' : 'Click to expand'}
                          </td>
                        </tr>
                        {/* Detail rows: visible when expanded in UI; always visible when printing */}
                        {g.rows.map((r, i) => (
                          <tr
                            key={`${g.key}-${i}`}
                            className={`hover:bg-[var(--surface-secondary)] ${isOpen ? '' : 'hidden print:table-row'}`}
                          >
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-[var(--text-secondary)] pl-8">↳</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{r.employee_code}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{r.date}</td>
                            <td className="px-3 py-2 text-center text-[var(--text-primary)]">{r.hours}</td>
                            <td className="px-3 py-2"><StatusBadge status={r.approval_status} /></td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-semibold text-sm">
                    <td colSpan={4} className="px-3 py-2 text-[var(--text-secondary)]">Total</td>
                    <td className="px-3 py-2 text-center text-[var(--text-primary)]">{grandTotal.toFixed(1)}</td>
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
