import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import TeamScopeToggle from './TeamScopeToggle'
import { useTeamScope } from '../../hooks/useTeamScope'
import { exportToExcel, printReport } from '../../lib/reportExports'
import StatusBadge from '../StatusBadge'
import type { TimesheetStatus } from '../../types'

interface DeptRow {
  division: string
  department: string
  employee_name: string
  employee_code: string
  week_start: string
  status: TimesheetStatus
  ot_hours: number
}

export default function DepartmentReport() {
  const { scope, isAdmin, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [divisionFilter, setDivisionFilter] = useState('')
  const [divisions, setDivisions] = useState<string[]>([])
  const [rows, setRows] = useState<DeptRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('divisions').select('name').order('name')
      .then(({ data }) => { if (data) setDivisions(data.map(d => d.name)) })
  }, [])

  async function runReport() {
    setLoading(true)

    let query = supabase
      .from('timesheet_weeks')
      .select(`week_start, status,
        employee:profiles!employee_id(
          first_name, surname, employee_code,
          division:divisions(name),
          department:departments(name)
        ),
        days:timesheet_days(overtime_flag, overtime_hours)`)
      .gte('week_start', startDate)
      .lte('week_start', endDate)
      .order('week_start')

    if (scope) query = query.in('employee_id', scope)

    const { data } = await query

    const result: DeptRow[] = (data ?? [])
      .map((w: unknown) => {
        const week = w as {
          week_start: string
          status: TimesheetStatus
          employee: {
            first_name: string
            surname: string
            employee_code: string | null
            division: { name: string } | null
            department: { name: string } | null
          }
          days: Array<{ overtime_flag: boolean; overtime_hours: number | null }>
        }
        return {
          division: week.employee.division?.name ?? '—',
          department: week.employee.department?.name ?? '—',
          employee_name: `${week.employee.first_name} ${week.employee.surname}`,
          employee_code: week.employee.employee_code ?? '',
          week_start: week.week_start,
          status: week.status,
          ot_hours: week.days?.filter(d => d.overtime_flag).reduce((s, d) => s + (d.overtime_hours ?? 0), 0) ?? 0,
        }
      })
      .filter((r: DeptRow) => !divisionFilter || r.division === divisionFilter)
      .sort((a: DeptRow, b: DeptRow) => a.division.localeCompare(b.division) || a.department.localeCompare(b.department) || a.employee_name.localeCompare(b.employee_name))

    setRows(result)
    setLoading(false)
  }

  return (
    <ReportShell title="Department Summary"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({
        'Division': r.division, 'Department': r.department, 'Employee': r.employee_name,
        'Code': r.employee_code, 'Week Start': r.week_start, 'Status': r.status, 'OT Hours': r.ot_hours,
      })), `department-${startDate}-${endDate}`) : undefined}
      onPrint={rows.length ? () => printReport('dept-report') : undefined}
      loading={loading} reportId="dept-report"
    >
      <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} onRun={runReport} loading={loading}>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Division</label>
          <select value={divisionFilter} onChange={e => setDivisionFilter(e.target.value)}
            className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
            <option value="">All divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <TeamScopeToggle show={isAdmin} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
      </DateRangeFilter>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-secondary)]">
                {['Division', 'Department', 'Employee', 'Code', 'Week Start', 'Status', 'OT Hours'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-[var(--surface-secondary)]">
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.division}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.department}</td>
                  <td className="px-3 py-2 text-[var(--text-primary)]">{r.employee_name}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{r.employee_code}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.week_start}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-center text-[var(--text-secondary)]">{r.ot_hours > 0 ? r.ot_hours.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
