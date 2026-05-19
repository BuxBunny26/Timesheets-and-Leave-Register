import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import TeamScopeToggle from './TeamScopeToggle'
import { useTeamScope } from '../../hooks/useTeamScope'
import { exportToExcel, printReport } from '../../lib/reportExports'

interface AwolRow {
  employee_name: string
  employee_code: string
  date: string
  day: string
  site: string
}

export default function AwolReport() {
  const { scope, isAdmin, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<AwolRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runReport() {
    setLoading(true)
    const { data } = await supabase
      .from('timesheet_days')
      .select(`date, day_of_week,
        timesheet_week:timesheet_weeks!timesheet_week_id(
          employee_id,
          employee:profiles!employee_id(first_name, surname, employee_code, site:sites!site_id(name)))`)
      .eq('primary_status', 'awol')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    setRows((data ?? [])
      .filter((d: unknown) => {
        if (!scope) return true
        const day = d as { timesheet_week: { employee_id: string } }
        return scope.includes(day.timesheet_week?.employee_id)
      })
      .map((d: unknown) => {
      const day = d as { date: string; day_of_week: string; timesheet_week: { employee_id: string; employee: { first_name: string; surname: string; employee_code: string | null; site: { name: string } | null } } }
      return {
        employee_name: `${day.timesheet_week.employee.first_name} ${day.timesheet_week.employee.surname}`,
        employee_code: day.timesheet_week.employee.employee_code ?? '',
        date: day.date,
        day: day.day_of_week,
        site: day.timesheet_week.employee.site?.name ?? '',
      }
    }))
    setLoading(false)
  }

  return (
    <ReportShell title="AWOL Report"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({ 'Employee': r.employee_name, 'Code': r.employee_code, 'Date': r.date, 'Day': r.day, 'Site': r.site })), `awol-${startDate}-${endDate}`) : undefined}
      onPrint={rows.length ? () => printReport('awol-report') : undefined}
      loading={loading} reportId="awol-report"
    >
      <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} onRun={runReport} loading={loading}>
        <TeamScopeToggle show={isAdmin} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
      </DateRangeFilter>
      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-8">No AWOL records in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Employee', 'Code', 'Date', 'Day', 'Site'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 font-medium">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2 text-gray-700">{r.date}</td>
                  <td className="px-3 py-2 text-gray-600">{r.day}</td>
                  <td className="px-3 py-2 text-gray-600">{r.site}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">{rows.length} AWOL record{rows.length !== 1 ? 's' : ''} found.</p>
        </div>
      )}
    </ReportShell>
  )
}
