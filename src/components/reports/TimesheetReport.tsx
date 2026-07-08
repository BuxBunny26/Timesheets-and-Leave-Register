import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTeamScope } from '../../hooks/useTeamScope'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import { exportToExcel, printReport } from '../../lib/reportExports'
import type { Profile } from '../../types'
import { formatDateDisplay } from '../../lib/dateUtils'

interface DayRow {
  id: string
  date: string
  day_of_week: string
  primary_status: string
  overtime_flag: boolean
  overtime_hours: number | null
  lol_flag: boolean
  loi_flag: boolean
  notes: string | null
  week_start: string
  week_status: string
  employee_name: string
  employee_code: string | null
}

export default function TimesheetReport() {
  const { profile } = useAuth()
  const { scope } = useTeamScope()
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState(profile?.id ?? '')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let q = supabase.from('profiles').select('id, first_name, surname, employee_code').eq('status', 'active').order('first_name')
    if (scope) q = q.in('id', scope)
    q.then(({ data }) => {
      if (!data) return
      setEmployees(data as Profile[])
      // If currently selected employee is no longer in scope, fall back to self.
      if (selectedEmployee && !data.find((e: { id: string }) => e.id === selectedEmployee)) {
        setSelectedEmployee(profile?.id ?? '')
      }
    })
  }, [scope, profile?.id, selectedEmployee])

  async function runReport() {
    if (!selectedEmployee) return
    setLoading(true)
    const { data } = await supabase
      .from('timesheet_days')
      .select(`
        id, date, day_of_week, primary_status, overtime_flag, overtime_hours, lol_flag, loi_flag, notes,
        timesheet_week:timesheet_weeks!timesheet_week_id(week_start, status, employee_id,
          employee:profiles!employee_id(first_name, surname, employee_code))
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    const filtered = (data ?? []).filter((d: unknown) => {
      const day = d as { timesheet_week: { employee_id: string } }
      return day.timesheet_week?.employee_id === selectedEmployee
    })

    setRows(filtered.map((d: unknown) => {
      const day = d as {
        id: string; date: string; day_of_week: string; primary_status: string;
        overtime_flag: boolean; overtime_hours: number | null; lol_flag: boolean; loi_flag: boolean; notes: string | null;
        timesheet_week: { week_start: string; status: string; employee: { first_name: string; surname: string; employee_code: string | null } }
      }
      return {
        id: day.id,
        date: day.date,
        day_of_week: day.day_of_week,
        primary_status: day.primary_status,
        overtime_flag: day.overtime_flag,
        overtime_hours: day.overtime_hours,
        lol_flag: day.lol_flag,
        loi_flag: day.loi_flag,
        notes: day.notes,
        week_start: day.timesheet_week.week_start,
        week_status: day.timesheet_week.status,
        employee_name: `${day.timesheet_week.employee.first_name} ${day.timesheet_week.employee.surname}`,
        employee_code: day.timesheet_week.employee.employee_code,
      }
    }))
    setLoading(false)
  }

  function handleExcel() {
    exportToExcel(rows.map(r => ({
      'Employee': r.employee_name,
      'Code': r.employee_code ?? '',
      'Week Start': r.week_start,
      'Week Status': r.week_status,
      'Date': r.date,
      'Day': r.day_of_week,
      'Status': r.primary_status,
      'OT Hours': r.overtime_flag ? r.overtime_hours ?? '' : '',
      'LOL': r.lol_flag ? 'Yes' : '',
      'LOI': r.loi_flag ? 'Yes' : '',
      'Notes': r.notes ?? '',
    })), `timesheet-report-${startDate}-${endDate}`)
  }

  const emp = employees.find(e => e.id === selectedEmployee)
  const canSeeOthers = profile?.role !== 'employee'

  return (
    <ReportShell
      title="Overall Timesheet Report"
      subtitle={emp ? `${emp.first_name} ${emp.surname}` : undefined}
      onExcel={rows.length ? handleExcel : undefined}
      onPrint={rows.length ? () => printReport('timesheet-report') : undefined}
      loading={loading}
      reportId="timesheet-report"
    >
      <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} onRun={runReport} loading={loading}>
        {canSeeOthers && (
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Employee</label>
            <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
              className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
              <option value="">Select employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.surname} {e.employee_code ? `(${e.employee_code})` : ''}</option>)}
            </select>
          </div>
        )}
      </DateRangeFilter>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-secondary)] text-left">
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Day</th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Status</th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-center">OT hrs</th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-center">LOL</th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-center">LOI</th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-[var(--surface-secondary)]">
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text-secondary)]">{formatDateDisplay(r.date)}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.day_of_week}</td>
                  <td className="px-3 py-2 capitalize text-[var(--text-secondary)]">{r.primary_status.replace('_', ' ')}</td>
                  <td className="px-3 py-2 text-center text-[var(--text-secondary)]">{r.overtime_flag ? r.overtime_hours : '—'}</td>
                  <td className="px-3 py-2 text-center text-[var(--text-secondary)]">{r.lol_flag ? 'Yes' : '—'}</td>
                  <td className="px-3 py-2 text-center text-[var(--text-secondary)]">{r.loi_flag ? 'Yes' : '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] text-xs">{r.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 font-medium">
                <td colSpan={3} className="px-3 py-2 text-xs text-[var(--text-secondary)]">Totals</td>
                <td className="px-3 py-2 text-center text-xs text-[var(--text-primary)]">
                  {rows.reduce((s, r) => s + (r.overtime_flag ? r.overtime_hours ?? 0 : 0), 0).toFixed(1)}
                </td>
                <td className="px-3 py-2 text-center text-xs text-[var(--text-primary)]">{rows.filter(r => r.lol_flag).length}</td>
                <td className="px-3 py-2 text-center text-xs text-[var(--text-primary)]">{rows.filter(r => r.loi_flag).length}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
