import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import { exportToExcel, printReport } from '../../lib/reportExports'
import StatusBadge from '../StatusBadge'

interface VerifRow {
  employee_name: string
  employee_code: string
  department: string
  status: string
  verified_at: string | null
}

export default function VerificationReport() {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`)
  const [rows, setRows] = useState<VerifRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runReport() {
    setLoading(true)
    const { data: employees } = await supabase
      .from('profiles')
      .select('id, first_name, surname, employee_code, department:departments!department_id(name)')
      .eq('status', 'active')
      .order('surname')

    const { data: verifs } = await supabase
      .from('timesheet_verifications')
      .select('employee_id, status, verified_at')
      .eq('period_month', month)

    const verifMap = new Map((verifs ?? []).map((v: { employee_id: string; status: string; verified_at: string | null }) => [v.employee_id, v]))

    setRows((employees ?? []).map((e: unknown) => {
      const emp = e as { id: string; first_name: string; surname: string; employee_code: string | null; department: { name: string } | null }
      const v = verifMap.get(emp.id)
      return {
        employee_name: `${emp.first_name} ${emp.surname}`,
        employee_code: emp.employee_code ?? '',
        department: emp.department?.name ?? '',
        status: v?.status ?? 'pending',
        verified_at: v?.verified_at ?? null,
      }
    }))
    setLoading(false)
  }

  const verifiedCount = rows.filter(r => r.status === 'verified').length

  return (
    <ReportShell title="Monthly Verification Status"
      subtitle={rows.length ? `${verifiedCount}/${rows.length} verified` : undefined}
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({ 'Employee': r.employee_name, 'Code': r.employee_code, 'Department': r.department, 'Status': r.status, 'Verified At': r.verified_at ?? '' })), `verification-${month}`) : undefined}
      onPrint={rows.length ? () => printReport('verif-report') : undefined}
      loading={loading} reportId="verif-report"
    >
      <div className="flex items-end gap-3 mb-5 pb-5 border-b border-gray-100">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]" />
        </div>
        <button onClick={runReport} disabled={loading}
          className="px-4 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8c] disabled:opacity-50 transition-colors">
          {loading ? 'Loading...' : 'Run report'}
        </button>
      </div>
      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Select a month and run the report.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Employee', 'Code', 'Department', 'Status', 'Verified At'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.verified_at ? new Date(r.verified_at).toLocaleString('en-ZA') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
