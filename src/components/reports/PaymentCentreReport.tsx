import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ReportShell from './ReportShell'
import DateRangeFilter from './DateRangeFilter'
import { exportPaymentCentreExcel, printReport } from '../../lib/reportExports'
import { formatDateDisplay } from '../../lib/dateUtils'
import StatusBadge from '../StatusBadge'

interface PCRow {
  employee_name: string
  employee_code: string
  division: string
  department: string
  site: string
  date: string
  day: string
  status: string
  ot_hours: number | null
  lol: boolean
  loi: boolean
}

export default function PaymentCentreReport() {
  const [centre, setCentre] = useState<'WEARCHECK' | 'GP_CONSULT'>('WEARCHECK')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<PCRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runReport() {
    setLoading(true)

    const { data: employees } = await supabase
      .from('profiles')
      .select(`id, first_name, surname, employee_code,
        division:divisions!division_id(name),
        department:departments!department_id(name),
        site:sites!site_id(name),
        payment_centre:payment_centres!payment_centre_id(code)`)
      .eq('status', 'active')

    const centreEmployees = (employees ?? []).filter((e: unknown) => {
      const emp = e as { payment_centre: { code: string } | null }
      return emp.payment_centre?.code === centre
    })

    const empIds = centreEmployees.map((e: unknown) => (e as { id: string }).id)
    if (empIds.length === 0) { setRows([]); setLoading(false); return }

    const { data: days } = await supabase
      .from('timesheet_days')
      .select(`date, day_of_week, primary_status, overtime_flag, overtime_hours, lol_flag, loi_flag,
        timesheet_week:timesheet_weeks!timesheet_week_id(employee_id)`)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    const empMap = new Map(centreEmployees.map((e: unknown) => {
      const emp = e as { id: string; first_name: string; surname: string; employee_code: string | null; division: { name: string } | null; department: { name: string } | null; site: { name: string } | null }
      return [emp.id, emp]
    }))

    const result: PCRow[] = []
    for (const d of (days ?? [])) {
      const day = d as unknown as { date: string; day_of_week: string; primary_status: string; overtime_flag: boolean; overtime_hours: number | null; lol_flag: boolean; loi_flag: boolean; timesheet_week: { employee_id: string } }
      const emp = empMap.get(day.timesheet_week?.employee_id)
      if (!emp) continue
      result.push({
        employee_name: `${emp.first_name} ${emp.surname}`,
        employee_code: emp.employee_code ?? '',
        division: emp.division?.name ?? '',
        department: emp.department?.name ?? '',
        site: emp.site?.name ?? '',
        date: day.date,
        day: day.day_of_week,
        status: day.primary_status,
        ot_hours: day.overtime_flag ? day.overtime_hours : null,
        lol: day.lol_flag,
        loi: day.loi_flag,
      })
    }

    result.sort((a, b) => a.employee_code.localeCompare(b.employee_code) || a.date.localeCompare(b.date))
    setRows(result)
    setLoading(false)
  }

  function handleExcel() {
    exportPaymentCentreExcel(rows.map(r => ({
      'Employee Name': r.employee_name,
      'Employee Code': r.employee_code,
      'Division': r.division,
      'Department': r.department,
      'Site': r.site,
      'Date': r.date,
      'Day': r.day,
      'Status': r.status,
      'OT Hours': r.ot_hours ?? '',
      'LOL': r.lol ? 'Yes' : '',
      'LOI': r.loi ? 'Yes' : '',
    })), `payment-centre-${centre}-${startDate}-${endDate}`)
  }

  // Group rows by employee for display
  const grouped = new Map<string, PCRow[]>()
  for (const r of rows) {
    if (!grouped.has(r.employee_code)) grouped.set(r.employee_code, [])
    grouped.get(r.employee_code)!.push(r)
  }

  return (
    <ReportShell
      title="Payment Centre Export"
      subtitle={centre === 'WEARCHECK' ? 'WearCheck employees' : 'GP Consult employees'}
      onExcel={rows.length ? handleExcel : undefined}
      onPrint={rows.length ? () => printReport('pc-report') : undefined}
      loading={loading}
      reportId="pc-report"
    >
      <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} onRun={runReport} loading={loading}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Centre</label>
          <select value={centre} onChange={e => setCentre(e.target.value as 'WEARCHECK' | 'GP_CONSULT')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]">
            <option value="WEARCHECK">WearCheck</option>
            <option value="GP_CONSULT">GP Consult</option>
          </select>
        </div>
      </DateRangeFilter>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Run the report to see results.</p>
      ) : (
        <div className="space-y-6 overflow-x-auto">
          {Array.from(grouped.entries()).map(([code, empRows]) => {
            const otTotal = empRows.reduce((s, r) => s + (r.ot_hours ?? 0), 0)
            const lolTotal = empRows.filter(r => r.lol).length
            const loiTotal = empRows.filter(r => r.loi).length
            return (
              <div key={code}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-sm text-gray-900">{empRows[0].employee_name}</span>
                  <span className="text-xs text-gray-400">{code}</span>
                  <span className="text-xs text-gray-400">{empRows[0].division} · {empRows[0].department} · {empRows[0].site}</span>
                </div>
                <table className="w-full text-sm mb-1">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-1.5 text-xs font-medium text-gray-500">Date</th>
                      <th className="px-3 py-1.5 text-xs font-medium text-gray-500">Day</th>
                      <th className="px-3 py-1.5 text-xs font-medium text-gray-500">Status</th>
                      <th className="px-3 py-1.5 text-xs font-medium text-gray-500 text-center">OT hrs</th>
                      <th className="px-3 py-1.5 text-xs font-medium text-gray-500 text-center">LOL</th>
                      <th className="px-3 py-1.5 text-xs font-medium text-gray-500 text-center">LOI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {empRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{formatDateDisplay(r.date)}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.day}</td>
                        <td className="px-3 py-1.5"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-1.5 text-center text-gray-700">{r.ot_hours ?? '—'}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700">{r.lol ? 'Yes' : '—'}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700">{r.loi ? 'Yes' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 text-xs font-semibold text-gray-700">
                      <td colSpan={3} className="px-3 py-1.5">Subtotal</td>
                      <td className="px-3 py-1.5 text-center">{otTotal > 0 ? otTotal.toFixed(1) : '—'}</td>
                      <td className="px-3 py-1.5 text-center">{lolTotal > 0 ? lolTotal : '—'}</td>
                      <td className="px-3 py-1.5 text-center">{loiTotal > 0 ? loiTotal : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </ReportShell>
  )
}
