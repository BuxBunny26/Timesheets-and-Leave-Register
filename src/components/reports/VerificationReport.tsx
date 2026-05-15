import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import { exportToExcel, printReport } from '../../lib/reportExports'
import StatusBadge from '../StatusBadge'

interface VerifRow {
  employee_name: string
  employee_code: string
  period_month: string
  status: string
  verified_at: string | null
  notes: string
}

export default function VerificationReport() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [rows, setRows] = useState<VerifRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runReport() {
    setLoading(true)

    const { data: verifications } = await supabase
      .from('timesheet_verifications')
      .select(`period_month, status, verified_at, notes,
        employee:profiles!employee_id(first_name, surname, employee_code)`)
      .eq('period_month', month)

    const { data: employees } = await supabase
      .from('profiles')
      .select('id, first_name, surname, employee_code')
      .eq('status', 'active')

    const verifByEmpId = new Map((verifications ?? []).map((v: unknown) => {
      const row = v as { period_month: string; status: string; verified_at: string | null; notes: string; employee: { first_name: string; surname: string; employee_code: string | null } }
      return [`${row.employee.first_name} ${row.employee.surname}`, row]
    }))

    const result: VerifRow[] = (employees ?? []).map((e: unknown) => {
      const emp = e as { id: string; first_name: string; surname: string; employee_code: string | null }
      const name = `${emp.first_name} ${emp.surname}`
      const v = verifByEmpId.get(name) as { status: string; verified_at: string | null; notes: string } | undefined
      return {
        employee_name: name,
        employee_code: emp.employee_code ?? '',
        period_month: month,
        status: v?.status ?? 'pending',
        verified_at: v?.verified_at ?? null,
        notes: v?.notes ?? '',
      }
    }).sort((a: VerifRow, b: VerifRow) => a.employee_name.localeCompare(b.employee_name))

    setRows(result)
    setLoading(false)
  }

  const verified = rows.filter(r => r.status === 'verified').length
  const pending = rows.filter(r => r.status !== 'verified').length

  return (
    <ReportShell title="Monthly Verification Status"
      onExcel={rows.length ? () => exportToExcel(rows.map(r => ({
        'Employee': r.employee_name, 'Code': r.employee_code, 'Period': r.period_month,
        'Status': r.status, 'Verified At': r.verified_at ?? '', 'Notes': r.notes,
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
                {['Employee', 'Code', 'Status', 'Verified At', 'Notes'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.employee_code}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.verified_at ? new Date(r.verified_at).toLocaleString('en-ZA') : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  )
}
