import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDateISO } from '../lib/dateUtils'
import { IconCalendar, IconBalloon, IconChevronLeft, IconChevronRight, IconXMark } from './Icons'
import type { LeaveType, Role } from '../types'

const SUPERVISOR_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']

type CalendarRow = {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  first_name: string | null
  surname: string | null
  site_id: string | null
  site_name: string | null
  supervisor_id: string | null
}

type SiteOption = { id: string; name: string }

const LEAVE_COLORS: Record<LeaveType, { dot: string; pill: string }> = {
  annual:  { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  sick:    { dot: 'bg-rose-500',    pill: 'bg-rose-50 text-rose-700 border-rose-200' },
  family:  { dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  study:   { dot: 'bg-sky-500',     pill: 'bg-sky-50 text-sky-700 border-sky-200' },
  unpaid:  { dot: 'bg-gray-500',    pill: 'bg-gray-50 text-gray-700 border-gray-200' },
  other:   { dot: 'bg-violet-500',  pill: 'bg-violet-50 text-violet-700 border-violet-200' },
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Build a Mon-start 6-week grid covering the supplied month. */
function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month)
  const firstDay = first.getDay() // 0=Sun..6=Sat
  // Days to shift back so grid starts on Monday
  const back = firstDay === 0 ? 6 : firstDay - 1
  const gridStart = addDays(first, -back)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

function initialsOf(first?: string | null, last?: string | null) {
  const f = (first ?? '').trim().charAt(0).toUpperCase()
  const l = (last ?? '').trim().charAt(0).toUpperCase()
  return (f + l) || '?'
}

function fullName(r: CalendarRow) {
  return `${r.first_name ?? ''} ${r.surname ?? ''}`.trim() || 'Unknown'
}

export type BirthdayMarker = {
  employee_id: string
  first_name: string
  surname: string
  birthday_this_year: string   // ISO YYYY-MM-DD
}

export default function LeaveCalendar({ birthdays = [] }: { birthdays?: BirthdayMarker[] }) {
  const { profile } = useAuth()
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [rows, setRows] = useState<CalendarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ date: Date; entries: CalendarRow[] } | null>(null)
  const [teamOnly, setTeamOnly] = useState(false)
  const [bdayPopover, setBdayPopover] = useState<{ x: number; y: number; entries: BirthdayMarker[] } | null>(null)

  const isSupervisor = !!(profile?.role && SUPERVISOR_ROLES.includes(profile.role))

  // Load sites for the filter
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('sites').select('id, name').order('name')
      if (!cancelled && data) setSites(data as SiteOption[])
    })()
    return () => { cancelled = true }
  }, [])

  // Default site filter = viewer's own site once profile is available
  useEffect(() => {
    if (profile?.site_id && siteFilter === 'all') {
      setSiteFilter(profile.site_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.site_id])

  // Load approved leave overlapping the visible grid
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const grid = buildGrid(month)
    const gridStartISO = formatDateISO(grid[0])
    const gridEndISO = formatDateISO(grid[grid.length - 1])
    ;(async () => {
      const { data, error } = await supabase
        .from('approved_leave_calendar')
        .select('id, employee_id, leave_type, start_date, end_date, first_name, surname, site_id, site_name, supervisor_id')
        .lte('start_date', gridEndISO)
        .gte('end_date', gridStartISO)
      if (cancelled) return
      if (error) {
        console.error('Leave calendar fetch error:', error)
        setRows([])
      } else {
        setRows((data ?? []) as CalendarRow[])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [month])

  const filteredRows = useMemo(() => {
    let out = rows
    if (siteFilter !== 'all') out = out.filter(r => r.site_id === siteFilter)
    if (teamOnly && profile?.id) out = out.filter(r => r.supervisor_id === profile.id)
    return out
  }, [rows, siteFilter, teamOnly, profile?.id])

  // Map ISO date → entries on that date
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarRow[]>()
    for (const r of filteredRows) {
      const start = new Date(r.start_date + 'T00:00:00')
      const end = new Date(r.end_date + 'T00:00:00')
      const cur = new Date(start)
      while (cur <= end) {
        const iso = formatDateISO(cur)
        if (!map.has(iso)) map.set(iso, [])
        map.get(iso)!.push(r)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [filteredRows])

  // Map ISO date → birthday names
  const birthdaysByDate = useMemo(() => {
    const map = new Map<string, BirthdayMarker[]>()
    for (const b of birthdays) {
      const key = b.birthday_this_year
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    }
    return map
  }, [birthdays])

  const grid = useMemo(() => buildGrid(month), [month])
  const today = new Date()
  const monthLabel = month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <IconCalendar className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Team leave calendar</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSupervisor && (
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={teamOnly}
                onChange={(e) => setTeamOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1B5EA6] focus:ring-[#1B5EA6]"
              />
              My team only
            </label>
          )}
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            aria-label="Filter by site"
          >
            <option value="all">All sites</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              className="p-1 rounded hover:bg-gray-100 text-gray-600"
              aria-label="Previous month"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className="p-1 rounded hover:bg-gray-100 text-gray-600"
              aria-label="Next month"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Month label + legend */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 pt-3">
        <p className="text-sm font-medium text-gray-800">{monthLabel}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {(Object.keys(LEAVE_COLORS) as LeaveType[]).map(t => (
            <span key={t} className="inline-flex items-center gap-1 capitalize">
              <span className={`w-2 h-2 rounded-full ${LEAVE_COLORS[t].dot}`} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="p-3">
        <div className="grid grid-cols-7 gap-px text-[11px] font-medium text-gray-500 mb-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-md overflow-hidden">
          {grid.map((d) => {
            const iso = formatDateISO(d)
            const inMonth = d.getMonth() === month.getMonth()
            const isToday = sameDay(d, today)
            const entries = byDate.get(iso) ?? []
            const bdayEntries = birthdaysByDate.get(iso) ?? []
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            const hasBirthdays = bdayEntries.length > 0
            return (
              <button
                key={iso}
                type="button"
                onClick={() => entries.length > 0 && setSelected({ date: d, entries })}
                className={`min-h-[72px] sm:min-h-[88px] text-left p-1.5 transition-colors
                  ${inMonth ? 'bg-white' : 'bg-gray-50'}
                  ${isWeekend && inMonth ? 'bg-gray-50/60' : ''}
                  ${entries.length > 0 ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'}
                `}
              >
                <div className={`flex items-center justify-between text-[11px] mb-1
                  ${inMonth ? 'text-gray-700' : 'text-gray-400'}`}
                >
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full
                    ${isToday ? 'bg-[#1B5EA6] text-white font-semibold' : ''}`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {hasBirthdays && (
                      <span
                        onMouseEnter={e => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setBdayPopover({ x: r.left + r.width / 2, y: r.bottom, entries: bdayEntries })
                        }}
                        onMouseLeave={() => setBdayPopover(null)}
                      >
                        <IconBalloon className="w-3.5 h-3.5 text-gray-800 cursor-default" />
                      </span>
                    )}
                    {entries.length > 0 && (
                      <span className="text-[10px] text-gray-400">{entries.length}</span>
                    )}
                  </span>
                </div>
                {entries.length >= 3 ? (
                  // Crowded day: collapse to a single "Multi" badge to keep the cell readable.
                  <div className="flex items-center gap-1 text-[10px] rounded px-1 py-0.5 border bg-indigo-50 text-indigo-700 border-indigo-200">
                    <span className="inline-flex -space-x-1">
                      {entries.slice(0, 3).map((r) => (
                        <span
                          key={r.id + iso + '-md'}
                          className={`w-2 h-2 rounded-full ring-1 ring-white ${LEAVE_COLORS[r.leave_type].dot}`}
                        />
                      ))}
                    </span>
                    <span className="font-semibold">Multi</span>
                    <span className="text-indigo-500">({entries.length})</span>
                  </div>
                ) : (
                  <>
                    {/* Mobile: initials-only avatar chips */}
                    <div className="sm:hidden flex flex-wrap gap-0.5">
                      {entries.map((r) => (
                        <span
                          key={r.id + iso + '-m'}
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold text-white ${LEAVE_COLORS[r.leave_type].dot}`}
                          title={fullName(r)}
                        >
                          {initialsOf(r.first_name, r.surname)}
                        </span>
                      ))}
                    </div>
                    {/* Desktop: name pills */}
                    <div className="hidden sm:block space-y-0.5">
                      {entries.map((r) => (
                        <div
                          key={r.id + iso}
                          className={`flex items-center gap-1 text-[10px] truncate rounded px-1 py-0.5 border ${LEAVE_COLORS[r.leave_type].pill}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-none ${LEAVE_COLORS[r.leave_type].dot}`} />
                          <span className="truncate">{r.first_name ?? ''} {(r.surname ?? '').charAt(0)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>
        {loading && <p className="text-xs text-gray-400 mt-2">Loading…</p>}
        {!loading && filteredRows.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">No approved leave in this view.</p>
        )}
      </div>

      {/* Birthday popover — fixed positioning escapes the overflow:hidden grid */}
      {bdayPopover && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ top: bdayPopover.y + 6, left: bdayPopover.x, transform: 'translateX(-50%)' }}
        >
          <div className="bg-gray-900 text-white text-[11px] rounded-md px-2.5 py-1.5 shadow-lg flex flex-col gap-0.5 min-w-max relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
            <span className="font-semibold text-gray-300 mb-0.5">Birthdays</span>
            {bdayPopover.entries.map(b => (
              <span key={b.employee_id}>{b.first_name} {b.surname}</span>
            ))}
          </div>
        </div>
      )}

      {/* Day detail modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">
                On leave · {selected.date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <IconXMark className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-gray-50">
              {selected.entries.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-3">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-semibold text-white ${LEAVE_COLORS[r.leave_type].dot}`}>
                    {initialsOf(r.first_name, r.surname)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{fullName(r)}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {r.site_name ?? 'No site'} · {new Date(r.start_date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                      {' – '}
                      {new Date(r.end_date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${LEAVE_COLORS[r.leave_type].pill}`}>
                    {r.leave_type}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
