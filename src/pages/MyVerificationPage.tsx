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

    const [{ data: otDays }, { data: leaves }, { data: verif }] = await Promise.all([
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
    ])

    const myOt = (otDays ?? [])
      .filter((d: unknown) => (d as { timesheet_week: { employee_id: string } }).timesheet_week?.employee_id === profile.id)
      .map((d: unknown) => {
        const row = d as { date: string; overtime_hours: number | null }
        return { date: row.date, hours: row.overtime_hours ?? 0 }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    const otTotal = myOt.reduce((s, r) => s + r.hours, 0)
    const leaveTotal = (leaves ?? []).reduce((s: number, l: { total_days: number }) => s + (l.total_days ?? 0), 0)

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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Monthly Verification</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Review your overtime and approved leave for the month, then confirm the totals are correct.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <label className="block text-xs font-medium text-gray-600 mb-1">Period</label>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
        >
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Overtime hours</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{summary.ot_hours.toFixed(1)}</p>
              {summary.ot_days.length > 0 && (
                <ul className="mt-3 text-xs text-gray-600 space-y-1 max-h-40 overflow-auto">
                  {summary.ot_days.map(d => (
                    <li key={d.date} className="flex justify-between">
                      <span>{d.date}</span>
                      <span className="font-medium text-gray-800">{d.hours.toFixed(1)} h</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Approved leave days</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{summary.leave_days}</p>
              {summary.leaves.length > 0 && (
                <ul className="mt-3 text-xs text-gray-600 space-y-1 max-h-40 overflow-auto">
                  {summary.leaves.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="capitalize">{l.leave_type}</span>
                      <span className="text-gray-500">{l.start_date} → {l.end_date}</span>
                      <span className="font-medium text-gray-800">{l.total_days} d</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            {alreadyVerified ? (
              <div className="flex items-start gap-3">
                <span className="text-green-600 mt-0.5"><IconCheckCircle className="w-5 h-5" /></span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Verified</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {verification?.verified_at ? new Date(verification.verified_at).toLocaleString('en-ZA') : ''}
                  </p>
                  {verification?.notes && (
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{verification.notes}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900 mb-2">Confirm your monthly totals</p>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any clarifications about your overtime or leave for this month."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] mb-3"
                />
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none mb-3">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={e => setConfirm(e.target.checked)}
                    className="mt-1 rounded border-gray-300"
                  />
                  <span>I confirm the overtime hours and approved leave shown above for {period} are correct.</span>
                </label>
                {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                {savedAt && <p className="text-xs text-green-600 mb-2">Saved.</p>}
                <button
                  onClick={handleVerify}
                  disabled={!confirm || saving}
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
