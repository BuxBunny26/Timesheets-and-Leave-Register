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
  if (d > 0 && d <= 30) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-secondary)] text-[var(--text-secondary)]">In {d} days</span>
  return null
}

export default function BirthdaysPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<BirthdayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth()) // 0-based

  const [cardTarget, setCardTarget] = useState<BirthdayRow | null>(null)
  const currentYear = new Date().getFullYear()

  // Set of employee_ids the current user has already wished this year
  const [wishedSet, setWishedSet] = useState<Set<string>>(new Set())

  async function refreshWishedSet() {
    if (!profile?.id) return
    const { data } = await supabase
      .from('celebration_messages')
      .select('employee_id')
      .eq('author_id', profile.id)
      .eq('occasion', 'birthday')
      .eq('year', currentYear)
    setWishedSet(new Set((data ?? []).map((r: { employee_id: string }) => r.employee_id)))
  }

  // Current user's own birthday row (if their ID is on file)
  const [myBirthdayRow, setMyBirthdayRow] = useState<BirthdayRow | null>(null)
  // Count of wishes on the current user's own card
  const [myWishCount, setMyWishCount] = useState<number | null>(null)
  const [loadingMyCard, setLoadingMyCard] = useState(true)

  // Fetch current user's own birthday row + wish count
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      setLoadingMyCard(true)
      const [{ data: bdayData }, { count }] = await Promise.all([
        supabase
          .from('birthdays_this_year')
          .select('employee_id, first_name, surname, employee_code, site_id, birthday_this_year')
          .eq('employee_id', profile.id)
          .maybeSingle(),
        supabase
          .from('celebration_messages')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', profile.id)
          .eq('occasion', 'birthday')
          .eq('year', currentYear),
      ])
      if (!cancelled) {
        setMyBirthdayRow(bdayData as BirthdayRow | null)
        setMyWishCount(count ?? 0)
      }
      setLoadingMyCard(false)
    })()
    return () => { cancelled = true }
  }, [profile?.id, currentYear])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [{ data, error }] = await Promise.all([
        supabase
          .from('birthdays_this_year')
          .select('employee_id, first_name, surname, employee_code, site_id, birthday_this_year')
          .order('birthday_this_year'),
      ])
      if (!cancelled && !error && data) setRows(data as BirthdayRow[])
      setLoading(false)
      if (!cancelled) refreshWishedSet()
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

  // My card banner — shown to ALL users at the top
  const myBdayDaysAway = myBirthdayRow ? daysUntilBirthday(myBirthdayRow.birthday_this_year) : null
  const isBdayToday = myBdayDaysAway === 0
  const isBdaySoon  = myBdayDaysAway !== null && myBdayDaysAway > 0 && myBdayDaysAway <= 14

  function MyCardBanner() {
    if (loadingMyCard) return null

    if (!myBirthdayRow) {
      // No birthday on file — prompt them to add ID
      return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex items-start gap-4">
          <span className="text-3xl leading-none select-none">🎂</span>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Your Birthday Card</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Your birthday card isn't available yet.{' '}
              <Link to="/profile" className="text-[var(--primary)] underline hover:no-underline">
                Add your SA ID number to your profile
              </Link>{' '}
              to unlock it and start receiving wishes from your colleagues.
            </p>
          </div>
        </div>
      )
    }

    const bdayDate = new Date(myBirthdayRow.birthday_this_year + 'T00:00:00')
    const bdayLabel = bdayDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })

    return (
      <div className={`rounded-xl border p-5 ${
        isBdayToday
          ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
          : isBdaySoon
            ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
            : 'bg-[var(--surface)] border-[var(--border)]'
      }`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none select-none">
              {isBdayToday ? '🎉' : '🎂'}
            </span>
            <div>
              <p className={`text-sm font-semibold ${isBdayToday ? 'text-amber-800' : isBdaySoon ? 'text-blue-800' : 'text-[var(--text-primary)]'}`}>
                {isBdayToday
                  ? `Happy Birthday, ${myBirthdayRow.first_name}! 🎊`
                  : `Your Birthday Card — ${bdayLabel}`}
              </p>
              <p className={`text-xs mt-0.5 ${isBdayToday ? 'text-amber-700' : isBdaySoon ? 'text-blue-600' : 'text-[var(--text-muted)]'}`}>
                {isBdayToday
                  ? 'Your colleagues can send you wishes today!'
                  : isBdaySoon
                    ? `Your birthday is in ${myBdayDaysAway} day${myBdayDaysAway === 1 ? '' : 's'} — colleagues can already wish you!`
                    : `Your colleagues can send you birthday wishes anytime.`}
              </p>
              {myWishCount !== null && myWishCount > 0 && (
                <p className="text-xs font-medium text-emerald-700 mt-1">
                  ✨ {myWishCount} {myWishCount === 1 ? 'colleague has' : 'colleagues have'} wished you a happy birthday!
                </p>
              )}
              {myWishCount === 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  No wishes yet — share this with your team! 🎈
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setCardTarget(myBirthdayRow)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-none ${
              isBdayToday
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : isBdaySoon
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white'
            }`}
          >
            🎂 Open my card
            {myWishCount !== null && myWishCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-white/25 rounded-full text-[11px] font-bold">
                {myWishCount}
              </span>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Birthdays</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Extracted from SA ID numbers — only active employees with ID numbers on file.</p>
      </div>

      {/* Every user sees their own birthday card */}
      <MyCardBanner />

      {loading ? (
        <div className="text-center py-10 text-[var(--text-muted)] text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center text-sm text-[var(--text-muted)]">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-amber-300 rounded-full text-sm font-medium text-amber-900 hover:bg-amber-100"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-blue-200 rounded-full text-sm text-blue-900 hover:bg-blue-100"
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
                    : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1B5EA6] hover:text-[#1B5EA6]'
                }`}
              >
                {name.slice(0, 3)}
                {byMonth[i].length > 0 && (
                  <span className={`ml-1 ${selectedMonth === i ? 'text-blue-200' : 'text-[var(--text-muted)]'}`}>
                    {byMonth[i].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Month detail */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-secondary)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {MONTHS[selectedMonth]} — {monthRows.length} {monthRows.length === 1 ? 'employee' : 'employees'}
              </h2>
            </div>
            {monthRows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">No birthdays in {MONTHS[selectedMonth]}.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {monthRows.map(r => {
                  const bday = new Date(r.birthday_this_year + 'T00:00:00')
                  return (
                    <li key={r.employee_id} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-secondary)] gap-4">
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
                            className="text-sm font-medium text-[var(--text-primary)] hover:text-[#1B5EA6] hover:underline truncate block"
                          >
                            {r.first_name} {r.surname}
                          </Link>
                          {r.employee_code && (
                            <p className="text-xs text-[var(--text-muted)]">{r.employee_code}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-none">
                        <BirthdayBadge isoThisYear={r.birthday_this_year} />
                        {wishedSet.has(r.employee_id) ? (
                          <button
                            onClick={() => setCardTarget(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                            title="You've sent your wishes — click to view the card"
                          >
                            ✓ Wished!
                          </button>
                        ) : (
                          <button
                            onClick={() => setCardTarget(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-pink-200 text-pink-700 hover:bg-pink-50 transition-colors"
                            title="Open birthday card"
                          >
                            🎂 Wishes
                          </button>
                        )}
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
        onClose={() => {
          setCardTarget(null)
          refreshWishedSet()
          // Also refresh own card wish count if viewing own card
          if (cardTarget?.employee_id === profile?.id) {
            supabase
              .from('celebration_messages')
              .select('id', { count: 'exact', head: true })
              .eq('employee_id', profile.id)
              .eq('occasion', 'birthday')
              .eq('year', currentYear)
              .then(({ count }) => setMyWishCount(count ?? 0))
          }
        }}
      />
    )}
    </>
  )
}
