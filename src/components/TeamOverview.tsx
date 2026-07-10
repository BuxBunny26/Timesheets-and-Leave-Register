import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getWeekBounds, formatDateISO } from '../lib/dateUtils'
import type { Profile, TimesheetStatus } from '../types'

interface EmployeeWeekCell {
  weekStart: string
  status: TimesheetStatus | null
  monthKey: string         // YYYY-MM for verification lookup
  verified: boolean        // employee verified this cell's month
  otApproved: boolean      // supervisor approved at least one OT day in this week
}

interface EmployeeRow {
  profile: Profile
  weeks: EmployeeWeekCell[]
  pendingCount: number
  currentMonthVerified: boolean
}

function monthKeyOf(isoDate: string): string {
  // isoDate = YYYY-MM-DD
  return isoDate.slice(0, 7)
}

function getLastEightMondays(): Date[] {
  const mondays: Date[] = []
  const today = new Date()
  const { start: thisMonday } = getWeekBounds(today)
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisMonday)
    d.setDate(thisMonday.getDate() - i * 7)
    mondays.push(d)
  }
  return mondays
}

function cellClass(status: TimesheetStatus | null): string {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'submitted':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'draft':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'rejected':
      return 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] border-[var(--border)]'
    default:
      return 'bg-red-50 text-red-600 border-red-200'
  }
}

function cellLabel(status: TimesheetStatus | null): string {
  switch (status) {
    case 'approved':
      return 'Approved'
    case 'submitted':
      return 'Submitted'
    case 'draft':
      return 'Draft'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Not started'
  }
}

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  const label =
    selected.length === 0 ? placeholder
    : selected.length === 1 ? selected[0]
    : `${selected.length} selected`
  return (
    <div
      className="relative"
      tabIndex={-1}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`border rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 whitespace-nowrap ${selected.length ? 'border-blue-400 text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
      >
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
            {selected.length}
          </span>
        )}
        <svg className="w-3 h-3 opacity-50 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg min-w-[200px] max-h-60 overflow-y-auto py-1">
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--surface-secondary)] cursor-pointer text-sm text-[var(--text-primary)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-blue-600 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="truncate max-w-[160px]">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeamOverview() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState({
    search: '',
    departments: [] as string[],
    sites: [] as string[],
    divisions: [] as string[],
    jobTitles: [] as string[],
    approval: '',
    verification: '',
  })

  const mondays = getLastEightMondays()
  const weekStarts = mondays.map(d => formatDateISO(d))
  const isAdmin = profile?.role === 'admin_manager' || profile?.role === 'system_admin' || profile?.role === 'manager'

  useEffect(() => {
    if (!profile?.id) return
    fetchTeam()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function fetchTeam() {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      // Fetch employees
      let query = supabase
        .from('profiles')
        .select('*, division:divisions(*), department:departments(*), payment_centre:payment_centres(*), site:sites(*)')
        .eq('status', 'active')
        .neq('id', profile.id)

      if (!isAdmin) {
        query = query.eq('supervisor_id', profile.id)
      }

      const { data: employees, error: empError } = await query.order('surname')
      if (empError) throw empError

      const typedEmployees = (employees ?? []) as Profile[]
      if (typedEmployees.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const employeeIds = typedEmployees.map(e => e.id)

      // Fetch timesheet weeks for last 8 weeks for all employees
      const { data: weekData, error: weekError } = await supabase
        .from('timesheet_weeks')
        .select('employee_id, week_start, status')
        .in('employee_id', employeeIds)
        .in('week_start', weekStarts)

      if (weekError) throw weekError

      const weekMap = new Map<string, TimesheetStatus>()
      for (const row of weekData ?? []) {
        weekMap.set(`${row.employee_id}__${row.week_start}`, row.status as TimesheetStatus)
      }

      // Fetch monthly verifications covering the visible months
      const monthKeys = [...new Set(weekStarts.map(monthKeyOf))]
      const { data: verifData, error: verifError } = await supabase
        .from('timesheet_verifications')
        .select('employee_id, period_month, status')
        .in('employee_id', employeeIds)
        .in('period_month', monthKeys)

      if (verifError) throw verifError

      const verifMap = new Map<string, string>()
      for (const row of verifData ?? []) {
        verifMap.set(`${row.employee_id}__${row.period_month}`, row.status as string)
      }

      // Fetch supervisor-approved OT for the visible weeks. The set holds
      // `${employee_id}__${week_start}` keys for any week with at least one
      // approved OT entry, so we can render an "A" badge even when the week
      // itself is still 'submitted'.
      const { data: otApprovedData, error: otApprovedError } = await supabase
        .from('ot_approvals')
        .select('employee_id, timesheet_day:timesheet_days!timesheet_day_id(timesheet_week:timesheet_weeks!timesheet_week_id(week_start))')
        .in('employee_id', employeeIds)
        .eq('status', 'approved')
      if (otApprovedError) throw otApprovedError

      const otApprovedSet = new Set<string>()
      for (const row of (otApprovedData ?? []) as unknown as Array<{
        employee_id: string
        timesheet_day: { timesheet_week: { week_start: string } | null } | null
      }>) {
        const ws = row.timesheet_day?.timesheet_week?.week_start
        if (ws && weekStarts.includes(ws)) {
          otApprovedSet.add(`${row.employee_id}__${ws}`)
        }
      }

      const currentMonthKey = monthKeyOf(weekStarts[weekStarts.length - 1])

      const employeeRows: EmployeeRow[] = typedEmployees.map(emp => {
        const weeks: EmployeeWeekCell[] = weekStarts.map(ws => {
          const mk = monthKeyOf(ws)
          return {
            weekStart: ws,
            status: weekMap.get(`${emp.id}__${ws}`) ?? null,
            monthKey: mk,
            verified: !!verifMap.get(`${emp.id}__${mk}`),
            otApproved: otApprovedSet.has(`${emp.id}__${ws}`),
          }
        })
        const pendingCount = weeks.filter(w => w.status === 'submitted').length
        const currentMonthVerified = !!verifMap.get(`${emp.id}__${currentMonthKey}`)
        return { profile: emp, weeks, pendingCount, currentMonthVerified }
      })

      setRows(employeeRows)
    } catch (err) {
      setError('Failed to load team data.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Summary counts for current week
  const currentWeekStart = weekStarts[weekStarts.length - 1]

  // Derived filter options (from loaded rows)
  const deptOptions     = [...new Set(rows.map(r => r.profile.department?.name).filter((v): v is string => !!v))].sort()
  const siteOptions     = [...new Set(rows.map(r => r.profile.site?.name).filter((v): v is string => !!v))].sort()
  const divOptions      = [...new Set(rows.map(r => r.profile.division?.name).filter((v): v is string => !!v))].sort()
  const jobTitleOptions = [...new Set(rows.map(r => r.profile.job_title).filter((v): v is string => !!v))].sort()
  const hasFilter = !!(filter.search || filter.departments.length || filter.sites.length || filter.divisions.length || filter.jobTitles.length || filter.approval || filter.verification)

  const filteredRows = rows.filter(r => {
    const p = r.profile
    const search = filter.search.toLowerCase()
    if (search) {
      const name = `${p.first_name} ${p.surname}`.toLowerCase()
      const code = (p.employee_code ?? '').toLowerCase()
      if (!name.includes(search) && !code.includes(search)) return false
    }
    if (filter.departments.length && !filter.departments.includes(p.department?.name ?? '')) return false
    if (filter.sites.length && !filter.sites.includes(p.site?.name ?? '')) return false
    if (filter.divisions.length && !filter.divisions.includes(p.division?.name ?? '')) return false
    if (filter.jobTitles.length && !filter.jobTitles.includes(p.job_title ?? '')) return false

    if (filter.approval) {
      const cwCell = r.weeks.find(w => w.weekStart === currentWeekStart)
      const s = cwCell?.status ?? null
      if (filter.approval === 'approved'   && s !== 'approved') return false
      if (filter.approval === 'pending'    && s !== 'submitted') return false
      if (filter.approval === 'rejected'   && s !== 'rejected') return false
      if (filter.approval === 'not_started' && s !== null) return false
    }
    if (filter.verification) {
      if (filter.verification === 'verified'     && !r.currentMonthVerified) return false
      if (filter.verification === 'not_verified' && r.currentMonthVerified) return false
    }
    return true
  })

  const submittedThisWeek = filteredRows.filter(r => {
    const cell = r.weeks.find(w => w.weekStart === currentWeekStart)
    return cell?.status === 'submitted'
  }).length
  const notStartedThisWeek = filteredRows.filter(r => {
    const cell = r.weeks.find(w => w.weekStart === currentWeekStart)
    return !cell?.status
  }).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)] text-sm">
        No direct reports found.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)] bg-[var(--surface)] rounded-lg border border-[var(--border)] px-4 py-3">
        <span>
          <span className="font-semibold text-blue-700">{submittedThisWeek}</span> submitted awaiting approval this week
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="font-semibold text-red-600">{notStartedThisWeek}</span> not started this week
        </span>
        {hasFilter && (
          <span className="text-[var(--text-muted)] ml-auto text-xs">{filteredRows.length} of {rows.length} employees</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-[var(--surface)] rounded-lg border border-[var(--border)] px-4 py-3">
        <input
          type="search"
          placeholder="Search name or code…"
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
        />
        {deptOptions.length > 1 && (
          <MultiSelect
            options={deptOptions}
            selected={filter.departments}
            onChange={v => setFilter(f => ({ ...f, departments: v }))}
            placeholder="All departments"
          />
        )}
        {siteOptions.length > 1 && (
          <MultiSelect
            options={siteOptions}
            selected={filter.sites}
            onChange={v => setFilter(f => ({ ...f, sites: v }))}
            placeholder="All sites"
          />
        )}
        {divOptions.length > 1 && (
          <MultiSelect
            options={divOptions}
            selected={filter.divisions}
            onChange={v => setFilter(f => ({ ...f, divisions: v }))}
            placeholder="All divisions"
          />
        )}
        {jobTitleOptions.length > 1 && (
          <MultiSelect
            options={jobTitleOptions}
            selected={filter.jobTitles}
            onChange={v => setFilter(f => ({ ...f, jobTitles: v }))}
            placeholder="All job titles"
          />
        )}
        <select
          value={filter.approval}
          onChange={e => setFilter(f => ({ ...f, approval: e.target.value }))}
          className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Approval status this week"
        >
          <option value="">Any approval</option>
          <option value="approved">Approved</option>
          <option value="pending">To be approved</option>
          <option value="rejected">Rejected</option>
          <option value="not_started">Not started</option>
        </select>
        <select
          value={filter.verification}
          onChange={e => setFilter(f => ({ ...f, verification: e.target.value }))}
          className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Self-verification status this month"
        >
          <option value="">Any verification</option>
          <option value="verified">Verified</option>
          <option value="not_verified">Not verified</option>
        </select>
        {hasFilter && (
          <button
            onClick={() => setFilter({ search: '', departments: [], sites: [], divisions: [], jobTitles: [], approval: '', verification: '' })}
            className="text-sm text-[var(--text-muted)] hover:text-gray-600 px-2 py-1.5"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] w-48">Employee</th>
              {mondays.map((monday, i) => (
                <th key={i} className="text-center px-2 py-3 font-medium text-[var(--text-secondary)] whitespace-nowrap">
                  {monday.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filteredRows.map(row => (
              <tr key={row.profile.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {row.profile.first_name} {row.profile.surname}
                      </p>
                      <p className="text-[var(--text-muted)]">{row.profile.employee_code}</p>
                    </div>
                    {row.pendingCount > 0 && (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white leading-none">
                        {row.pendingCount}
                      </span>
                    )}
                  </div>
                </td>
                {row.weeks.map((cell, ci) => (
                  <td key={ci} className="px-2 py-3 text-center">
                    <div className="inline-flex flex-col items-center gap-0.5">
                      <span
                        className={`inline-block px-2 py-1 rounded border text-[10px] font-medium whitespace-nowrap ${cellClass(cell.status)}`}
                      >
                        {cellLabel(cell.status)}
                      </span>
                      <div className="flex items-center gap-0.5 h-3">
                        {(cell.status === 'approved' || cell.otApproved) && (
                          <span
                            title={cell.status === 'approved' ? 'Supervisor approved' : 'Supervisor approved overtime'}
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-green-600 text-white text-[8px] font-bold leading-none"
                          >A</span>
                        )}
                        {cell.verified && (
                          <span
                            title="Employee verified this month"
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-indigo-600 text-white text-[8px] font-bold leading-none"
                          >V</span>
                        )}
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-200" /> Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-200" /> Submitted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Draft
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" /> Not started
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-[var(--surface-secondary)] border border-[var(--border)]" /> Rejected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-green-600 text-white text-[8px] font-bold leading-none">A</span>
          Supervisor approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-indigo-600 text-white text-[8px] font-bold leading-none">V</span>
          Employee verified (monthly)
        </span>
      </div>
    </div>
  )
}
