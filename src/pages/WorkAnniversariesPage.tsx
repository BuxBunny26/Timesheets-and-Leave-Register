import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconTrophy } from '../components/Icons'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const MILESTONES = [1, 3, 5, 10, 15, 20, 25, 30]

type AnniversaryRow = {
  employee_id: string
  first_name: string
  surname: string
  employee_code: string | null
  site_id: string | null
  department_id: string | null
  supervisor_id: string | null
  status: string
  start_date: string         // ISO date YYYY-MM-DD
  anniversary_this_year: string  // YYYY-MM-DD (this calendar year)
  years_of_service: number
}

function daysUntil(isoDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(isoDate + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function AnniversaryBadge({ iso }: { iso: string }) {
  const d = daysUntil(iso)
  if (d === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Today!</span>
  if (d === 1) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">Tomorrow</span>
  if (d > 0 && d <= 7) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">In {d} days</span>
  if (d > 0 && d <= 30) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">In {d} days</span>
  return null
}

function MilestoneBadge({ years }: { years: number }) {
  if (!MILESTONES.includes(years)) return null
  const colour =
    years >= 25 ? 'bg-purple-100 text-purple-800' :
    years >= 10 ? 'bg-amber-100 text-amber-800' :
    years >= 5  ? 'bg-blue-100 text-blue-800' :
                  'bg-green-100 text-green-800'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${colour}`}>
      <IconTrophy className="w-3 h-3" /> {years}yr milestone
    </span>
  )
}

function buildAnniversaryRows(rawRows: { id: string; first_name: string; surname: string; employee_code: string | null; site_id: string | null; department_id: string | null; supervisor_id: string | null; status: string; employee_details: { start_date: string }[] | null }[]): AnniversaryRow[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const currentYear = today.getFullYear()

  return rawRows.flatMap(p => {
    const startRaw = p.employee_details?.[0]?.start_date
    if (!startRaw) return []
    const startDate = new Date(startRaw + 'T00:00:00')
    if (isNaN(startDate.getTime())) return []

    // Anniversary this calendar year
    let anniversaryThisYear = new Date(currentYear, startDate.getMonth(), startDate.getDate())
    // If already passed, show next year's
    const yearsThisYear = currentYear - startDate.getFullYear()
    if (anniversaryThisYear < today) {
      anniversaryThisYear = new Date(currentYear + 1, startDate.getMonth(), startDate.getDate())
    }
    const displayYear = anniversaryThisYear.getFullYear()
    const years = displayYear - startDate.getFullYear()

    const isoAnniversary = anniversaryThisYear.toISOString().slice(0, 10)

    return [{
      employee_id: p.id,
      first_name: p.first_name,
      surname: p.surname,
      employee_code: p.employee_code,
      site_id: p.site_id,
      department_id: p.department_id,
      supervisor_id: p.supervisor_id,
      status: p.status,
      start_date: startRaw,
      anniversary_this_year: isoAnniversary,
      years_of_service: years,
    }]
  })
}

export default function WorkAnniversariesPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<AnniversaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())

  const isManager = ['manager', 'admin_manager', 'system_admin'].includes(profile?.role ?? '')
  const isSupervisor = profile?.role === 'supervisor'

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, first_name, surname, employee_code, site_id, department_id, supervisor_id, status,
          employee_details!employee_details_employee_id_fkey(start_date)
        `)
        .eq('status', 'active')
        .order('surname')

      if (!cancelled && !error && data) {
        const built = buildAnniversaryRows(data as Parameters<typeof buildAnniversaryRows>[0])
        built.sort((a, b) => a.anniversary_this_year.localeCompare(b.anniversary_this_year))
        setRows(built)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile])

  const byMonth = useMemo(() => {
    const map: Record<number, AnniversaryRow[]> = {}
    for (let i = 0; i < 12; i++) map[i] = []
    for (const r of rows) {
      const m = new Date(r.anniversary_this_year + 'T00:00:00').getMonth()
      map[m].push(r)
    }
    return map
  }, [rows])

  const todaysAnniversaries = useMemo(() =>
    rows.filter(r => daysUntil(r.anniversary_this_year) === 0), [rows])

  const upcomingWeek = useMemo(() =>
    rows.filter(r => { const d = daysUntil(r.anniversary_this_year); return d > 0 && d <= 7 }), [rows])

  const monthRows = byMonth[selectedMonth] ?? []

  if (!isManager && !isSupervisor) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        You don't have access to view team work anniversaries.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Work Anniversaries</h1>
        <p className="text-sm text-gray-500 mt-0.5">Based on start dates in employee profiles — active employees only.</p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          No anniversary data yet. Add start dates to employee profiles.
        </div>
      ) : (
        <>
          {todaysAnniversaries.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">Today's anniversaries</p>
              <div className="flex flex-wrap gap-2">
                {todaysAnniversaries.map(r => (
                  <Link
                    key={r.employee_id}
                    to={`/employees/${r.employee_id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-full text-sm font-medium text-amber-900 hover:bg-amber-100"
                  >
                    <IconTrophy className="w-4 h-4 text-amber-600" />
                    {r.first_name} {r.surname}
                    <span className="text-xs text-amber-600">{r.years_of_service} year{r.years_of_service !== 1 ? 's' : ''}</span>
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
                      {new Date(r.anniversary_this_year + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
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
              <p className="px-4 py-6 text-sm text-gray-500 text-center">No anniversaries in {MONTHS[selectedMonth]}.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {monthRows.map(r => {
                  const anniv = new Date(r.anniversary_this_year + 'T00:00:00')
                  return (
                    <li key={r.employee_id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                      <div className="w-12 text-center flex-shrink-0">
                        <p className="text-lg font-bold text-gray-800 leading-none">{anniv.getDate()}</p>
                        <p className="text-[11px] text-gray-400 uppercase tracking-wide">{MONTHS[anniv.getMonth()].slice(0, 3)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/employees/${r.employee_id}`}
                          className="text-sm font-medium text-gray-900 hover:text-[#1B5EA6]"
                        >
                          {r.first_name} {r.surname}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Started {new Date(r.start_date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-700">
                          {r.years_of_service} yr{r.years_of_service !== 1 ? 's' : ''}
                        </span>
                        <MilestoneBadge years={r.years_of_service} />
                        <AnniversaryBadge iso={r.anniversary_this_year} />
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
  )
}
