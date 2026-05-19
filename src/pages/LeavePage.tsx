import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import { formatDateDisplay, formatDateISO, countWorkingDays, fyEndYearFor, fyLabel } from '../lib/dateUtils'
import { IconCalendar } from '../components/Icons'
import type { LeaveRequest, LeaveType, LeaveStatus, CountryCode } from '../types'

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'family', label: 'Family Responsibility' },
  { value: 'study', label: 'Study Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other' },
]

const STATUS_FILTERS: { value: 'all' | LeaveStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'cancelled', label: 'Cancelled' },
]

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function LeavePage() {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState(false)

  // List state
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all')
  const [cancelling, setCancelling] = useState<string | null>(null)

  // Public holidays in range (date ISO → name)
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map())

  // FY bucket selection (FY-end year)
  const [leaveYear, setLeaveYear] = useState<number | null>(null)
  const [leaveYearTouched, setLeaveYearTouched] = useState(false)

  const country: CountryCode = (profile?.site?.country_code ?? 'ZA') as CountryCode

  const startDateObj = startDate ? parseLocalDate(startDate) : null
  const endDateObj = endDate ? parseLocalDate(endDate) : null

  // Default FY bucket from start date whenever user hasn't manually changed it.
  useEffect(() => {
    if (!startDateObj) return
    if (leaveYearTouched) return
    setLeaveYear(fyEndYearFor(startDateObj))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate])

  // Fetch public holidays whenever the date range changes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!startDateObj || !endDateObj || endDateObj < startDateObj) {
        if (!cancelled) setHolidays(new Map())
        return
      }
      const { data } = await supabase
        .from('public_holidays')
        .select('date, name')
        .eq('country_code', country)
        .gte('date', startDate)
        .lte('date', endDate)
      if (cancelled) return
      const map = new Map<string, string>()
      for (const r of (data ?? []) as { date: string; name: string }[]) {
        map.set(r.date, r.name)
      }
      setHolidays(map)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, country])

  const holidayISO = useMemo(() => new Set(holidays.keys()), [holidays])

  const totalDays =
    startDateObj && endDateObj
      ? countWorkingDays(startDateObj, endDateObj, holidayISO)
      : 0

  // Count weekend / weekday breakdown for display.
  const breakdown = useMemo(() => {
    if (!startDateObj || !endDateObj) return null
    let weekdays = 0
    let weekends = 0
    let holidaysOnWeekdays = 0
    const cur = new Date(startDateObj)
    while (cur <= endDateObj) {
      const day = cur.getDay()
      const iso = formatDateISO(cur)
      const isHoliday = holidayISO.has(iso)
      if (day === 0 || day === 6) {
        weekends++
      } else if (isHoliday) {
        holidaysOnWeekdays++
      } else {
        weekdays++
      }
      cur.setDate(cur.getDate() + 1)
    }
    return { weekdays, weekends, holidaysOnWeekdays }
  }, [startDate, endDate, holidayISO])

  const bucketOptions = useMemo(() => {
    if (!startDateObj) return [] as number[]
    const natural = fyEndYearFor(startDateObj)
    return [natural - 1, natural]
  }, [startDate])

  const reasonRequired = leaveType === 'unpaid' || leaveType === 'other'

  useEffect(() => {
    if (profile?.id) fetchRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function fetchRequests() {
    setLoadingList(true)
    setListError(null)
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', profile!.id)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      setRequests((data as LeaveRequest[]) ?? [])
    } catch (err) {
      setListError('Failed to load leave requests.')
      console.error(err)
    } finally {
      setLoadingList(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(false)

    if (!startDate || !endDate) {
      setFormError('Please select both start and end dates.')
      return
    }
    if (parseLocalDate(endDate) < parseLocalDate(startDate)) {
      setFormError('End date must be on or after start date.')
      return
    }
    if (totalDays <= 0) {
      setFormError('Selected dates contain no working days.')
      return
    }
    if (reasonRequired && !reason.trim()) {
      setFormError('A reason is required for this leave type.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: profile!.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        leave_year: leaveYear,
        reason: reason.trim() || null,
        supervisor_id: profile!.supervisor_id,
        status: 'pending',
      })
      if (error) throw error
      setFormSuccess(true)
      setLeaveType('annual')
      setStartDate('')
      setEndDate('')
      setReason('')
      setLeaveYear(null)
      setLeaveYearTouched(false)
      setShowForm(false)
      await fetchRequests()
    } catch (err) {
      setFormError('Failed to submit leave request. Please try again.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(requestId: string) {
    setCancelling(requestId)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('status', 'pending')
      if (error) throw error
      setRequests(prev =>
        prev.map(r => (r.id === requestId ? { ...r, status: 'cancelled' as LeaveStatus } : r))
      )
    } catch (err) {
      console.error('Failed to cancel leave request:', err)
    } finally {
      setCancelling(null)
    }
  }

  const filteredRequests =
    statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave</h1>
          <p className="text-gray-500 text-sm mt-0.5">Submit and track your leave requests</p>
        </div>
        <button
          onClick={() => {
            setShowForm(v => !v)
            setFormError(null)
            setFormSuccess(false)
          }}
          className="px-4 py-2 bg-[#1B5EA6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Request'}
        </button>
      </div>

      {formSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-800">Leave request submitted successfully.</p>
        </div>
      )}

      {/* Submit form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">New Leave Request</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Leave type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
              <select
                value={leaveType}
                onChange={e => setLeaveType(e.target.value as LeaveType)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LEAVE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={e => setEndDate(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Total working days */}
            {startDate && endDate && breakdown && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700 space-y-1">
                <p>
                  Leave days: <strong>{totalDays}</strong>
                </p>
                <p className="text-xs text-blue-600/80">
                  {breakdown.weekdays} weekday{breakdown.weekdays !== 1 ? 's' : ''}
                  {breakdown.weekends > 0 && <> &middot; {breakdown.weekends} weekend day{breakdown.weekends !== 1 ? 's' : ''} excluded</>}
                  {breakdown.holidaysOnWeekdays > 0 && <> &middot; {breakdown.holidaysOnWeekdays} public holiday{breakdown.holidaysOnWeekdays !== 1 ? 's' : ''} excluded</>}
                </p>
                {holidays.size > 0 && (
                  <ul className="text-[11px] text-blue-600/70 list-disc list-inside">
                    {Array.from(holidays.entries()).map(([d, n]) => (
                      <li key={d}>{formatDateDisplay(d)} — {n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Leave bucket (financial year) */}
            {startDate && bucketOptions.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Charge against leave bucket
                </label>
                <select
                  value={leaveYear ?? ''}
                  onChange={e => {
                    setLeaveYear(parseInt(e.target.value, 10))
                    setLeaveYearTouched(true)
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {bucketOptions.map(y => (
                    <option key={y} value={y}>{fyLabel(y)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Defaults to the financial year that contains the start date. Switch to the
                  previous FY if you are using leftover days from that bucket.
                </p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason
                {reasonRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder={reasonRequired ? 'Required for this leave type' : 'Optional'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
              />
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-[#1B5EA6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My Leave Requests */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">My Leave Requests</h2>
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-[#1B5EA6] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : listError ? (
          <div className="p-5">
            <p className="text-sm text-red-600">{listError}</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center">
            <IconCalendar className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-3 text-gray-600 font-medium">No leave requests yet</p>
            <p className="mt-1 text-sm text-gray-400">
              {statusFilter !== 'all'
                ? `No ${statusFilter} requests found.`
                : 'Submit your first leave request using the button above.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRequests.map(req => (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {req.leave_type.replace('_', ' ')} Leave
                      </span>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                      <span className="ml-2 text-gray-400">({req.total_days} working day{req.total_days !== 1 ? 's' : ''})</span>
                      {req.leave_year != null && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                          FY {req.leave_year}
                        </span>
                      )}
                    </p>
                    {req.reason && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{req.reason}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted {formatDateDisplay(req.submitted_at)}
                    </p>
                    {req.supervisor_comment && (
                      <p className="text-xs text-gray-600 mt-1 italic">
                        Comment: {req.supervisor_comment}
                      </p>
                    )}
                  </div>
                  {req.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      disabled={cancelling === req.id}
                      className="shrink-0 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {cancelling === req.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
