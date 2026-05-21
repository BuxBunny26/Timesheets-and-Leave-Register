import { useState, useEffect } from 'react'
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

  useEffect(() => {
    let q = supabase.from('profiles').select('id, first_name, surname, employee_code').eq('status', 'active').order('surname')
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee (optional)</label>
            <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
              <option value="">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.surname}, {e.first_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Leave type</label>
          <select value={leaveType} onChange={e => setLeaveType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
            <option value="">All types</option>
            {(['annual', 'sick', 'family', 'study', 'unpaid', 'other'] as LeaveType[]).map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
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
                {['Employee', 'Code', 'Type', 'From', 'To', 'Days', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2 capitalize text-gray-700">{r.leave_type}</td>
                  <td className="px-3 py-2 text-gray-700">{r.start_date}</td>
                  <td className="px-3 py-2 text-gray-700">{r.end_date}</td>
                  <td className="px-3 py-2 text-center text-gray-800 font-medium">{r.total_days}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 font-semibold text-sm">
                <td colSpan={5} className="px-3 py-2 text-gray-700">Total days</td>
                <td className="px-3 py-2 text-center text-gray-800">{rows.reduce((s, r) => s + r.total_days, 0)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
