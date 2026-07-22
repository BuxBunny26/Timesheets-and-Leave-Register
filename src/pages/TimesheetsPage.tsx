import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Holidays from 'date-holidays'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import TeamOverview from '../components/TeamOverview'
import { IconPaperclip, IconDocument, IconTrash, IconDownload, IconXMark, IconSparkles, IconPencil, IconChevronDown, IconCheckCircle } from '../components/Icons'
import {
  getWeekBounds,
  formatDateISO,
  getDaysOfWeek,
} from '../lib/dateUtils'
import type { TimesheetWeek, TimesheetDay, DayStatus, TimesheetStatus, Attachment, DocumentCategory } from '../types'
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_COLOURS } from '../types'
import type { Role } from '../types'

const MANAGER_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']
type ViewMode = 'my' | 'team' | 'history'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_OPTIONS: DayStatus[] = ['present', 'leave', 'sick', 'awol', 'public_holiday']
// WEEKEND_STATUS_OPTIONS removed — weekends use OT/standby/underground/LOL/LOI only
const MEDICAL_CATEGORIES: DocumentCategory[] = ['sick_note', 'doctors_certificate', 'medical_report']

const SA_PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
  'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
]

// All UN-recognised countries (ISO 3166-1) — used with datalist for LOI search
const LOI_COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda',
  'Argentina','Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain',
  'Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria',
  'Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada',
  'Central African Republic','Chad','Chile','China','Colombia','Comoros',
  'Congo (Brazzaville)','Congo (Kinshasa / DRC)','Costa Rica','Croatia','Cuba',
  'Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic',
  'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia',
  'Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia',
  'Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
  'Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran',
  'Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan',
  'Kenya','Kiribati','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho',
  'Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar',
  'Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania',
  'Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro',
  'Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands',
  'New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia',
  'Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea',
  'Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania',
  'Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia',
  'Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe',
  'Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore',
  'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea',
  'South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland',
  'Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo',
  'Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu',
  'Uganda','Ukraine','United Arab Emirates','United Kingdom','United States',
  'Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam',
  'Yemen','Zambia','Zimbabwe',
]

// ---------------------------------------------------------------------------
// Centralised flag-visibility rules
// Returns which additive flags are permitted for a given primary status.
// ---------------------------------------------------------------------------
function getAllowedFlagsForStatus(status: DayStatus | '') {
  const fullAccess = status === 'present' || status === 'public_holiday' || status === ''
  return {
    ot:          fullAccess || status === 'leave',   // OT also allowed on leave
    standby:     fullAccess,
    underground: fullAccess,
    lol:         fullAccess,
    loi:         fullAccess,
  }
}

// ── Leave conflict validation types ───────────────────────────────────────────
type ActiveLeaveEntry   = { id: string; leave_type: string; status: 'pending' | 'approved' }
type InactiveLeaveEntry = { id: string; leave_type: string; status: 'denied' | 'cancelled' | 'returned' }

/** Full leave resolution for a single calendar date, computed by resolveLeaveStateForDate. */
type LeaveResolution = {
  activeRequest:    ActiveLeaveEntry | null
  inactiveRequest:  InactiveLeaveEntry | null
  leaveType:        string         // human-readable leave type label
  requestStatus:    'pending' | 'approved' | 'denied' | 'cancelled' | 'returned' | null
  shouldSetLeave:   boolean        // draft only: auto-set day → 'leave'
  shouldSetPresent: boolean        // draft only: revert day → 'present'
  badge:            { text: string; colour: 'green' | 'amber' | 'red' | 'grey' } | null
  infoMessage:      string | null  // informational text for denied/cancelled/returned
  blockingConflict: boolean
  pendingOverlap:   boolean
}

type LeaveConflict = {
  dateISO:          string
  dayLabel:         string
  dayIndex:         number
  timesheetStatus:  'leave' | 'sick'
  conflictType:     'missing_request' | 'type_mismatch'
}

type PresentConflict = {
  dateISO:     string
  dayLabel:    string
  dayIndex:    number
  leaveType:   string
  leaveStatus: 'pending' | 'approved'
}

interface DayState {
  primary_status: DayStatus | ''
  // Transitional UI-only field — NOT persisted to the database.
  // The DB column (leave_type_detail) does not exist; this is kept in React state
  // only to drive the sub-dropdown display until migration 073 adds
  // timesheet_days.leave_type_id and timesheet_days.leave_request_id.
  leave_type_detail: string
  overtime_flag: boolean
  overtime_hours: number
  overtime_reason: string
  standby_flag: boolean
  underground_flag: boolean
  underground_hours: number
  lol_flag: boolean
  lol_province: string
  loi_flag: boolean
  loi_country: string
  notes: string
  is_public_holiday: boolean
  holiday_name: string
  is_locked: boolean
}

function defaultDay(isHoliday: boolean, holidayName: string, isWeekend = false): DayState {
  return {
    primary_status: isHoliday ? 'public_holiday' : isWeekend ? '' : 'present',
    leave_type_detail: '',
    overtime_flag: false,
    overtime_hours: 0,
    overtime_reason: '',
    standby_flag: false,
    underground_flag: false,
    underground_hours: 0,
    lol_flag: false,
    lol_province: '',
    loi_flag: false,
    loi_country: '',
    notes: '',
    is_public_holiday: isHoliday,
    holiday_name: holidayName,
    is_locked: false,
  }
}

interface HistoryWeek {
  id: string
  week_start: string
  week_end: string
  status: TimesheetStatus
  submitted_at: string | null
  reviewer_comment: string | null
  resubmission_count: number
}

interface ExpandedData {
  days: TimesheetDay[]
  attachments: Attachment[]
  loading: boolean
}

function formatWeekRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatDayHeading(d: Date, idx: number): string {
  const dayName = DAY_NAMES[idx]
  return `${dayName} ${d.getDate()} ${d.toLocaleDateString('en-ZA', { month: 'short' })}`
}

// ── Leave reconciliation helpers ─────────────────────────────────────────────
// These are the single source of truth for leave auto-population logic.
// Used both at initial timesheet load (post DB-merge) and in the status-change
// handler so the two paths cannot diverge.

/**
 * Given a leave_request.leave_type code, returns the leave_type_detail value
 * to store on the timesheet day. Returns '' for unknown / unmapped codes.
 * TODO: replace with leave_type_id UUID lookup after migration 073 is applied.
 */
function leaveDetailFromRequest(leaveType: string): string {
  const valid = [
    'annual', 'sick',
    'family', 'family_responsibility',  // 'family' = legacy code pre-mig 073
    'study', 'maternity', 'adoption', 'parental', 'unpaid', 'other',
  ]
  return valid.includes(leaveType) ? leaveType : ''
}

/**
 * Human-readable label for a leave_type code.
 * TODO: remove after migration 073 — replace with leave_types.name from DB join.
 */
const LEAVE_TYPE_NAMES: Record<string, string> = {
  annual:                'Annual Leave',
  sick:                  'Sick Leave',
  family:                'Family Responsibility Leave',
  family_responsibility: 'Family Responsibility Leave',
  study:                 'Study Leave',
  maternity:             'Maternity Leave',
  adoption:              'Adoption Leave',
  parental:              'Parental Leave',
  unpaid:                'Unpaid Leave',
  other:                 'Other Leave',
}
function leaveTypeName(code: string): string {
  // TODO: remove after migration 073 — replace with leave_types.name from DB join.
  return LEAVE_TYPE_NAMES[code] ?? code
}

/**
 * Pure function — given a dateISO and the leave maps, computes the full leave
 * resolution for that day: badge, auto-fill direction, conflict flags, etc.
 *
 * This is the single source of truth for leave state.  Call it from
 * reconcileLeave, JSX rendering, and any refresh path so logic cannot diverge.
 *
 * Status precedence:
 *   Exactly one approved                  → use it (green badge)
 *   Exactly one pending, no approved      → use it (amber badge)
 *   Approved + pending                    → use approved; pendingOverlap = true
 *   Multiple approved, OR multi-pending   → blockingConflict = true
 *   denied / cancelled / returned         → inactive only; revert draft day
 */
function resolveLeaveStateForDate(
  dateISO: string,
  activeLeaveMap:   Record<string, ActiveLeaveEntry>,
  inactiveLeaveMap: Record<string, InactiveLeaveEntry>,
  blockingConflicts: Set<string>,
  pendingOverlaps:   Set<string>,
): LeaveResolution {
  const active   = activeLeaveMap[dateISO]   ?? null
  const inactive = inactiveLeaveMap[dateISO] ?? null
  const blocking = blockingConflicts.has(dateISO)
  const overlap  = pendingOverlaps.has(dateISO)

  const lt     = active?.leave_type ?? inactive?.leave_type ?? ''
  const ltName = lt ? leaveTypeName(lt) : ''
  const status = (active?.status ?? inactive?.status ?? null) as LeaveResolution['requestStatus']

  let badge:            LeaveResolution['badge'] = null
  let shouldSetLeave   = false
  let shouldSetPresent = false
  let infoMessage:     string | null = null

  if (!blocking) {
    if (active?.status === 'approved') {
      badge = { text: 'Approved', colour: 'green' }
      shouldSetLeave = true
    } else if (active?.status === 'pending') {
      badge = { text: 'Pending', colour: 'amber' }
      shouldSetLeave = true
    } else if (inactive?.status === 'denied') {
      badge = { text: 'Leave Denied', colour: 'red' }
      shouldSetPresent = true
      infoMessage = ltName ? `${ltName} Denied` : 'Leave Denied'
    } else if (inactive?.status === 'cancelled') {
      badge = { text: 'Leave Cancelled', colour: 'grey' }
      shouldSetPresent = true
      infoMessage = ltName ? `${ltName} Cancelled` : 'Leave Cancelled'
    } else if (inactive?.status === 'returned') {
      badge = { text: 'Leave Returned', colour: 'amber' }
      shouldSetPresent = true
      infoMessage = ltName ? `${ltName} Returned — revision required` : 'Leave Returned — revision required'
    }
  }

  return {
    activeRequest:    active,
    inactiveRequest:  inactive,
    leaveType:        ltName,
    requestStatus:    status,
    shouldSetLeave,
    shouldSetPresent,
    badge,
    infoMessage,
    blockingConflict: blocking,
    pendingOverlap:   overlap,
  }
}

/**
 * Applies a LeaveResolution to a DayState for DRAFT weeks only.
 * Submitted / approved weeks are never modified automatically.
 *
 * Rules:
 *   shouldSetLeave:   auto-fill blank/present → leave (approved or pending request)
 *   shouldSetPresent: revert leave → present  (denied, cancelled, or returned request)
 *   blockingConflict: leave unchanged; JSX shows the error
 *   locked / public-holiday: always leave unchanged
 */
function reconcileLeave(
  day: DayState,
  resolution: LeaveResolution,
  weekStatus: TimesheetStatus | 'draft',
): DayState {
  if (weekStatus === 'submitted' || weekStatus === 'approved') return day
  if (day.is_locked) return day
  if (day.is_public_holiday) return day
  if (resolution.blockingConflict) return day

  if (resolution.shouldSetPresent && day.primary_status === 'leave') {
    // Denied, cancelled, or returned — revert to present on draft weeks
    return { ...day, primary_status: 'present', leave_type_detail: '' }
  }

  if (resolution.shouldSetLeave && resolution.activeRequest) {
    if (day.primary_status === 'leave') {
      // Already leave — fill in the type detail if missing
      if (!day.leave_type_detail) {
        return { ...day, leave_type_detail: leaveDetailFromRequest(resolution.activeRequest.leave_type) }
      }
      return day
    }
    if (day.primary_status === 'present' || day.primary_status === '') {
      // Default status — auto-fill with the leave request
      return {
        ...day,
        primary_status:    'leave',
        leave_type_detail: leaveDetailFromRequest(resolution.activeRequest.leave_type),
      }
    }
    // Non-default, non-leave status (sick, awol…) while an active request exists.
    // Leave unchanged; JSX mismatch warning handles this.
  }

  return day
}

export default function TimesheetsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [viewMode, setViewMode] = useState<ViewMode>('my')
  const canSeeTeam = profile?.role && MANAGER_ROLES.includes(profile.role)
  const [weekOffset, setWeekOffset] = useState<number>(() => {
    const navWeek = (location.state as { weekStart?: string } | null)?.weekStart
    if (navWeek) {
      const d = new Date(navWeek + 'T00:00:00')
      if (!isNaN(d.getTime())) {
        const targetMonday = getWeekBounds(d).start
        const currentMonday = getWeekBounds(new Date()).start
        return Math.round((targetMonday.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
      }
    }
    return 0
  })
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekBounds(new Date()).start)
  const [weekEnd, setWeekEnd] = useState<Date>(() => getWeekBounds(new Date()).end)
  const [days, setDays] = useState<DayState[]>([])
  const [weekId, setWeekId] = useState<string | null>(null)
  const [weekStatus, setWeekStatus] = useState<TimesheetStatus>('draft')
  const [resubmissionCount, setResubmissionCount] = useState<number>(0)
  const [reviewerComment, setReviewerComment] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Autosave indicator state: 'idle' | 'saving' | 'saved' | 'error'
  // Separate from `saving` so the submit-button disable and autosave display are independent.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showConfirm, setShowConfirm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hd = useRef<InstanceType<typeof Holidays>>(new Holidays())
  const [historyWeeks, setHistoryWeeks] = useState<HistoryWeek[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyStatusFilter, setHistoryStatusFilter] = useState<TimesheetStatus | 'all'>('all')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')
  const [expandedWeekId, setExpandedWeekId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<ExpandedData | null>(null)
  const [editingAttachmentCategoryId, setEditingAttachmentCategoryId] = useState<string | null>(null)

  // OT hours per-row text-editing state (allows typing freely, including incomplete decimals)
  const [otHourDrafts, setOtHourDrafts] = useState<Record<number, string>>({})
  const [otHourErrors, setOtHourErrors] = useState<Record<number, string>>({})

  // Approved leave covering days in the current week — dateISO -> { id, leave_type }
  const [leaveByDate, setLeaveByDate] = useState<Record<string, { id: string; leave_type: string }>>({})
  // Pending + approved leave — used for leave/sick validation on the day cards
  const [activeLeaveByDate, setActiveLeaveByDate] = useState<Record<string, ActiveLeaveEntry>>({})
  // Blocking conflict dates: multiple approved, OR multiple pending with no approved.
  // Reconciliation is blocked; submission is blocked until resolved.
  const [blockingConflictDates, setBlockingConflictDates] = useState<Set<string>>(new Set())
  // Non-blocking overlap dates: one approved + one or more additional pending requests.
  // Auto-populate from the approved request; show a warning about the pending overlap.
  const [pendingOverlapDates, setPendingOverlapDates] = useState<Set<string>>(new Set())
  // Denied / cancelled / returned leave requests overlapping this week — dateISO → InactiveLeaveEntry.
  // Only populated when no active (pending/approved) request exists for the same date.
  // Used for informational badges (red/grey/amber) and "revert to present" on draft weeks.
  const [inactiveLeaveByDate, setInactiveLeaveByDate] = useState<Record<string, InactiveLeaveEntry>>({})
  // Leave conflict modal state (null = no modal)
  const [leaveConflicts, setLeaveConflicts] = useState<{
    missingRequests: LeaveConflict[]
    presentWithLeave: PresentConflict[]
  } | null>(null)
  // Mon/Fri sick days for current employee in current calendar month, EXCLUDING dates in the currently-viewed week
  const [monthMonFriSickOutsideWeek, setMonthMonFriSickOutsideWeek] = useState<number>(0)
  // Context snapshot panel: leave balances + OT
  const [showContextPanel, setShowContextPanel] = useState(true)
  const [ctxBalances, setCtxBalances] = useState<{leave_type: string; total_days: number; used_days: number}[]>([])
  const [ctxPendingLeave, setCtxPendingLeave] = useState<Record<string, number>>({})
  const [ctxOtPrev, setCtxOtPrev] = useState(0)
  const [ctxOtCurr, setCtxOtCurr] = useState(0)
  const [ctxOtPrevPending, setCtxOtPrevPending] = useState(0)
  const [ctxOtCurrPending, setCtxOtCurrPending] = useState(0)
  const [loadingCtx, setLoadingCtx] = useState(false)
  // Track which (weekId, dateISO) mismatches we've already sent notifications for this session
  const notifiedMismatchesRef = useRef<Set<string>>(new Set())
  // Set of dateISO strings auto-filled from leave that still need persisting via autosave
  const pendingLeaveAutofillRef = useRef<Set<string>>(new Set())
  // Timer ref for auto-clearing the 'saved' indicator (avoids setState-after-unmount)
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Init holidays based on country code
  useEffect(() => {
    const cc = profile?.country_code ?? 'ZA'
    hd.current = new Holidays(cc)
  }, [profile?.country_code])

  // Recalculate week bounds on offset change
  useEffect(() => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    const { start, end } = getWeekBounds(base)
    setWeekStart(start)
    setWeekEnd(end)
  }, [weekOffset])

  // Load timesheet when week changes
  useEffect(() => {
    if (!profile?.id) return
    loadWeek()
    setOtHourDrafts({})
    setOtHourErrors({})
    notifiedMismatchesRef.current = new Set()
    pendingLeaveAutofillRef.current = new Set()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, profile?.id])

  // Real-time: reload the current week whenever one of this employee's leave
  // requests changes status (e.g. approved by supervisor while the page is open).
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel(`leave_status_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leave_requests',
          filter: `employee_id=eq.${profile.id}`,
        },
        () => {
          // Re-run loadWeek so reconciliation picks up the new status
          loadWeek()
        }
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Load leave balances + OT summary for the context snapshot panel
  useEffect(() => {
    if (profile?.id) fetchContextData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function fetchContextData() {
    if (!profile?.id) return
    setLoadingCtx(true)
    try {
      const now = new Date()
      const fy = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      const currMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const [{ data: balData }, { data: otData }, { data: pendingLeaveData }] = await Promise.all([
        supabase
          .from('leave_balances')
          .select('leave_type, total_days, used_days')
          .eq('employee_id', profile.id)
          .eq('year', fy),
        supabase
          .from('ot_approvals')
          .select('status, final_status, timesheet_day:timesheet_days(date, overtime_hours)')
          .eq('employee_id', profile.id)
          .gte('submitted_at', cutoff.toISOString()),
        supabase
          .from('leave_requests')
          .select('leave_type, total_days')
          .eq('employee_id', profile.id)
          .eq('leave_year', fy)
          .in('status', ['pending', 'secondary_approved']),
      ])
      setCtxBalances((balData ?? []) as {leave_type: string; total_days: number; used_days: number}[])
      const pendingByType: Record<string, number> = {}
      for (const r of (pendingLeaveData ?? []) as { leave_type: string; total_days: number }[]) {
        pendingByType[r.leave_type] = (pendingByType[r.leave_type] ?? 0) + r.total_days
      }
      setCtxPendingLeave(pendingByType)
      let prevApproved = 0, currApproved = 0, prevPending = 0, currPending = 0
      for (const row of (otData ?? []) as unknown as {status: string; final_status: string | null; timesheet_day: {date: string; overtime_hours: number | null} | null}[]) {
        const dateStr = row.timesheet_day?.date
        if (!dateStr) continue
        const d = new Date(dateStr + 'T00:00:00')
        const hrs = row.timesheet_day?.overtime_hours ?? 0
        const approved = row.final_status === 'approved' || (row.status === 'approved' && !row.final_status)
        const pending = row.status === 'pending' || row.final_status === 'pending'
        if (d >= prevMonthStart && d <= prevMonthEnd) {
          if (approved) prevApproved += hrs
          else if (pending) prevPending += hrs
        } else if (d >= currMonthStart) {
          if (approved) currApproved += hrs
          else if (pending) currPending += hrs
        }
      }
      setCtxOtPrev(prevApproved)
      setCtxOtCurr(currApproved)
      setCtxOtPrevPending(prevPending)
      setCtxOtCurrPending(currPending)
    } finally {
      setLoadingCtx(false)
    }
  }

  function buildDaysFromDates(weekStartDate: Date): DayState[] {
    const dateArr = getDaysOfWeek(weekStartDate)
    return dateArr.map((d, i) => {
      const holidayResult = hd.current.isHoliday(d)
      const isHoliday = !!holidayResult
      const holidayName = isHoliday && Array.isArray(holidayResult) && holidayResult.length > 0
        ? holidayResult[0].name
        : ''
      return defaultDay(isHoliday, holidayName, i >= 5)
    })
  }

  function mergeDaysWithDb(baseDays: DayState[], dbDays: TimesheetDay[]): DayState[] {
    const dateArr = getDaysOfWeek(weekStart)
    return baseDays.map((base, idx) => {
      const dateStr = formatDateISO(dateArr[idx])
      const db = dbDays.find(d => d.date === dateStr)
      if (!db) return base
      return {
        primary_status: db.primary_status,
        // leave_type_detail not read from DB — column does not exist yet.
        // It is reconciled from the active leave request in the post-merge step.
        // TODO: read leave_type_id and leave_request_id here after migration 073.
        leave_type_detail: '',
        overtime_flag: db.overtime_flag,
        overtime_hours: db.overtime_hours ?? 0,
        overtime_reason: db.overtime_reason ?? '',
        standby_flag: db.standby_flag ?? false,
        underground_flag: db.underground_flag ?? false,
        underground_hours: db.underground_hours ?? 0,
        lol_flag: db.lol_flag,
        lol_province: db.lol_province ?? '',
        loi_flag: db.loi_flag,
        loi_country: db.loi_country ?? '',
        notes: db.notes ?? '',
        is_public_holiday: base.is_public_holiday,
        holiday_name: base.holiday_name,
        is_locked: db.is_locked,
      }
    })
  }

  async function loadWeek() {
    setLoading(true)
    setSaveError(null)
    // Clear week-scoped state so stale data from the previous week never leaks
    // into the new view (e.g. a sick note attached to last week's row).
    setAttachments([])
    try {
      const baseDays = buildDaysFromDates(weekStart)
      const weekStartStr = formatDateISO(weekStart)
      const weekEndStr = formatDateISO(weekEnd)
      const dateArr = getDaysOfWeek(weekStart)

      // Try localStorage draft first for instant render
      const draftKey = `timesheet_draft_${profile!.id}_${weekStartStr}`
      const localDraft = localStorage.getItem(draftKey)

      // Fetch all leave requests overlapping this week: active (pending/approved) and
      // inactive (denied/cancelled/returned).  Active → auto-fill; inactive → badge only.
      // NOTE: no status filter here — fetch all statuses and classify in JS so that
      // non-standard status values (e.g. 'returned', future workflow states) are still
      // surfaced. Errors are logged so silent failures don't hide leave data.
      const { data: allLeaves, error: leaveFetchError } = await supabase
        .from('leave_requests')
        .select('id, leave_type, start_date, end_date, status')
        .eq('employee_id', profile!.id)
        .lte('start_date', weekEndStr)
        .gte('end_date', weekStartStr)
      if (leaveFetchError) {
        console.error('[loadWeek] leave_requests fetch failed:', leaveFetchError)
      }

      const leaveMap: Record<string, { id: string; leave_type: string }> = {}
      const activeLeaveMap: Record<string, ActiveLeaveEntry> = {}
      const inactiveLeaveMap: Record<string, InactiveLeaveEntry> = {}
      const blockingConflicts = new Set<string>()
      const pendingOverlaps = new Set<string>()
      if (allLeaves && allLeaves.length > 0) {
        for (const d of dateArr) {
          const ds = formatDateISO(d)
          const onDate  = allLeaves.filter(l => l.start_date <= ds && l.end_date >= ds)
          // Treat 'approved', 'secondary_approved', 'final_approved' all as approved for auto-fill.
          const ACTIVE_APPROVED = new Set(['approved', 'secondary_approved', 'final_approved'])
          const INACTIVE = new Set(['denied', 'cancelled', 'returned'])
          const approved = onDate.filter(l => ACTIVE_APPROVED.has(l.status))
          const pending  = onDate.filter(l => l.status === 'pending')
          const inactive = onDate.filter(l => INACTIVE.has(l.status))

          // Blocking: multiple approved, OR multiple pending with no approved request
          if (approved.length > 1 || (approved.length === 0 && pending.length > 1)) {
            blockingConflicts.add(ds)
          }
          // Non-blocking overlap: one approved + additional pending — use approved, warn about pending
          if (approved.length === 1 && pending.length > 0) {
            pendingOverlaps.add(ds)
          }

          // Preferred active request for auto-population: first approved, else first pending
          const preferred = approved[0] ?? pending[0]
          if (preferred) {
            // Normalise any variant of "approved" to 'approved' for the UI badge
            const normStatus: 'pending' | 'approved' = ACTIVE_APPROVED.has(preferred.status) ? 'approved' : 'pending'
            activeLeaveMap[ds] = { id: preferred.id, leave_type: preferred.leave_type, status: normStatus }
            if (normStatus === 'approved') {
              leaveMap[ds] = { id: preferred.id, leave_type: preferred.leave_type }
            }
          }

          // Inactive (denied/cancelled/returned) — only when no active request exists for this date.
          // Prefer 'denied' over 'cancelled'/'returned' to surface the most actionable status.
          if (!preferred && inactive.length > 0) {
            const denied = inactive.find(l => l.status === 'denied')
            const chosen = denied ?? inactive[0]
            const inactiveStatus = chosen.status === 'denied' ? 'denied' : chosen.status === 'returned' ? 'returned' : 'cancelled'
            inactiveLeaveMap[ds] = { id: chosen.id, leave_type: chosen.leave_type, status: inactiveStatus as 'denied' | 'cancelled' | 'returned' }
          }
        }
      }
      setLeaveByDate(leaveMap)
      setActiveLeaveByDate(activeLeaveMap)
      setInactiveLeaveByDate(inactiveLeaveMap)
      setBlockingConflictDates(blockingConflicts)
      setPendingOverlapDates(pendingOverlaps)
      // NOTE: leave reconciliation (auto-fill / revert) runs AFTER the DB merge below,
      // not here, so DB values are respected first and all request states are included.

      const { data: week, error } = await supabase
        .from('timesheet_weeks')
        .select('*, days:timesheet_days(*)')
        .eq('employee_id', profile!.id)
        .eq('week_start', weekStartStr)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      // Track which dates need autosave persistence after leave auto-fill
      pendingLeaveAutofillRef.current = new Set()
      let needsPersist = false
      let finalDaysForPersist: DayState[] | null = null

      if (week) {
        const typedWeek = week as TimesheetWeek & { days: TimesheetDay[] }
        setWeekId(typedWeek.id)
        loadAttachments(typedWeek.id)
        setWeekStatus(typedWeek.status)
        setResubmissionCount(typedWeek.resubmission_count ?? 0)
        setReviewerComment(typedWeek.reviewer_comment ?? null)
        const dbDays = typedWeek.days ?? []
        const merged = mergeDaysWithDb(baseDays, dbDays)

        // Reconcile every day against active/inactive leave requests AFTER the DB merge.
        // This fixes the bug where a previously-saved 'present' DB row would overwrite
        // the pre-fill, and adds support for pending / denied / cancelled / returned
        // requests.  Submitted/approved weeks are never modified by reconcileLeave.
        const reconciled = merged.map((day, i) => {
          if (i >= 5) return day  // weekends handled by their own logic
          const ds = formatDateISO(dateArr[i])
          const resolution = resolveLeaveStateForDate(ds, activeLeaveMap, inactiveLeaveMap, blockingConflicts, pendingOverlaps)
          return reconcileLeave(day, resolution, typedWeek.status)
        })

        // Persist days changed by reconciliation: auto-filled (→ leave) or reverted (→ present).
        // NOTE: the !dbDays.find() guard was intentionally removed — if leave is approved after
        // a 'present' DB row was already saved, the reconciled value must overwrite the DB row.
        for (let i = 0; i < dateArr.length; i++) {
          const ds = formatDateISO(dateArr[i])
          const wasAutoFilled = reconciled[i].primary_status === 'leave' && merged[i].primary_status !== 'leave'
          const wasReverted   = reconciled[i].primary_status !== 'leave' && merged[i].primary_status === 'leave'
          if (wasAutoFilled || wasReverted) {
            pendingLeaveAutofillRef.current.add(ds)
            needsPersist = true
          }
        }
        setDays(reconciled)
        finalDaysForPersist = reconciled
        // Don't auto-persist for submitted/approved/rejected weeks.
        if (typedWeek.status !== 'draft') needsPersist = false
      } else {
        // No DB record yet — use localStorage draft or blank
        setWeekId(null)
        setWeekStatus('draft')
        setResubmissionCount(0)
        setReviewerComment(null)
        let priorDays: DayState[] = baseDays
        if (localDraft) {
          try {
            const parsed = JSON.parse(localDraft) as DayState[]
            // Restore public holiday flags from fresh computation
            priorDays = parsed.map((d, i) => ({
              ...d,
              is_public_holiday: baseDays[i].is_public_holiday,
              holiday_name: baseDays[i].holiday_name,
              is_locked: d.is_locked,
            }))
          } catch {
            priorDays = baseDays
          }
        }

        // Reconcile against active/inactive leave requests (no DB rows exist for this week yet)
        const finalDays = priorDays.map((day, i) => {
          if (i >= 5) return day
          const ds = formatDateISO(dateArr[i])
          const resolution = resolveLeaveStateForDate(ds, activeLeaveMap, inactiveLeaveMap, blockingConflicts, pendingOverlaps)
          return reconcileLeave(day, resolution, 'draft')
        })

        // Persist days changed by reconciliation (auto-filled or reverted)
        for (let i = 0; i < dateArr.length; i++) {
          const wasAutoFilled = finalDays[i].primary_status === 'leave' && priorDays[i].primary_status !== 'leave'
          const wasReverted   = finalDays[i].primary_status !== 'leave' && priorDays[i].primary_status === 'leave'
          if (wasAutoFilled || wasReverted) {
            const ds = formatDateISO(dateArr[i])
            pendingLeaveAutofillRef.current.add(ds)
            needsPersist = true
          }
        }
        setDays(finalDays)
        finalDaysForPersist = finalDays
      }

      // If anything was auto-filled and the week isn't locked, persist it once
      if (needsPersist && finalDaysForPersist) {
        // Fire-and-forget; mismatch detection in autoSave is harmless here
        autoSave(finalDaysForPersist)
      }
    } catch (err) {
      setSaveError('Failed to load timesheet.')
      console.error(err)
      const baseDays = buildDaysFromDates(weekStart)
      setDays(baseDays)
    } finally {
      setLoading(false)
    }
  }

  const autoSave = useCallback(
    async (updatedDays: DayState[]) => {
      if (!profile?.id) return
      const weekStartStr = formatDateISO(weekStart)
      const weekEndStr = formatDateISO(weekEnd)
      const draftKey = `timesheet_draft_${profile.id}_${weekStartStr}`

      // Save to localStorage
      localStorage.setItem(draftKey, JSON.stringify(updatedDays))

      setSaving(true)
      setSaveStatus('saving')
      setSaveError(null)
      try {
        // Upsert week
        const { data: upsertedWeek, error: weekErr } = await supabase
          .from('timesheet_weeks')
          .upsert(
            {
              employee_id: profile.id,
              week_start: weekStartStr,
              week_end: weekEndStr,
              status: 'draft',
            },
            { onConflict: 'employee_id,week_start' }
          )
          .select('id, status, reviewer_comment')
          .single()

        if (weekErr) throw weekErr

        const currentWeekId = upsertedWeek.id
        if (!weekId) setWeekId(currentWeekId)
        setWeekStatus('draft')

        // Upsert each day — skip weekend days with no status selected
        const dateArr = getDaysOfWeek(weekStart)
        const dayUpserts = updatedDays
          .map((day, idx) => ({ day, idx }))
          // Include any day that has a status OR an additive flag set
          .filter(({ day }) => day.primary_status !== '' || day.standby_flag || day.overtime_flag || day.underground_flag || day.lol_flag || day.loi_flag)
          .map(({ day, idx }) => ({
            timesheet_week_id: currentWeekId,
            date: formatDateISO(dateArr[idx]),
            day_of_week: DAY_NAMES[idx],
            // Standby/OT/LOL/LOI on a weekend without an explicit status default to 'present'
            primary_status: day.primary_status || 'present',
            // leave_type_detail intentionally omitted — DB column does not exist.
            // TODO: add leave_type_id (UUID) and leave_request_id (UUID) here after migration 073.
            overtime_flag: day.overtime_flag,
            overtime_hours: day.overtime_flag ? day.overtime_hours : null,
            overtime_reason: day.overtime_flag ? (day.overtime_reason || null) : null,
            standby_flag: day.standby_flag,
            underground_flag: day.underground_flag,
            underground_hours: day.underground_flag ? (day.underground_hours || null) : null,
            lol_flag: day.lol_flag,
            lol_province: day.lol_flag ? (day.lol_province || null) : null,
            loi_flag: day.loi_flag,
            loi_country: day.loi_flag ? (day.loi_country || null) : null,
            notes: day.notes || null,
          }))

        const { error: daysErr } = await supabase
          .from('timesheet_days')
          .upsert(dayUpserts, { onConflict: 'timesheet_week_id,date' })

        if (daysErr) throw daysErr

        // Clear the auto-fill pending set once persisted
        pendingLeaveAutofillRef.current = new Set()

        // Detect leave vs timesheet mismatches and notify (once per day per session)
        try {
          const mismatches: Array<{ date: string; status: string; leave_type: string }> = []
          for (let i = 0; i < updatedDays.length; i++) {
            const ds = formatDateISO(dateArr[i])
            const leave = leaveByDate[ds]
            if (!leave) continue
            const status = updatedDays[i].primary_status
            if (status && status !== 'leave' && status !== 'public_holiday' && !updatedDays[i].is_public_holiday) {
              const key = `${currentWeekId}_${ds}`
              if (!notifiedMismatchesRef.current.has(key)) {
                mismatches.push({ date: ds, status, leave_type: leave.leave_type })
                notifiedMismatchesRef.current.add(key)
              }
            }
          }
          if (mismatches.length > 0 && profile) {
            const name = `${profile.first_name ?? ''} ${profile.surname ?? ''}`.trim() || 'An employee'
            const rows = mismatches.flatMap(m => {
              const dateLabel = new Date(m.date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
              const employeeMsg = `You marked ${dateLabel} as "${m.status.replace(/_/g, ' ')}" but you have approved ${m.leave_type} leave on this day. Please review.`
              const supervisorMsg = `${name} marked ${dateLabel} as "${m.status.replace(/_/g, ' ')}" on their timesheet, but has approved ${m.leave_type} leave on this day.`
              const baseRow = {
                type: 'leave_timesheet_mismatch',
                title: 'Leave vs timesheet mismatch',
                related_entity_type: 'timesheet_week',
                related_entity_id: currentWeekId,
              }
              const out = [
                { ...baseRow, recipient_id: profile.id, message: employeeMsg },
              ]
              if (profile.supervisor_id) {
                out.push({ ...baseRow, recipient_id: profile.supervisor_id, message: supervisorMsg })
              }
              return out
            })
            if (rows.length > 0) {
              await supabase.from('notifications').insert(rows)
            }
          }
        } catch (notifyErr) {
          console.error('mismatch notify failed', notifyErr)
        }
        // Autosave succeeded — update indicator and schedule auto-clear
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
        setSaveStatus('saved')
        saveStatusTimerRef.current = setTimeout(
          () => setSaveStatus(s => s === 'saved' ? 'idle' : s),
          2500
        )
      } catch (err) {
        // Log only technical identifiers and error metadata — no PII, no payloads.
        const errObj = err as { message?: string; code?: string; hint?: string } | null
        console.error('[autoSave] timesheet save failed', {
          weekStart: weekStartStr,   // date only, no names or personal data
          employeeId: profile.id,    // UUID only
          errorMessage: errObj?.message ?? String(err),
          errorCode: errObj?.code,
          errorHint: errObj?.hint,
        })
        setSaveStatus('error')
        // saveError intentionally not set here — the inline indicator handles
        // autosave failure display. saveError is reserved for submit/load failures.
      } finally {
        setSaving(false)
      }
    },
    [profile, weekStart, weekEnd, weekId, leaveByDate, activeLeaveByDate]
  )

  function handleDayChange(idx: number, partial: Partial<DayState>) {
    setDays(prev => {
      const updated = prev.map((d, i) => (i === idx ? { ...d, ...partial } : d))
      // Debounce auto-save
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (weekStatus !== 'approved') autoSave(updated)
      }, 2000)
      return updated
    })
  }

  // ── Leave conflict validation ─────────────────────────────────────────────
  // Shared logic used for both inline warnings and the submit gate.
  function validateLeaveConflicts(currentDays: DayState[]) {
    const dateArr = getDaysOfWeek(weekStart)
    const missingRequests: LeaveConflict[] = []
    const presentWithLeave: PresentConflict[] = []

    for (let i = 0; i < currentDays.length; i++) {
      const d       = dateArr[i]
      const iso     = formatDateISO(d)
      const day     = currentDays[i]
      const isWeekend = d.getDay() === 0 || d.getDay() === 6

      if (day.is_locked || day.primary_status === '' || day.is_public_holiday || isWeekend) continue

      const active   = activeLeaveByDate[iso]  // pending or approved
      const approved = leaveByDate[iso]        // approved only

      const dayLabel = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })

      if (day.primary_status === 'leave' || day.primary_status === 'sick') {
        if (!active) {
          // No pending or approved leave request for this day at all
          missingRequests.push({ dateISO: iso, dayLabel, dayIndex: i, timesheetStatus: day.primary_status as 'leave' | 'sick', conflictType: 'missing_request' })
        } else if (day.primary_status === 'sick' && active.leave_type !== 'sick') {
          // Marked sick but the leave request on this day is not sick leave
          missingRequests.push({ dateISO: iso, dayLabel, dayIndex: i, timesheetStatus: 'sick', conflictType: 'type_mismatch' })
        }
        // leave + any active leave type = valid
      }

      // Reverse: marked present but has approved (or pending) leave
      if (day.primary_status === 'present' && approved) {
        presentWithLeave.push({ dateISO: iso, dayLabel, dayIndex: i, leaveType: approved.leave_type, leaveStatus: 'approved' })
      }
    }

    return { missingRequests, presentWithLeave }
  }

  async function handleSubmit() {
    if (!profile?.id) return
    setShowConfirm(false)
    setSaving(true)
    try {
      // Make sure the week (and any pending day rows) exist in DB before submitting
      let currentWeekId = weekId
      if (!currentWeekId) {
        await autoSave(days)
        currentWeekId = await ensureWeekSaved()
      }
      if (!currentWeekId) throw new Error('Could not create timesheet week')
      // Look up current row to know if this is a resubmission
      const { data: existing } = await supabase
        .from('timesheet_weeks')
        .select('submitted_at, resubmission_count')
        .eq('id', currentWeekId)
        .single()
      const wasSubmittedBefore = existing?.submitted_at != null
      const newCount = wasSubmittedBefore
        ? (existing?.resubmission_count ?? 0) + 1
        : 0
      const { error } = await supabase
        .from('timesheet_weeks')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          resubmission_count: newCount,
        })
        .eq('id', currentWeekId)
      if (error) throw error
      setWeekStatus('submitted')
      setResubmissionCount(newCount)
      setSubmitSuccess(wasSubmittedBefore ? 'Timesheet resubmitted successfully.' : 'Timesheet submitted successfully.')
      setTimeout(() => setSubmitSuccess(null), 5000)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSaveError('Failed to submit timesheet.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // Ensure the week record exists in DB and return its id
  async function ensureWeekSaved(): Promise<string | null> {
    if (weekId) return weekId
    if (!profile?.id) return null
    const weekStartStr = formatDateISO(weekStart)
    const weekEndStr = formatDateISO(weekEnd)
    const { data, error } = await supabase
      .from('timesheet_weeks')
      .upsert(
        { employee_id: profile.id, week_start: weekStartStr, week_end: weekEndStr, status: 'draft' },
        { onConflict: 'employee_id,week_start' }
      )
      .select('id')
      .single()
    if (error || !data) return null
    setWeekId(data.id)
    return data.id
  }

  async function loadAttachments(id: string) {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('linked_to_type', 'timesheet')
      .eq('linked_to_id', id)
      .order('uploaded_at', { ascending: false })
    if (data) setAttachments(data as Attachment[])
  }

  async function handleFileUpload(file: File) {
    if (!profile?.id) return
    setUploadingFile(true)
    setUploadError(null)
    const currentWeekId = await ensureWeekSaved()
    if (!currentWeekId) {
      setUploadError('Could not save timesheet. Please try again.')
      setUploadingFile(false)
      return
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${profile.id}/${formatDateISO(weekStart)}/${Date.now()}_${safeName}`
    const { error: storageErr } = await supabase.storage.from('attachments').upload(path, file)
    if (storageErr) {
      setUploadError(storageErr.message)
      setUploadingFile(false)
      return
    }
    const { error: dbErr, data: inserted } = await supabase.from('attachments').insert({
      linked_to_type: 'timesheet',
      linked_to_id: currentWeekId,
      display_name: file.name,
      storage_path: path,
      file_size_bytes: file.size,
      mime_type: file.type,
      uploaded_by: profile.id,
    }).select('id').single()
    if (dbErr) {
      setUploadError(dbErr.message)
      setUploadingFile(false)
      return
    }
    await loadAttachments(currentWeekId)
    setUploadingFile(false)

    // Trigger AI classification in the background — no await so user isn't blocked
    if (inserted?.id) {
      triggerClassification(inserted.id, currentWeekId)
    }
  }

  async function triggerClassification(attachmentId: string, weekIdForRefresh: string) {
    try {
      const { data, error } = await supabase.functions.invoke('classify-document', {
        body: { attachmentId },
      })
      if (error) {
        console.error('classify-document invoke error:', error)
        setUploadError(`Classification failed: ${error.message ?? 'edge function error'}. You can set the category manually.`)
      } else if (data?.error) {
        console.error('classify-document returned error:', data.error)
        setUploadError(`Classification failed: ${data.error}. You can set the category manually.`)
      }
      await loadAttachments(weekIdForRefresh)
    } catch (err) {
      console.error('classify-document threw:', err)
      setUploadError(`Classification failed: ${String(err)}. You can set the category manually.`)
    }
  }

  async function handleDownloadAttachment(attachment: Attachment) {
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(attachment.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDeleteAttachment(attachment: Attachment) {
    await supabase.storage.from('attachments').remove([attachment.storage_path])
    await supabase.from('attachments').delete().eq('id', attachment.id)
    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
  }

  async function handleUpdateAttachmentCategory(attId: string, newCategory: DocumentCategory) {
    await supabase.from('attachments').update({
      category: newCategory,
      ai_classified_at: new Date().toISOString(),
    }).eq('id', attId)
    setAttachments(prev => prev.map(a => a.id === attId
      ? { ...a, category: newCategory, ai_classified_at: a.ai_classified_at ?? new Date().toISOString() }
      : a
    ))
    setExpandedData(prev => prev ? {
      ...prev,
      attachments: prev.attachments.map(a => a.id === attId
        ? { ...a, category: newCategory, ai_classified_at: a.ai_classified_at ?? new Date().toISOString() }
        : a
      ),
    } : prev)
    setEditingAttachmentCategoryId(null)
  }

  async function loadExpandedWeek(weekId: string) {
    setExpandedData({ days: [], attachments: [], loading: true })
    const [{ data: days }, { data: atts }] = await Promise.all([
      supabase.from('timesheet_days').select('*').eq('timesheet_week_id', weekId).order('date'),
      supabase.from('attachments').select('*').eq('linked_to_type', 'timesheet').eq('linked_to_id', weekId).order('uploaded_at'),
    ])
    setExpandedData({
      days: (days ?? []) as TimesheetDay[],
      attachments: (atts ?? []) as Attachment[],
      loading: false,
    })
  }

  function toggleExpandWeek(weekId: string) {
    if (expandedWeekId === weekId) {
      setExpandedWeekId(null)
      setExpandedData(null)
    } else {
      setExpandedWeekId(weekId)
      loadExpandedWeek(weekId)
    }
  }

  function getDayStatusColour(status: DayStatus): string {
    const map: Record<DayStatus, string> = {
      present: 'text-green-600',
      leave: 'text-blue-600',
      sick: 'text-red-600',
      awol: 'text-orange-600',
      public_holiday: 'text-purple-600',
      standby: 'text-amber-600',
    }
    return map[status] ?? 'text-[var(--text-muted)]'
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  function navigateToWeek(weekStartStr: string) {
    const target = new Date(weekStartStr + 'T00:00:00')
    const { start: currentStart } = getWeekBounds(new Date())
    const diffMs = target.getTime() - currentStart.getTime()
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
    setWeekOffset(diffWeeks)
    setViewMode('my')
  }

  async function loadHistory() {
    if (!profile?.id) return
    setHistoryLoading(true)
    try {
      let query = supabase
        .from('timesheet_weeks')
        .select('id, week_start, week_end, status, submitted_at, reviewer_comment, resubmission_count')
        .eq('employee_id', profile.id)
        .order('week_start', { ascending: false })
      if (historyStatusFilter !== 'all') query = query.eq('status', historyStatusFilter)
      if (historyDateFrom) query = query.gte('week_start', historyDateFrom)
      if (historyDateTo) query = query.lte('week_start', historyDateTo)
      const { data } = await query
      setHistoryWeeks((data ?? []) as HistoryWeek[])
    } finally {
      setHistoryLoading(false)
    }
  }

  // Load attachments when weekId becomes known
  useEffect(() => {
    if (weekId) loadAttachments(weekId)
    else setAttachments([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId])

  // Poll every 5 s while any attachment is still being classified.
  // After 15 s of being pending, re-invoke classification (first call may have failed).
  useEffect(() => {
    if (!weekId) return
    const pending = attachments.filter(a => a.ai_classified_at === null)
    if (pending.length === 0) return
    const timer = setTimeout(() => {
      // For any attachment older than 15 s and still pending, retry once
      const now = Date.now()
      for (const a of pending) {
        const uploadedMs = new Date(a.uploaded_at).getTime()
        if (now - uploadedMs > 15000) {
          triggerClassification(a.id, weekId)
          return
        }
      }
      loadAttachments(weekId)
    }, 5000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, weekId])

  // Reload history when tab selected or filters change
  useEffect(() => {
    if (viewMode === 'history') loadHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, historyStatusFilter, historyDateFrom, historyDateTo, profile?.id])

  // Load cross-week Mon/Fri sick count for the current calendar month (excluding visible week)
  useEffect(() => {
    if (!profile?.id) { setMonthMonFriSickOutsideWeek(0); return }
    let cancelled = false
    ;(async () => {
      // Calendar month of the week-start date
      const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
      const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0)
      const monthStartISO = formatDateISO(monthStart)
      const monthEndISO = formatDateISO(monthEnd)
      const wkStartISO = formatDateISO(weekStart)
      const weekEndDate = new Date(weekStart)
      weekEndDate.setDate(weekEndDate.getDate() + 6)
      const weekEndISO = formatDateISO(weekEndDate)
      const { data, error } = await supabase
        .from('timesheet_days')
        .select('date, primary_status, timesheet_week:timesheet_weeks!inner(employee_id)')
        .eq('timesheet_week.employee_id', profile.id)
        .eq('primary_status', 'sick')
        .gte('date', monthStartISO)
        .lte('date', monthEndISO)
      if (cancelled || error || !data) {
        if (!cancelled) setMonthMonFriSickOutsideWeek(0)
        return
      }
      let count = 0
      for (const row of data as Array<{ date: string }>) {
        // Skip rows inside the visible week — those are handled by in-memory state
        if (row.date >= wkStartISO && row.date <= weekEndISO) continue
        const d = new Date(row.date + 'T00:00:00')
        const dow = d.getDay() // 0 Sun .. 6 Sat
        if (dow === 1 || dow === 5) count += 1
      }
      if (!cancelled) setMonthMonFriSickOutsideWeek(count)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, weekStart])

  const isLocked = weekStatus === 'approved'
  const hasOtWithoutReason = days.some(d => d.overtime_flag && !d.overtime_reason.trim())
  const hasOtHourError = Object.values(otHourErrors).some(e => !!e)
  const hasOtZeroHours = days.some(d => d.overtime_flag && (d.overtime_hours ?? 0) <= 0)
  const hasUndergroundZeroHours = days.some(d => d.underground_flag && (d.underground_hours ?? 0) <= 0)
  const hasLolWithoutProvince = days.some(d => d.lol_flag && !d.lol_province)
  const hasLoiWithoutCountry = days.some(d => d.loi_flag && !d.loi_country)
  const weekStartStr = formatDateISO(weekStart)
  const dateArr = getDaysOfWeek(weekStart)

  // --- Sick-note governance ---
  // Categories that count as a valid medical note attachment
  const hasMedicalAttachment = attachments.some(a => a.category && MEDICAL_CATEGORIES.includes(a.category))
  // Indices of sick days within the current week
  const sickIndicesThisWeek = days
    .map((d, i) => (d.primary_status === 'sick' ? i : -1))
    .filter(i => i >= 0)
  const hasAnySickThisWeek = sickIndicesThisWeek.length > 0
  // Longest consecutive run of sick days within the week
  let maxConsecutiveSick = 0
  {
    let run = 0
    for (const d of days) {
      if (d.primary_status === 'sick') { run += 1; if (run > maxConsecutiveSick) maxConsecutiveSick = run }
      else run = 0
    }
  }
  const hasConsecutiveSick = maxConsecutiveSick >= 2
  // Mon (idx 0) or Fri (idx 4) sick days in current week
  const monFriSickThisWeek = sickIndicesThisWeek.filter(i => i === 0 || i === 4).length
  // Combined with stored cross-week count to detect monthly Mon/Fri pattern
  const monthMonFriSickTotal = monFriSickThisWeek + monthMonFriSickOutsideWeek
  const hasMonFriPattern = monthMonFriSickTotal > 1
  const sickNoteRequired = hasAnySickThisWeek && (hasConsecutiveSick || hasMonFriPattern)
  const sickNoteMissingBlocking = sickNoteRequired && !hasMedicalAttachment
  const sickNoteMissingFlag = hasAnySickThisWeek && !sickNoteRequired && !hasMedicalAttachment

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Timesheets</h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            {viewMode === 'my' ? 'Weekly timesheet entry' : 'Team timesheet overview'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'my' && (
            <StatusBadge
              status={
                weekStatus === 'submitted' && resubmissionCount > 0
                  ? 'resubmitted'
                  : weekStatus
              }
            />
          )}
          {saveStatus === 'saving' && (
            <span className="text-xs text-[var(--text-muted)]">Saving…</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 font-medium">Saved ✓</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
              ⚠ Save failed — 
              <button
                type="button"
                onClick={() => { setSaveStatus('idle'); autoSave(days) }}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </span>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-[var(--surface-secondary)] p-1 rounded-lg w-fit mb-5">
        <button
          type="button"
          onClick={() => setViewMode('my')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'my'
              ? 'bg-[var(--tab-active-bg)] text-[var(--primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--tab-inactive-hover-text)]'
          }`}
        >
          My Timesheet
        </button>
        <button
          type="button"
          onClick={() => setViewMode('history')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'history'
              ? 'bg-[var(--tab-active-bg)] text-[var(--primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--tab-inactive-hover-text)]'
          }`}
        >
          History
        </button>
        {canSeeTeam && (
          <button
            type="button"
            onClick={() => setViewMode('team')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'team'
                ? 'bg-[var(--tab-active-bg)] text-[var(--primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--tab-inactive-hover-text)]'
            }`}
          >
            Team Overview
          </button>
        )}
      </div>

      {/* ── My snapshot panel: leave balances + OT ─────────────────── */}
      {viewMode === 'my' && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">My Snapshot</p>
            <button
              type="button"
              onClick={() => setShowContextPanel(v => !v)}
              className="text-xs text-[var(--text-muted)] hover:text-gray-600"
            >
              {showContextPanel ? 'Hide' : 'Show balances & OT'}
            </button>
          </div>
          {showContextPanel && (
            <div className={`bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-5 ${loadingCtx ? 'opacity-60' : ''}`}>
              {/* Leave balances */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Leave Balances — current FY</p>
                {(['annual', 'sick', 'family', 'study'] as const).map(type => {
                  const bal = ctxBalances.find(b => b.leave_type === type)
                  const DEFAULTS: Record<string, number> = { annual: 15, sick: 30, family: 3, study: 0 }
                  const total = bal?.total_days ?? DEFAULTS[type] ?? 0
                  const used = bal?.used_days ?? 0
                  const pending = ctxPendingLeave[type] ?? 0
                  const avail = Math.max(0, total - used)
                  const LABELS: Record<string, string> = { annual: 'Annual', sick: 'Sick (36-mo)', family: 'Family Resp.', study: 'Study' }
                  const pct = total > 0 ? (used / total) * 100 : 0
                  const pendingPct = total > 0 ? (pending / total) * 100 : 0
                  const colorCls = avail === 0 && total > 0 ? 'text-red-500' : avail > 0 && avail <= 3 && avail < total ? 'text-amber-500' : 'text-[var(--text-secondary)]'
                  return (
                    <div key={type} className="mb-2">
                      <div className="flex justify-between items-center text-xs mb-0.5 gap-2">
                        <span className="text-[var(--text-muted)]">{LABELS[type]}</span>
                        <span className="flex items-center gap-1.5">
                          <span className={`font-medium ${colorCls}`}>
                            {total === 0 ? 'per policy' : `${avail} / ${total} days`}
                            {avail === 0 && total > 0 ? ' ⚠' : avail > 0 && avail <= 3 && avail < total ? ' ⚠' : ''}
                          </span>
                          {pending > 0 && (
                            <span className="text-[10px] text-amber-600 font-medium whitespace-nowrap">({pending} pending)</span>
                          )}
                        </span>
                      </div>
                      {total > 0 && (
                        <div className="h-1 rounded-full bg-[var(--surface-secondary)] overflow-hidden flex">
                          <div
                            className={`h-full rounded-l-full ${avail === 0 ? 'bg-red-400' : avail > 0 && avail <= 3 && avail < total ? 'bg-amber-400' : 'bg-blue-400'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                          {pending > 0 && avail > 0 && (
                            <div
                              className="h-full bg-amber-300"
                              style={{ width: `${Math.min(pendingPct, 100 - Math.min(pct, 100))}%` }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="mt-3 pt-2 border-t border-[var(--border)] space-y-0.5">
                  {profile?.sex === 'female'
                    ? <p className="text-[11px] text-[var(--text-muted)]">Maternity: 4 months unpaid (BCEA s25)</p>
                    : <p className="text-[11px] text-[var(--text-muted)]">Parental: 10 days unpaid (BCEA s25B)</p>
                  }
                  <p className="text-[11px] text-[var(--text-muted)]">Adoption: 10 weeks unpaid (BCEA s25A)</p>
                </div>
              </div>
              {/* OT summary */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Overtime Summary</p>
                {([
                  {
                    label: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
                    approved: ctxOtPrev,
                    pending: ctxOtPrevPending,
                  },
                  {
                    label: new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
                    approved: ctxOtCurr,
                    pending: ctxOtCurrPending,
                  },
                ] as {label: string; approved: number; pending: number}[]).map(({ label, approved, pending }) => (
                  <div key={label} className="mb-3">
                    <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
                    <p className="text-xs">
                      <span className="font-medium text-[var(--text-secondary)]">{approved} hr{approved !== 1 ? 's' : ''} approved</span>
                      {pending > 0 && <span className="text-amber-600 ml-1">· {pending} hr{pending !== 1 ? 's' : ''} pending</span>}
                      {approved === 0 && pending === 0 && <span className="text-[var(--text-muted)] ml-1">· none recorded</span>}
                    </p>
                  </div>
                ))}
                <p className="text-[11px] text-[var(--text-muted)] mt-2 pt-2 border-t border-[var(--border)]">
                  Approved = fully signed off. Pending = awaiting action.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team overview */}
      {viewMode === 'team' && <TeamOverview />}

      {/* History */}
      {viewMode === 'history' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4 bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Status</label>
              <select
                value={historyStatusFilter}
                onChange={e => setHistoryStatusFilter(e.target.value as TimesheetStatus | 'all')}
                className="text-sm border border-[var(--border)] rounded px-2 py-1.5 bg-[var(--surface)] text-[var(--text-secondary)]"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">From week</label>
              <input
                type="date"
                value={historyDateFrom}
                onChange={e => setHistoryDateFrom(e.target.value)}
                className="text-sm border border-[var(--border)] rounded px-2 py-1.5 bg-[var(--surface)] text-[var(--text-secondary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">To week</label>
              <input
                type="date"
                value={historyDateTo}
                onChange={e => setHistoryDateTo(e.target.value)}
                className="text-sm border border-[var(--border)] rounded px-2 py-1.5 bg-[var(--surface)] text-[var(--text-secondary)]"
              />
            </div>
            {(historyDateFrom || historyDateTo || historyStatusFilter !== 'all') && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => { setHistoryStatusFilter('all'); setHistoryDateFrom(''); setHistoryDateTo('') }}
                  className="text-xs text-[var(--text-muted)] underline py-1.5 hover:text-gray-600"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* List */}
          {historyLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : historyWeeks.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-10 text-center">
              <p className="text-sm text-[var(--text-muted)]">No timesheets found.</p>
            </div>
          ) : (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {historyWeeks.map(week => {
                const ws = new Date(week.week_start + 'T00:00:00')
                const we = new Date(week.week_end + 'T00:00:00')
                const isExpanded = expandedWeekId === week.id
                return (
                  <div key={week.id}>
                    <div
                      className="flex flex-col gap-2 px-4 py-3 hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => toggleExpandWeek(week.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{formatWeekRange(ws, we)}</p>
                        {week.submitted_at && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            Submitted {new Date(week.submitted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                        {week.status === 'rejected' && week.reviewer_comment && (
                          <p className="text-xs text-red-500 mt-0.5">Rejected: {week.reviewer_comment}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <StatusBadge
                          status={
                            week.status === 'submitted' && (week.resubmission_count ?? 0) > 0
                              ? 'resubmitted'
                              : week.status
                          }
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); navigateToWeek(week.week_start) }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] transition-colors"
                          >
                            {week.status === 'approved' ? 'View' : 'Edit'}
                          </button>
                          <IconChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-4">
                        {expandedData?.loading ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                          </div>
                        ) : (
                          <>
                            {/* Day summary */}
                            {expandedData && expandedData.days.length > 0 && (
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Week Summary</p>
                                <div
                                  className="grid gap-1.5"
                                  style={{ gridTemplateColumns: `repeat(${Math.min(expandedData.days.length, 7)}, minmax(0, 1fr))` }}
                                >
                                  {expandedData.days.map(d => (
                                    <div key={d.id} className="bg-[var(--surface)] rounded border border-[var(--border)] px-1 py-2 text-center">
                                      <p className="text-[10px] font-semibold text-[var(--text-secondary)] mb-0.5">{d.day_of_week}</p>
                                      <p className={`text-[9px] font-medium leading-tight break-words ${getDayStatusColour(d.primary_status)}`}>
                                        {d.primary_status.replace(/_/g, ' ')}
                                      </p>
                                      {d.overtime_flag && d.overtime_hours && (
                                        <p className="text-[9px] text-amber-600 mt-0.5 leading-tight">+{d.overtime_hours}h OT</p>
                                      )}
                                      {d.standby_flag && (
                                        <p className="text-[9px] text-indigo-600 mt-0.5 leading-tight">Standby</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Attachments */}
                            <div>
                              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                                Attachments{expandedData?.attachments.length ? ` (${expandedData.attachments.length})` : ''}
                              </p>
                              {!expandedData || expandedData.attachments.length === 0 ? (
                                <p className="text-xs text-[var(--text-muted)] italic">No attachments for this week.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {expandedData.attachments.map(att => (
                                    <li key={att.id} className="flex items-center justify-between bg-[var(--surface)] rounded-lg border border-[var(--border)] px-3 py-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <IconDocument className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-[var(--text-secondary)] truncate max-w-[200px]">{att.ai_display_name ?? att.display_name}</p>
                                          <div className="flex items-center gap-1 mt-0.5">
                                            {editingAttachmentCategoryId === att.id ? (
                                              <select
                                                defaultValue={att.category ?? 'other'}
                                                onChange={e => { e.stopPropagation(); handleUpdateAttachmentCategory(att.id, e.target.value as DocumentCategory) }}
                                                onBlur={() => setEditingAttachmentCategoryId(null)}
                                                autoFocus
                                                className="border border-[var(--border)] rounded px-1 py-0.5 text-[10px] bg-[var(--surface)]"
                                              >
                                                {(Object.entries(DOCUMENT_CATEGORY_LABELS) as [DocumentCategory, string][]).map(([key, label]) => (
                                                  <option key={key} value={key}>{label}</option>
                                                ))}
                                              </select>
                                            ) : att.ai_classified_at === null ? (
                                              <div className="flex items-center gap-0.5">
                                                <span className="text-[10px] text-[var(--text-muted)] italic">Classifying…</span>
                                                <button type="button" onClick={e => { e.stopPropagation(); setEditingAttachmentCategoryId(att.id) }} title="Set category" className="p-0.5 rounded hover:bg-[var(--surface-secondary)]">
                                                  <IconPencil className="w-3 h-3 text-[var(--text-muted)]" />
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-0.5 group">
                                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${DOCUMENT_CATEGORY_COLOURS[att.category ?? 'other']}`}>
                                                  <IconSparkles className="w-2.5 h-2.5" />
                                                  {DOCUMENT_CATEGORY_LABELS[att.category ?? 'other']}
                                                </span>
                                                <button type="button" onClick={e => { e.stopPropagation(); setEditingAttachmentCategoryId(att.id) }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--surface-secondary)] transition-opacity" title="Edit category">
                                                  <IconPencil className="w-3 h-3 text-[var(--text-muted)]" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); handleDownloadAttachment(att) }}
                                        className="p-1.5 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-muted)] shrink-0"
                                        title="Download"
                                      >
                                        <IconDownload className="w-3.5 h-3.5" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* My timesheet (hidden when in team mode) */}
      {viewMode === 'my' && (<>

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-[var(--surface)] rounded-lg border border-[var(--border)] px-4 py-3 mb-4">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-1.5 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)] font-bold"
        >
          ←
        </button>
        <div className="text-center">
          <p className="font-semibold text-[var(--text-primary)] text-sm">{formatWeekRange(weekStart, weekEnd)}</p>
          {weekOffset === 0 && <p className="text-xs text-blue-600">Current week</p>}
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-blue-600 underline"
            >
              Go to current week
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="p-1.5 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)] font-bold"
        >
          →
        </button>
      </div>

      {/* Rejection comment */}
      {weekStatus === 'rejected' && reviewerComment && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">Timesheet rejected</p>
          <p className="text-sm text-red-700 mt-1">{reviewerComment}</p>
        </div>
      )}

      {/* Success */}
      {submitSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
          <IconCheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">{submitSuccess}</p>
            <p className="text-xs text-green-700 mt-0.5">Your supervisor has been notified.</p>
          </div>
          <button type="button" onClick={() => setSubmitSuccess(null)} className="p-0.5 rounded hover:bg-green-100 text-green-700 shrink-0">
            <IconXMark className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error */}
      {saveError && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">{saveError}</p>
        </div>
      )}

      {/* Leave vs timesheet mismatch */}
      {(() => {
        const activeMismatches = days
          .map((d, i) => ({ d, ds: dateArr[i] ? formatDateISO(dateArr[i]) : '' }))
          .filter(({ d, ds }) => ds && leaveByDate[ds] && d.primary_status !== '' && d.primary_status !== 'leave' && d.primary_status !== 'public_holiday' && !d.is_public_holiday)
        // Denied/cancelled/returned leave on a submitted/approved timesheet where the day is still 'leave'
        const inactiveMismatches = (weekStatus === 'submitted' || weekStatus === 'approved')
          ? days
              .map((d, i) => ({ d, ds: dateArr[i] ? formatDateISO(dateArr[i]) : '' }))
              .filter(({ d, ds }) => ds && inactiveLeaveByDate[ds] && d.primary_status === 'leave')
          : []
        const total = activeMismatches.length + inactiveMismatches.length
        if (total === 0) return null
        return (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800">
              Leave vs timesheet mismatch on {total} day{total > 1 ? 's' : ''}
            </p>
            {activeMismatches.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                You have approved leave on {activeMismatches.map(({ ds }) => new Date(ds + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })).join(', ')} but the day{activeMismatches.length > 1 ? 's are' : ' is'} not marked as leave. Your supervisor has been notified. Update the day{activeMismatches.length > 1 ? 's' : ''} to "leave" if you took leave, or leave as-is if you actually worked.
              </p>
            )}
            {inactiveMismatches.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                The leave request for {inactiveMismatches.map(({ ds }) => new Date(ds + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })).join(', ')} has been denied, cancelled, or returned but the day{inactiveMismatches.length > 1 ? 's are' : ' is'} still marked as leave. Please review and update.
              </p>
            )}
          </div>
        )
      })()}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Day grid: mobile = stack, desktop = 7 columns */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-4">
            {days.map((day, idx) => {
              const date = dateArr[idx]
              const locked = day.is_locked || isLocked
              const isWeekend = idx >= 5
              const dateStr = formatDateISO(date)
              const approvedLeave = leaveByDate[dateStr]
              const resolution = resolveLeaveStateForDate(dateStr, activeLeaveByDate, inactiveLeaveByDate, blockingConflictDates, pendingOverlapDates)
              const leaveMismatch = (
                // Active approved request but day not marked as leave (ignore if it's a public holiday)
                (!!approvedLeave && day.primary_status !== '' && day.primary_status !== 'leave' && !day.is_public_holiday) ||
                // Denied/cancelled/returned leave on a locked (submitted/approved) timesheet while day is still 'leave'
                (!!resolution.inactiveRequest && day.primary_status === 'leave' && (weekStatus === 'submitted' || weekStatus === 'approved'))
              )

              return (
                <div
                  key={weekStartStr + idx}
                  className={`bg-[var(--surface)] rounded-lg border p-3 ${
                    isWeekend ? 'border-[var(--border)] bg-[var(--surface-secondary)]' : 'border-[var(--border)]'
                  } ${leaveMismatch ? 'border-amber-300 ring-1 ring-amber-200' : ''} ${locked && !day.is_public_holiday ? 'opacity-75' : ''}`}
                >
                  {/* Day heading */}
                  <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {formatDayHeading(date, idx)}
                  </p>

                  {/* Public holiday badge */}
                  {day.is_public_holiday && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 mb-2">
                      {day.holiday_name || 'Public Holiday'}
                    </span>
                  )}

                  {/* Leave request status badge — approved (green), pending (amber), denied (red), cancelled/returned (grey/amber) */}
                  {resolution.badge && !day.is_public_holiday && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mb-2 ${
                      resolution.badge.colour === 'green' ? 'bg-green-50 text-green-700 border border-green-200' :
                      resolution.badge.colour === 'red'   ? 'bg-red-50 text-red-700 border border-red-200' :
                      resolution.badge.colour === 'grey'  ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {resolution.badge.text}
                    </span>
                  )}
                  {/* Mismatch: active approved request but day not marked as leave */}
                  {!!approvedLeave && day.primary_status !== '' && day.primary_status !== 'leave' && !day.is_public_holiday && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200 mb-2">
                      ⚠ Mismatch: approved {leaveTypeName(approvedLeave.leave_type)} leave
                    </span>
                  )}
                  {/* Mismatch: denied/cancelled/returned leave on a locked timesheet while day is still leave */}
                  {resolution.inactiveRequest && day.primary_status === 'leave' && (weekStatus === 'submitted' || weekStatus === 'approved') && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200 mb-2">
                      ⚠ Leave {resolution.inactiveRequest.status} — review required
                    </span>
                  )}

                  {/* Primary status — hidden on weekends (nobody works; OT/Standby/LOL/LOI still available below).
                      Public holidays lock just the status. */}
                  {!isWeekend && (
                  <select
                    value={day.primary_status}
                    disabled={locked || day.is_public_holiday}
                    onChange={e => {
                      const newStatus = e.target.value as DayStatus | ''
                      const a = getAllowedFlagsForStatus(newStatus)
                      handleDayChange(idx, {
                        primary_status: newStatus,
                        // Use the shared helper so onChange and loadWeek stay in sync
                        leave_type_detail: newStatus === 'leave'
                          ? leaveDetailFromRequest(activeLeaveByDate[dateStr]?.leave_type ?? '')
                          : '',
                        ...(!a.ot          && { overtime_flag: false, overtime_hours: 0, overtime_reason: '' }),
                        ...(!a.standby     && { standby_flag: false }),
                        ...(!a.underground && { underground_flag: false, underground_hours: 0 }),
                        ...(!a.lol         && { lol_flag: false, lol_province: '' }),
                        ...(!a.loi         && { loi_flag: false, loi_country: '' }),
                      })
                    }}
                    className={`w-full text-xs border border-[var(--border)] rounded px-2 py-1.5 mb-1 bg-[var(--surface)] ${
                      locked || day.is_public_holiday ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {(STATUS_OPTIONS).map(s => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  )}

                  {/* Leave type display — read-only, derived from the active leave request.
                      TODO: replace with leave_type_id FK display after migration 073. */}
                  {day.primary_status === 'leave' && !locked && (
                    resolution.activeRequest ? (
                      <div className="text-xs px-2 py-1.5 mb-1 rounded border border-[var(--border)] bg-[var(--surface-secondary)] flex items-center gap-2">
                        <span className="text-[var(--text-secondary)] truncate flex-1">
                          {resolution.leaveType}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-1">
                        <p className="text-[10px] text-amber-700 leading-tight mb-0.5">
                          Leave type not saved — create a matching leave request for this date.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate('/leave', { state: { openForm: true, startDate: dateStr, endDate: dateStr } })}
                          className="text-[10px] text-blue-600 hover:text-blue-700 underline"
                        >
                          + Create leave request
                        </button>
                      </div>
                    )
                  )}

                  {/* Inline leave-conflict warnings — soft hints; submit is the hard gate */}
                  {!locked && !isWeekend && !day.is_public_holiday && (() => {
                    // Blocking: multiple approved, OR multiple pending with no approved
                    if (resolution.blockingConflict) {
                      return (
                        <p className="text-[10px] text-red-600 mb-1 flex items-center gap-1 font-medium">
                          ⛔ Multiple leave requests conflict on this date — resolve before submitting
                        </p>
                      )
                    }
                    // Non-blocking overlap: one approved + additional pending requests
                    if (resolution.pendingOverlap) {
                      return (
                        <p className="text-[10px] text-amber-600 mb-1 flex items-center gap-1">
                          ⚠️ A pending leave request also covers this date
                        </p>
                      )
                    }
                    if ((day.primary_status === 'leave' || day.primary_status === 'sick') && !resolution.activeRequest && !resolution.inactiveRequest) {
                      return (
                        <p className="text-[10px] text-amber-600 mb-1 flex items-center gap-1">
                          ⚠️ No leave request found for this date — a formal request is required
                        </p>
                      )
                    }
                    if (day.primary_status === 'sick' && resolution.activeRequest && resolution.activeRequest.leave_type !== 'sick') {
                      return (
                        <p className="text-[10px] text-amber-600 mb-1 flex items-center gap-1">
                          ⚠️ Leave request is {resolution.activeRequest.leave_type} — not sick leave
                        </p>
                      )
                    }
                    if (
                      day.primary_status === 'leave' &&
                      day.leave_type_detail &&
                      resolution.activeRequest && resolution.activeRequest.leave_type !== day.leave_type_detail
                    ) {
                      return (
                        <p className="text-[10px] text-amber-600 mb-1 flex items-center gap-1">
                          ⚠️ Leave request is {resolution.activeRequest.leave_type} — type mismatch
                        </p>
                      )
                    }
                    return null
                  })()}

                  {/* Sick-note hint */}
                  {day.primary_status === 'sick' && !locked && (
                    hasMedicalAttachment ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full mb-2 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title="Medical note attached for this week"
                      >
                        <IconPaperclip className="w-3 h-3" />
                        Sick note attached
                      </button>
                    ) : sickNoteRequired ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full mb-2 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                        title="Attach sick note (required)"
                      >
                        <IconPaperclip className="w-3 h-3" />
                        Sick note required
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full mb-2 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                        title="Attach sick note"
                      >
                        <IconPaperclip className="w-3 h-3" />
                        Attach sick note
                      </button>
                    )
                  )}

                  {/* ── Additive flags — visibility driven by getAllowedFlagsForStatus ── */}
                  {(() => {
                    const a = getAllowedFlagsForStatus(day.primary_status)
                    return (
                      <>
                        {/* OT */}
                        {a.ot && (
                          <>
                            <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                              <input type="checkbox" checked={day.overtime_flag} disabled={locked}
                                onChange={e => handleDayChange(idx, { overtime_flag: e.target.checked, overtime_reason: '' })}
                                className="rounded border-[var(--border)]" />
                              <span className="text-xs text-[var(--text-secondary)]">OT</span>
                            </label>
                            {day.overtime_flag && (
                              <div className="mb-2 space-y-1">
                                <input type="text" inputMode="decimal"
                                  value={otHourDrafts[idx] ?? (day.overtime_hours > 0 ? String(day.overtime_hours) : '')}
                                  disabled={locked}
                                  onChange={e => {
                                    const raw = e.target.value
                                    setOtHourDrafts(prev => ({ ...prev, [idx]: raw }))
                                    if (raw.includes(',')) { setOtHourErrors(prev => ({ ...prev, [idx]: 'Use a point (.) for decimals — e.g. 5.5' })); return }
                                    if (raw === '' || raw === '.') { setOtHourErrors(prev => ({ ...prev, [idx]: '' })); return }
                                    if (!/^\d+(\.\d+)?$/.test(raw)) { setOtHourErrors(prev => ({ ...prev, [idx]: 'Enter a valid number (e.g. 5 or 5.5)' })); return }
                                    setOtHourErrors(prev => ({ ...prev, [idx]: '' }))
                                    handleDayChange(idx, { overtime_hours: parseFloat(raw) })
                                  }}
                                  onBlur={() => setOtHourDrafts(prev => { const n = { ...prev }; delete n[idx]; return n })}
                                  className="w-full text-xs border border-[var(--border)] rounded px-2 py-1"
                                  placeholder="Hours (e.g. 5 or 5.5)" />
                                {otHourErrors[idx] && <p className="text-xs text-red-500">{otHourErrors[idx]}</p>}
                                {!otHourErrors[idx] && day.overtime_flag && (day.overtime_hours ?? 0) <= 0 && (
                                  <p className="text-xs text-red-500">Must be &gt; 0</p>
                                )}
                                <textarea value={day.overtime_reason} disabled={locked} rows={2}
                                  onChange={e => handleDayChange(idx, { overtime_reason: e.target.value })}
                                  placeholder="OT reason (required)…"
                                  className={`w-full text-xs border rounded px-2 py-1 resize-none placeholder:text-gray-300 ${
                                    !day.overtime_reason.trim() && !locked ? 'border-red-300 bg-red-50' : 'border-[var(--border)]'
                                  }`} />
                                {!day.overtime_reason.trim() && !locked && <p className="text-xs text-red-500">Reason required</p>}
                              </div>
                            )}
                          </>
                        )}

                        {/* Standby */}
                        {a.standby && (
                          <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                            <input type="checkbox" checked={day.standby_flag} disabled={locked}
                              onChange={e => handleDayChange(idx, { standby_flag: e.target.checked })}
                              className="rounded border-[var(--border)]" />
                            <span className="text-xs text-[var(--text-secondary)]">Standby</span>
                          </label>
                        )}

                        {/* Underground */}
                        {a.underground && (
                          <>
                            <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                              <input type="checkbox" checked={day.underground_flag} disabled={locked}
                                onChange={e => handleDayChange(idx, { underground_flag: e.target.checked, underground_hours: 0 })}
                                className="rounded border-[var(--border)]" />
                              <span className="text-xs text-[var(--text-secondary)]">Underground</span>
                            </label>
                            {day.underground_flag && (
                              <div className="mb-1 pl-5">
                                <input type="number" min="0.5" max="24" step="0.5"
                                  value={day.underground_hours || ''} disabled={locked}
                                  onChange={e => handleDayChange(idx, { underground_hours: parseFloat(e.target.value) || 0 })}
                                  placeholder="Hours"
                                  className={`w-full text-xs border rounded px-2 py-1 ${
                                    (day.underground_hours ?? 0) <= 0 && !locked ? 'border-red-300 bg-red-50' : 'border-[var(--border)]'
                                  }`} />
                                {(day.underground_hours ?? 0) <= 0 && !locked && <p className="text-xs text-red-500">Hours required</p>}
                              </div>
                            )}
                          </>
                        )}

                        {/* LOL — mutually exclusive with LOI */}
                        {a.lol && (
                          <>
                            <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                              <input type="checkbox" checked={day.lol_flag} disabled={locked}
                                onChange={e => handleDayChange(idx, { lol_flag: e.target.checked, lol_province: '', ...(e.target.checked && { loi_flag: false, loi_country: '' }) })}
                                className="rounded border-[var(--border)]" />
                              <span className="text-xs text-[var(--text-secondary)]">LOL</span>
                            </label>
                            {day.lol_flag && (
                              <div className="mb-1 pl-5">
                                <select value={day.lol_province} disabled={locked}
                                  onChange={e => handleDayChange(idx, { lol_province: e.target.value })}
                                  className={`w-full text-xs border rounded px-2 py-1 ${
                                    !day.lol_province && !locked ? 'border-red-300 bg-red-50' : 'border-[var(--border)]'
                                  }`}>
                                  <option value="">— Province —</option>
                                  {SA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                {!day.lol_province && !locked && <p className="text-xs text-red-500">Province required</p>}
                              </div>
                            )}
                          </>
                        )}

                        {/* LOI — mutually exclusive with LOL */}
                        {a.loi && (
                          <>
                            <label className="flex items-center gap-1.5 mb-2 cursor-pointer">
                              <input type="checkbox" checked={day.loi_flag} disabled={locked}
                                onChange={e => handleDayChange(idx, { loi_flag: e.target.checked, loi_country: '', ...(e.target.checked && { lol_flag: false, lol_province: '' }) })}
                                className="rounded border-[var(--border)]" />
                              <span className="text-xs text-[var(--text-secondary)]">LOI</span>
                            </label>
                            {day.loi_flag && (
                              <div className="mb-2 pl-5">
                                <input type="text" list={`loi-countries-${idx}`}
                                  value={day.loi_country} disabled={locked} autoComplete="off"
                                  onChange={e => handleDayChange(idx, { loi_country: e.target.value })}
                                  placeholder="Search country…"
                                  className={`w-full text-xs border rounded px-2 py-1 ${
                                    !day.loi_country && !locked ? 'border-red-300 bg-red-50' : 'border-[var(--border)]'
                                  }`} />
                                <datalist id={`loi-countries-${idx}`}>
                                  {LOI_COUNTRIES.map(c => <option key={c} value={c} />)}
                                </datalist>
                                {!day.loi_country && !locked && <p className="text-xs text-red-500">Country required</p>}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )
                  })()}

                  {/* Notes */}
                  <textarea
                    value={day.notes}
                    disabled={locked}
                    onChange={e => handleDayChange(idx, { notes: e.target.value })}
                    rows={2}
                    placeholder="Notes…"
                    className="w-full text-xs border border-[var(--border)] rounded px-2 py-1 resize-none placeholder:text-gray-300"
                  />
                </div>
              )
            })}
          </div>

          {/* Attachments */}
          <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <IconPaperclip className="w-4 h-4 text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Attachments</h3>
                {attachments.length > 0 && (
                  <span className="text-xs text-[var(--text-muted)]">({attachments.length})</span>
                )}
              </div>
              {!isLocked && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B5EA6] border border-[#1B5EA6] rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <IconPaperclip className="w-3.5 h-3.5" />
                    {uploadingFile ? 'Uploading…' : 'Add file'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                      e.target.value = ''
                    }}
                  />
                </>
              )}
            </div>

            {attachments.length === 0 && weekId && (
              <p className="text-xs text-[var(--text-muted)] italic">No attachments yet. Upload sick notes, OT approval emails, or any supporting documents.</p>
            )}
            {attachments.length === 0 && !weekId && !isLocked && (
              <p className="text-xs text-[var(--text-muted)] italic">No attachments yet. Click "Add file" to upload a sick note, OT approval email, or any supporting document.</p>
            )}

            {uploadError && (
              <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-200 rounded px-3 py-2">
                <p className="text-xs text-red-700">{uploadError}</p>
                <button onClick={() => setUploadError(null)}><IconXMark className="w-3.5 h-3.5 text-red-500" /></button>
              </div>
            )}

            {attachments.length > 0 && (
              <ul className="space-y-2">
                {attachments.map(att => (
                  <li key={att.id} className="flex items-center justify-between gap-2 bg-[var(--surface-secondary)] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconDocument className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text-secondary)] truncate">
                          {att.ai_display_name ?? att.display_name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {editingAttachmentCategoryId === att.id ? (
                            <select
                              defaultValue={att.category ?? 'other'}
                              onChange={e => handleUpdateAttachmentCategory(att.id, e.target.value as DocumentCategory)}
                              onBlur={() => setEditingAttachmentCategoryId(null)}
                              autoFocus
                              className="border border-[var(--border)] rounded px-1 py-0.5 text-[10px] bg-[var(--surface)]"
                            >
                              {(Object.entries(DOCUMENT_CATEGORY_LABELS) as [DocumentCategory, string][]).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                          ) : att.ai_classified_at === null ? (
                            <div className="flex items-center gap-0.5">
                              <span className="text-[10px] text-[var(--text-muted)] italic">Classifying…</span>
                              <button type="button" onClick={() => setEditingAttachmentCategoryId(att.id)} title="Set category" className="p-0.5 rounded hover:bg-[var(--surface-secondary)]">
                                <IconPencil className="w-3 h-3 text-[var(--text-muted)]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 group">
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${DOCUMENT_CATEGORY_COLOURS[att.category ?? 'other']}`}>
                                <IconSparkles className="w-2.5 h-2.5" />
                                {DOCUMENT_CATEGORY_LABELS[att.category ?? 'other']}
                              </span>
                              <button type="button" onClick={() => setEditingAttachmentCategoryId(att.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--surface-secondary)] transition-opacity" title="Edit category">
                                <IconPencil className="w-3 h-3 text-[var(--text-muted)]" />
                              </button>
                            </div>
                          )}
                          {att.file_size_bytes && (
                            <span className="text-[10px] text-[var(--text-muted)]">{formatBytes(att.file_size_bytes)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-muted)]"
                        title="Download"
                      >
                        <IconDownload className="w-3.5 h-3.5" />
                      </button>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att)}
                          className="p-1 rounded hover:bg-red-100 text-[var(--text-muted)] hover:text-red-500"
                          title="Remove"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            {weekStatus === 'draft' && hasOtWithoutReason && (
              <p className="text-xs text-red-600">Please add a reason for all overtime days before submitting.</p>
            )}
            {weekStatus === 'draft' && hasOtHourError && (
              <p className="text-xs text-red-600">Please fix the overtime hours errors before submitting.</p>
            )}
            {weekStatus === 'draft' && !hasOtHourError && hasOtZeroHours && (
              <p className="text-xs text-red-600">Please enter overtime hours for all OT days before submitting.</p>
            )}
            {weekStatus === 'draft' && sickNoteMissingBlocking && (
              <p className="text-xs text-amber-600">
                {hasConsecutiveSick
                  ? 'Sick note required (consecutive sick days) — submitting without one will flag this week for your supervisor.'
                  : 'Sick note required (repeated Mon/Fri sick days this month) — submitting without one will flag this week for your supervisor.'}
              </p>
            )}
            {weekStatus === 'draft' && sickNoteMissingFlag && (
              <p className="text-xs text-amber-600">No sick note attached — your supervisor will be notified. You can still submit.</p>
            )}
            {weekStatus === 'draft' && (
              <button
                onClick={() => {
                  const conflicts = validateLeaveConflicts(days)
                  if (conflicts.missingRequests.length > 0) {
                    setLeaveConflicts(conflicts)
                  } else {
                    setShowConfirm(true)
                  }
                }}
                disabled={saving || hasOtWithoutReason || hasOtHourError || hasOtZeroHours || hasUndergroundZeroHours || hasLolWithoutProvince || hasLoiWithoutCountry}
                className="px-5 py-2 bg-[#1B5EA6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Submit timesheet
              </button>
            )}
            {weekStatus === 'approved' && (
              <p className="text-sm text-[var(--text-muted)] italic">
                Timesheet is <strong>approved</strong> and locked.
              </p>
            )}
            {weekStatus === 'submitted' && (
              <p className="text-xs text-amber-600 italic">
                {resubmissionCount > 0
                  ? `Resubmitted (${resubmissionCount}× re-sent) — any further edits will revert this to draft again.`
                  : 'Submitted — any edits will revert this to draft for resubmission.'}
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Leave conflict modal ──────────────────────────────────────────────────
         Shown when user tries to submit with leave/sick days that have no
         matching pending or approved leave request.                             */}
      {leaveConflicts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Leave request required</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              The following days are marked as leave or sick but have no matching
              pending or approved leave request. A timesheet cannot be submitted with unmatched leave/sick days.
            </p>
            {leaveConflicts.missingRequests.length > 0 && (
              <ul className="space-y-2 mb-4">
                {leaveConflicts.missingRequests.map(c => (
                  <li key={c.dateISO} className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="text-amber-500 mt-0.5">⚠️</span>
                    <div>
                      <p className="text-sm font-medium text-amber-900">{c.dayLabel}</p>
                      <p className="text-xs text-amber-700">
                        {c.conflictType === 'missing_request'
                          ? `Marked as ${c.timesheetStatus} — no pending or approved ${c.timesheetStatus} leave request found.`
                          : `Marked as sick — the leave request on this day is not a sick leave type.`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {leaveConflicts.presentWithLeave.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-blue-700 mb-1.5">Also noted:</p>
                <ul className="space-y-1.5">
                  {leaveConflicts.presentWithLeave.map(c => (
                    <li key={c.dateISO} className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <span>ℹ️</span>
                      <span><strong>{c.dayLabel}</strong> is marked <em>present</em> but you have an approved {c.leaveType} leave request for this day. Consider changing it to "leave".</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-[var(--border)]">
              <button onClick={() => setLeaveConflicts(null)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">
                Cancel
              </button>
              <button
                onClick={() => {
                  setDays(prev => {
                    const updated = [...prev]
                    for (const c of leaveConflicts.missingRequests) {
                      updated[c.dayIndex] = { ...updated[c.dayIndex], primary_status: 'present' }
                    }
                    return updated
                  })
                  setLeaveConflicts(null)
                  setShowConfirm(true)
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">
                Remove leave status &amp; submit
              </button>
              <button
                onClick={() => {
                  setLeaveConflicts(null)
                  const sorted = [...leaveConflicts.missingRequests].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
                  navigate('/leave', {
                    state: {
                      openForm:  true,
                      startDate: sorted[0]?.dateISO,
                      endDate:   sorted[sorted.length - 1]?.dateISO,
                      leaveType: sorted.every(c => c.timesheetStatus === 'sick') ? 'sick' : 'annual',
                    },
                  })
                }}
                className="px-4 py-2 rounded-lg bg-[#1B5EA6] text-white text-sm font-medium hover:bg-[#154d8a]">
                Go to Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Submit timesheet?</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              You can still edit this timesheet until your supervisor approves it. Once approved, no further changes can be made. Submit now?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 rounded-lg bg-[#1B5EA6] text-white text-sm font-medium hover:bg-blue-700"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}
