import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import CelebrationCardModal from '../components/CelebrationCardModal'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

type BirthdayRow = {
  employee_id: string
  first_name: string
  surname: string
  employee_code: string | null
  site_id: string | null
  birthday_this_year: string   // ISO date YYYY-MM-DD
}

function daysUntilBirthday(isoThisYear: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const bday = new Date(isoThisYear + 'T00:00:00')
  return Math.round((bday.getTime() - today.getTime()) / 86_400_000)
}

function BirthdayBadge({ isoThisYear }: { isoThisYear: string }) {
  const d = daysUntilBirthday(isoThisYear)
  if (d === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Today!</span>
  if (d === 1) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">Tomorrow</span>
  if (d > 0 && d <= 7) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">In {d} days</span>
  if (d > 0 && d <= 30) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">In {d} days</span>
  return null
}

export default function BirthdaysPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<BirthdayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth()) // 0-based

  const isManager = ['manager', 'admin_manager', 'system_admin'].includes(profile?.role ?? '')
  const isSupervisor = profile?.role === 'supervisor'
  const [cardTarget, setCardTarget] = useState<BirthdayRow | null>(null)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('birthdays_this_year')
        .select('employee_id, first_name, surname, employee_code, site_id, birthday_this_year')
        .order('birthday_this_year')
      if (!cancelled && !error && data) setRows(data as BirthdayRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile])

  // Group by month (0-based from birthday_this_year)
  const byMonth = useMemo(() => {
    const map: Record<number, BirthdayRow[]> = {}
    for (let i = 0; i < 12; i++) map[i] = []
    for (const r of rows) {
      const m = new Date(r.birthday_this_year + 'T00:00:00').getMonth()
      map[m].push(r)
    }
    return map
  }, [rows])

  const todaysBirthdays = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return rows.filter(r => daysUntilBirthday(r.birthday_this_year) === 0)
  }, [rows])

  const upcomingWeek = useMemo(() => {
    return rows.filter(r => {
      const d = daysUntilBirthday(r.birthday_this_year)
      return d > 0 && d <= 7
    })
  }, [rows])

  const monthRows = byMonth[selectedMonth] ?? []

  if (!isManager && !isSupervisor) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        You don't have access to view team birthdays.
      </div>
    )
  }

  return (
    <>
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Birthdays</h1>
        <p className="text-sm text-gray-500 mt-0.5">Extracted from SA ID numbers — only active employees with ID numbers on file.</p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          No birthday data yet. Add SA ID numbers to employee profiles to see birthdays here.
        </div>
      ) : (
        <>
          {/* Today / this week callouts */}
          {todaysBirthdays.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">Today's birthdays</p>
              <div className="flex flex-wrap gap-2">
                {todaysBirthdays.map(r => (
                  <Link
                    key={r.employee_id}
                    to={`/employees/${r.employee_id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-full text-sm font-medium text-amber-900 hover:bg-amber-100"
                  >
                    {r.first_name} {r.surname}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {upcomingWeek.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-800 mb-2">Coming up this week</p>
              <div className="flex flex-wrap gap-2">
                {upcomingWeek.map(r => (
                  <Link
                    key={r.employee_id}
                    to={`/employees/${r.employee_id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-full text-sm text-blue-900 hover:bg-blue-100"
                  >
                    {r.first_name} {r.surname}
                    <span className="text-xs text-blue-500">
                      {new Date(r.birthday_this_year + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Month selector */}
          <div className="flex gap-1 flex-wrap">
            {MONTHS.map((name, i) => (
              <button
                key={i}
                onClick={() => setSelectedMonth(i)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedMonth === i
                    ? 'bg-[#1B5EA6] text-white border-[#1B5EA6]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#1B5EA6] hover:text-[#1B5EA6]'
                }`}
              >
                {name.slice(0, 3)}
                {byMonth[i].length > 0 && (
                  <span className={`ml-1 ${selectedMonth === i ? 'text-blue-200' : 'text-gray-400'}`}>
                    {byMonth[i].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Month detail */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-800">
                {MONTHS[selectedMonth]} — {monthRows.length} {monthRows.length === 1 ? 'employee' : 'employees'}
              </h2>
            </div>
            {monthRows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">No birthdays in {MONTHS[selectedMonth]}.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {monthRows.map(r => {
                  const bday = new Date(r.birthday_this_year + 'T00:00:00')
                  return (
                    <li key={r.employee_id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* day badge */}
                        <div className="flex-none flex flex-col items-center justify-center w-10 h-10 bg-[#1B5EA6]/10 rounded-lg">
                          <span className="text-[11px] font-medium text-[#1B5EA6] leading-none uppercase">
                            {bday.toLocaleDateString('en-ZA', { month: 'short' })}
                          </span>
                          <span className="text-base font-bold text-[#1B5EA6] leading-none">{bday.getDate()}</span>
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/employees/${r.employee_id}`}
                            className="text-sm font-medium text-gray-900 hover:text-[#1B5EA6] hover:underline truncate block"
                          >
                            {r.first_name} {r.surname}
                          </Link>
                          {r.employee_code && (
                            <p className="text-xs text-gray-500">{r.employee_code}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-none">
                        <BirthdayBadge isoThisYear={r.birthday_this_year} />
                        <button
                          onClick={() => setCardTarget(r)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-pink-200 text-pink-700 hover:bg-pink-50 transition-colors"
                          title="Open birthday card"
                        >
                          🎂 Wishes
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>

    {cardTarget && (
      <CelebrationCardModal
        employee={{ id: cardTarget.employee_id, first_name: cardTarget.first_name, surname: cardTarget.surname }}
        occasion="birthday"
        year={currentYear}
        onClose={() => setCardTarget(null)}
      />
    )}
    </>
  )
}
