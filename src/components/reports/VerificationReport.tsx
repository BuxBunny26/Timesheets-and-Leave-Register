import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import TeamScopeToggle from './TeamScopeToggle'
import { useTeamScope } from '../../hooks/useTeamScope'
import { exportToExcel, printReport } from '../../lib/reportExports'

interface VerifRow {
  employee_id: string
  employee_name: string
  employee_code: string
  period_month: string
  ot_hours: number
  leave_days: number
  verified: boolean
  verified_at: string | null
  notes: string
}

export default function VerificationReport() {
  const { scope, isAdmin, myTeamOnly, setMyTeamOnly } = useTeamScope()
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [rows, setRows] = useState<VerifRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runReport() {
    setLoading(true)

    const [yr, mo] = month.split('-').map(Number)
    const periodStart = `${yr}-${String(mo).padStart(2, '0')}-01`
    const lastDay = new Date(yr, mo, 0).getDate()
    const periodEnd = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    let empQuery = supabase
      .from('profiles')
      .select('id, first_name, surname, employee_code')
      .eq('status', 'active')
      .order('surname')
    if (scope) empQuery = empQuery.in('id', scope)
    const { data: employees } = await empQuery

    const empIds = (employees ?? []).map((e: { id: string }) => e.id)
    if (empIds.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const { data: verifications } = await supabase
      .from('timesheet_verifications')
      .select('employee_id, status, verified_at, notes')
      .eq('period_month', month)
      .in('employee_id', empIds)

    const { data: otDays } = await supabase
      .from('timesheet_days')
      .select('overtime_hours, timesheet_week:timesheet_weeks!timesheet_week_id(employee_id)')
      .eq('overtime_flag', true)
      .gte('date', periodStart)
      .lte('date', periodEnd)

    const otByEmp = new Map<string, number>()
    for (const d of (otDays ?? [])) {
      const row = d as unknown as { overtime_hours: number | null; timesheet_week: { employee_id: string } }
      const id = row.timesheet_week?.employee_id
      if (!id) continue
      otByEmp.set(id, (otByEmp.get(id) ?? 0) + (row.overtime_hours ?? 0))
    }

    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('employee_id, total_days, start_date, end_date, status')
      .in('employee_id', empIds)
      .eq('status', 'approved')
      .lte('start_date', periodEnd)
      .gte('end_date', periodStart)

    const leaveByEmp = new Map<string, number>()
    for (const l of (leaves ?? [])) {
      leaveByEmp.set(l.employee_id, (leaveByEmp.get(l.employee_id) ?? 0) + (l.total_days ?? 0))
    }

    const verifByEmp = new Map(
      (verifications ?? []).map((v: { employee_id: string; status: string; verified_at: string | null; notes: string | null }) => [v.employee_id, v]),
    )

    const result: VerifRow[] = (employees ?? []).map((e: unknown) => {
      const emp = e as { id: string; first_name: string; surname: string; employee_code: string | null }
      const v = verifByEmp.get(emp.id)
      return {
        employee_id: emp.id,
        employee_name: `${emp.first_name} ${emp.surname}`,
        employee_code: emp.employee_code ?? '',
        period_month: month,
        ot_hours: otByEmp.get(emp.id) ?? 0,
        leave_days: leaveByEmp.get(emp.id) ?? 0,
        verified: v?.status === 'verified',
        verified_at: v?.verified_at ?? null,
        notes: v?.notes ?? '',
      }
    }).sort((a: VerifRow, b: VerifRow) => a.employee_name.localeCompare(b.employee_name))

    setRows(result)
    setLoading(false)
  }

  const verified = rows.filter(r => r.verified).length
  const pending = rows.length - verified

  return (
    <ReportShell title="Monthly Verification Status"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({
        'Employee': r.employee_name,
        'Code': r.employee_code,
        'Period': r.period_month,
        'OT Hours': r.ot_hours,
        'Leave Days': r.leave_days,
        'Verified': r.verified ? 'Yes' : 'No',
        'Verified At': r.verified_at ?? '',
        'Notes': r.notes,
      })), `verification-${month}`) : undefined}
      onPrint={rows.length ? () => printReport('verif-report') : undefined}
      loading={loading} reportId="verif-report"
    >
      <div className="flex flex-wrap items-end gap-3 mb-5 pb-5 border-b border-gray-100">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Period Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]" />
        </div>
        <TeamScopeToggle show={isAdmin} myTeamOnly={myTeamOnly} onChange={setMyTeamOnly} />
        <button onClick={runReport} disabled={loading}
          className="px-4 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8a] disabled:opacity-50 transition-colors">
          {loading ? 'Loading…' : 'Run Report'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="flex gap-6 mb-4 text-sm">
          <span className="text-green-700 font-medium">{verified} verified</span>
          <span className="text-amber-700 font-medium">{pending} pending</span>
          <span className="text-gray-500">{rows.length} total employees</span>
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Employee', 'Code', 'OT Hours', 'Leave Days', 'Verified', 'Verified At', 'Notes'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.employee_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{r.ot_hours > 0 ? r.ot_hours.toFixed(1) : '—'}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{r.leave_days > 0 ? r.leave_days : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.verified ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {r.verified ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.verified_at ? new Date(r.verified_at).toLocaleString('en-ZA') : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate" title={r.notes}>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
