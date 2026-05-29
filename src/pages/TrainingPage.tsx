import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  IconAcademicCap, IconCalendar, IconMapPin,
  IconPlus, IconUsers, IconXMark, IconBadgeCheck,
  IconExclamationTriangle, IconChevronDown,
} from '../components/Icons'

// ── Types ──────────────────────────────────────────────────────────────────────

type SessionStatus = 'scheduled' | 'completed' | 'cancelled'
type EnrolStatus   = 'enrolled' | 'completed' | 'cancelled' | 'no_show'

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

type ExpiringCert = {
  id: string
  employee_id: string
  expiry_date: string | null
  days_left: number | null
  profiles: { first_name: string; surname: string; employee_code: string | null } | null
  certification_types: { id: string; name: string; technology: string | null; cert_level: string | null } | null
}

type Employee = {
  id: string
  first_name: string
  surname: string
  employee_code: string | null
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

function daysLabel(days: number | null) {
  if (days === null) return 'No expiry'
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  return `${days}d left`
}

function daysColour(days: number | null) {
  if (days === null) return 'text-gray-400'
  if (days < 0)   return 'text-red-600 font-medium'
  if (days <= 30) return 'text-red-500 font-medium'
  if (days <= 60) return 'text-amber-600 font-medium'
  return 'text-green-600'
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

type Tab = 'overview' | 'sessions' | 'needs-training'

const SUPERVISOR_ROLES = ['supervisor', 'manager', 'admin_manager', 'system_admin']
const MANAGER_ROLES    = ['manager', 'admin_manager', 'system_admin']

export default function TrainingPage() {
  const { profile } = useAuth()
  const isSupervisor = SUPERVISOR_ROLES.includes(profile?.role ?? '')
  const isManager    = MANAGER_ROLES.includes(profile?.role ?? '')

  const [tab, setTab]                   = useState<Tab>('overview')
  const [courses, setCourses]           = useState<Course[]>([])
  const [sessions, setSessions]         = useState<Session[]>([])
  const [expiring, setExpiring]         = useState<ExpiringCert[]>([])
  const [employees, setEmployees]       = useState<Employee[]>([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [prefillCourse, setPrefillCourse] = useState<string | undefined>()
  const [prefillEmps, setPrefillEmps]   = useState<string[] | undefined>()

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: coursesData },
      { data: sessionsData },
      { data: expiringData },
      { data: empsData },
    ] = await Promise.all([
      supabase.from('training_courses').select('id, name, technology, provider, duration_days, certification_type_id').order('name'),
      supabase.from('training_sessions').select(`
        id, course_id, scheduled_date, end_date, location, trainer_name,
        max_participants, notes, status,
        training_courses(name, technology, provider),
        training_enrollments(id, status, profiles(first_name, surname, employee_code))
      `).order('scheduled_date', { ascending: false }),
      supabase.from('employee_certifications').select(`
        id, employee_id, expiry_date,
        profiles(first_name, surname, employee_code),
        certification_types(id, name, technology, cert_level)
      `)
        .eq('has_certification', true)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
        .order('expiry_date'),
      supabase.from('profiles').select('id, first_name, surname, employee_code')
        .eq('status', 'active')
        .order('surname'),
    ])
    setCourses((coursesData as Course[]) ?? [])
    setSessions((sessionsData as unknown as Session[]) ?? [])

    // Compute days_left for expiring certs
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const enriched = ((expiringData ?? []) as unknown as Omit<ExpiringCert, 'days_left'>[]).map(r => ({
      ...r,
      days_left: r.expiry_date
        ? Math.round((new Date(r.expiry_date + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
        : null,
    }))
    setExpiring(enriched)
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
  const upcoming  = useMemo(() => sessions.filter(s => s.status === 'scheduled').slice().sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)), [sessions])
  const past      = useMemo(() => sessions.filter(s => s.status !== 'scheduled').slice().sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)), [sessions])

  const completedThisYear = useMemo(() => {
    const yr = new Date().getFullYear().toString()
    return sessions.filter(s => s.status === 'completed' && s.scheduled_date.startsWith(yr))
  }, [sessions])

  const totalEnrolledThisYear = useMemo(() =>
    completedThisYear.reduce((sum, s) => sum + s.training_enrollments.filter(e => e.status === 'completed').length, 0),
  [completedThisYear])

  // Group expiring by technology for the "Needs Training" tab
  const needsByTech = useMemo(() => {
    const map = new Map<string, ExpiringCert[]>()
    for (const cert of expiring) {
      const tech = cert.certification_types?.technology ?? 'Other'
      if (!map.has(tech)) map.set(tech, [])
      map.get(tech)!.push(cert)
    }
    return map
  }, [expiring])

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
          <p className="text-sm text-gray-500 mt-0.5">Schedule sessions, track enrolments, and monitor employees due for training.</p>
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
          { key: 'overview',       label: 'Overview' },
          { key: 'sessions',       label: `Sessions${sessions.length ? ` (${sessions.length})` : ''}` },
          { key: 'needs-training', label: `Needs Training${expiring.length ? ` (${expiring.length})` : ''}` },
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
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Certs Due ≤90d</p>
                  <p className={`text-3xl font-bold mt-1 ${expiring.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{expiring.length}</p>
                </div>
              </div>

              {/* Upcoming sessions preview */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-sm font-semibold text-gray-700">Upcoming Sessions</h2>
                  {upcoming.length > 3 && (
                    <button onClick={() => setTab('sessions')} className="text-xs text-[#1B5EA6] hover:underline">
                      View all
                    </button>
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

              {/* Needs training preview */}
              {expiring.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-sm font-semibold text-gray-700">Employees Needing Training Soon</h2>
                    <button onClick={() => setTab('needs-training')} className="text-xs text-[#1B5EA6] hover:underline">
                      View all ({expiring.length})
                    </button>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
                    {expiring.slice(0, 5).map(cert => (
                      <div key={cert.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {cert.profiles?.first_name} {cert.profiles?.surname}
                            {cert.profiles?.employee_code && <span className="text-gray-400 font-normal ml-1">{cert.profiles.employee_code}</span>}
                          </p>
                          <p className="text-xs text-gray-400">{cert.certification_types?.name}</p>
                        </div>
                        <span className={`text-xs flex-shrink-0 ${daysColour(cert.days_left)}`}>
                          {daysLabel(cert.days_left)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Sessions Tab ── */}
          {tab === 'sessions' && (
            <div className="space-y-5">
              {/* Upcoming */}
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

              {/* Past */}
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

          {/* ── Needs Training Tab ── */}
          {tab === 'needs-training' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Employees with certifications expiring within 90 days, grouped by technology. Schedule training to renew them.
              </p>

              {expiring.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl py-10 text-center">
                  <IconBadgeCheck className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">All certifications are up to date.</p>
                  <p className="text-xs text-gray-400 mt-0.5">No certs expiring in the next 90 days.</p>
                </div>
              ) : (
                Array.from(needsByTech.entries()).map(([tech, certs]) => {
                  // Find matching courses for this technology
                  const techCourses = courses.filter(c => c.technology === tech)
                  return (
                    <div key={tech} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {/* Group header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <IconAcademicCap className="w-4 h-4 text-[#1B5EA6]" />
                          <span className="text-sm font-semibold text-gray-800">{tech}</span>
                          <span className="text-xs text-gray-400">({certs.length})</span>
                        </div>
                        {isManager && techCourses.length > 0 && (
                          <button
                            onClick={() => openSchedule(
                              techCourses[0].id,
                              certs.map(c => c.employee_id)
                            )}
                            className="flex items-center gap-1 text-xs text-[#1B5EA6] hover:underline font-medium"
                          >
                            <IconPlus className="w-3.5 h-3.5" /> Schedule for all
                          </button>
                        )}
                      </div>

                      {/* Cert rows */}
                      <div className="divide-y divide-gray-50">
                        {certs.map(cert => (
                          <div key={cert.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/employees/${cert.employee_id}`}
                                className="text-sm font-medium text-gray-900 hover:text-[#1B5EA6]"
                              >
                                {cert.profiles?.first_name} {cert.profiles?.surname}
                              </Link>
                              {cert.profiles?.employee_code && (
                                <span className="text-xs text-gray-400 ml-1">{cert.profiles.employee_code}</span>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">
                                {cert.certification_types?.name}
                                {cert.certification_types?.cert_level ? ` \u00b7 ${cert.certification_types.cert_level}` : ''}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-xs ${daysColour(cert.days_left)}`}>{daysLabel(cert.days_left)}</p>
                              {cert.expiry_date && (
                                <p className="text-[11px] text-gray-400">{fmt(cert.expiry_date)}</p>
                              )}
                            </div>
                            {isManager && (
                              <button
                                onClick={() => openSchedule(
                                  techCourses[0]?.id,
                                  [cert.employee_id]
                                )}
                                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-[#1B5EA6] border border-blue-200 rounded-lg hover:bg-blue-50 font-medium"
                              >
                                <IconCalendar className="w-3 h-3" /> Schedule
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
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
