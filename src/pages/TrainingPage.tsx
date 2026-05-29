import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  IconAcademicCap, IconCalendar, IconMapPin,
  IconPlus, IconUsers, IconXMark, IconBadgeCheck,
  IconExclamationTriangle, IconChevronDown, IconChevronLeft, IconChevronRight,
} from '../components/Icons'

// ── Types ──────────────────────────────────────────────────────────────────────

type SessionStatus = 'scheduled' | 'completed' | 'cancelled'
type EnrolStatus   = 'enrolled' | 'completed' | 'cancelled' | 'no_show'
type MatrixStatus  = 'planned' | 'scheduled' | 'completed' | 'not_applicable'

type Course = {
  id: string
  name: string
  technology: string | null
  provider: string | null
  duration_days: number
  certification_type_id: string | null
}

type Session = {
  id: string
  course_id: string
  scheduled_date: string
  end_date: string | null
  location: string | null
  trainer_name: string | null
  max_participants: number | null
  notes: string | null
  status: SessionStatus
  training_courses: { name: string; technology: string | null; provider: string | null } | null
  training_enrollments: { id: string; status: EnrolStatus; profiles: { first_name: string; surname: string; employee_code: string | null } | null }[]
}

type Employee = {
  id: string
  first_name: string
  surname: string
  employee_code: string | null
  role: string | null
  department_id: string | null
}

type MatrixEntry = {
  id: string
  employee_id: string
  course_id: string
  financial_year: number
  quarter: 1 | 2 | 3 | 4
  status: MatrixStatus
  completed_date: string | null
}

// ── Fiscal year helpers ────────────────────────────────────────────────────────
// FY starts 1 Jul. FY2026 = Jul 2025 – Jun 2026.
// Q1 = Jul–Sep, Q2 = Oct–Dec, Q3 = Jan–Mar, Q4 = Apr–Jun

function getFY(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear()
}

function getFYQ(date: Date): 1 | 2 | 3 | 4 {
  const m = date.getMonth() + 1
  if (m >= 7 && m <= 9) return 1
  if (m >= 10) return 2
  if (m <= 3) return 3
  return 4
}

const QUARTER_MONTHS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Jul – Sep',
  2: 'Oct – Dec',
  3: 'Jan – Mar',
  4: 'Apr – Jun',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_COLOUR: Record<SessionStatus, string> = {
  scheduled:  'bg-blue-50 text-blue-700 border-blue-200',
  completed:  'bg-green-50 text-green-700 border-green-200',
  cancelled:  'bg-gray-100 text-gray-500 border-gray-200',
}

const ENROL_COLOUR: Record<EnrolStatus, string> = {
  enrolled:   'bg-blue-50 text-blue-700',
  completed:  'bg-green-50 text-green-700',
  cancelled:  'bg-gray-100 text-gray-500',
  no_show:    'bg-red-50 text-red-600',
}

// Matrix status cycle: empty → planned → scheduled → completed → not_applicable → empty
const MATRIX_CYCLE: (MatrixStatus | null)[] = [null, 'planned', 'scheduled', 'completed', 'not_applicable']

const MATRIX_CELL: Record<MatrixStatus, { bg: string; text: string; label: string; symbol: string }> = {
  planned:        { bg: 'bg-amber-50  border-amber-200',  text: 'text-amber-700',  label: 'Planned',       symbol: '▪' },
  scheduled:      { bg: 'bg-blue-50   border-blue-200',   text: 'text-blue-700',   label: 'Scheduled',     symbol: '−' },
  completed:      { bg: 'bg-green-50  border-green-200',  text: 'text-green-700',  label: 'Completed',     symbol: '✓' },
  not_applicable: { bg: 'bg-gray-100  border-gray-200',   text: 'text-gray-400',   label: 'N/A',           symbol: '/' },
}

function fmt(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Schedule Form ──────────────────────────────────────────────────────────────

interface ScheduleFormProps {
  courses: Course[]
  employees: Employee[]
  prefillCourseId?: string
  prefillEmployeeIds?: string[]
  onClose: () => void
  onSaved: () => void
}

function ScheduleForm({ courses, employees, prefillCourseId, prefillEmployeeIds, onClose, onSaved }: ScheduleFormProps) {
  const { profile } = useAuth()
  const [courseId, setCourseId]         = useState(prefillCourseId ?? courses[0]?.id ?? '')
  const [date, setDate]                 = useState('')
  const [endDate, setEndDate]           = useState('')
  const [location, setLocation]         = useState('')
  const [trainer, setTrainer]           = useState('')
  const [maxPax, setMaxPax]             = useState('')
  const [notes, setNotes]               = useState('')
  const [selected, setSelected]         = useState<Set<string>>(new Set(prefillEmployeeIds ?? []))
  const [empSearch, setEmpSearch]       = useState('')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const filteredEmps = useMemo(() => {
    const q = empSearch.toLowerCase()
    return employees.filter(e =>
      `${e.first_name} ${e.surname}`.toLowerCase().includes(q) ||
      (e.employee_code ?? '').toLowerCase().includes(q)
    )
  }, [employees, empSearch])

  function toggleEmp(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!courseId || !date) { setError('Course and date are required.'); return }
    setSaving(true); setError(null)
    const { data: sess, error: sessErr } = await supabase
      .from('training_sessions')
      .insert({
        course_id:        courseId,
        scheduled_date:   date,
        end_date:         endDate || null,
        location:         location || null,
        trainer_name:     trainer || null,
        max_participants: maxPax ? parseInt(maxPax) : null,
        notes:            notes || null,
        status:           'scheduled',
        created_by:       profile?.id ?? null,
      })
      .select('id')
      .single()
    if (sessErr || !sess) { setError(sessErr?.message ?? 'Failed to save session'); setSaving(false); return }

    if (selected.size > 0) {
      const enrollRows = Array.from(selected).map(emp_id => ({ session_id: sess.id, employee_id: emp_id, status: 'enrolled' }))
      const { error: enrollErr } = await supabase.from('training_enrollments').insert(enrollRows)
      if (enrollErr) { setError(enrollErr.message); setSaving(false); return }
    }
    setSaving(false)
    onSaved()
  }

  const course = courses.find(c => c.id === courseId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[92dvh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <IconAcademicCap className="w-5 h-5 text-[#1B5EA6]" />
            <span className="font-semibold text-gray-900">Schedule Training Session</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <IconXMark className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden flex-1">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <IconExclamationTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Course */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Course <span className="text-red-500">*</span></label>
              <select
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {course && (
                <p className="text-xs text-gray-400 mt-1">
                  {[course.technology, course.provider, course.duration_days ? `${course.duration_days}d` : null].filter(Boolean).join(' \u00b7 ')}
                </p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={date}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                />
              </div>
            </div>

            {/* Location + Trainer */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Training Room A"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Trainer</label>
                <input
                  type="text"
                  value={trainer}
                  onChange={e => setTrainer(e.target.value)}
                  placeholder="Trainer name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                />
              </div>
            </div>

            {/* Max participants + Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Max Participants</label>
                <input
                  type="number"
                  min="1"
                  value={maxPax}
                  onChange={e => setMaxPax(e.target.value)}
                  placeholder="No limit"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                />
              </div>
            </div>

            {/* Employee enrolment */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Enrol Employees
                {selected.size > 0 && <span className="ml-1.5 text-[#1B5EA6]">({selected.size} selected)</span>}
              </label>
              <input
                type="text"
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
              />
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {filteredEmps.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-3 text-center">No employees found</p>
                )}
                {filteredEmps.map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(emp.id)}
                      onChange={() => toggleEmp(emp.id)}
                      className="rounded border-gray-300 text-[#1B5EA6] focus:ring-[#1B5EA6]"
                    />
                    <span className="text-sm text-gray-800">{emp.first_name} {emp.surname}</span>
                    {emp.employee_code && <span className="text-xs text-gray-400 ml-auto">{emp.employee_code}</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1B5EA6] hover:bg-[#154d8a] rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Schedule Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Session Card ───────────────────────────────────────────────────────────────

function SessionCard({ session, onStatusChange }: { session: Session; onStatusChange: (id: string, s: SessionStatus) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3.5 flex items-start gap-3">
        {/* Date block */}
        <div className="flex-shrink-0 w-12 text-center bg-gray-50 rounded-lg py-1.5 border border-gray-100">
          <p className="text-[10px] font-semibold uppercase text-gray-400 leading-none">
            {new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'short' })}
          </p>
          <p className="text-xl font-bold text-gray-900 leading-tight">
            {new Date(session.scheduled_date + 'T00:00:00').getDate()}
          </p>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {session.training_courses?.name ?? 'Unknown Course'}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLOUR[session.status]}`}>
              {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </span>
          </div>
          {session.training_courses?.technology && (
            <p className="text-xs text-gray-400 mt-0.5">{session.training_courses.technology}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-500">
            {session.location && (
              <span className="flex items-center gap-1">
                <IconMapPin className="w-3.5 h-3.5" /> {session.location}
              </span>
            )}
            {session.trainer_name && (
              <span className="flex items-center gap-1">
                <IconAcademicCap className="w-3.5 h-3.5" /> {session.trainer_name}
              </span>
            )}
            {session.end_date && session.end_date !== session.scheduled_date && (
              <span className="flex items-center gap-1">
                <IconCalendar className="w-3.5 h-3.5" /> Until {fmt(session.end_date)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <IconUsers className="w-3.5 h-3.5" />
              {session.training_enrollments.length}
              {session.max_participants ? `/${session.max_participants}` : ''} enrolled
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {session.status === 'scheduled' && (
            <button
              onClick={() => onStatusChange(session.id, 'completed')}
              className="text-xs px-2 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 font-medium"
            >
              Mark Complete
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <IconChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Enrollments expansion */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          {session.training_enrollments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-1">No employees enrolled</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {session.training_enrollments.map(e => (
                <span
                  key={e.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${ENROL_COLOUR[e.status]}`}
                >
                  {e.profiles?.first_name} {e.profiles?.surname}
                  {e.profiles?.employee_code && <span className="opacity-60">{e.profiles.employee_code}</span>}
                </span>
              ))}
            </div>
          )}
          {session.notes && (
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 italic">{session.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'sessions' | 'matrix'

const SUPERVISOR_ROLES = ['supervisor', 'manager', 'admin_manager', 'system_admin']
const MANAGER_ROLES    = ['manager', 'admin_manager', 'system_admin']

// ── CAT level helpers ─────────────────────────────────────────────────────────

// Extract Roman numeral level from a course name (I=1, II=2, III=3, IV=4)
// Works for "CAT II", "CAT III", "Infrared I", etc.
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 }
function getCourseLevel(name: string): number | null {
  const m = name.match(/\bCAT\s+(I{1,3}V?|IV)\b/i) || name.match(/\b(I{1,3}V?|IV)\s*(?:—|$)/i)
  if (!m) return null
  const r = m[1].toUpperCase()
  return ROMAN[r] ?? null
}

// Returns true if a group of courses has detectable Roman numeral levels
function isLevelledGroup(groupCourses: Course[]): boolean {
  return groupCourses.some(c => getCourseLevel(c.name) !== null)
}

// ── Training Matrix Component ──────────────────────────────────────────────────

interface TrainingMatrixProps {
  courses: Course[]
  employees: Employee[]
  isManager: boolean
}

function TrainingMatrix({ courses, employees, isManager }: TrainingMatrixProps) {
  const today = new Date()
  const [fy, setFY]           = useState(getFY(today))
  const [quarter, setQ]       = useState<1 | 2 | 3 | 4>(getFYQ(today))
  const [entries, setEntries] = useState<MatrixEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<'all' | 'highest'>('all')
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedEmps, setSelectedEmps] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<MatrixStatus | 'clear'>('completed')
  const [bulkCourseId, setBulkCourseId] = useState<string>('all')
  const [bulkSaving, setBulkSaving] = useState(false)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('training_matrix_entries')
      .select('id, employee_id, course_id, financial_year, quarter, status, completed_date')
      .eq('financial_year', fy)
      .eq('quarter', quarter)
    setEntries((data as MatrixEntry[]) ?? [])
    setLoading(false)
  }, [fy, quarter])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Build lookup: `${employee_id}:${course_id}` → entry
  const entryMap = useMemo(() => {
    const m = new Map<string, MatrixEntry>()
    for (const e of entries) m.set(`${e.employee_id}:${e.course_id}`, e)
    return m
  }, [entries])

  async function cycleStatus(emp: Employee, course: Course) {
    if (!isManager) return
    const key = `${emp.id}:${course.id}`
    const existing = entryMap.get(key)
    const currentIdx = existing ? MATRIX_CYCLE.indexOf(existing.status) : 0
    const nextStatus = MATRIX_CYCLE[(currentIdx + 1) % MATRIX_CYCLE.length]
    setSaving(key)

    if (nextStatus === null) {
      // Delete the entry
      if (existing) {
        await supabase.from('training_matrix_entries').delete().eq('id', existing.id)
      }
    } else {
      if (existing) {
        await supabase.from('training_matrix_entries')
          .update({ status: nextStatus, completed_date: nextStatus === 'completed' ? new Date().toISOString().slice(0, 10) : null })
          .eq('id', existing.id)
      } else {
        await supabase.from('training_matrix_entries').insert({
          employee_id: emp.id,
          course_id: course.id,
          financial_year: fy,
          quarter,
          status: nextStatus,
        })
      }
    }
    setSaving(null)
    loadEntries()
  }

  async function applyBulk() {
    if (!bulkStatus || selectedEmps.size === 0) return
    setBulkSaving(true)
    const targetCourses = bulkCourseId === 'all' ? courses : courses.filter(c => c.id === bulkCourseId)
    const ops: Promise<unknown>[] = []
    for (const empId of selectedEmps) {
      for (const course of targetCourses) {
        const key = `${empId}:${course.id}`
        const existing = entryMap.get(key)
        if (bulkStatus === 'clear') {
          if (existing) ops.push(supabase.from('training_matrix_entries').delete().eq('id', existing.id))
        } else {
          const completedDate = bulkStatus === 'completed' ? new Date().toISOString().slice(0, 10) : null
          if (existing) {
            ops.push(supabase.from('training_matrix_entries').update({ status: bulkStatus, completed_date: completedDate }).eq('id', existing.id))
          } else {
            ops.push(supabase.from('training_matrix_entries').insert({ employee_id: empId, course_id: course.id, financial_year: fy, quarter, status: bulkStatus, completed_date: completedDate }))
          }
        }
      }
    }
    await Promise.all(ops)
    setBulkSaving(false)
    setSelectedEmps(new Set())
    loadEntries()
  }

  // Completion stats per course for this quarter
  const courseStats = useMemo(() => {
    const stats: Record<string, { completed: number; total: number }> = {}
    for (const c of courses) {
      const completed = entries.filter(e => e.course_id === c.id && e.status === 'completed').length
      const nonNA     = entries.filter(e => e.course_id === c.id && e.status !== 'not_applicable').length
      stats[c.id] = { completed, total: nonNA }
    }
    return stats
  }, [courses, entries])

  // Group courses by technology
  const courseGroups = useMemo(() => {
    const groups = new Map<string, Course[]>()
    for (const c of courses) {
      const key = c.technology ?? 'Other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }
    return groups
  }, [courses])

  // For "highest only" mode: per (employee, technology), the highest level
  // course they have any non-null entry for. Key = `${empId}:${tech}`
  const highestLevelMap = useMemo(() => {
    const m = new Map<string, number>()
    if (catFilter !== 'highest') return m
    for (const [tech, techCourses] of courseGroups.entries()) {
      if (!isLevelledGroup(techCourses)) continue
      for (const emp of employees) {
        let maxLevel = 0
        for (const c of techCourses) {
          const lvl = getCourseLevel(c.name)
          if (lvl === null) continue
          const entry = entryMap.get(`${emp.id}:${c.id}`)
          if (entry && entry.status !== 'not_applicable' && lvl > maxLevel) {
            maxLevel = lvl
          }
        }
        if (maxLevel > 0) m.set(`${emp.id}:${tech}`, maxLevel)
      }
    }
    return m
  }, [catFilter, courseGroups, employees, entryMap])

  const fyLabel = `FY${fy} (Jul ${fy - 1} – Jun ${fy})`

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* FY selector */}
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
          <button onClick={() => setFY(y => y - 1)} className="p-0.5 hover:bg-gray-100 rounded text-gray-500">
            <IconChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">{fyLabel}</span>
          <button onClick={() => setFY(y => y + 1)} className="p-0.5 hover:bg-gray-100 rounded text-gray-500">
            <IconChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quarter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([1, 2, 3, 4] as const).map(q => (
            <button
              key={q}
              onClick={() => setQ(q)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                quarter === q
                  ? 'bg-white text-[#1B5EA6] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Q{q}
              <span className="ml-1 font-normal text-[10px] hidden sm:inline">{QUARTER_MONTHS[q]}</span>
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-400">{QUARTER_MONTHS[quarter]}</span>

        {/* CAT level filter */}
        <div className="ml-auto flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setCatFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${catFilter === 'all' ? 'bg-white text-[#1B5EA6] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All CAT levels
          </button>
          <button
            onClick={() => setCatFilter('highest')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${catFilter === 'highest' ? 'bg-white text-[#1B5EA6] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Highest level only
          </button>
        </div>

        {/* Bulk update toggle */}
        {isManager && (
          <button
            onClick={() => { setBulkMode(m => !m); setSelectedEmps(new Set()) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              bulkMode
                ? 'bg-[#1B5EA6] text-white border-[#1B5EA6]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {bulkMode ? 'Exit Bulk Update' : 'Bulk Update'}
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="font-medium text-gray-600">Key:</span>
        {(Object.entries(MATRIX_CELL) as [MatrixStatus, typeof MATRIX_CELL[MatrixStatus]][]).map(([, cfg]) => (
          <span key={cfg.label} className="flex items-center gap-1">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.symbol}</span>
            {cfg.label}
          </span>
        ))}
        {isManager && <span className="text-gray-400 italic">Click any cell to cycle status</span>}
      </div>

      {/* Bulk action bar */}
      {isManager && bulkMode && selectedEmps.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-semibold text-[#1B5EA6]">{selectedEmps.size} employee{selectedEmps.size !== 1 ? 's' : ''} selected</span>
          <select
            value={bulkCourseId}
            onChange={e => setBulkCourseId(e.target.value)}
            className="px-2 py-1.5 border border-blue-200 rounded-md text-sm bg-white"
          >
            <option value="all">All courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value as MatrixStatus | 'clear')}
            className="px-2 py-1.5 border border-blue-200 rounded-md text-sm bg-white"
          >
            <option value="planned">Planned</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="not_applicable">N/A</option>
            <option value="clear">Clear</option>
          </select>
          <button
            onClick={applyBulk}
            disabled={bulkSaving}
            className="px-3 py-1.5 bg-[#1B5EA6] text-white text-sm font-medium rounded-md hover:bg-[#154d8a] disabled:opacity-50"
          >
            {bulkSaving ? 'Applying…' : 'Apply to selected'}
          </button>
          <button
            onClick={() => setSelectedEmps(new Set())}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-blue-100 rounded-md"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Matrix table */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-[#1B5EA6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto rounded-xl border border-gray-200 bg-white" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          <table className="text-xs min-w-max">
            <thead>
              {/* Technology group headers */}
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 top-0 z-30 bg-white px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-52 border-r border-gray-200">
                  <div className="flex items-center gap-2">
                    {isManager && bulkMode && (
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#1B5EA6]"
                        checked={selectedEmps.size === employees.length && employees.length > 0}
                        onChange={e => setSelectedEmps(e.target.checked ? new Set(employees.map(emp => emp.id)) : new Set())}
                      />
                    )}
                    Employee
                  </div>
                </th>
                {Array.from(courseGroups.entries()).map(([tech, techCourses]) => (
                  <th
                    key={tech}
                    colSpan={techCourses.length}
                    className="sticky top-0 z-20 px-3 py-2 text-center text-xs font-semibold text-gray-700 border-l border-gray-200 bg-gray-50 uppercase tracking-wide"
                  >
                    {tech}
                  </th>
                ))}
              </tr>
              {/* Course name headers */}
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 top-9 z-30 bg-white px-4 py-2 border-r border-gray-200" />
                {courses.map(c => {
                  const stats = courseStats[c.id]
                  const pct = stats && stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null
                  return (
                    <th key={c.id} className="sticky top-9 z-20 bg-white px-2 py-2 text-center border-l border-gray-100 min-w-[72px] max-w-[96px]">
                      <div className="font-medium text-gray-700 leading-tight text-[11px] text-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 80 }}>
                        {c.name}
                      </div>
                      {pct !== null && (
                        <div className={`text-[10px] mt-1 font-semibold ${pct === 100 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {pct}%
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employees.map((emp, i) => (
                <tr key={emp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="sticky left-0 z-10 px-4 py-2 border-r border-gray-200 bg-inherit">
                    <div className="flex items-center gap-2">
                      {isManager && bulkMode && (
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#1B5EA6] flex-shrink-0"
                          checked={selectedEmps.has(emp.id)}
                          onChange={() => setSelectedEmps(prev => {
                            const next = new Set(prev)
                            next.has(emp.id) ? next.delete(emp.id) : next.add(emp.id)
                            return next
                          })}
                        />
                      )}
                      <div>
                        <Link
                          to={`/employees/${emp.id}`}
                          className="font-medium text-gray-800 hover:text-[#1B5EA6] whitespace-nowrap"
                        >
                          {emp.first_name} {emp.surname}
                        </Link>
                        {emp.employee_code && (
                          <p className="text-[10px] text-gray-400">{emp.employee_code}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  {courses.map(course => {
                    const key = `${emp.id}:${course.id}`
                    const entry = entryMap.get(key)
                    const isSaving = saving === key
                    const cfg = entry ? MATRIX_CELL[entry.status] : null

                    // In "highest only" mode, dim levels below an employee's highest
                    const courseLevel = getCourseLevel(course.name)
                    const tech = course.technology ?? 'Other'
                    const empHighest = highestLevelMap.get(`${emp.id}:${tech}`)
                    const isSuperseded = catFilter === 'highest'
                      && courseLevel !== null
                      && empHighest !== undefined
                      && courseLevel < empHighest

                    return (
                      <td key={course.id} className="px-1.5 py-1.5 text-center border-l border-gray-100">
                        {isSuperseded ? (
                          <span
                            title={`Superseded by higher CAT level`}
                            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-100 text-[10px] text-gray-300 bg-gray-50"
                          >
                            /
                          </span>
                        ) : (
                          <button
                            onClick={() => cycleStatus(emp, course)}
                            disabled={!isManager || isSaving}
                            title={cfg ? `${cfg.label}${entry?.completed_date ? ` \u00b7 ${fmt(entry.completed_date)}` : ''}` : 'Not set'}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded border text-[11px] font-bold transition-colors ${
                              cfg
                                ? `${cfg.bg} ${cfg.text}`
                                : 'border-gray-100 text-gray-300 hover:border-gray-300'
                            } ${isManager ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${isSaving ? 'opacity-50' : ''}`}
                          >
                            {isSaving ? '…' : cfg ? cfg.symbol : ''}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const { profile } = useAuth()
  const isSupervisor = SUPERVISOR_ROLES.includes(profile?.role ?? '')
  const isManager    = MANAGER_ROLES.includes(profile?.role ?? '')

  const [tab, setTab]                     = useState<Tab>('overview')
  const [courses, setCourses]             = useState<Course[]>([])
  const [sessions, setSessions]           = useState<Session[]>([])
  const [employees, setEmployees]         = useState<Employee[]>([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [prefillCourse, setPrefillCourse] = useState<string | undefined>()
  const [prefillEmps, setPrefillEmps]     = useState<string[] | undefined>()

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: coursesData },
      { data: sessionsData },
      { data: empsData },
    ] = await Promise.all([
      supabase.from('training_courses').select('id, name, technology, provider, duration_days, certification_type_id').order('name'),
      supabase.from('training_sessions').select(`
        id, course_id, scheduled_date, end_date, location, trainer_name,
        max_participants, notes, status,
        training_courses(name, technology, provider),
        training_enrollments(id, status, profiles(first_name, surname, employee_code))
      `).order('scheduled_date', { ascending: false }),
      supabase.from('profiles').select('id, first_name, surname, employee_code, role, department_id')
        .eq('status', 'active')
        .order('first_name'),
    ])
    setCourses((coursesData as Course[]) ?? [])
    setSessions((sessionsData as unknown as Session[]) ?? [])
    setEmployees((empsData as Employee[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleStatusChange(sessionId: string, newStatus: SessionStatus) {
    await supabase.from('training_sessions').update({ status: newStatus }).eq('id', sessionId)
    loadAll()
  }

  function openSchedule(courseId?: string, empIds?: string[]) {
    setPrefillCourse(courseId)
    setPrefillEmps(empIds)
    setShowForm(true)
  }

  // Derived data
  const upcoming = useMemo(() =>
    sessions.filter(s => s.status === 'scheduled').slice().sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
  [sessions])
  const past = useMemo(() =>
    sessions.filter(s => s.status !== 'scheduled').slice().sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)),
  [sessions])
  const completedThisYear = useMemo(() => {
    const yr = new Date().getFullYear().toString()
    return sessions.filter(s => s.status === 'completed' && s.scheduled_date.startsWith(yr))
  }, [sessions])
  const totalEnrolledThisYear = useMemo(() =>
    completedThisYear.reduce((sum, s) => sum + s.training_enrollments.filter(e => e.status === 'completed').length, 0),
  [completedThisYear])

  if (!isSupervisor) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        You don't have access to the training register.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Training</h1>
          <p className="text-sm text-gray-500 mt-0.5">Schedule sessions, track enrolments, and manage the quarterly training matrix.</p>
        </div>
        {isManager && (
          <button
            onClick={() => openSchedule()}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8a] flex-shrink-0"
          >
            <IconPlus className="w-4 h-4" /> Schedule Session
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'sessions', label: `Sessions${sessions.length ? ` (${sessions.length})` : ''}` },
          { key: 'matrix',   label: 'Training Matrix' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-[#1B5EA6] text-[#1B5EA6]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#1B5EA6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Overview Tab ── */}
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming Sessions</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{upcoming.length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed This Year</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{completedThisYear.length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Trained This Year</p>
                  <p className="text-3xl font-bold text-[#1B5EA6] mt-1">{totalEnrolledThisYear}</p>
                  <p className="text-xs text-gray-400 mt-0.5">completions</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-sm font-semibold text-gray-700">Upcoming Sessions</h2>
                  {upcoming.length > 3 && (
                    <button onClick={() => setTab('sessions')} className="text-xs text-[#1B5EA6] hover:underline">View all</button>
                  )}
                </div>
                {upcoming.length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl py-8 text-center">
                    <IconAcademicCap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No upcoming sessions scheduled.</p>
                    {isManager && (
                      <button onClick={() => openSchedule()} className="mt-2 text-sm text-[#1B5EA6] hover:underline">
                        Schedule one now
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcoming.slice(0, 3).map(s => (
                      <SessionCard key={s.id} session={s} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-sm font-semibold text-gray-700">Training Matrix</h2>
                  <button onClick={() => setTab('matrix')} className="text-xs text-[#1B5EA6] hover:underline">Open matrix</button>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                  <IconBadgeCheck className="w-8 h-8 text-[#1B5EA6] flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Quarterly Training Planner</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Plan and track training for all employees across Q1–Q4 of the financial year (Jul–Jun).
                    </p>
                  </div>
                  <button
                    onClick={() => setTab('matrix')}
                    className="ml-auto flex-shrink-0 px-3 py-1.5 text-xs font-medium text-[#1B5EA6] border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Sessions Tab ── */}
          {tab === 'sessions' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2.5">Upcoming ({upcoming.length})</h2>
                {upcoming.length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl py-8 text-center">
                    <p className="text-sm text-gray-400">No upcoming sessions.</p>
                    {isManager && (
                      <button onClick={() => openSchedule()} className="mt-1.5 text-sm text-[#1B5EA6] hover:underline">Schedule one</button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map(s => (
                      <SessionCard key={s.id} session={s} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                )}
              </div>
              {past.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 mb-2.5">Past Sessions ({past.length})</h2>
                  <div className="space-y-2">
                    {past.map(s => (
                      <SessionCard key={s.id} session={s} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Training Matrix Tab ── */}
          {tab === 'matrix' && (
            <TrainingMatrix
              courses={courses}
              employees={employees}
              isManager={isManager}
            />
          )}
        </>
      )}

      {/* Schedule form modal */}
      {showForm && (
        <ScheduleForm
          courses={courses}
          employees={employees}
          prefillCourseId={prefillCourse}
          prefillEmployeeIds={prefillEmps}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadAll() }}
        />
      )}
    </div>
  )
}
