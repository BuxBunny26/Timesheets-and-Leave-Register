import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
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
  const { scope, isAdmin, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<OTRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let q = supabase.from('profiles').select('id, first_name, surname, employee_code').eq('status', 'active').order('surname')
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
        ot_approvals(status)`)
      .eq('overtime_flag', true)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    const result: OTRow[] = []
    for (const d of (data ?? [])) {
      const day = d as unknown as {
        date: string; overtime_hours: number | null;
        timesheet_week: { employee_id: string; employee: { first_name: string; surname: string; employee_code: string | null } };
        ot_approvals: Array<{ status: string }>
      }
      if (selectedEmployee && day.timesheet_week?.employee_id !== selectedEmployee) continue
      if (scope && !scope.includes(day.timesheet_week?.employee_id)) continue
      result.push({
        employee_name: `${day.timesheet_week.employee.first_name} ${day.timesheet_week.employee.surname}`,
        employee_code: day.timesheet_week.employee.employee_code ?? '',
        date: day.date,
        hours: day.overtime_hours ?? 0,
        approval_status: day.ot_approvals?.[0]?.status ?? 'pending',
      })
    }
    setRows(result)
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
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Employee (optional)</label>
          <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
            <option value="">All employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.surname}, {e.first_name}</option>)}
          </select>
        </div>
        <TeamScopeToggle show={isAdmin} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
      </DateRangeFilter>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left">Employee</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left">Code</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 text-center">OT Hours</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2 text-gray-700">{r.date}</td>
                  <td className="px-3 py-2 text-center font-medium text-gray-800">{r.hours}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.approval_status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 font-semibold text-sm">
                <td colSpan={3} className="px-3 py-2 text-gray-700">Total</td>
                <td className="px-3 py-2 text-center text-gray-800">{rows.reduce((s, r) => s + r.hours, 0).toFixed(1)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
