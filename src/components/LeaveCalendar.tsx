import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateISO, getWeekBounds, fyEndYearFor } from '../lib/dateUtils'
import { IconCalendar, IconChevronLeft, IconChevronRight, IconXMark } from './Icons'
import birthdayCakeUrl from '../assets/birthday-cake.svg'
import birthdayCakeWhiteUrl from '../../assets/birthday-cake-white.svg'
import medalUrl from '../assets/medal-ribbons-star-svgrepo-com.svg'
import medalWhiteUrl from '../../assets/medal-ribbons-star-white.svg'
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
  unpaid:  { dot: 'bg-gray-500',    pill: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] border-[var(--border)]' },
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

export type AnniversaryMarker = {
  employee_id: string
  first_name: string
  surname: string
  anniversary_this_year: string  // ISO YYYY-MM-DD
  years_of_service: number
}

export default function LeaveCalendar({
  birthdays = [],
  anniversaries = [],
}: {
  birthdays?: BirthdayMarker[]
  anniversaries?: AnniversaryMarker[]
}) {
  const { profile } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const isDark = theme === 'dark'
  const cakeIcon  = isDark ? birthdayCakeWhiteUrl  : birthdayCakeUrl
  const medalIcon = isDark ? medalWhiteUrl          : medalUrl
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [rows, setRows] = useState<CalendarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ date: Date; entries: CalendarRow[] } | null>(null)
  const [teamOnly, setTeamOnly] = useState(false)
  const [bdayPopover, setBdayPopover] = useState<{ x: number; y: number; entries: BirthdayMarker[] } | null>(null)
  const [annivPopover, setAnnivPopover] = useState<{ x: number; y: number; entries: AnniversaryMarker[] } | null>(null)
  const [tsPopover, setTsPopover] = useState<{ x: number; y: number } | null>(null)
  const [outstandingWeeks, setOutstandingWeeks] = useState<Set<string>>(new Set())

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

  // Fetch outstanding timesheet weeks for the current user (current FY, past weeks only)
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const today = new Date()
      const fyEndYear = fyEndYearFor(today)
      const fyStart = new Date(fyEndYear - 1, 6, 1) // July 1 of FY start year
      const fyFirstMonday = getWeekBounds(fyStart).start
      const currentWeekStart = getWeekBounds(today).start

      // Build every expected Monday from FY start up to (not including) current week
      const expectedISOs: string[] = []
      const d = new Date(fyFirstMonday)
      while (d < currentWeekStart) {
        expectedISOs.push(formatDateISO(d))
        d.setDate(d.getDate() + 7)
      }
      if (expectedISOs.length === 0) return

      const { data } = await supabase
        .from('timesheet_weeks')
        .select('week_start, status')
        .eq('employee_id', profile.id)
        .gte('week_start', expectedISOs[0])
        .lt('week_start', formatDateISO(currentWeekStart))

      if (cancelled) return
      function trueMondayISO(ws: string) {
        const d = new Date(ws + 'T00:00:00')
        const dow = d.getDay() // 0 = Sun, 1 = Mon
        if (dow !== 1) d.setDate(d.getDate() + ((1 - dow + 7) % 7))
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const doneSet = new Set(
        (data ?? []).filter(w => w.status === 'submitted' || w.status === 'approved').map(w => trueMondayISO(w.week_start))
      )
      setOutstandingWeeks(new Set(expectedISOs.filter(iso => !doneSet.has(iso))))
    })()
    return () => { cancelled = true }
  }, [profile?.id])

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

  // Map ISO date → work anniversaries
  const anniversariesByDate = useMemo(() => {
    const map = new Map<string, AnniversaryMarker[]>()
    for (const a of anniversaries) {
      const key = a.anniversary_this_year
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return map
  }, [anniversaries])

  const grid = useMemo(() => buildGrid(month), [month])
  const today = new Date()
  const monthLabel = month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-[var(--surface)] rounded-lg shadow-sm border border-[var(--border)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <IconCalendar className="w-4 h-4 text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Team leave calendar</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSupervisor && (
            <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={teamOnly}
                onChange={(e) => setTeamOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border)] text-[#1B5EA6] focus:ring-[#1B5EA6]"
              />
              My team only
            </label>
          )}
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="text-xs border border-[var(--border)] rounded-md px-2 py-1 bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
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
              className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
              aria-label="Previous month"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="text-xs px-2 py-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
              aria-label="Next month"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Month label + legend */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 pt-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">{monthLabel}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
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
        <div className="grid grid-cols-7 gap-px text-[11px] font-medium text-[var(--calendar-weekday)] mb-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-[var(--calendar-grid-gap)] rounded-md overflow-hidden">
          {grid.map((d) => {
            const iso = formatDateISO(d)
            const inMonth = d.getMonth() === month.getMonth()
            const isToday = sameDay(d, today)
            const entries = byDate.get(iso) ?? []
            const bdayEntries = birthdaysByDate.get(iso) ?? []
            const annivEntries = anniversariesByDate.get(iso) ?? []
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            const hasBirthdays = bdayEntries.length > 0
            const hasAnniversaries = annivEntries.length > 0
            const isMonday = d.getDay() === 1
            const isOutstanding = isMonday && inMonth && !isWeekend && outstandingWeeks.has(iso)
            return (
              <button
                key={iso}
                type="button"
                onClick={() => entries.length > 0 && setSelected({ date: d, entries })}
                className={`min-h-[72px] sm:min-h-[88px] text-left p-1.5 transition-colors
                  ${inMonth ? 'bg-[var(--calendar-surface)]' : 'bg-[var(--calendar-outside-bg)]'}
                  ${isWeekend && inMonth ? 'bg-[var(--calendar-weekend-bg)]' : ''}
                  ${entries.length > 0 ? 'hover:bg-[var(--calendar-hover-bg)] cursor-pointer' : 'cursor-default'}
                `}
              >
                <div className={`flex items-center justify-between text-[11px] mb-1
                  ${inMonth ? 'text-[var(--calendar-text)]' : 'text-[var(--calendar-date-outside)]'}`}
                >
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full
                    ${isToday ? 'bg-[#1B5EA6] text-white font-semibold' : ''}`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {isOutstanding && (
                      <span
                        onClick={e => {
                          e.stopPropagation()
                          setTsPopover(null)
                          navigate('/timesheets', { state: { weekStart: iso } })
                        }}
                        onMouseEnter={e => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setTsPopover({ x: r.left + r.width / 2, y: r.bottom })
                        }}
                        onMouseLeave={() => setTsPopover(null)}
                        className="inline-block w-2 h-2 rounded-full bg-amber-400 ring-1 ring-amber-600/30 cursor-pointer flex-shrink-0"
                        aria-label="Timesheet outstanding — click to open"
                      />
                    )}
                    {hasBirthdays && (
                      <span
                        onMouseEnter={e => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setBdayPopover({ x: r.left + r.width / 2, y: r.bottom, entries: bdayEntries })
                        }}
                        onMouseLeave={() => setBdayPopover(null)}
                      >
                        <img src={cakeIcon} alt="Birthday" className="w-3.5 h-3.5 cursor-default" />
                      </span>
                    )}
                    {hasAnniversaries && (
                      <span
                        onMouseEnter={e => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setAnnivPopover({ x: r.left + r.width / 2, y: r.bottom, entries: annivEntries })
                        }}
                        onMouseLeave={() => setAnnivPopover(null)}
                      >
                        <img src={medalIcon} alt="Anniversary" className="w-3.5 h-3.5 cursor-default" />
                      </span>
                    )}
                    {entries.length > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)]">{entries.length}</span>
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
        {loading && <p className="text-xs text-[var(--text-muted)] mt-2">Loading…</p>}
        {!loading && filteredRows.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-2">No approved leave in this view.</p>
        )}
      </div>

      {/* Timesheet outstanding popover */}
      {tsPopover && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ top: tsPopover.y + 6, left: tsPopover.x, transform: 'translateX(-50%)' }}
        >
          <div className="bg-[var(--surface-elevated)] border border-amber-300 text-[var(--text-primary)] text-[11px] rounded-md px-2.5 py-1.5 shadow-lg min-w-max relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[var(--surface-elevated)]" />
            <span className="font-semibold text-amber-700">⚠️ Timesheet outstanding</span>
            <span className="block text-[var(--text-muted)] mt-0.5">Click to open and fill in this week.</span>
          </div>
        </div>
      )}

      {/* Birthday popover */}
      {bdayPopover && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ top: bdayPopover.y + 6, left: bdayPopover.x, transform: 'translateX(-50%)' }}
        >
          <div className="bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-[11px] rounded-md px-2.5 py-1.5 shadow-lg flex flex-col gap-0.5 min-w-max relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[var(--surface-elevated)]" />
            <span className="font-semibold text-[var(--text-secondary)] mb-0.5">🎂 Birthdays</span>
            {bdayPopover.entries.map(b => (
              <span key={b.employee_id}>{b.first_name} {b.surname}</span>
            ))}
          </div>
        </div>
      )}

      {/* Anniversary popover */}
      {annivPopover && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ top: annivPopover.y + 6, left: annivPopover.x, transform: 'translateX(-50%)' }}
        >
          <div className="bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-[11px] rounded-md px-2.5 py-1.5 shadow-lg flex flex-col gap-0.5 min-w-max relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[var(--surface-elevated)]" />
            <span className="font-semibold text-[var(--text-secondary)] mb-0.5">🏅 Work Anniversaries</span>
            {annivPopover.entries.map(a => (
              <span key={a.employee_id}>{a.first_name} {a.surname} · {a.years_of_service}yr</span>
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
            className="bg-[var(--surface)] rounded-lg shadow-lg w-full max-w-md max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                On leave · {selected.date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-muted)]"
                aria-label="Close"
              >
                <IconXMark className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {selected.entries.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-3">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-semibold text-white ${LEAVE_COLORS[r.leave_type].dot}`}>
                    {initialsOf(r.first_name, r.surname)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{fullName(r)}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
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
