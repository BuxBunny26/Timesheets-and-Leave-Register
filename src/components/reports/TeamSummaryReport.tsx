import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import TeamScopeToggle from './TeamScopeToggle'
import { useTeamScope } from '../../hooks/useTeamScope'
import { exportToExcel, printReport } from '../../lib/reportExports'
import StatusBadge from '../StatusBadge'
import type { TimesheetStatus } from '../../types'

interface TeamRow {
  employee_name: string
  employee_code: string
  week_start: string
  status: TimesheetStatus
  submitted_at: string | null
  ot_hours: number
}

export default function TeamSummaryReport() {
  const { scope, isManager, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runReport() {
    setLoading(true)

    let query = supabase
      .from('timesheet_weeks')
      .select(`week_start, status, submitted_at,
        employee:profiles!employee_id(id, first_name, surname, employee_code, supervisor_id),
        days:timesheet_days(overtime_flag, overtime_hours)`)
      .gte('week_start', startDate)
      .lte('week_start', endDate)
      .order('week_start')

    if (scope) query = query.in('employee_id', scope)

    const { data } = await query

    const result: TeamRow[] = (data ?? [])
      .map((w: unknown) => {
        const week = w as { week_start: string; status: TimesheetStatus; submitted_at: string | null; employee: { first_name: string; surname: string; employee_code: string | null }; days: Array<{ overtime_flag: boolean; overtime_hours: number | null }> }
        const otHours = week.days?.filter(d => d.overtime_flag).reduce((s, d) => s + (d.overtime_hours ?? 0), 0) ?? 0
        return {
          employee_name: `${week.employee.first_name} ${week.employee.surname}`,
          employee_code: week.employee.employee_code ?? '',
          week_start: week.week_start,
          status: week.status,
          submitted_at: week.submitted_at,
          ot_hours: otHours,
        }
      })

    setRows(result)
    setLoading(false)
  }

  return (
    <ReportShell title="Team Summary"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({ 'Employee': r.employee_name, 'Code': r.employee_code, 'Week Start': r.week_start, 'Status': r.status, 'Submitted': r.submitted_at ?? '', 'OT Hours': r.ot_hours })), `team-summary-${startDate}-${endDate}`) : undefined}
      onPrint={rows.length ? () => printReport('team-report') : undefined}
      loading={loading} reportId="team-report"
    >
      <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} onRun={runReport} loading={loading}>
        <TeamScopeToggle isManager={isManager} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
      </DateRangeFilter>
      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Employee', 'Code', 'Week Start', 'Status', 'Submitted At', 'OT Hours'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2 text-gray-700">{r.week_start}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-ZA') : '—'}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{r.ot_hours > 0 ? r.ot_hours.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
