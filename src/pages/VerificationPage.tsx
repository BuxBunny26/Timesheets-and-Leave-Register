import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconClipboardCheck, IconCheck, IconFlag, IconXMark } from '../components/Icons'
import type { TimesheetVerification, VerificationStatus, TimesheetDay, Profile } from '../types'

function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ value: ym, label: formatMonth(ym) })
  }
  return opts
}

const STATUS_CONFIG: Record<VerificationStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending verification',  className: 'bg-amber-100 text-amber-700' },
  overdue:   { label: 'Overdue',               className: 'bg-red-100 text-red-700' },
  verified:  { label: 'Verified',              className: 'bg-green-100 text-green-700' },
  disputed:  { label: 'Dispute submitted',      className: 'bg-orange-100 text-orange-700' },
}

interface DaySummary extends TimesheetDay {
  week_start?: string
}

export default function VerificationPage() {
  const { profile } = useAuth()

  const monthOptions = getMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value ?? monthOptions[0]?.value)

  const [verification, setVerification] = useState<TimesheetVerification | null>(null)
  const [days, setDays] = useState<DaySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [adminProfile, setAdminProfile] = useState<Pick<Profile, 'id' | 'first_name' | 'surname'> | null>(null)

  // Dispute flow
  const [showDispute, setShowDispute] = useState(false)
  const [disputeNote, setDisputeNote] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)

  // Verify action
  const [verifying, setVerifying] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (profile?.id) {
      fetchData()
      fetchAdminProfile()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, selectedMonth])

  async function fetchAdminProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, surname')
      .eq('role', 'admin_manager')
      .eq('status', 'active')
      .limit(1)
      .single()
    if (data) setAdminProfile(data as typeof adminProfile)
  }

  async function fetchData() {
    setLoading(true)
    try {
      // Get or create verification record
      const { data: existing } = await supabase
        .from('timesheet_verifications')
        .select('*')
        .eq('employee_id', profile!.id)
        .eq('period_month', selectedMonth)
        .single()

      setVerification(existing as TimesheetVerification | null)

      // Fetch all timesheet days for this month
      const [y, m] = selectedMonth.split('-').map(Number)
      const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
      const nextM = m === 12 ? 1 : m + 1
      const nextY = m === 12 ? y + 1 : y
      const monthEnd = `${nextY}-${String(nextM).padStart(2, '0')}-01`

      const { data: dayData } = await supabase
        .from('timesheet_days')
        .select('*, timesheet_week:timesheet_weeks!inner(employee_id, week_start)')
        .eq('timesheet_week.employee_id', profile!.id)
        .gte('date', monthStart)
        .lt('date', monthEnd)
        .order('date')

      setDays((dayData ?? []) as DaySummary[])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    try {
      const now = new Date().toISOString()
      if (verification?.id) {
        const { error } = await supabase
          .from('timesheet_verifications')
          .update({ status: 'verified', verified_at: now, dispute_note: null, dispute_flagged_to: null, updated_at: now })
          .eq('id', verification.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('timesheet_verifications')
          .insert({ employee_id: profile!.id, period_month: selectedMonth, status: 'verified', verified_at: now })
        if (error) throw error
      }
      showToast('success', 'Hours verified successfully.')
      await fetchData()
    } catch (err: unknown) {
      showToast('error', 'Failed to verify: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setVerifying(false)
    }
  }

  async function handleDispute() {
    if (!disputeNote.trim()) return
    setSubmittingDispute(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        employee_id: profile!.id,
        period_month: selectedMonth,
        status: 'disputed' as VerificationStatus,
        dispute_note: disputeNote.trim(),
        dispute_flagged_to: adminProfile?.id ?? null,
        updated_at: now,
      }
      if (verification?.id) {
        const { error } = await supabase
          .from('timesheet_verifications')
          .update(payload)
          .eq('id', verification.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('timesheet_verifications')
          .insert(payload)
        if (error) throw error
      }

      // Notify admin
      if (adminProfile?.id) {
        await supabase.from('notifications').insert({
          recipient_id: adminProfile.id,
          type: 'verification_dispute',
          title: `Verification dispute — ${profile!.first_name} ${profile!.surname}`,
          message: `${profile!.first_name} ${profile!.surname} has flagged a discrepancy for ${formatMonth(selectedMonth)}: "${disputeNote.trim()}"`,
          related_entity_type: 'timesheet_verification',
        })
      }

      showToast('success', 'Dispute submitted to admin.')
      setShowDispute(false)
      setDisputeNote('')
      await fetchData()
    } catch (err: unknown) {
      showToast('error', 'Failed to submit dispute: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmittingDispute(false)
    }
  }

  // Derived stats
  const totalOtHours = days.reduce((sum, d) => sum + (d.overtime_flag ? (d.overtime_hours ?? 0) : 0), 0)
  const statusCounts = days.reduce<Record<string, number>>((acc, d) => {
    acc[d.primary_status] = (acc[d.primary_status] ?? 0) + 1
    return acc
  }, {})

  const canVerify = verification?.status !== 'verified'
  const canDispute = verification?.status !== 'disputed'

  const vStatus: VerificationStatus = verification?.status ?? 'pending'
  const statusConfig = STATUS_CONFIG[vStatus]

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Monthly Verification</h1>
        <p className="text-gray-500 text-sm mt-0.5">Review and confirm your hours for each month</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium mb-4 ${
          toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <IconCheck className="w-4 h-4 flex-shrink-0" /> : <IconXMark className="w-4 h-4 flex-shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Month selector + status */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusConfig.className}`}>
          {statusConfig.label}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-5">
            {[
              { label: 'Days recorded', value: days.length },
              { label: 'Present', value: statusCounts['present'] ?? 0 },
              { label: 'Leave', value: (statusCounts['leave'] ?? 0) + (statusCounts['sick'] ?? 0) },
              { label: 'AWOL', value: statusCounts['awol'] ?? 0 },
              { label: 'OT hours', value: Math.round(totalOtHours * 10) / 10 },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-xl font-bold ${s.label === 'AWOL' && (s.value as number) > 0 ? 'text-red-600' : 'text-gray-900'}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Verified banner */}
          {verification?.status === 'verified' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
              <IconCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Hours verified</p>
                {verification.verified_at && (
                  <p className="text-xs text-green-600">
                    {new Date(verification.verified_at).toLocaleDateString('en-ZA', { dateStyle: 'long' })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Disputed banner */}
          {verification?.status === 'disputed' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
              <div className="flex items-center gap-2 mb-1">
                <IconFlag className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-medium text-amber-800">Dispute submitted to admin</p>
              </div>
              {verification.dispute_note && (
                <p className="text-sm text-amber-700 mt-1">"{verification.dispute_note}"</p>
              )}
              <p className="text-xs text-amber-500 mt-1">
                {adminProfile ? `Sent to ${adminProfile.first_name} ${adminProfile.surname}` : 'Admin has been notified'} — awaiting resolution.
              </p>
            </div>
          )}

          {/* Day list */}
          {days.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm text-center py-12 text-gray-400">
              <IconClipboardCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No timesheet data found for {formatMonth(selectedMonth)}.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-5">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Date', 'Day', 'Status', 'OT Hrs', 'LOL', 'LOI'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {days.map(d => (
                    <tr key={d.id} className={`${d.primary_status === 'awol' ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 capitalize">{d.day_of_week}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          d.primary_status === 'present'        ? 'bg-green-100 text-green-700' :
                          d.primary_status === 'awol'           ? 'bg-red-100 text-red-700' :
                          d.primary_status === 'public_holiday' ? 'bg-blue-100 text-blue-700' :
                          d.primary_status === 'standby'        ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {d.primary_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {d.overtime_flag ? (d.overtime_hours ?? '—') : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">{d.lol_flag ? <IconCheck className="w-4 h-4 text-green-500" /> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5">{d.loi_flag ? <IconCheck className="w-4 h-4 text-green-500" /> : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          {(canVerify || canDispute) && days.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Are the hours for <strong>{formatMonth(selectedMonth)}</strong> accurate?
              </p>
              <div className="flex flex-wrap gap-3">
                {canVerify && (
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <IconCheck className="w-4 h-4" />
                    {verifying ? 'Verifying…' : 'Confirm — hours are correct'}
                  </button>
                )}
                {canDispute && (
                  <button
                    onClick={() => setShowDispute(v => !v)}
                    className="flex items-center gap-2 px-5 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors"
                  >
                    <IconFlag className="w-4 h-4" />
                    Flag a discrepancy
                  </button>
                )}
              </div>

              {/* Dispute form */}
              {showDispute && (
                <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-sm text-gray-600">
                    Describe the discrepancy. This will be sent directly to{' '}
                    {adminProfile ? `${adminProfile.first_name} ${adminProfile.surname}` : 'the admin manager'} for correction.
                  </p>
                  <textarea
                    value={disputeNote}
                    onChange={e => setDisputeNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. My OT for 15 April was 3 hours but shows 0. I have approval from my supervisor."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-gray-300"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowDispute(false); setDisputeNote('') }}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDispute}
                      disabled={submittingDispute || !disputeNote.trim()}
                      className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {submittingDispute ? 'Submitting…' : 'Submit dispute'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
