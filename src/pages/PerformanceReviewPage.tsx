import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  IconPlus, IconXMark, IconClipboardList,
  IconChevronDown,
} from '../components/Icons'

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewType   = 'annual' | 'quarterly' | 'probation' | 'ad_hoc'
type ReviewStatus = 'draft' | 'submitted' | 'secondary_approved' | 'final_approved' | 'returned' | 'acknowledged'

type Review = {
  id: string
  employee_id: string
  reviewer_id: string | null
  supervisor_id: string | null
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
  secondary_approver_id: string | null
  secondary_approved_at: string | null
  secondary_approval_comments: string | null
  final_approver_id: string | null
  final_approved_at: string | null
  final_approval_comments: string | null
  returned_by: string | null
  returned_at: string | null
  returned_comments: string | null
  acknowledged_at: string | null
  acknowledgement_comments: string | null
  created_at: string
  employee:           { first_name: string; surname: string; employee_code: string | null } | null
  reviewer:           { first_name: string; surname: string } | null
  secondary_approver: { first_name: string; surname: string } | null
  final_approver:     { first_name: string; surname: string } | null
}

type Employee = {
  id: string
  first_name: string
  surname: string
  employee_code: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ROLES      = ['admin_manager', 'system_admin']
const SUPERVISOR_ROLES = ['supervisor', 'manager', 'admin_manager', 'system_admin']

const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  annual:    'Annual',
  quarterly: 'Quarterly',
  probation: 'Probation',
  ad_hoc:    'Ad Hoc',
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft:               'Draft',
  submitted:           'Submitted',
  secondary_approved:  'Secondary Approved',
  final_approved:      'Final Approved',
  returned:            'Returned',
  acknowledged:        'Acknowledged',
}

const STATUS_STYLE: Record<ReviewStatus, string> = {
  draft:               'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  submitted:           'bg-blue-50 text-blue-700',
  secondary_approved:  'bg-indigo-50 text-indigo-700',
  final_approved:      'bg-green-50 text-green-700',
  returned:            'bg-amber-50 text-amber-700',
  acknowledged:        'bg-emerald-50 text-emerald-700',
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

const SELECT_FIELDS = `
  id, employee_id, reviewer_id, supervisor_id, review_type, review_period, review_date,
  overall_rating, technical_score, teamwork_score, reliability_score, safety_score,
  strengths, improvements, goals_next, notes, status,
  secondary_approver_id, secondary_approved_at, secondary_approval_comments,
  final_approver_id, final_approved_at, final_approval_comments,
  returned_by, returned_at, returned_comments,
  acknowledged_at, acknowledgement_comments, created_at,
  employee:profiles!performance_reviews_employee_id_fkey(first_name, surname, employee_code),
  reviewer:profiles!performance_reviews_reviewer_id_fkey(first_name, surname),
  secondary_approver:profiles!performance_reviews_secondary_approver_id_fkey(first_name, surname),
  final_approver:profiles!performance_reviews_final_approver_id_fkey(first_name, surname)
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function avgScore(r: Review): number | null {
  const scores = [r.technical_score, r.teamwork_score, r.reliability_score, r.safety_score]
    .filter(s => s !== null) as number[]
  if (scores.length === 0) return r.overall_rating
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
}

function personName(p: { first_name: string; surname: string } | null | undefined) {
  return p ? `${p.first_name} ${p.surname}` : '—'
}

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ value, onChange, readonly = false }: {
  value: number | null; onChange?: (v: number) => void; readonly?: boolean
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={readonly} onClick={() => onChange?.(n)}
          title={SCORE_LABELS[n]}
          className={`w-6 h-6 transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} ${
            value !== null && n <= value ? 'text-amber-400' : 'text-gray-200'
          }`}>
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

// ── Action Modal ──────────────────────────────────────────────────────────────

function ActionModal({
  title, actionLabel, actionClass, requireComment = false, placeholder, onConfirm, onClose,
}: {
  title: string; actionLabel: string; actionClass: string;
  requireComment?: boolean; placeholder?: string;
  onConfirm: (comments: string) => Promise<void>; onClose: () => void;
}) {
  const [comments, setComments] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState<string | null>(null)

  async function go() {
    if (requireComment && !comments.trim()) { setErr('Please enter a reason.'); return }
    setSaving(true); await onConfirm(comments.trim()); setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] rounded-xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{title}</h3>
        <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3}
          placeholder={placeholder ?? 'Comments (optional)…'}
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30 mb-3" />
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">Cancel</button>
          <button onClick={go} disabled={saving} className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${actionClass}`}>
            {saving ? 'Processing…' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Review Form ───────────────────────────────────────────────────────────────

function ReviewForm({ employees, review, currentUserId, onClose, onSaved }: {
  employees: Employee[]
  review?: Review | null
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit   = !!review
  const isLocked = isEdit && !['draft', 'returned'].includes(review.status)

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
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId) { setError('Please select an employee.'); return }
    if (!reviewPeriod.trim()) { setError('Please enter a review period.'); return }
    setSaving(true); setError(null)
    const payload = {
      employee_id: employeeId, reviewer_id: currentUserId,
      review_type: reviewType, review_period: reviewPeriod.trim(), review_date: reviewDate,
      overall_rating: overallRating, technical_score: technicalScore, teamwork_score: teamworkScore,
      reliability_score: reliabilityScore, safety_score: safetyScore,
      strengths: strengths.trim() || null, improvements: improvements.trim() || null,
      goals_next: goalsNext.trim() || null, notes: notes.trim() || null,
      status: 'draft' as ReviewStatus,
    }
    const { error: err } = isEdit
      ? await supabase.from('performance_reviews').update(payload).eq('id', review!.id)
      : await supabase.from('performance_reviews').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const readOnly = (val: string) => (
    <p className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface-secondary)] text-[var(--text-muted)]">{val || '—'}</p>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative w-full max-w-2xl my-6 bg-[var(--surface)] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{isEdit ? 'Edit Review' : 'New Performance Review'}</h2>
            {isLocked && <p className="text-xs text-amber-600 mt-0.5">🔒 Locked — submitted. Must be returned to unlock editing.</p>}
            {review?.status === 'returned' && review.returned_comments && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2">
                <strong>Returned:</strong> {review.returned_comments}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-muted)]"><IconXMark className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Employee</label>
              {isLocked ? readOnly(`${employees.find(e => e.id === employeeId)?.first_name ?? ''} ${employees.find(e => e.id === employeeId)?.surname ?? ''}`) : (
                <div className="relative">
                  <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} required
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30">
                    <option value="">Select employee…</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.surname}{emp.employee_code ? ` (${emp.employee_code})` : ''}</option>
                    ))}
                  </select>
                  <IconChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Review Type</label>
              {isLocked ? readOnly(REVIEW_TYPE_LABEL[reviewType]) : (
                <div className="relative">
                  <select value={reviewType} onChange={e => setReviewType(e.target.value as ReviewType)}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30">
                    {(Object.entries(REVIEW_TYPE_LABEL) as [ReviewType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <IconChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Review Period</label>
              {isLocked ? readOnly(reviewPeriod) : (
                <input type="text" value={reviewPeriod} onChange={e => setReviewPeriod(e.target.value)} placeholder="FY2026 Annual" required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30" />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Review Date</label>
              {isLocked ? readOnly(fmtDate(reviewDate)) : (
                <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30" />
              )}
            </div>
          </div>

          <div className="space-y-3 bg-[var(--surface-secondary)] rounded-xl p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Scores</p>
            {([
              ['Technical Skills',  technicalScore,   setTechnicalScore],
              ['Teamwork',          teamworkScore,    setTeamworkScore],
              ['Reliability',       reliabilityScore, setReliabilityScore],
              ['Safety',            safetyScore,      setSafetyScore],
            ] as [string, number | null, (v: number) => void][]).map(([label, val, setter]) => (
              <div key={label} className="flex items-center gap-4">
                <span className="text-xs text-[var(--text-secondary)] w-32 flex-shrink-0">{label}</span>
                <StarRating value={val} onChange={isLocked ? undefined : setter} readonly={isLocked} />
                {!isLocked && val !== null && (
                  <button type="button" onClick={() => setter(0 as unknown as number)} className="text-[10px] text-[var(--text-muted)] hover:text-gray-600 ml-auto">Clear</button>
                )}
              </div>
            ))}
            <div className="border-t border-[var(--border)] pt-3 flex items-center gap-4">
              <span className="text-xs font-semibold text-[var(--text-secondary)] w-32 flex-shrink-0">Overall Rating</span>
              <StarRating value={overallRating} onChange={isLocked ? undefined : setOverallRating} readonly={isLocked} />
              {!isLocked && overallRating !== null && (
                <button type="button" onClick={() => setOverallRating(null)} className="text-[10px] text-[var(--text-muted)] hover:text-gray-600 ml-auto">Clear</button>
              )}
            </div>
          </div>

          {([
            ['Strengths', strengths, setStrengths, 'What did the employee do well?'],
            ['Areas for Improvement', improvements, setImprovements, 'Where can they improve?'],
            ['Goals for Next Period', goalsNext, setGoalsNext, 'Key objectives for the next review period'],
            ['Additional Notes', notes, setNotes, 'Any other relevant comments'],
          ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
            <div key={label}>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}</label>
              {isLocked
                ? (val ? <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--surface-secondary)] rounded-lg px-3 py-2">{val}</p> : null)
                : <textarea value={val} onChange={e => setter(e.target.value)} placeholder={ph} rows={2}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30" />
              }
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-secondary)]">
              {isLocked ? 'Close' : 'Cancel'}
            </button>
            {!isLocked && (
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#1B5EA6] rounded-lg hover:bg-[#154d8a] disabled:opacity-60">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Review'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Review Detail ─────────────────────────────────────────────────────────────

function ReviewDetail({
  review, currentUserId, isAdmin, onClose, onEdit, onSubmit,
  onApproveSecondary, onReturnFromSecondary, onApproveFinal, onReturnFromFinal,
  onAcknowledge, onDelete,
}: {
  review: Review; currentUserId: string; isAdmin: boolean
  onClose: () => void; onEdit: () => void
  onSubmit: () => Promise<void>
  onApproveSecondary: (c: string) => Promise<void>
  onReturnFromSecondary: (c: string) => Promise<void>
  onApproveFinal: (c: string) => Promise<void>
  onReturnFromFinal: (c: string) => Promise<void>
  onAcknowledge: (c: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [modal,    setModal]    = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const emp = review.employee
  const avg = avgScore(review)

  const isReviewer  = review.reviewer_id           === currentUserId
  const isSecondary = review.secondary_approver_id === currentUserId
  const isFinal     = review.final_approver_id     === currentUserId
  const isEmployee  = review.employee_id           === currentUserId

  const canSubmit = isReviewer && review.status === 'draft'
  const canEdit   = (isReviewer && ['draft', 'returned'].includes(review.status)) || isAdmin
  const canDelete = (isReviewer && review.status === 'draft') || isAdmin

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative w-full max-w-xl my-6 bg-[var(--surface)] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {emp?.first_name} {emp?.surname}
              {emp?.employee_code && <span className="text-[var(--text-muted)] font-normal ml-1 text-sm">{emp.employee_code}</span>}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {REVIEW_TYPE_LABEL[review.review_type]} · {review.review_period} · {fmtDate(review.review_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && <button onClick={onEdit} className="px-3 py-1.5 text-xs font-medium text-[#1B5EA6] border border-blue-200 rounded-lg hover:bg-blue-50">Edit</button>}
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-muted)]"><IconXMark className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[review.status]}`}>{STATUS_LABEL[review.status]}</span>
            {review.reviewer && <span className="text-xs text-[var(--text-muted)]">By {personName(review.reviewer)}</span>}
            {avg !== null && <span className={`ml-auto text-sm font-bold ${SCORE_COLOUR[Math.round(avg)]}`}>{avg} / 5</span>}
          </div>

          {/* Returned notice */}
          {review.status === 'returned' && review.returned_comments && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚠ Returned for changes</p>
              <p className="text-sm text-amber-700">{review.returned_comments}</p>
              {review.returned_at && <p className="text-[11px] text-amber-600 mt-1">Returned {fmtDate(review.returned_at)}</p>}
            </div>
          )}

          {/* Approval chain */}
          {review.status !== 'draft' && (
            <div className="bg-[var(--surface-secondary)] rounded-xl px-4 py-3 text-xs space-y-1">
              <p className="font-semibold text-[var(--text-secondary)] mb-2">Approval chain</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[var(--text-muted)]">
                <span>Secondary approver</span><span className="text-[var(--text-primary)]">{personName(review.secondary_approver)}</span>
                {review.secondary_approved_at && <><span>Secondary approved</span><span className="text-green-600">{fmtDate(review.secondary_approved_at)}</span></>}
                {review.secondary_approval_comments && <><span>Secondary note</span><span className="italic text-[var(--text-primary)]">{review.secondary_approval_comments}</span></>}
                <span>Final approver</span><span className="text-[var(--text-primary)]">{personName(review.final_approver)}</span>
                {review.final_approved_at && <><span>Final approved</span><span className="text-green-600">{fmtDate(review.final_approved_at)}</span></>}
                {review.final_approval_comments && <><span>Final note</span><span className="italic text-[var(--text-primary)]">{review.final_approval_comments}</span></>}
                {review.acknowledged_at && <><span>Acknowledged</span><span className="text-emerald-600">{fmtDate(review.acknowledged_at)}</span></>}
                {review.acknowledgement_comments && <><span>Employee note</span><span className="italic text-[var(--text-primary)]">{review.acknowledgement_comments}</span></>}
              </div>
            </div>
          )}

          {/* Scores */}
          {(review.technical_score ?? review.teamwork_score ?? review.reliability_score ?? review.safety_score ?? review.overall_rating) !== null && (
            <div className="grid grid-cols-2 gap-3 bg-[var(--surface-secondary)] rounded-xl p-4">
              {([
                ['Technical Skills', review.technical_score],
                ['Teamwork',         review.teamwork_score],
                ['Reliability',      review.reliability_score],
                ['Safety',           review.safety_score],
              ] as [string, number | null][]).filter(([, v]) => v !== null).map(([label, val]) => (
                <div key={label}>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">{label}</p>
                  <StarRating value={val} readonly />
                </div>
              ))}
              {review.overall_rating !== null && (
                <div className="col-span-2 border-t border-[var(--border)] pt-3 mt-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Overall Rating</p>
                  <StarRating value={review.overall_rating} readonly />
                </div>
              )}
            </div>
          )}

          {/* Text */}
          {([
            ['Strengths',             review.strengths],
            ['Areas for Improvement', review.improvements],
            ['Goals for Next Period',  review.goals_next],
            ['Additional Notes',       review.notes],
          ] as [string, string | null][]).filter(([, v]) => v).map(([label, val]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}</p>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--surface-secondary)] rounded-lg px-3 py-2">{val}</p>
            </div>
          ))}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
            {canSubmit && (
              <button disabled={submitting} onClick={async () => { setSubmitting(true); await onSubmit(); setSubmitting(false) }}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1B5EA6] rounded-lg hover:bg-[#154d8a] disabled:opacity-60">
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            )}
            {(isSecondary || isAdmin) && review.status === 'submitted' && (
              <>
                <button onClick={() => setModal('approve_secondary')} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Approve</button>
                <button onClick={() => setModal('return_secondary')} className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100">Return for changes</button>
              </>
            )}
            {(isFinal || isAdmin) && review.status === 'secondary_approved' && (
              <>
                <button onClick={() => setModal('approve_final')} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">Final approve</button>
                <button onClick={() => setModal('return_final')} className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100">Return for changes</button>
              </>
            )}
            {isEmployee && review.status === 'final_approved' && (
              <button onClick={() => setModal('acknowledge')} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Acknowledge receipt</button>
            )}
            {canDelete && review.status === 'draft' && (
              <button disabled={deleting} onClick={async () => { setDeleting(true); await onDelete(); setDeleting(false) }}
                className="ml-auto px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>

      {modal === 'approve_secondary' && (
        <ActionModal title="Approve (secondary)" actionLabel="Approve" actionClass="bg-emerald-600 hover:bg-emerald-700"
          placeholder="Optional comments…" onConfirm={async c => { await onApproveSecondary(c); setModal(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'return_secondary' && (
        <ActionModal title="Return for changes" actionLabel="Return" actionClass="bg-amber-500 hover:bg-amber-600"
          requireComment placeholder="Explain what needs to be corrected…" onConfirm={async c => { await onReturnFromSecondary(c); setModal(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'approve_final' && (
        <ActionModal title="Final approval" actionLabel="Final Approve" actionClass="bg-green-600 hover:bg-green-700"
          placeholder="Optional comments…" onConfirm={async c => { await onApproveFinal(c); setModal(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'return_final' && (
        <ActionModal title="Return for changes" actionLabel="Return" actionClass="bg-amber-500 hover:bg-amber-600"
          requireComment placeholder="Explain what needs to be corrected…" onConfirm={async c => { await onReturnFromFinal(c); setModal(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'acknowledge' && (
        <ActionModal title="Acknowledge receipt" actionLabel="Acknowledge" actionClass="bg-blue-600 hover:bg-blue-700"
          placeholder="Optional comments — acknowledging receipt does not imply agreement…" onConfirm={async c => { await onAcknowledge(c); setModal(null) }} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({ review, onClick }: { review: Review; onClick: () => void }) {
  const emp = review.employee; const avg = avgScore(review)
  return (
    <button onClick={onClick} className="w-full text-left bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[#1B5EA6]/40 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {emp?.first_name} {emp?.surname}
            {emp?.employee_code && <span className="text-[var(--text-muted)] font-normal ml-1">{emp.employee_code}</span>}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{REVIEW_TYPE_LABEL[review.review_type]} · {review.review_period}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{fmtDate(review.review_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[review.status]}`}>{STATUS_LABEL[review.status]}</span>
          {avg !== null && <span className={`text-sm font-bold ${SCORE_COLOUR[Math.round(avg)]}`}>{avg}/5</span>}
        </div>
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PerformanceReviewPage() {
  const { profile } = useAuth()
  const isAdmin      = ADMIN_ROLES.includes(profile?.role ?? '')
  const isSupervisor = SUPERVISOR_ROLES.includes(profile?.role ?? '')
  const isEmployeeOnly = !isSupervisor

  const [reviews,    setReviews]    = useState<Review[]>([])
  const [employees,  setEmployees]  = useState<Employee[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [editReview, setEditReview] = useState<Review | null>(null)
  const [viewReview, setViewReview] = useState<Review | null>(null)
  const [filterType,   setFilterType]   = useState<ReviewType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | 'all'>('all')
  const [searchText,   setSearchText]   = useState('')

  const loadAll = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const [{ data: revData }, { data: empData }] = await Promise.all([
      supabase.from('performance_reviews').select(SELECT_FIELDS).order('review_date', { ascending: false }),
      isAdmin || profile.role === 'manager'
        ? supabase.from('profiles').select('id, first_name, surname, employee_code').eq('status', 'active').order('surname')
        : isSupervisor
          ? supabase.from('profiles').select('id, first_name, surname, employee_code').eq('supervisor_id', profile.id).eq('status', 'active').order('surname')
          : Promise.resolve({ data: [] }),
    ])
    setReviews((revData as unknown as Review[]) ?? [])
    setEmployees((empData as Employee[]) ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Workflow ────────────────────────────────────────────────────────────

  async function handleSubmitReview(review: Review) {
    const { data: reviewerProfile } = await supabase
      .from('profiles').select('id, supervisor_id, role').eq('id', review.reviewer_id!).maybeSingle()

    let secondaryApproverId: string | null = null
    if (reviewerProfile?.supervisor_id) {
      const { data: sup } = await supabase.from('profiles').select('id, role').eq('id', reviewerProfile.supervisor_id).maybeSingle()
      if (sup && SUPERVISOR_ROLES.includes(sup.role)) secondaryApproverId = sup.id
    }

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin_manager').eq('status', 'active').limit(1)
    const finalApproverId = admins?.[0]?.id ?? null
    if (!secondaryApproverId) secondaryApproverId = finalApproverId

    const skipSecondary = secondaryApproverId === finalApproverId
    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      status: skipSecondary ? 'final_approved' : 'submitted',
      secondary_approver_id: secondaryApproverId,
      final_approver_id: finalApproverId,
      supervisor_id: reviewerProfile?.supervisor_id ?? null,
    }
    if (skipSecondary) {
      update.secondary_approved_at = now
      update.secondary_approval_comments = 'Auto-approved — secondary and final approver are the same'
      update.final_approved_at = now
      update.final_approval_comments = 'Auto-approved — reviewer has no separate secondary approver'
    }
    await supabase.from('performance_reviews').update(update).eq('id', review.id)
    await loadAll(); setViewReview(null)
  }

  async function handleApproveSecondary(review: Review, comments: string) {
    await supabase.from('performance_reviews').update({ status: 'secondary_approved', secondary_approved_at: new Date().toISOString(), secondary_approval_comments: comments || null }).eq('id', review.id)
    await loadAll(); setViewReview(null)
  }

  async function handleReturnFrom(review: Review, comments: string) {
    await supabase.from('performance_reviews').update({ status: 'returned', returned_by: profile?.id, returned_at: new Date().toISOString(), returned_comments: comments }).eq('id', review.id)
    await loadAll(); setViewReview(null)
  }

  async function handleApproveFinal(review: Review, comments: string) {
    await supabase.from('performance_reviews').update({ status: 'final_approved', final_approved_at: new Date().toISOString(), final_approval_comments: comments || null }).eq('id', review.id)
    await loadAll(); setViewReview(null)
  }

  async function handleAcknowledge(review: Review, comments: string) {
    await supabase.from('performance_reviews').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledgement_comments: comments || null }).eq('id', review.id)
    await loadAll(); setViewReview(null)
  }

  async function handleDelete(review: Review) {
    await supabase.from('performance_reviews').delete().eq('id', review.id)
    await loadAll(); setViewReview(null)
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let r = reviews
    if (filterType !== 'all') r = r.filter(x => x.review_type === filterType)
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

  const pendingMyAction = useMemo(() => reviews.filter(r =>
    (r.secondary_approver_id === profile?.id && r.status === 'submitted') ||
    (r.final_approver_id === profile?.id && r.status === 'secondary_approved')
  ).length, [reviews, profile?.id])

  const stats = useMemo(() => ({
    total:    reviews.length,
    draft:    reviews.filter(r => r.status === 'draft').length,
    pending:  reviews.filter(r => ['submitted', 'secondary_approved'].includes(r.status)).length,
    returned: reviews.filter(r => r.status === 'returned').length,
    approved: reviews.filter(r => ['final_approved', 'acknowledged'].includes(r.status)).length,
  }), [reviews])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Performance Reviews</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {isEmployeeOnly
              ? 'Your performance reviews — visible once final approval is complete.'
              : 'Create and manage employee performance reviews.'}
          </p>
        </div>
        {isSupervisor && employees.length > 0 && (
          <button onClick={() => { setEditReview(null); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8a] flex-shrink-0">
            <IconPlus className="w-4 h-4" /> New Review
          </button>
        )}
      </div>

      {pendingMyAction > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            You have <strong>{pendingMyAction}</strong> performance review{pendingMyAction > 1 ? 's' : ''} awaiting your approval.
          </p>
        </div>
      )}

      {!isEmployeeOnly && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { l: 'Total',    v: stats.total,    c: 'text-[var(--text-primary)]' },
            { l: 'Draft',    v: stats.draft,    c: 'text-[var(--text-muted)]' },
            { l: 'Pending',  v: stats.pending,  c: 'text-blue-600' },
            { l: 'Returned', v: stats.returned, c: 'text-amber-600' },
            { l: 'Approved', v: stats.approved, c: 'text-green-600' },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{l}</p>
              <p className={`text-3xl font-bold mt-1 ${c}`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {!isEmployeeOnly && (
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Search employee or period…"
            className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30" />
          <select value={filterType} onChange={e => setFilterType(e.target.value as ReviewType | 'all')}
            className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30">
            <option value="all">All types</option>
            {(Object.entries(REVIEW_TYPE_LABEL) as [ReviewType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ReviewStatus | 'all')}
            className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30">
            <option value="all">All statuses</option>
            {(Object.entries(STATUS_LABEL) as [ReviewStatus, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-[var(--text-muted)] text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-10 text-center">
          <IconClipboardList className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            {isEmployeeOnly ? 'No reviews available yet.' : 'No reviews match the current filters.'}
          </p>
          {isEmployeeOnly && <p className="text-xs text-[var(--text-muted)] mt-1">Reviews appear here once finally approved by management.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(r => <ReviewCard key={r.id} review={r} onClick={() => setViewReview(r)} />)}
        </div>
      )}

      {showForm && (
        <ReviewForm employees={employees} review={null} currentUserId={profile!.id}
          onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await loadAll() }} />
      )}
      {editReview && (
        <ReviewForm employees={employees} review={editReview} currentUserId={profile!.id}
          onClose={() => setEditReview(null)} onSaved={async () => { setEditReview(null); await loadAll() }} />
      )}
      {viewReview && (
        <ReviewDetail
          review={viewReview} currentUserId={profile!.id} isAdmin={isAdmin}
          onClose={() => setViewReview(null)}
          onEdit={() => { setEditReview(viewReview); setViewReview(null) }}
          onSubmit={() => handleSubmitReview(viewReview)}
          onApproveSecondary={c => handleApproveSecondary(viewReview, c)}
          onReturnFromSecondary={c => handleReturnFrom(viewReview, c)}
          onApproveFinal={c => handleApproveFinal(viewReview, c)}
          onReturnFromFinal={c => handleReturnFrom(viewReview, c)}
          onAcknowledge={c => handleAcknowledge(viewReview, c)}
          onDelete={() => handleDelete(viewReview)}
        />
      )}
    </div>
  )
}
