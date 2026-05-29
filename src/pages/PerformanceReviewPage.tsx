import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  IconPlus, IconXMark, IconClipboardList,
  IconChevronDown, IconUsers,
} from '../components/Icons'

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewType   = 'annual' | 'quarterly' | 'probation' | 'ad_hoc'
type ReviewStatus = 'draft' | 'submitted' | 'acknowledged'

type Review = {
  id: string
  employee_id: string
  reviewer_id: string | null
  review_type: ReviewType
  review_period: string
  review_date: string
  overall_rating: number | null
  technical_score: number | null
  teamwork_score: number | null
  reliability_score: number | null
  safety_score: number | null
  strengths: string | null
  improvements: string | null
  goals_next: string | null
  notes: string | null
  status: ReviewStatus
  acknowledged_at: string | null
  created_at: string
  employee: { first_name: string; surname: string; employee_code: string | null } | null
  reviewer: { first_name: string; surname: string } | null
}

type Employee = {
  id: string
  first_name: string
  surname: string
  employee_code: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPERVISOR_ROLES = ['supervisor', 'manager', 'admin_manager', 'system_admin']
const MANAGER_ROLES    = ['manager', 'admin_manager', 'system_admin']

const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  annual:     'Annual',
  quarterly:  'Quarterly',
  probation:  'Probation',
  ad_hoc:     'Ad Hoc',
}

const STATUS_STYLE: Record<ReviewStatus, string> = {
  draft:        'bg-gray-100 text-gray-500',
  submitted:    'bg-blue-50 text-blue-700',
  acknowledged: 'bg-green-50 text-green-700',
}

const SCORE_LABELS: Record<number, string> = {
  1: 'Needs Improvement',
  2: 'Below Expectations',
  3: 'Meets Expectations',
  4: 'Exceeds Expectations',
  5: 'Outstanding',
}

const SCORE_COLOUR: Record<number, string> = {
  1: 'text-red-600',
  2: 'text-orange-500',
  3: 'text-amber-600',
  4: 'text-blue-600',
  5: 'text-green-600',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function avgScore(r: Review): number | null {
  const scores = [r.technical_score, r.teamwork_score, r.reliability_score, r.safety_score].filter(s => s !== null) as number[]
  if (scores.length === 0) return r.overall_rating
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
}

// ── Star Rating Component ─────────────────────────────────────────────────────

function StarRating({
  value, onChange, readonly = false,
}: { value: number | null; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          title={SCORE_LABELS[n]}
          className={`w-6 h-6 transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} ${
            value !== null && n <= value ? 'text-amber-400' : 'text-gray-200'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
      {value !== null && (
        <span className={`ml-1.5 text-xs font-medium self-center ${SCORE_COLOUR[value]}`}>
          {SCORE_LABELS[value]}
        </span>
      )}
    </div>
  )
}

// ── Review Form ───────────────────────────────────────────────────────────────

interface ReviewFormProps {
  employees: Employee[]
  review?: Review | null
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}

function ReviewForm({ employees, review, currentUserId, onClose, onSaved }: ReviewFormProps) {
  const isEdit = !!review

  const [employeeId,       setEmployeeId]       = useState(review?.employee_id ?? '')
  const [reviewType,       setReviewType]       = useState<ReviewType>(review?.review_type ?? 'annual')
  const [reviewPeriod,     setReviewPeriod]     = useState(review?.review_period ?? '')
  const [reviewDate,       setReviewDate]       = useState(review?.review_date ?? new Date().toISOString().slice(0, 10))
  const [overallRating,    setOverallRating]    = useState<number | null>(review?.overall_rating ?? null)
  const [technicalScore,   setTechnicalScore]   = useState<number | null>(review?.technical_score ?? null)
  const [teamworkScore,    setTeamworkScore]    = useState<number | null>(review?.teamwork_score ?? null)
  const [reliabilityScore, setReliabilityScore] = useState<number | null>(review?.reliability_score ?? null)
  const [safetyScore,      setSafetyScore]      = useState<number | null>(review?.safety_score ?? null)
  const [strengths,        setStrengths]        = useState(review?.strengths ?? '')
  const [improvements,     setImprovements]     = useState(review?.improvements ?? '')
  const [goalsNext,        setGoalsNext]        = useState(review?.goals_next ?? '')
  const [notes,            setNotes]            = useState(review?.notes ?? '')
  const [status,           setStatus]           = useState<ReviewStatus>(review?.status ?? 'draft')
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId) { setError('Please select an employee.'); return }
    if (!reviewPeriod.trim()) { setError('Please enter a review period.'); return }
    setSaving(true); setError(null)

    const payload = {
      employee_id:       employeeId,
      reviewer_id:       currentUserId,
      review_type:       reviewType,
      review_period:     reviewPeriod.trim(),
      review_date:       reviewDate,
      overall_rating:    overallRating,
      technical_score:   technicalScore,
      teamwork_score:    teamworkScore,
      reliability_score: reliabilityScore,
      safety_score:      safetyScore,
      strengths:         strengths.trim() || null,
      improvements:      improvements.trim() || null,
      goals_next:        goalsNext.trim() || null,
      notes:             notes.trim() || null,
      status,
      acknowledged_at:   status === 'acknowledged' && !review?.acknowledged_at
        ? new Date().toISOString()
        : (review?.acknowledged_at ?? null),
    }

    const { error: err } = isEdit
      ? await supabase.from('performance_reviews').update(payload).eq('id', review!.id)
      : await supabase.from('performance_reviews').insert(payload)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative w-full max-w-2xl my-6 bg-white rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Review' : 'New Performance Review'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <IconXMark className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Employee + type row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Employee</label>
              <div className="relative">
                <select
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                >
                  <option value="">Select employee…</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.surname}
                      {emp.employee_code ? ` (${emp.employee_code})` : ''}
                    </option>
                  ))}
                </select>
                <IconChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Review Type</label>
              <div className="relative">
                <select
                  value={reviewType}
                  onChange={e => setReviewType(e.target.value as ReviewType)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
                >
                  {(Object.entries(REVIEW_TYPE_LABEL) as [ReviewType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <IconChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Period + date row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Review Period <span className="font-normal text-gray-400">(e.g. FY2026 Annual)</span>
              </label>
              <input
                type="text"
                value={reviewPeriod}
                onChange={e => setReviewPeriod(e.target.value)}
                placeholder="FY2026 Annual"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Review Date</label>
              <input
                type="date"
                value={reviewDate}
                onChange={e => setReviewDate(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
              />
            </div>
          </div>

          {/* Scores */}
          <div className="space-y-3 bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Scores</p>

            {([
              ['Technical Skills',  technicalScore,   setTechnicalScore],
              ['Teamwork',          teamworkScore,    setTeamworkScore],
              ['Reliability',       reliabilityScore, setReliabilityScore],
              ['Safety',            safetyScore,      setSafetyScore],
            ] as [string, number | null, (v: number) => void][]).map(([label, val, setter]) => (
              <div key={label} className="flex items-center gap-4">
                <span className="text-xs text-gray-600 w-32 flex-shrink-0">{label}</span>
                <StarRating value={val} onChange={setter} />
                {val !== null && (
                  <button
                    type="button"
                    onClick={() => setter(0 as unknown as number)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 ml-auto"
                    title="Clear"
                  >
                    Clear
                  </button>
                )}
              </div>
            ))}

            <div className="border-t border-gray-200 pt-3 flex items-center gap-4">
              <span className="text-xs font-semibold text-gray-700 w-32 flex-shrink-0">Overall Rating</span>
              <StarRating value={overallRating} onChange={setOverallRating} />
              {overallRating !== null && (
                <button
                  type="button"
                  onClick={() => setOverallRating(null)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 ml-auto"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Text fields */}
          {([
            ['Strengths', strengths, setStrengths, 'What did the employee do well?'],
            ['Areas for Improvement', improvements, setImprovements, 'Where can they improve?'],
            ['Goals for Next Period', goalsNext, setGoalsNext, 'Key objectives for the next review period'],
            ['Additional Notes', notes, setNotes, 'Any other relevant comments'],
          ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
              <textarea
                value={val}
                onChange={e => setter(e.target.value)}
                placeholder={ph}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
              />
            </div>
          ))}

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
            <div className="flex gap-2">
              {(['draft', 'submitted', 'acknowledged'] as ReviewStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    status === s
                      ? 'border-[#1B5EA6] bg-blue-50 text-[#1B5EA6]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1B5EA6] rounded-lg hover:bg-[#154d8a] disabled:opacity-60"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Review Detail Modal ───────────────────────────────────────────────────────

function ReviewDetail({ review, onClose, onEdit }: { review: Review; onClose: () => void; onEdit: () => void }) {
  const emp = review.employee
  const rvr = review.reviewer
  const avg = avgScore(review)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative w-full max-w-xl my-6 bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {emp?.first_name} {emp?.surname}
              {emp?.employee_code && <span className="text-gray-400 font-normal ml-1 text-sm">{emp.employee_code}</span>}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {REVIEW_TYPE_LABEL[review.review_type]} \u00b7 {review.review_period} \u00b7 {fmt(review.review_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="px-3 py-1.5 text-xs font-medium text-[#1B5EA6] border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              Edit
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <IconXMark className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status + reviewer */}
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[review.status]}`}>
              {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
            </span>
            {rvr && (
              <span className="text-xs text-gray-400">
                Reviewed by {rvr.first_name} {rvr.surname}
              </span>
            )}
            {avg !== null && (
              <span className={`ml-auto text-sm font-bold ${SCORE_COLOUR[Math.round(avg)]}`}>
                {avg} / 5
              </span>
            )}
          </div>

          {/* Scores grid */}
          {(review.technical_score || review.teamwork_score || review.reliability_score || review.safety_score || review.overall_rating) && (
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4">
              {([
                ['Technical Skills',  review.technical_score],
                ['Teamwork',          review.teamwork_score],
                ['Reliability',       review.reliability_score],
                ['Safety',            review.safety_score],
              ] as [string, number | null][]).filter(([, v]) => v !== null).map(([label, val]) => (
                <div key={label}>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                  <StarRating value={val} readonly />
                </div>
              ))}
              {review.overall_rating !== null && (
                <div className="col-span-2 border-t border-gray-200 pt-3 mt-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Overall Rating</p>
                  <StarRating value={review.overall_rating} readonly />
                </div>
              )}
            </div>
          )}

          {/* Text fields */}
          {([
            ['Strengths',              review.strengths],
            ['Areas for Improvement',  review.improvements],
            ['Goals for Next Period',   review.goals_next],
            ['Additional Notes',        review.notes],
          ] as [string, string | null][]).filter(([, v]) => v).map(([label, val]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({
  review, onClick,
}: { review: Review; onClick: () => void }) {
  const emp = review.employee
  const avg = avgScore(review)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1B5EA6]/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {emp?.first_name} {emp?.surname}
            {emp?.employee_code && (
              <span className="text-gray-400 font-normal ml-1">{emp.employee_code}</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {REVIEW_TYPE_LABEL[review.review_type]} \u00b7 {review.review_period}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{fmt(review.review_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[review.status]}`}>
            {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
          </span>
          {avg !== null && (
            <span className={`text-sm font-bold ${SCORE_COLOUR[Math.round(avg)]}`}>{avg}/5</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PerformanceReviewPage() {
  const { profile } = useAuth()
  const isSupervisor = SUPERVISOR_ROLES.includes(profile?.role ?? '')
  const isManager    = MANAGER_ROLES.includes(profile?.role ?? '')

  const [reviews,   setReviews]   = useState<Review[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editReview, setEditReview] = useState<Review | null>(null)
  const [viewReview, setViewReview] = useState<Review | null>(null)
  const [filterType,   setFilterType]   = useState<ReviewType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | 'all'>('all')
  const [searchText,   setSearchText]   = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [{ data: revData }, { data: empData }] = await Promise.all([
      supabase
        .from('performance_reviews')
        .select(`
          id, employee_id, reviewer_id, review_type, review_period, review_date,
          overall_rating, technical_score, teamwork_score, reliability_score, safety_score,
          strengths, improvements, goals_next, notes, status, acknowledged_at, created_at,
          employee:profiles!performance_reviews_employee_id_fkey(first_name, surname, employee_code),
          reviewer:profiles!performance_reviews_reviewer_id_fkey(first_name, surname)
        `)
        .order('review_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, first_name, surname, employee_code')
        .eq('status', 'active')
        .order('surname'),
    ])
    setReviews((revData as unknown as Review[]) ?? [])
    setEmployees((empData as Employee[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const filtered = useMemo(() => {
    let r = reviews
    if (filterType   !== 'all') r = r.filter(x => x.review_type === filterType)
    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus)
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      r = r.filter(x =>
        `${x.employee?.first_name} ${x.employee?.surname}`.toLowerCase().includes(q) ||
        (x.employee?.employee_code ?? '').toLowerCase().includes(q) ||
        x.review_period.toLowerCase().includes(q)
      )
    }
    return r
  }, [reviews, filterType, filterStatus, searchText])

  // Stats
  const totalReviews   = reviews.length
  const draftCount     = reviews.filter(r => r.status === 'draft').length
  const submittedCount = reviews.filter(r => r.status === 'submitted').length
  const avgOverall     = useMemo(() => {
    const scored = reviews.map(r => avgScore(r)).filter(v => v !== null) as number[]
    if (!scored.length) return null
    return (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1)
  }, [reviews])

  if (!isSupervisor) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        You don't have access to performance reviews.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Performance Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create and manage employee performance reviews by period and type.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => { setEditReview(null); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8a] flex-shrink-0"
          >
            <IconPlus className="w-4 h-4" /> New Review
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Reviews</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalReviews}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Draft</p>
          <p className="text-3xl font-bold text-gray-500 mt-1">{draftCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{submittedCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</p>
          <p className={`text-3xl font-bold mt-1 ${avgOverall ? SCORE_COLOUR[Math.round(Number(avgOverall))] : 'text-gray-300'}`}>
            {avgOverall ?? '—'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search employee or period…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as ReviewType | 'all')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
        >
          <option value="all">All types</option>
          {(Object.entries(REVIEW_TYPE_LABEL) as [ReviewType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as ReviewStatus | 'all')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="acknowledged">Acknowledged</option>
        </select>
        {(filterType !== 'all' || filterStatus !== 'all' || searchText) && (
          <button
            onClick={() => { setFilterType('all'); setFilterStatus('all'); setSearchText('') }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} review{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#1B5EA6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-12 text-center">
          <IconClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          {reviews.length === 0 ? (
            <>
              <p className="text-sm text-gray-500">No reviews yet.</p>
              {isManager && (
                <button
                  onClick={() => { setEditReview(null); setShowForm(true) }}
                  className="mt-2 text-sm text-[#1B5EA6] hover:underline"
                >
                  Create the first review
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">No reviews match the current filters.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              onClick={() => setViewReview(review)}
            />
          ))}
        </div>
      )}

      {/* Employees without a review this period (quick insight) */}
      {!loading && reviews.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <IconUsers className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-semibold text-amber-800">
              {employees.filter(e => !reviews.some(r => r.employee_id === e.id)).length} employee(s) have no review on record
            </p>
          </div>
          <p className="text-xs text-amber-700">
            {employees
              .filter(e => !reviews.some(r => r.employee_id === e.id))
              .slice(0, 6)
              .map(e => `${e.first_name} ${e.surname}`)
              .join(', ')}
            {employees.filter(e => !reviews.some(r => r.employee_id === e.id)).length > 6 ? ' \u2026' : ''}
          </p>
        </div>
      )}

      {/* Modals */}
      {showForm && profile && (
        <ReviewForm
          employees={employees}
          review={editReview}
          currentUserId={profile.id}
          onClose={() => { setShowForm(false); setEditReview(null) }}
          onSaved={() => { setShowForm(false); setEditReview(null); loadAll() }}
        />
      )}

      {viewReview && !showForm && (
        <ReviewDetail
          review={viewReview}
          onClose={() => setViewReview(null)}
          onEdit={() => { setEditReview(viewReview); setViewReview(null); setShowForm(true) }}
        />
      )}
    </div>
  )
}
