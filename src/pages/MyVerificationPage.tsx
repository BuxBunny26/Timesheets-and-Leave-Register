import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IconCheckCircle } from '../components/Icons'

interface MonthSummary {
  ot_hours: number
  leave_days: number
  ot_days: Array<{ date: string; hours: number }>
  leaves: Array<{ leave_type: string; start_date: string; end_date: string; total_days: number; status: string }>
}

interface Verification {
  status: 'pending' | 'verified' | 'overdue'
  verified_at: string | null
  notes: string | null
}

interface WeekStatus {
  week_start: string
  week_end: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
}

function monthOptions(count = 6): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function periodBounds(period: string) {
  const [yr, mo] = period.split('-').map(Number)
  const start = `${yr}-${String(mo).padStart(2, '0')}-01`
  const lastDay = new Date(yr, mo, 0).getDate()
  const end = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export default function MyVerificationPage() {
  const { profile } = useAuth()
  const months = useMemo(() => monthOptions(6), [])
  const [period, setPeriod] = useState(months[0])
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [verification, setVerification] = useState<Verification | null>(null)
  const [weeks, setWeeks] = useState<WeekStatus[]>([])
  const [expectedWeeks, setExpectedWeeks] = useState(0)
  const [notes, setNotes] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setError(null)
    const { start, end } = periodBounds(period)

    const [{ data: otDays }, { data: leaves }, { data: verif }, { data: weekRows }] = await Promise.all([

      supabase
        .from('timesheet_days')
        .select('date, overtime_hours, timesheet_week:timesheet_weeks!timesheet_week_id(employee_id)')
        .eq('overtime_flag', true)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('leave_requests')
        .select('leave_type, start_date, end_date, total_days, status')
        .eq('employee_id', profile.id)
        .eq('status', 'approved')
        .lte('start_date', end)
        .gte('end_date', start)
        .order('start_date'),
      supabase
        .from('timesheet_verifications')
        .select('status, verified_at, notes')
        .eq('employee_id', profile.id)
        .eq('period_month', period)
        .maybeSingle(),
      supabase
        .from('timesheet_weeks')
        .select('week_start, week_end, status')
        .eq('employee_id', profile.id)
        .lte('week_start', end)
        .gte('week_end', start)
        .order('week_start'),
    ])

    // Expected weeks: those whose Monday (week_start) falls within this month
    const startD = new Date(start + 'T00:00:00')
    const endD = new Date(end + 'T00:00:00')
    // Don't require future weeks (the month isn't over yet). Cap the end of
    // the expected range at today's Monday — weeks that haven't started yet
    // shouldn't block verification of the current month.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMonday = new Date(today)
    const todayDow = (today.getDay() + 6) % 7 // 0 = Monday
    todayMonday.setDate(today.getDate() - todayDow)
    const expectedEnd = endD < todayMonday ? endD : todayMonday
    // Walk Mondays from the first Monday on/after the period start
    const firstMon = new Date(startD)
    const dayShift = (firstMon.getDay() + 6) % 7 // 0 = Monday
    if (dayShift !== 0) firstMon.setDate(firstMon.getDate() + (7 - dayShift))
    let expected = 0
    for (let d = new Date(firstMon); d <= expectedEnd; d.setDate(d.getDate() + 7)) expected++
    setExpectedWeeks(expected)
    // Compute each week's true Monday (legacy data may have week_start anchored to
    // Sunday due to an old timezone bug). A week belongs to this period if its
    // Monday falls within [start, end]. We also dedupe by that Monday so a legacy
    // ghost row (Sunday-anchored draft) can't block a real Monday-anchored
    // submitted/approved row for the same week.
    function trueMondayISO(ws: string) {
      const d = new Date(ws + 'T00:00:00')
      const dow = d.getDay() // 0 = Sun, 1 = Mon
      if (dow !== 1) d.setDate(d.getDate() + ((1 - dow + 7) % 7))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const STATUS_RANK: Record<WeekStatus['status'], number> = {
      approved: 3, submitted: 2, rejected: 1, draft: 0,
    }
    const byMonday = new Map<string, WeekStatus>()
    for (const w of (weekRows ?? []) as WeekStatus[]) {
      const monday = trueMondayISO(w.week_start)
      if (monday < start || monday > end) continue
      const existing = byMonday.get(monday)
      if (!existing || STATUS_RANK[w.status] > STATUS_RANK[existing.status]) {
        // Normalise week_start to the true Monday so the UI/badge shows the right date.
        byMonday.set(monday, { ...w, week_start: monday })
      }
    }
    const weeksInPeriod = Array.from(byMonday.values()).sort((a, b) => a.week_start.localeCompare(b.week_start))
    setWeeks(weeksInPeriod)

    const myOt = (otDays ?? [])
      .filter((d: unknown) => (d as { timesheet_week: { employee_id: string } }).timesheet_week?.employee_id === profile.id)
      .map((d: unknown) => {
        const row = d as { date: string; overtime_hours: number | null }
        return { date: row.date, hours: row.overtime_hours ?? 0 }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    const otTotal = myOt.reduce((s, r) => s + r.hours, 0)
    // Count working-day overlap of each leave with this period (so leaves spanning
    // multiple months only contribute the working days that fall in this month).
    function workingDaysBetween(aISO: string, bISO: string): number {
      const a = new Date(aISO + 'T00:00:00')
      const b = new Date(bISO + 'T00:00:00')
      if (b < a) return 0
      let n = 0
      for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay()
        if (dow !== 0 && dow !== 6) n++
      }
      return n
    }
    const leaveTotal = (leaves ?? []).reduce((s: number, l: { start_date: string; end_date: string }) => {
      const a = l.start_date > start ? l.start_date : start
      const b = l.end_date < end ? l.end_date : end
      return s + workingDaysBetween(a, b)
    }, 0)

    setSummary({
      ot_hours: otTotal,
      leave_days: leaveTotal,
      ot_days: myOt,
      leaves: leaves ?? [],
    })
    setVerification(verif as Verification | null)
    setNotes((verif as Verification | null)?.notes ?? '')
    setConfirm(false)
    setLoading(false)
  }, [profile?.id, period])

  useEffect(() => {
    load()
  }, [load])

  async function handleVerify() {
    if (!profile?.id || !confirm) return
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('timesheet_verifications')
      .upsert(
        {
          employee_id: profile.id,
          period_month: period,
          status: 'verified',
          verified_at: new Date().toISOString(),
          notes: notes.trim() || null,
        },
        { onConflict: 'employee_id,period_month' },
      )
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSavedAt(Date.now())
    await load()
  }

  const alreadyVerified = verification?.status === 'verified'
  const unsubmittedWeeks = weeks.filter(w => w.status !== 'submitted' && w.status !== 'approved')
  const missingCount = Math.max(0, expectedWeeks - weeks.length)
  const canVerify = unsubmittedWeeks.length === 0 && missingCount === 0 && weeks.length > 0

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Monthly Verification</h1>
        <p className="text-[var(--text-muted)] mt-1 text-sm">
          Review your overtime and approved leave for the month, then confirm the totals are correct.
        </p>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Period</label>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
        >
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Loading…</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Overtime hours</p>
              <p className="text-3xl font-semibold text-[var(--text-primary)] mt-1">{summary.ot_hours.toFixed(1)}</p>
              {summary.ot_days.length > 0 && (
                <ul className="mt-3 text-xs text-[var(--text-secondary)] space-y-1 max-h-40 overflow-auto">
                  {summary.ot_days.map(d => (
                    <li key={d.date} className="flex justify-between">
                      <span>{d.date}</span>
                      <span className="font-medium text-[var(--text-primary)]">{d.hours.toFixed(1)} h</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Approved leave days</p>
              <p className="text-3xl font-semibold text-[var(--text-primary)] mt-1">{summary.leave_days}</p>
              {summary.leaves.length > 0 && (
                <ul className="mt-3 text-xs text-[var(--text-secondary)] space-y-1 max-h-40 overflow-auto">
                  {summary.leaves.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="capitalize">{l.leave_type}</span>
                      <span className="text-[var(--text-muted)]">{l.start_date} → {l.end_date}</span>
                      <span className="font-medium text-[var(--text-primary)]">{l.total_days} d</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
            {alreadyVerified ? (
              <div className="flex items-start gap-3">
                <span className="text-green-600 mt-0.5"><IconCheckCircle className="w-5 h-5" /></span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Verified</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {verification?.verified_at ? new Date(verification.verified_at).toLocaleString('en-ZA') : ''}
                  </p>
                  {verification?.notes && (
                    <p className="text-sm text-[var(--text-secondary)] mt-2 whitespace-pre-wrap">{verification.notes}</p>
                  )}
                </div>
              </div>
            ) : !canVerify ? (
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Cannot verify yet</p>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  All weeks in {period} must be submitted before you can verify the month.
                </p>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                  {unsubmittedWeeks.map(w => (
                    <li key={w.week_start} className="flex justify-between">
                      <span>{w.week_start} → {w.week_end}</span>
                      <span className="capitalize text-red-600">{w.status}</span>
                    </li>
                  ))}
                  {missingCount > 0 && (
                    <li className="text-red-600">{missingCount} week(s) not started.</li>
                  )}
                </ul>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Confirm your monthly totals</p>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any clarifications about your overtime or leave for this month."
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] mb-3"
                />
                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none mb-3">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={e => setConfirm(e.target.checked)}
                    className="mt-1 rounded border-[var(--border)]"
                  />
                  <span>I confirm the overtime hours and approved leave shown above for {period} are correct.</span>
                </label>
                {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                {savedAt && <p className="text-xs text-green-600 mb-2">Saved.</p>}
                <button
                  onClick={handleVerify}
                  disabled={!confirm || saving || !canVerify}
                  className="px-4 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8a] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Mark as verified'}
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
