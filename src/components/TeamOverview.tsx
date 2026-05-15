import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getWeekBounds, formatDateISO } from '../lib/dateUtils'
import type { Profile, TimesheetStatus } from '../types'

interface EmployeeWeekCell {
  weekStart: string
  status: TimesheetStatus | null
}

interface EmployeeRow {
  profile: Profile
  weeks: EmployeeWeekCell[]
  pendingCount: number
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
      return 'bg-gray-100 text-gray-600 border-gray-200'
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

export default function TeamOverview() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mondays = getLastEightMondays()
  const weekStarts = mondays.map(d => formatDateISO(d))
  const isAdmin = profile?.role === 'admin_manager' || profile?.role === 'system_admin'

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

      const employeeRows: EmployeeRow[] = typedEmployees.map(emp => {
        const weeks: EmployeeWeekCell[] = weekStarts.map(ws => ({
          weekStart: ws,
          status: weekMap.get(`${emp.id}__${ws}`) ?? null,
        }))
        const pendingCount = weeks.filter(w => w.status === 'submitted').length
        return { profile: emp, weeks, pendingCount }
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
  const submittedThisWeek = rows.filter(r => {
    const cell = r.weeks.find(w => w.weekStart === currentWeekStart)
    return cell?.status === 'submitted'
  }).length
  const notStartedThisWeek = rows.filter(r => {
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-500 text-sm">
        No direct reports found.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-gray-600 bg-white rounded-lg border border-gray-100 px-4 py-3">
        <span>
          <span className="font-semibold text-blue-700">{submittedThisWeek}</span> submitted awaiting approval this week
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="font-semibold text-red-600">{notStartedThisWeek}</span> not started this week
        </span>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-48">Employee</th>
              {mondays.map((monday, i) => (
                <th key={i} className="text-center px-2 py-3 font-medium text-gray-600 whitespace-nowrap">
                  {monday.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => (
              <tr key={row.profile.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {row.profile.first_name} {row.profile.surname}
                      </p>
                      <p className="text-gray-400">{row.profile.employee_code}</p>
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
                    <span
                      className={`inline-block px-2 py-1 rounded border text-[10px] font-medium whitespace-nowrap ${cellClass(cell.status)}`}
                    >
                      {cellLabel(cell.status)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
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
          <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Rejected
        </span>
      </div>
    </div>
  )
}
