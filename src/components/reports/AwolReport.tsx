import { useState, Fragment } from 'react'
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleEmployee(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
    setExpanded(new Set())
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
        <p className="text-sm text-[var(--text-muted)] text-center py-8">No AWOL records in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          {(() => {
            type Group = { key: string; name: string; code: string; site: string; rows: AwolRow[] }
            const groupMap = new Map<string, Group>()
            for (const r of rows) {
              const key = `${r.employee_name}|${r.employee_code}`
              const g = groupMap.get(key)
              if (g) g.rows.push(r)
              else groupMap.set(key, { key, name: r.employee_name, code: r.employee_code, site: r.site, rows: [r] })
            }
            const groups = Array.from(groupMap.values())
            groups.forEach(g => g.rows.sort((a, b) => a.date.localeCompare(b.date)))
            groups.sort((a, b) => a.name.localeCompare(b.name))
            return (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--surface-secondary)]">
                      <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left w-8" />
                      <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Employee</th>
                      <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Code</th>
                      <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Date</th>
                      <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Day</th>
                      <th className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] text-left">Site</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {groups.map(g => {
                      const isOpen = expanded.has(g.key)
                      return (
                        <Fragment key={g.key}>
                          <tr
                            onClick={() => toggleEmployee(g.key)}
                            className="hover:bg-[var(--surface-secondary)] cursor-pointer bg-gray-50/50 font-medium"
                          >
                            <td className="px-3 py-2 text-[var(--text-muted)] select-none">
                              <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                            </td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">{g.name}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{g.code}</td>
                            <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              {g.rows.length} AWOL {g.rows.length === 1 ? 'day' : 'days'}
                            </td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              {isOpen ? 'Click to collapse' : 'Click to expand'}
                            </td>
                          </tr>
                          {g.rows.map((r, i) => (
                            <tr
                              key={`${g.key}-${i}`}
                              className={`hover:bg-[var(--surface-secondary)] ${isOpen ? '' : 'hidden print:table-row'}`}
                            >
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 text-[var(--text-secondary)] pl-8">↳</td>
                              <td className="px-3 py-2 text-[var(--text-muted)]">{r.employee_code}</td>
                              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.date}</td>
                              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.day}</td>
                              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.site}</td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-[var(--text-muted)] mt-3">{rows.length} AWOL record{rows.length !== 1 ? 's' : ''} found across {groups.length} employee{groups.length !== 1 ? 's' : ''}.</p>
              </>
            )
          })()}
        </div>
      )}
    </ReportShell>
  )
}
