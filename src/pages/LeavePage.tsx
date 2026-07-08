import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import { formatDateDisplay, formatDateISO, countWorkingDays, fyEndYearFor, fyLabel } from '../lib/dateUtils'
import { IconCalendar } from '../components/Icons'
import type { LeaveRequest, LeaveType, LeaveStatus, CountryCode, LeaveBalance } from '../types'
import { exportToExcel } from '../lib/reportExports'

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

const LEAVE_INFO = [
  {
    type: 'annual',
    label: 'Annual Leave',
    shortLabel: '15 days/year (or per contract)',
    statute: 'BCEA s20 — 15 working days per annum (21 consecutive days; 5-day week)',
    bcea: 'BCEA s20',
    note: 'Your leave cycle resets annually on your engagement (start) date — not the financial year. Leave must be taken within 6 months of your cycle end date. Entitlement is 15 working days per annum unless your contract specifies more. Leave cannot be cashed out except on termination of employment.',
    borderColor: 'border-blue-100',
    badgeColor: 'bg-blue-50 text-blue-600',
    textColor: 'text-blue-600',
    barColor: 'bg-blue-400',
  },
  {
    type: 'sick',
    label: 'Sick Leave',
    shortLabel: '30 days per 36-month cycle',
    statute: 'BCEA s22 — 30 paid days per 36-month cycle (6 weeks; 5-day week)',
    bcea: 'BCEA s22',
    note: 'A medical certificate is required if you are absent for more than 2 consecutive days, or on more than 2 occasions within any 8-week period, or if your absence falls on a Friday, a Monday, or the day immediately before or after a public holiday.',
    borderColor: 'border-amber-100',
    badgeColor: 'bg-amber-50 text-amber-600',
    textColor: 'text-amber-600',
    barColor: 'bg-amber-400',
  },
  {
    type: 'family',
    label: 'Family Responsibility',
    shortLabel: '3 days/year statutory (some contracts: 4)',
    statute: 'BCEA s27 — 3 paid days per year (statutory minimum; your contract may grant 4)',
    bcea: 'BCEA s27',
    note: 'Applicable after 4 months of continuous service. Used for the birth or illness of a child, or the death of a spouse, life partner, child, parent, sibling, grandparent or grandchild.',
    borderColor: 'border-emerald-100',
    badgeColor: 'bg-emerald-50 text-emerald-600',
    textColor: 'text-emerald-600',
    barColor: 'bg-emerald-400',
  },
  {
    type: 'study',
    label: 'Study Leave',
    shortLabel: 'Per company policy',
    statute: 'Company policy — not a statutory BCEA right',
    bcea: 'Policy',
    note: 'Granted at management discretion as per your employment contract. Not a statutory entitlement under the BCEA.',
    borderColor: 'border-violet-100',
    badgeColor: 'bg-violet-50 text-violet-600',
    textColor: 'text-violet-600',
    barColor: 'bg-violet-400',
  },
]

const STATUTORY_LEAVE = [
  {
    label: 'Maternity Leave',
    entitlement: '4 consecutive months',
    bcea: 'BCEA s25',
    note: 'Available to female employees. Unpaid by employer; UIF maternity benefits may apply. May commence up to 4 weeks before the expected due date. Mutually exclusive with parental leave.',
    borderColor: 'border-pink-100',
    badgeColor: 'bg-pink-50 text-pink-600',
    textColor: 'text-pink-600',
    barColor: 'bg-pink-400',
  },
  {
    label: 'Parental Leave',
    entitlement: '10 consecutive days',
    bcea: 'BCEA s25B',
    note: 'Available to fathers and non-birth parents. Mutually exclusive with maternity leave — the birth mother receives maternity leave, not parental leave. Unpaid; UIF parental benefits may apply.',
    borderColor: 'border-indigo-100',
    badgeColor: 'bg-indigo-50 text-indigo-600',
    textColor: 'text-indigo-600',
    barColor: 'bg-indigo-400',
  },
  {
    label: 'Adoption Leave',
    entitlement: '10 consecutive weeks',
    bcea: 'BCEA s25A',
    note: 'For the primary adoptive caregiver where the child is under 2 years old. Unpaid by employer; UIF adoption benefits may apply.',
    borderColor: 'border-teal-100',
    badgeColor: 'bg-teal-50 text-teal-600',
    textColor: 'text-teal-600',
    barColor: 'bg-teal-400',
  },
]

// Statutory default entitlements (used when no leave_balances row exists).
const STATUTORY_DEFAULTS: Record<string, number> = {
  annual: 15,  // 15 working days per year
  sick:   30,  // 30 days per 36-month cycle
  family:  3,  // 3 days per year (minimum)
  study:   0,  // company policy only
}

// Returns the annual leave cycle (start/end) active on the given reference date.
function getAnnualLeaveCycleDates(engagementDateStr: string, refDate = new Date()): { start: Date; end: Date } {
  const eng = new Date(engagementDateStr + 'T00:00:00')
  let cycleStart = new Date(eng)
  let next = new Date(cycleStart)
  next.setFullYear(next.getFullYear() + 1)
  while (next <= refDate) {
    cycleStart = new Date(next)
    next = new Date(cycleStart)
    next.setFullYear(next.getFullYear() + 1)
  }
  const end = new Date(next)
  end.setDate(end.getDate() - 1)
  return { start: cycleStart, end }
}

// Returns the 36-month sick leave cycle (number, start, end) active on the given reference date.
function getSickLeaveCycle(engagementDateStr: string, refDate = new Date()): { num: number; start: Date; end: Date } {
  const eng = new Date(engagementDateStr + 'T00:00:00')
  let num = 1
  let cycleStart = new Date(eng)
  let next = new Date(cycleStart)
  next.setFullYear(next.getFullYear() + 3)
  while (next <= refDate) {
    cycleStart = new Date(next)
    num++
    next = new Date(cycleStart)
    next.setFullYear(next.getFullYear() + 3)
  }
  const end = new Date(next)
  end.setDate(end.getDate() - 1)
  return { num, start: cycleStart, end }
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

  // Leave balances for current FY
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [showBceaDetail, setShowBceaDetail] = useState(false)
  const [engagementDate, setEngagementDate] = useState<string | null>(null)
  const [selectedFY, setSelectedFY] = useState(fyEndYearFor(new Date()))

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

  const currentFY = fyEndYearFor(new Date())

  // FY years available to browse: from the employee's first FY through to the current one
  const fyYears = useMemo(() => {
    const engFY = engagementDate
      ? fyEndYearFor(new Date(engagementDate + 'T00:00:00'))
      : currentFY
    // Always surface at least 3 years of history so users can browse prior periods
    const start = Math.min(engFY, currentFY - 2)
    const years: number[] = []
    for (let y = start; y <= currentFY; y++) years.push(y)
    return years
  }, [engagementDate, currentFY])

  const reasonRequired = leaveType === 'unpaid' || leaveType === 'other'

  // Fetch requests once on load — all years; year-filtering is client-side
  useEffect(() => {
    if (profile?.id) fetchRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Re-fetch leave balances whenever the selected FY year changes
  useEffect(() => {
    if (profile?.id) fetchBalances(selectedFY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, selectedFY])

  async function fetchBalances(year: number) {
    if (!profile?.id) return
    setLoadingBalances(true)
    try {
      const [{ data: balData }, { data: detailsData }] = await Promise.all([
        supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', profile.id)
          .eq('year', year),
        supabase
          .from('employee_details')
          .select('engagement_date')
          .eq('employee_id', profile.id)
          .maybeSingle(),
      ])
      setBalances((balData as LeaveBalance[]) ?? [])
      setEngagementDate((detailsData as { engagement_date: string | null } | null)?.engagement_date ?? null)
    } finally {
      setLoadingBalances(false)
    }
  }

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

  // Maternity leave (BCEA s25) is for female employees only.
  // Parental leave (BCEA s25B) is for fathers/non-birth parents.
  // They are mutually exclusive — a birth mother gets maternity, not parental leave.
  const filteredStatutoryLeave = STATUTORY_LEAVE.filter(s => {
    if (s.label === 'Maternity Leave') return profile?.sex === 'female'
    if (s.label === 'Parental Leave')  return profile?.sex !== 'female'
    return true
  })

  function exportLeaveHistory() {
    const sickCycleRef = selectedFY === currentFY ? new Date() : new Date(selectedFY, 0, 1)
    const sickCycle = engagementDate ? getSickLeaveCycle(engagementDate, sickCycleRef) : null
    const rows = requests
      .filter(r => {
        if (r.leave_type === 'sick' && sickCycle) {
          const s = parseLocalDate(r.start_date)
          return s >= sickCycle.start && s <= sickCycle.end
        }
        return r.leave_year === selectedFY
      })
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map(r => ({
        'Leave Type': r.leave_type.charAt(0).toUpperCase() + r.leave_type.slice(1) + ' Leave',
        'From': formatDateDisplay(r.start_date),
        'To': formatDateDisplay(r.end_date),
        'Days': r.total_days,
        'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
        'FY Bucket': r.leave_year ? fyLabel(r.leave_year) : '—',
        'Submitted': formatDateDisplay(r.submitted_at),
        'Reason': r.reason ?? '',
      }))
    if (!rows.length) return
    exportToExcel(rows, `Leave History - ${fyLabel(selectedFY)}`, 'Leave History')
  }

  const filteredRequests =
    statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter)

  const requestCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [requests])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Leave Management</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Submit and track your leave requests</p>
        </div>
        <button
          onClick={() => {
            setShowForm(v => !v)
            setFormError(null)
            setFormSuccess(false)
          }}
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            showForm
              ? 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
              : 'bg-[#1B5EA6] text-white hover:bg-blue-700'
          }`}
        >
          {showForm ? 'Cancel' : (
            <><span className="text-base leading-none">+</span> Request Leave</>
          )}
        </button>
      </div>

      {/* ── Leave Entitlements ──────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Leave Entitlements</h2>
            {selectedFY !== currentFY && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
                Historical · {fyLabel(selectedFY)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={selectedFY}
              onChange={e => setSelectedFY(Number(e.target.value))}
              className="h-8 border border-[var(--border)] rounded-lg px-2.5 text-xs text-[var(--text-secondary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {[...fyYears].reverse().map(y => (
                <option key={y} value={y}>
                  {fyLabel(y)}{y === currentFY ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={exportLeaveHistory}
              className="h-8 px-3 text-xs text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors whitespace-nowrap"
            >
              ↓ Export
            </button>
            <button
              onClick={() => setShowBceaDetail(v => !v)}
              className="h-8 px-3 text-xs text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors whitespace-nowrap"
            >
              {showBceaDetail ? 'Hide reference' : 'BCEA reference'}
            </button>
          </div>
        </div>

        {loadingBalances ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-[var(--border)] overflow-hidden animate-pulse">
                <div className="h-[3px] bg-gray-200" />
                <div className="p-6 space-y-4">
                  <div className="h-2.5 bg-[var(--surface-secondary)] rounded w-1/2" />
                  <div className="h-14 bg-[var(--surface-secondary)] rounded w-1/3" />
                  <div className="h-1.5 bg-[var(--surface-secondary)] rounded-full" />
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-8 bg-[var(--surface-secondary)] rounded" />
                    <div className="h-8 bg-[var(--surface-secondary)] rounded" />
                    <div className="h-8 bg-[var(--surface-secondary)] rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Tracked balance cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {LEAVE_INFO.map(info => {
                const bal = balances.find(b => b.leave_type === info.type)
                const fmt = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                const annualCycle = info.type === 'annual' && engagementDate ? getAnnualLeaveCycleDates(engagementDate) : null
                const sickCycle   = info.type === 'sick'   && engagementDate ? getSickLeaveCycle(engagementDate)        : null
                const isSick = info.type === 'sick'

                // Compute live stats directly from approved/pending leave requests.
                // This is always accurate: cancellations auto-restore balance, no cron needed.
                const today = new Date(); today.setHours(0, 0, 0, 0)

                const inScope = (r: LeaveRequest) => {
                  if (r.leave_type !== info.type) return false
                  if (isSick && sickCycle) {
                    const s = parseLocalDate(r.start_date)
                    return s >= sickCycle.start && s <= sickCycle.end
                  }
                  return r.leave_year === selectedFY
                }

                const approvedInScope = requests.filter(r => r.status === 'approved' && inScope(r))
                const usedDays    = approvedInScope.filter(r => parseLocalDate(r.start_date) <= today).reduce((s, r) => s + r.total_days, 0)
                const bookedDays  = approvedInScope.filter(r => parseLocalDate(r.start_date) >  today).reduce((s, r) => s + r.total_days, 0)
                const pendingDays = requests.filter(r => r.status === 'pending' && inScope(r)).reduce((s, r) => s + r.total_days, 0)

                const entitlement = bal?.total_days ?? STATUTORY_DEFAULTS[info.type] ?? 0
                const available   = Math.max(0, entitlement - usedDays - bookedDays)
                const committedPct = entitlement > 0 ? ((usedDays + bookedDays) / entitlement) * 100 : 0

                const isLow  = available > 0 && available <= 3 && available < entitlement
                const isZero = available === 0 && entitlement > 0
                return (
                  <div key={info.type} className="relative bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm hover:border-gray-200 hover:shadow-md transition-all duration-200 overflow-hidden">
                    {/* Thin type-accent top bar */}
                    <div className={`absolute inset-x-0 top-0 h-[3px] ${info.barColor}`} />
                    <div className="px-6 pt-6 pb-6">
                      {/* Card header */}
                      <div className="flex items-center justify-between mb-5">
                        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">{info.label}</span>
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">{info.bcea}</span>
                      </div>
                      {entitlement > 0 ? (
                        <>
                          {/* Hero metric — the number should dominate */}
                          <div className="mb-1">
                            <span className={`text-[3.5rem] font-bold leading-none tracking-tight ${
                              isZero ? 'text-red-600' : isLow ? 'text-amber-500' : 'text-[var(--text-primary)]'
                            }`}>{available}</span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mb-5 flex items-center gap-2 flex-wrap">
                            <span>of {entitlement} days {isSick ? '(36-month cycle)' : 'per year'}</span>
                            {isZero && <span className="text-red-500 font-semibold">⚠ none remaining</span>}
                            {isLow  && <span className="text-amber-500 font-semibold">⚠ low</span>}
                          </p>
                          {/* Progress bar */}
                          <div className="h-1.5 bg-[var(--surface-secondary)] dark:bg-white/10 rounded-full overflow-hidden mb-6">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                isZero ? 'bg-red-400' : isLow ? 'bg-amber-400' : info.barColor
                              }`}
                              style={{ width: `${Math.min(committedPct, 100)}%` }}
                            />
                          </div>
                          {/* Stats — used / booked / pending always shown */}
                          <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
                            <div className="pr-4">
                              <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums leading-tight">{usedDays}</p>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">used</p>
                            </div>
                            <div className="px-4">
                              <p className={`text-lg font-semibold tabular-nums leading-tight ${bookedDays > 0 ? info.textColor : 'text-[var(--text-primary)]'}`}>{bookedDays}</p>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">booked</p>
                            </div>
                            <div className="pl-4">
                              <p className={`text-lg font-semibold tabular-nums leading-tight ${pendingDays > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]'}`}>{pendingDays}</p>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">pending</p>
                            </div>
                          </div>
                          {/* Cycle dates */}
                          {(annualCycle || sickCycle) && (
                            <p className="text-[10px] text-[var(--text-muted)] mt-4 pt-4 border-t border-[var(--border)]">
                              {annualCycle && `Cycle: ${fmt(annualCycle.start)} – ${fmt(annualCycle.end)}`}
                              {sickCycle && `Cycle ${sickCycle.num}: ${fmt(sickCycle.start)} – ${fmt(sickCycle.end)}`}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="py-4">
                          <p className="text-sm font-medium text-[var(--text-muted)]">No balance configured</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1">Contact HR to configure</p>
                        </div>
                      )}
                      {showBceaDetail && (
                        <p className="mt-4 pt-4 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] leading-relaxed">{info.note}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Statutory unpaid leave — same visual weight as tracked cards; users are entitled */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredStatutoryLeave.map(s => (
                <div key={s.label} className="relative bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm hover:border-gray-200 hover:shadow-md transition-all duration-200 overflow-hidden">
                  <div className={`absolute inset-x-0 top-0 h-[3px] ${s.barColor}`} />
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">{s.label}</span>
                      <span className="text-[10px] font-medium text-[var(--text-muted)]">{s.bcea}</span>
                    </div>
                    <p className={`text-2xl font-bold leading-tight ${s.textColor} mb-3`}>{s.entitlement}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--surface-secondary)] dark:bg-white/10 text-[var(--text-muted)]">Unpaid</span>
                      <span className="text-[11px] text-[var(--text-muted)]">UIF benefits may apply</span>
                    </div>
                    {showBceaDetail && (
                      <p className="mt-3 pt-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] leading-relaxed">{s.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-[11px] text-[var(--text-muted)] mt-3">
          Showing {fyLabel(selectedFY)}{selectedFY !== currentFY ? ' — historical' : ''}. Regulated by the{' '}
          <a
            href="https://labourguide.co.za/employment-condition/types-of-leave"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600 transition-colors"
          >
            Basic Conditions of Employment Act (BCEA)
          </a>{' '}
          and may be supplemented by your contract.
        </p>
      </div>

      {formSuccess && (
        <div className="mb-5 flex items-center gap-2.5 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <p className="text-sm text-green-800 font-medium">Leave request submitted successfully.</p>
        </div>
      )}

      {/* Submit form */}
      {showForm && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-5">New Leave Request</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Leave type */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Leave Type</label>
              <select
                value={leaveType}
                onChange={e => setLeaveType(e.target.value as LeaveType)}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={e => setEndDate(e.target.value)}
                  required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Total working days */}
            {startDate && endDate && breakdown && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 text-sm text-blue-700 dark:text-blue-300 space-y-1">
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
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Charge against leave bucket
                </label>
                <select
                  value={leaveYear ?? ''}
                  onChange={e => {
                    setLeaveYear(parseInt(e.target.value, 10))
                    setLeaveYearTouched(true)
                  }}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {bucketOptions.map(y => (
                    <option key={y} value={y}>{fyLabel(y)}</option>
                  ))}
                </select>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Defaults to the financial year that contains the start date. Switch to the
                  previous FY if you are using leftover days from that bucket.
                </p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Reason
                {reasonRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder={reasonRequired ? 'Required for this leave type' : 'Optional'}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface)] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
              />
            </div>

            {formError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
                <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
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
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">My Leave Requests</h2>
          <div className="flex items-center gap-0.5">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-gray-900 dark:bg-sky-500 text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--tab-inactive-hover-text)] hover:bg-[var(--surface-secondary)]'
                }`}
              >
                {f.label}
                {f.value !== 'all' && (requestCounts[f.value] ?? 0) > 0 && (
                  <span className={`ml-1 tabular-nums text-[10px] ${
                    statusFilter === f.value ? 'opacity-60' : 'opacity-40'
                  }`}>{requestCounts[f.value]}</span>
                )}
                {f.value === 'all' && requests.length > 0 && (
                  <span className={`ml-1 tabular-nums text-[10px] ${
                    statusFilter === f.value ? 'opacity-60' : 'opacity-40'
                  }`}>{requests.length}</span>
                )}
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
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-secondary)] flex items-center justify-center mx-auto">
              <IconCalendar className="w-5 h-5 text-[var(--text-muted)]" />
            </div>
            <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">No requests found</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {statusFilter !== 'all'
                ? `No ${statusFilter} requests match the current filter.`
                : 'Submit your first leave request using the button above.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredRequests.map(req => (
              <div key={req.id} className="px-5 py-4 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--text-primary)] capitalize">
                        {req.leave_type.replace('_', ' ')} Leave
                      </span>
                      <StatusBadge status={req.status} />
                      {req.leave_year != null && (
                        <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--surface-secondary)] px-1.5 py-0.5 rounded">
                          FY {req.leave_year}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                      <span className="ml-2 text-xs text-[var(--text-muted)]">{req.total_days} day{req.total_days !== 1 ? 's' : ''}</span>
                    </p>
                    {req.reason && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 truncate max-w-sm">{req.reason}</p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-1">Submitted {formatDateDisplay(req.submitted_at)}</p>
                    {req.supervisor_comment && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 italic border-l-2 border-[var(--border)] pl-2">
                        {req.supervisor_comment}
                      </p>
                    )}
                  </div>
                  {req.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      disabled={cancelling === req.id}
                      className="shrink-0 h-7 px-3 text-xs text-red-600 border border-red-100 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
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
