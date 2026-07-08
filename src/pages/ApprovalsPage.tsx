import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateDisplay, fyEndYearFor } from '../lib/dateUtils'
import { IconCheckCircle } from '../components/Icons'
import type { OTApprovalStatus, LeaveType, LeaveStatus } from '../types'

function formatTimestampDisplay(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Tab = 'ot' | 'leave' | 'final_ot' | 'final_leave' | 'denied_ot' | 'denied_leave' | 'reviews' | 'final_reviews' | 'my_ot' | 'my_leave'
type Section = 'action' | 'mine'

const MINE_TABS: Tab[] = ['my_ot', 'my_leave']

interface EmployeeSnippet {
  first_name: string
  surname: string
}

interface OTApprovalRow {
  id: string
  employee_id: string
  approver_id: string | null
  status: OTApprovalStatus
  approver_comment: string | null
  submitted_at: string
  actioned_at: string | null
  final_status?: 'pending' | 'approved' | 'denied'
  employee?: EmployeeSnippet
  timesheet_day?: {
    date: string
    overtime_hours: number | null
    overtime_reason: string | null
    timesheet_week?: { id: string; week_start: string; week_end: string } | null
  }
}

interface OTGroup {
  key: string
  employeeName: string
  weekStart: string
  weekEnd: string
  totalHours: number
  rows: OTApprovalRow[]
}

interface LeaveRequestRow {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  total_days: number
  reason: string | null
  status: LeaveStatus
  supervisor_id: string | null
  supervisor_comment: string | null
  submitted_at: string
  actioned_at: string | null
  leave_year: number | null
  final_status?: 'pending' | 'approved' | 'denied'
  employee?: EmployeeSnippet
}

export default function ApprovalsPage() {
  const { profile } = useAuth()
  const isManager =
    profile?.role === 'manager' ||
    profile?.role === 'admin_manager' ||
    profile?.role === 'system_admin'
  const isSupervisorOrAbove =
    profile?.role === 'supervisor' ||
    profile?.role === 'manager' ||
    profile?.role === 'admin_manager' ||
    profile?.role === 'system_admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const parseTab = (raw: string | null): Tab => {
    if (raw === 'leave' || raw === 'final_ot' || raw === 'final_leave' || raw === 'denied_ot' || raw === 'denied_leave' || raw === 'my_ot' || raw === 'my_leave' || raw === 'reviews' || raw === 'final_reviews') return raw
    if (raw === 'ot') return 'ot'
    // Default — employees land on their own requests; supervisors on the action queue.
    return isSupervisorOrAbove ? 'ot' : 'my_ot'
  }
  const [activeTab, setActiveTab] = useState<Tab>(parseTab(searchParams.get('tab')))
  const activeSection: Section = MINE_TABS.includes(activeTab) ? 'mine' : 'action'

  useEffect(() => {
    const t = parseTab(searchParams.get('tab'))
    if (t !== activeTab) setActiveTab(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const selectTab = (tab: Tab) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  // OT state
  const [otApprovals, setOtApprovals] = useState<OTApprovalRow[]>([])
  const [loadingOt, setLoadingOt] = useState(true)
  const [otError, setOtError] = useState<string | null>(null)
  const [otActionId, setOtActionId] = useState<string | null>(null)
  const [otDenyComment, setOtDenyComment] = useState('')
  const [otDenyId, setOtDenyId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [groupActionKey, setGroupActionKey] = useState<string | null>(null)
  const [groupDenyKey, setGroupDenyKey] = useState<string | null>(null)
  const [groupDenyComment, setGroupDenyComment] = useState('')

  // Leave state
  const [leaveApprovals, setLeaveApprovals] = useState<LeaveRequestRow[]>([])
  const [loadingLeave, setLoadingLeave] = useState(true)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [leaveActionId, setLeaveActionId] = useState<string | null>(null)
  const [leaveDenyComment, setLeaveDenyComment] = useState('')
  const [leaveDenyId, setLeaveDenyId] = useState<string | null>(null)
  // Keyed by `employeeId-leaveType-year`; populated lazily when leave queues load
  const [leaveBalanceMap, setLeaveBalanceMap] = useState<Map<string, { total: number; used: number }>>(new Map())

  // Final-approval state (manager-only second-stage queues)
  const [finalOt, setFinalOt] = useState<OTApprovalRow[]>([])
  const [finalLeave, setFinalLeave] = useState<LeaveRequestRow[]>([])
  const [loadingFinalOt, setLoadingFinalOt] = useState(false)
  const [loadingFinalLeave, setLoadingFinalLeave] = useState(false)
  const [finalActionId, setFinalActionId] = useState<string | null>(null)
  // Denied-by-supervisor queues (manager can override)
  const [deniedOt, setDeniedOt] = useState<OTApprovalRow[]>([])
  const [deniedLeave, setDeniedLeave] = useState<LeaveRequestRow[]>([])
  const [loadingDeniedOt, setLoadingDeniedOt] = useState(false)
  const [loadingDeniedLeave, setLoadingDeniedLeave] = useState(false)

  // Performance review approval queues
  type PRApprovalRow = {
    id: string
    employee_id: string
    reviewer_id: string | null
    review_type: string
    review_period: string
    review_date: string
    overall_rating: number | null
    status: string
    returned_comments: string | null
    secondary_approver_id: string | null
    final_approver_id: string | null
    submitted_at: string | null
    created_at: string
    employee: { first_name: string; surname: string; employee_code: string | null } | null
    reviewer:  { first_name: string; surname: string } | null
  }
  const [prReviews,      setPrReviews]      = useState<PRApprovalRow[]>([])
  const [prFinalReviews, setPrFinalReviews] = useState<PRApprovalRow[]>([])
  const [loadingPr,      setLoadingPr]      = useState(false)
  const [prActionId,     setPrActionId]     = useState<string | null>(null)
  const [prCommentId,    setPrCommentId]    = useState<string | null>(null)
  const [prComment,      setPrComment]      = useState('')
  const [prCommentMode,  setPrCommentMode]  = useState<'approve' | 'return' | null>(null)
  // My own OT / leave requests (visible to every role)
  const [myOt, setMyOt] = useState<OTApprovalRow[]>([])
  const [myLeave, setMyLeave] = useState<LeaveRequestRow[]>([])
  const [loadingMyOt, setLoadingMyOt] = useState(true)
  const [loadingMyLeave, setLoadingMyLeave] = useState(true)
  // Reporting tree for managers: direct reports + reports-of-reports.
  // Used to scope the Final Approval queues so a manager only sees items for
  // employees who roll up to them (not other managers' people).
  const [managerScope, setManagerScope] = useState<string[] | null>(null)

  // Build manager scope once we know who the profile is
  useEffect(() => {
    if (!profile?.id || !isManager) {
      setManagerScope(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: level1 } = await supabase
        .from('profiles')
        .select('id')
        .eq('supervisor_id', profile.id)
      const level1Ids = (level1 ?? []).map(r => r.id as string)
      let level2Ids: string[] = []
      if (level1Ids.length > 0) {
        const { data: level2 } = await supabase
          .from('profiles')
          .select('id')
          .in('supervisor_id', level1Ids)
        level2Ids = (level2 ?? []).map(r => r.id as string)
      }
      if (!cancelled) setManagerScope([...level1Ids, ...level2Ids])
    })()
    return () => { cancelled = true }
  }, [profile?.id, isManager])

  useEffect(() => {
    if (profile?.id) {
      fetchMyOt()
      fetchMyLeave()
      if (isSupervisorOrAbove) {
        fetchOtApprovals()
        fetchLeaveApprovals()
      }
      if (isManager && managerScope !== null) {
        fetchFinalOt()
        fetchFinalLeave()
        fetchDeniedOt()
        fetchDeniedLeave()
      }
      if (isSupervisorOrAbove) fetchPrReviews()
      if (isManager) fetchPrFinalReviews()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isManager, isSupervisorOrAbove, managerScope])

  async function fetchOtApprovals() {
    setLoadingOt(true)
    setOtError(null)
    try {
      // Everyone (supervisors AND managers) only sees pending items they are
      // the assigned approver for. This avoids the duplication where a
      // manager would see items still on a supervisor's desk.
      const { data, error } = await supabase
        .from('ot_approvals')
        .select('*, employee:profiles!ot_approvals_employee_id_fkey(first_name, surname), timesheet_day:timesheet_days(date, overtime_hours, overtime_reason, timesheet_week:timesheet_weeks!timesheet_week_id(id, week_start, week_end))')
        .eq('status', 'pending')
        .eq('approver_id', profile!.id)
        .neq('employee_id', profile!.id)
        .order('submitted_at', { ascending: true })
      if (error) throw error
      setOtApprovals((data as OTApprovalRow[]) ?? [])
    } catch (err) {
      setOtError('Failed to load OT approvals.')
      console.error(err)
    } finally {
      setLoadingOt(false)
    }
  }

  async function fetchMyOt() {
    if (!profile?.id) return
    setLoadingMyOt(true)
    try {
      const { data, error } = await supabase
        .from('ot_approvals')
        .select('*, employee:profiles!ot_approvals_employee_id_fkey(first_name, surname), timesheet_day:timesheet_days(date, overtime_hours, overtime_reason, timesheet_week:timesheet_weeks!timesheet_week_id(id, week_start, week_end))')
        .eq('employee_id', profile.id)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      setMyOt((data as OTApprovalRow[]) ?? [])
    } catch (err) {
      console.error('fetchMyOt failed', err)
    } finally {
      setLoadingMyOt(false)
    }
  }

  async function fetchMyLeave() {
    if (!profile?.id) return
    setLoadingMyLeave(true)
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, employee:profiles!leave_requests_employee_id_fkey(first_name, surname)')
        .eq('employee_id', profile.id)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      setMyLeave((data as LeaveRequestRow[]) ?? [])
    } catch (err) {
      console.error('fetchMyLeave failed', err)
    } finally {
      setLoadingMyLeave(false)
    }
  }

  async function fetchLeaveApprovals() {
    setLoadingLeave(true)
    setLeaveError(null)
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, employee:profiles!leave_requests_employee_id_fkey(first_name, surname)')
        .eq('status', 'pending')
        .eq('supervisor_id', profile!.id)
        .neq('employee_id', profile!.id)
        .order('submitted_at', { ascending: true })
      if (error) throw error
      const pendingLeave = (data as LeaveRequestRow[]) ?? []
      setLeaveApprovals(pendingLeave)
      fetchLeaveBalancesForApprovals(pendingLeave)
    } catch (err) {
      setLeaveError('Failed to load leave approvals.')
      console.error(err)
    } finally {
      setLoadingLeave(false)
    }
  }

  // Fetches leave_balances for every employee in `reqs` and merges into leaveBalanceMap.
  async function fetchLeaveBalancesForApprovals(reqs: LeaveRequestRow[]) {
    if (!reqs.length) return
    const empIds = [...new Set(reqs.map(r => r.employee_id))]
    const { data } = await supabase
      .from('leave_balances')
      .select('employee_id, leave_type, year, total_days, used_days')
      .in('employee_id', empIds)
    if (!data) return
    setLeaveBalanceMap(prev => {
      const next = new Map(prev)
      for (const b of data as { employee_id: string; leave_type: string; year: number; total_days: number; used_days: number }[]) {
        next.set(`${b.employee_id}-${b.leave_type}-${b.year}`, { total: b.total_days, used: b.used_days })
      }
      return next
    })
  }

  async function fetchFinalOt() {
    setLoadingFinalOt(true)
    try {
      // Empty scope -> nothing to show (manager has no reports yet)
      if (!managerScope || managerScope.length === 0) {
        setFinalOt([])
        return
      }
      const { data, error } = await supabase
        .from('ot_approvals')
        .select('*, employee:profiles!ot_approvals_employee_id_fkey(first_name, surname), timesheet_day:timesheet_days(date, overtime_hours, overtime_reason, timesheet_week:timesheet_weeks!timesheet_week_id(id, week_start, week_end))')
        .eq('status', 'approved')
        .eq('final_status', 'pending')
        .in('employee_id', managerScope)
        .neq('employee_id', profile!.id)
        .order('actioned_at', { ascending: true })
      if (error) throw error
      setFinalOt((data as OTApprovalRow[]) ?? [])
    } catch (err) {
      console.error('Failed to load final OT queue:', err)
    } finally {
      setLoadingFinalOt(false)
    }
  }

  async function fetchFinalLeave() {
    setLoadingFinalLeave(true)
    try {
      if (!managerScope || managerScope.length === 0) {
        setFinalLeave([])
        return
      }
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, employee:profiles!leave_requests_employee_id_fkey(first_name, surname)')
        .eq('status', 'approved')
        .eq('final_status', 'pending')
        .in('employee_id', managerScope)
        .neq('employee_id', profile!.id)
        .order('actioned_at', { ascending: true })
      if (error) throw error
      const finalLv = (data as LeaveRequestRow[]) ?? []
      setFinalLeave(finalLv)
      fetchLeaveBalancesForApprovals(finalLv)
    } catch (err) {
      console.error('Failed to load final leave queue:', err)
    } finally {
      setLoadingFinalLeave(false)
    }
  }

  async function finaliseOt(id: string, decision: 'approved' | 'denied', comment?: string) {
    setFinalActionId(id)
    try {
      const { error } = await supabase
        .from('ot_approvals')
        .update({
          final_status: decision,
          final_approver_id: profile!.id,
          final_actioned_at: new Date().toISOString(),
          final_comment: comment?.trim() || null,
        })
        .eq('id', id)
      if (error) throw error
      setFinalOt(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Failed to finalise OT:', err)
    } finally {
      setFinalActionId(null)
    }
  }

  async function finaliseLeave(id: string, decision: 'approved' | 'denied', comment?: string) {
    setFinalActionId(id)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          final_status: decision,
          final_approver_id: profile!.id,
          final_actioned_at: new Date().toISOString(),
          final_comment: comment?.trim() || null,
        })
        .eq('id', id)
      if (error) throw error
      setFinalLeave(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Failed to finalise leave:', err)
    } finally {
      setFinalActionId(null)
    }
  }

  async function fetchDeniedOt() {
    setLoadingDeniedOt(true)
    try {
      if (!managerScope || managerScope.length === 0) { setDeniedOt([]); return }
      const { data, error } = await supabase
        .from('ot_approvals')
        .select('*, employee:profiles!ot_approvals_employee_id_fkey(first_name, surname), timesheet_day:timesheet_days(date, overtime_hours, overtime_reason, timesheet_week:timesheet_weeks!timesheet_week_id(id, week_start, week_end))')
        .eq('status', 'denied')
        .in('employee_id', managerScope)
        .neq('employee_id', profile!.id)
        .order('actioned_at', { ascending: false })
      if (error) throw error
      setDeniedOt((data as OTApprovalRow[]) ?? [])
    } catch (err) {
      console.error('Failed to load denied OT queue:', err)
    } finally {
      setLoadingDeniedOt(false)
    }
  }

  async function fetchDeniedLeave() {
    setLoadingDeniedLeave(true)
    try {
      if (!managerScope || managerScope.length === 0) { setDeniedLeave([]); return }
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, employee:profiles!leave_requests_employee_id_fkey(first_name, surname)')
        .eq('status', 'denied')
        .in('employee_id', managerScope)
        .neq('employee_id', profile!.id)
        .order('actioned_at', { ascending: false })
      if (error) throw error
      const deniedLv = (data as LeaveRequestRow[]) ?? []
      setDeniedLeave(deniedLv)
      fetchLeaveBalancesForApprovals(deniedLv)
    } catch (err) {
      console.error('Failed to load denied leave queue:', err)
    } finally {
      setLoadingDeniedLeave(false)
    }
  }

  async function overrideDeniedOt(id: string) {
    setFinalActionId(id)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('ot_approvals')
        .update({
          status: 'approved',
          actioned_at: now,
          final_status: 'approved',
          final_approver_id: profile!.id,
          final_actioned_at: now,
          final_comment: 'Manager override of supervisor denial',
        })
        .eq('id', id)
      if (error) throw error
      setDeniedOt(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Failed to override OT denial:', err)
    } finally {
      setFinalActionId(null)
    }
  }

  async function overrideDeniedLeave(id: string) {
    setFinalActionId(id)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'approved',
          actioned_at: now,
          final_status: 'approved',
          final_approver_id: profile!.id,
          final_actioned_at: now,
          final_comment: 'Manager override of supervisor denial',
        })
        .eq('id', id)
      if (error) throw error
      setDeniedLeave(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Failed to override leave denial:', err)
    } finally {
      setFinalActionId(null)
    }
  }

  // ── Performance Review approval fetches & actions ─────────────────────────

  async function fetchPrReviews() {
    if (!profile?.id) return
    setLoadingPr(true)
    try {
      const { data } = await supabase
        .from('performance_reviews')
        .select(`id, employee_id, reviewer_id, review_type, review_period, review_date, overall_rating,
          status, returned_comments, secondary_approver_id, final_approver_id, created_at,
          employee:profiles!performance_reviews_employee_id_fkey(first_name, surname, employee_code),
          reviewer:profiles!performance_reviews_reviewer_id_fkey(first_name, surname)`)
        .eq('secondary_approver_id', profile.id)
        .eq('status', 'submitted')
        .order('created_at', { ascending: true })
      setPrReviews((data as unknown as typeof prReviews) ?? [])
    } catch (err) { console.error('Failed to load PR approvals:', err) }
    finally { setLoadingPr(false) }
  }

  async function fetchPrFinalReviews() {
    if (!profile?.id) return
    try {
      const { data } = await supabase
        .from('performance_reviews')
        .select(`id, employee_id, reviewer_id, review_type, review_period, review_date, overall_rating,
          status, returned_comments, secondary_approver_id, final_approver_id, created_at,
          employee:profiles!performance_reviews_employee_id_fkey(first_name, surname, employee_code),
          reviewer:profiles!performance_reviews_reviewer_id_fkey(first_name, surname)`)
        .eq('final_approver_id', profile.id)
        .eq('status', 'secondary_approved')
        .order('created_at', { ascending: true })
      setPrFinalReviews((data as unknown as typeof prFinalReviews) ?? [])
    } catch (err) { console.error('Failed to load final PR approvals:', err) }
  }

  async function approvePrSecondary(id: string, comments: string) {
    setPrActionId(id)
    const { error } = await supabase.from('performance_reviews')
      .update({ status: 'secondary_approved', secondary_approved_at: new Date().toISOString(), secondary_approval_comments: comments || null })
      .eq('id', id)
    setPrActionId(null)
    if (!error) { setPrReviews(prev => prev.filter(r => r.id !== id)); setPrCommentId(null); setPrComment('') }
  }

  async function returnPrReview(id: string, comments: string, fromFinal = false) {
    setPrActionId(id)
    const { error } = await supabase.from('performance_reviews')
      .update({ status: 'returned', returned_by: profile?.id, returned_at: new Date().toISOString(), returned_comments: comments })
      .eq('id', id)
    setPrActionId(null)
    if (!error) {
      if (fromFinal) setPrFinalReviews(prev => prev.filter(r => r.id !== id))
      else setPrReviews(prev => prev.filter(r => r.id !== id))
      setPrCommentId(null); setPrComment('')
    }
  }

  async function approvePrFinal(id: string, comments: string) {
    setPrActionId(id)
    const { error } = await supabase.from('performance_reviews')
      .update({ status: 'final_approved', final_approved_at: new Date().toISOString(), final_approval_comments: comments || null })
      .eq('id', id)
    setPrActionId(null)
    if (!error) { setPrFinalReviews(prev => prev.filter(r => r.id !== id)); setPrCommentId(null); setPrComment('') }
  }

  async function approveOt(approvalId: string) {
    setOtActionId(approvalId)
    try {
      const now = new Date().toISOString()
      // When a manager is the stage-1 approver (direct report), auto-finalise
      // so the item doesn't bounce into their own Final queue.
      const update: Record<string, unknown> = { status: 'approved', actioned_at: now }
      if (isManager) {
        update.final_status = 'approved'
        update.final_approver_id = profile!.id
        update.final_actioned_at = now
      }
      const { error } = await supabase
        .from('ot_approvals')
        .update(update)
        .eq('id', approvalId)
      if (error) throw error
      setOtApprovals(prev => prev.filter(a => a.id !== approvalId))
    } catch (err) {
      console.error('Failed to approve OT:', err)
    } finally {
      setOtActionId(null)
    }
  }

  async function denyOt(approvalId: string) {
    setOtActionId(approvalId)
    try {
      const { error } = await supabase
        .from('ot_approvals')
        .update({
          status: 'denied',
          approver_comment: otDenyComment.trim() || null,
          actioned_at: new Date().toISOString(),
        })
        .eq('id', approvalId)
      if (error) throw error
      setOtApprovals(prev => prev.filter(a => a.id !== approvalId))
      setOtDenyId(null)
      setOtDenyComment('')
    } catch (err) {
      console.error('Failed to deny OT:', err)
    } finally {
      setOtActionId(null)
    }
  }

  async function approveOtBulk(ids: string[], key: string) {
    if (ids.length === 0) return
    setGroupActionKey(key)
    try {
      const now = new Date().toISOString()
      const update: Record<string, unknown> = { status: 'approved', actioned_at: now }
      if (isManager) {
        update.final_status = 'approved'
        update.final_approver_id = profile!.id
        update.final_actioned_at = now
      }
      const { error } = await supabase
        .from('ot_approvals')
        .update(update)
        .in('id', ids)
      if (error) throw error
      setOtApprovals(prev => prev.filter(a => !ids.includes(a.id)))
    } catch (err) {
      console.error('Failed to approve OT week:', err)
    } finally {
      setGroupActionKey(null)
    }
  }

  async function denyOtBulk(ids: string[], key: string) {
    if (ids.length === 0) return
    setGroupActionKey(key)
    try {
      const { error } = await supabase
        .from('ot_approvals')
        .update({
          status: 'denied',
          approver_comment: groupDenyComment.trim() || null,
          actioned_at: new Date().toISOString(),
        })
        .in('id', ids)
      if (error) throw error
      setOtApprovals(prev => prev.filter(a => !ids.includes(a.id)))
      setGroupDenyKey(null)
      setGroupDenyComment('')
    } catch (err) {
      console.error('Failed to deny OT week:', err)
    } finally {
      setGroupActionKey(null)
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function approveLeave(requestId: string) {
    setLeaveActionId(requestId)
    try {
      const now = new Date().toISOString()
      const update: Record<string, unknown> = { status: 'approved', actioned_at: now }
      if (isManager) {
        update.final_status = 'approved'
        update.final_approver_id = profile!.id
        update.final_actioned_at = now
      }
      const { error } = await supabase
        .from('leave_requests')
        .update(update)
        .eq('id', requestId)
      if (error) throw error
      setLeaveApprovals(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      console.error('Failed to approve leave:', err)
    } finally {
      setLeaveActionId(null)
    }
  }

  async function denyLeave(requestId: string) {
    setLeaveActionId(requestId)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'denied',
          supervisor_comment: leaveDenyComment.trim() || null,
          actioned_at: new Date().toISOString(),
        })
        .eq('id', requestId)
      if (error) throw error
      setLeaveApprovals(prev => prev.filter(r => r.id !== requestId))
      setLeaveDenyId(null)
      setLeaveDenyComment('')
    } catch (err) {
      console.error('Failed to deny leave:', err)
    } finally {
      setLeaveActionId(null)
    }
  }

  // Inline balance context pill shown on every leave card in the approval queues.
  function getBalancePill(req: LeaveRequestRow) {
    const d = new Date(req.start_date + 'T00:00:00')
    const year = req.leave_year ?? (d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear())
    const bal = leaveBalanceMap.get(`${req.employee_id}-${req.leave_type}-${year}`)
    const defaults: Record<string, number> = { annual: 15, sick: 30, family: 3, study: 0 }
    const entitlement = bal?.total ?? defaults[req.leave_type] ?? 0
    if (entitlement === 0) return null
    const available = Math.max(0, entitlement - (bal?.used ?? 0))
    const willExceed = req.total_days > available
    const isLow = available > 0 && available <= 3 && available < entitlement
    return (
      <p className={`text-xs mt-1.5 ${
        willExceed ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-[var(--text-muted)]'
      }`}>
        {(willExceed || isLow) ? '\u26a0 ' : ''}
        Balance: <strong>{available}</strong> / {entitlement} days remaining
        {willExceed && <span className="font-medium"> — exceeds entitlement</span>}
        {!willExceed && isLow && <span className="font-medium"> — low</span>}
      </p>
    )
  }

  const otCount = otApprovals.length
  const leaveCount = leaveApprovals.length
  const finalOtCount = finalOt.length
  const finalLeaveCount = finalLeave.length
  const deniedOtCount = deniedOt.length
  const deniedLeaveCount  = deniedLeave.length
  const prReviewCount      = prReviews.length
  const prFinalReviewCount = prFinalReviews.length
  const totalActionCount = otCount + leaveCount + finalOtCount + finalLeaveCount + deniedOtCount + deniedLeaveCount + prReviewCount + prFinalReviewCount
  const myOtPendingCount = myOt.filter(r => r.status === 'pending').length
  const myLeavePendingCount = myLeave.filter(r => r.status === 'pending').length
  const totalMineCount = myOtPendingCount + myLeavePendingCount

  // Group pending OT approvals by employee + week
  const otGroups: OTGroup[] = (() => {
    const map = new Map<string, OTGroup>()
    for (const row of otApprovals) {
      const week = row.timesheet_day?.timesheet_week
      const weekId = week?.id ?? `noweek-${row.id}`
      const key = `${row.employee_id}|${weekId}`
      const employeeName = `${row.employee?.first_name ?? ''} ${row.employee?.surname ?? ''}`.trim() || 'Employee'
      const existing = map.get(key)
      if (existing) {
        existing.rows.push(row)
        existing.totalHours += row.timesheet_day?.overtime_hours ?? 0
      } else {
        map.set(key, {
          key,
          employeeName,
          weekStart: week?.week_start ?? row.timesheet_day?.date ?? '',
          weekEnd: week?.week_end ?? row.timesheet_day?.date ?? '',
          totalHours: row.timesheet_day?.overtime_hours ?? 0,
          rows: [row],
        })
      }
    }
    // Sort each group's rows by date asc; sort groups by week_start asc then name
    const groups = Array.from(map.values())
    groups.forEach(g => g.rows.sort((a, b) => (a.timesheet_day?.date ?? '').localeCompare(b.timesheet_day?.date ?? '')))
    groups.sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.employeeName.localeCompare(b.employeeName))
    return groups
  })()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Approvals</h1>
        <p className="text-[var(--text-muted)] text-sm mt-0.5">Review and action pending requests</p>
      </div>

      {/* Section toggle — visible to supervisors and above; employees only see "My requests" */}
      {isSupervisorOrAbove && (
        <div className="flex gap-1 mb-4 bg-[var(--surface-secondary)] rounded-lg p-1 w-fit">
          <button
            onClick={() => selectTab('ot')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSection === 'action'
                ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
            }`}
          >
            To action
            {totalActionCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {totalActionCount}
              </span>
            )}
          </button>
          <button
            onClick={() => selectTab('my_ot')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSection === 'mine'
                ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
            }`}
          >
            My requests
            {totalMineCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {totalMineCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Tabs */}
      {activeSection === 'action' && isSupervisorOrAbove && (
      <div className="flex gap-1 mb-6 bg-[var(--surface-secondary)] rounded-lg p-1 w-fit flex-wrap">
        <button
          onClick={() => selectTab('ot')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'ot'
              ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
              : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
          }`}
        >
          OT Approvals
          {otCount > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {otCount}
            </span>
          )}
        </button>
        <button
          onClick={() => selectTab('leave')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'leave'
              ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
              : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
          }`}
        >
          Leave Approvals
          {leaveCount > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {leaveCount}
            </span>
          )}
        </button>
        {isManager && (
          <>
            <button
              onClick={() => selectTab('final_ot')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'final_ot'
                  ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                  : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
              }`}
            >
              Final OT Approval
              {finalOtCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {finalOtCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectTab('final_leave')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'final_leave'
                  ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                  : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
              }`}
            >
              Final Leave Approval
              {finalLeaveCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {finalLeaveCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectTab('denied_ot')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'denied_ot'
                  ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                  : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
              }`}
            >
              Denied OT
              {deniedOtCount > 0 && (
                <span className="ml-1.5 bg-gray-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {deniedOtCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectTab('denied_leave')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'denied_leave'
                  ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                  : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
              }`}
            >
              Denied Leave
              {deniedLeaveCount > 0 && (
                <span className="ml-1.5 bg-gray-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {deniedLeaveCount}
                </span>
              )}
            </button>
            {/* Performance Review approval tabs */}
            <button
              onClick={() => selectTab('reviews')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'reviews'
                  ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                  : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
              }`}
            >
              Reviews
              {prReviewCount > 0 && (
                <span className="ml-1.5 bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {prReviewCount}
                </span>
              )}
            </button>
            <button
              onClick={() => selectTab('final_reviews')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'final_reviews'
                  ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
                  : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
              }`}
            >
              Final Reviews
              {prFinalReviewCount > 0 && (
                <span className="ml-1.5 bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {prFinalReviewCount}
                </span>
              )}
            </button>
          </>
        )}
      </div>
      )}

      {activeSection === 'mine' && (
      <div className="flex gap-1 mb-6 bg-[var(--surface-secondary)] rounded-lg p-1 w-fit flex-wrap">
        <button
          onClick={() => selectTab('my_ot')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'my_ot'
              ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
              : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
          }`}
        >
          My OT
          {myOtPendingCount > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {myOtPendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => selectTab('my_leave')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'my_leave'
              ? 'bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm'
              : 'text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
          }`}
        >
          My Leave
          {myLeavePendingCount > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {myLeavePendingCount}
            </span>
          )}
        </button>
      </div>
      )}

      {/* OT Approvals Tab */}
      {activeTab === 'ot' && (
        <div>
          {loadingOt ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : otError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{otError}</p>
            </div>
          ) : otApprovals.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No pending OT approvals</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {otGroups.map(group => {
                const isExpanded = expandedGroups.has(group.key)
                const ids = group.rows.map(r => r.id)
                const isBusy = groupActionKey === group.key
                return (
                  <div key={group.key} className="bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                    {/* Group header */}
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{group.employeeName}</p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          Week: {formatDateDisplay(group.weekStart)} – {formatDateDisplay(group.weekEnd)}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {group.rows.length} day{group.rows.length !== 1 ? 's' : ''} · Total OT: <strong>{group.totalHours}</strong> hr{group.totalHours !== 1 ? 's' : ''}
                        </p>
                        <button
                          onClick={() => toggleGroup(group.key)}
                          className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {isExpanded ? 'Hide days' : 'Show days'}
                        </button>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => approveOtBulk(ids, group.key)}
                          disabled={isBusy}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {isBusy ? '…' : 'Approve week'}
                        </button>
                        <button
                          onClick={() => setGroupDenyKey(group.key)}
                          disabled={isBusy}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          Deny week
                        </button>
                      </div>
                    </div>

                    {/* Week deny form */}
                    {groupDenyKey === group.key && (
                      <div className="px-4 pb-4 -mt-2 border-t border-[var(--border)] pt-3">
                        <textarea
                          value={groupDenyComment}
                          onChange={e => setGroupDenyComment(e.target.value)}
                          rows={2}
                          placeholder="Reason for denying the whole week (optional)"
                          className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setGroupDenyKey(null); setGroupDenyComment('') }}
                            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => denyOtBulk(ids, group.key)}
                            disabled={isBusy}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirm Deny Week
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Per-day breakdown */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                        {group.rows.map(approval => (
                          <div key={approval.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {approval.timesheet_day?.date && (
                                  <p className="text-sm text-[var(--text-primary)]">
                                    {formatDateDisplay(approval.timesheet_day.date)}
                                    {approval.timesheet_day.overtime_hours != null && (
                                      <span className="ml-2 text-[var(--text-secondary)]">
                                        · <strong>{approval.timesheet_day.overtime_hours}</strong> hr{approval.timesheet_day.overtime_hours !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </p>
                                )}
                                {approval.timesheet_day?.overtime_reason ? (
                                  <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">
                                    <span className="text-[var(--text-muted)]">Reason: </span>{approval.timesheet_day.overtime_reason}
                                  </p>
                                ) : (
                                  <p className="text-xs text-[var(--text-muted)] italic mt-1">No reason provided</p>
                                )}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => approveOt(approval.id)}
                                  disabled={otActionId === approval.id || isBusy}
                                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                                >
                                  {otActionId === approval.id ? '…' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => setOtDenyId(approval.id)}
                                  disabled={otActionId === approval.id || isBusy}
                                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                  Deny
                                </button>
                              </div>
                            </div>

                            {/* Per-day deny form */}
                            {otDenyId === approval.id && (
                              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                <textarea
                                  value={otDenyComment}
                                  onChange={e => setOtDenyComment(e.target.value)}
                                  rows={2}
                                  placeholder="Reason for denial (optional)"
                                  className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => { setOtDenyId(null); setOtDenyComment('') }}
                                    className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => denyOt(approval.id)}
                                    disabled={otActionId === approval.id}
                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                  >
                                    Confirm Deny
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Leave Approvals Tab */}
      {activeTab === 'leave' && (
        <div>
          {loadingLeave ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : leaveError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{leaveError}</p>
            </div>
          ) : leaveApprovals.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No pending leave approvals</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaveApprovals.map(req => (
                <div
                  key={req.id}
                  className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {req.employee?.first_name} {req.employee?.surname}
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                          {req.leave_type.replace('_', ' ')} Leave
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                        <span className="ml-2 text-[var(--text-muted)]">
                          ({req.total_days} day{req.total_days !== 1 ? 's' : ''})
                        </span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">{req.reason}</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Submitted: {formatTimestampDisplay(req.submitted_at)}
                      </p>
                      {getBalancePill(req)}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveLeave(req.id)}
                        disabled={leaveActionId === req.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {leaveActionId === req.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setLeaveDenyId(req.id)}
                        disabled={leaveActionId === req.id}
                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        Deny
                      </button>
                    </div>
                  </div>

                  {/* Deny form */}
                  {leaveDenyId === req.id && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <textarea
                        value={leaveDenyComment}
                        onChange={e => setLeaveDenyComment(e.target.value)}
                        rows={2}
                        placeholder="Reason for denial (optional)"
                        className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setLeaveDenyId(null); setLeaveDenyComment('') }}
                          className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => denyLeave(req.id)}
                          disabled={leaveActionId === req.id}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm Deny
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Final OT Approval Tab (manager only) */}
      {activeTab === 'final_ot' && isManager && (
        <div>
          {loadingFinalOt ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : finalOt.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No OT awaiting final approval</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Items supervisors approve appear here for your sign-off.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {finalOt.map(row => {
                const employeeName = `${row.employee?.first_name ?? ''} ${row.employee?.surname ?? ''}`.trim() || 'Employee'
                const day = row.timesheet_day
                const week = day?.timesheet_week
                return (
                  <div key={row.id} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{employeeName}</p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          {day?.date ? formatDateDisplay(day.date) : '—'}
                          {day?.overtime_hours != null && (
                            <span className="ml-2">· <strong>{day.overtime_hours}</strong> hr{day.overtime_hours !== 1 ? 's' : ''}</span>
                          )}
                        </p>
                        {week && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">Week {formatDateDisplay(week.week_start)} – {formatDateDisplay(week.week_end)}</p>
                        )}
                        {day?.overtime_reason && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Reason: </span>{day.overtime_reason}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Supervisor approved: {formatTimestampDisplay(row.actioned_at)}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => finaliseOt(row.id, 'approved')}
                          disabled={finalActionId === row.id}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {finalActionId === row.id ? '…' : 'Final approve'}
                        </button>
                        <button
                          onClick={() => finaliseOt(row.id, 'denied')}
                          disabled={finalActionId === row.id}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Final Leave Approval Tab (manager only) */}
      {activeTab === 'final_leave' && isManager && (
        <div>
          {loadingFinalLeave ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : finalLeave.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No leave awaiting final approval</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Items supervisors approve appear here for your sign-off.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {finalLeave.map(req => (
                <div key={req.id} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {req.employee?.first_name} {req.employee?.surname}
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                          {req.leave_type.replace('_', ' ')} Leave
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                        <span className="ml-2 text-[var(--text-muted)]">
                          ({req.total_days} day{req.total_days !== 1 ? 's' : ''})
                        </span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">{req.reason}</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Supervisor approved: {formatTimestampDisplay(req.actioned_at)}
                      </p>
                      {getBalancePill(req)}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => finaliseLeave(req.id, 'approved')}
                        disabled={finalActionId === req.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {finalActionId === req.id ? '…' : 'Final approve'}
                      </button>
                      <button
                        onClick={() => finaliseLeave(req.id, 'denied')}
                        disabled={finalActionId === req.id}
                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Denied OT Tab (manager only) — override supervisor denials */}
      {activeTab === 'denied_ot' && isManager && (
        <div>
          {loadingDeniedOt ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : deniedOt.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No denied OT in your team</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Items a supervisor declines appear here so you can override.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deniedOt.map(row => {
                const employeeName = `${row.employee?.first_name ?? ''} ${row.employee?.surname ?? ''}`.trim() || 'Employee'
                const day = row.timesheet_day
                const week = day?.timesheet_week
                return (
                  <div key={row.id} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{employeeName}</p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          {day?.date ? formatDateDisplay(day.date) : '—'}
                          {day?.overtime_hours != null && (
                            <span className="ml-2">· <strong>{day.overtime_hours}</strong> hr{day.overtime_hours !== 1 ? 's' : ''}</span>
                          )}
                        </p>
                        {week && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">Week {formatDateDisplay(week.week_start)} – {formatDateDisplay(week.week_end)}</p>
                        )}
                        {day?.overtime_reason && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Reason: </span>{day.overtime_reason}
                          </p>
                        )}
                        {row.approver_comment && (
                          <p className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Supervisor denial: </span>{row.approver_comment}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Denied: {formatTimestampDisplay(row.actioned_at)}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => overrideDeniedOt(row.id)}
                          disabled={finalActionId === row.id}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {finalActionId === row.id ? '…' : 'Override → Approve'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Denied Leave Tab (manager only) — override supervisor denials */}
      {activeTab === 'denied_leave' && isManager && (
        <div>
          {loadingDeniedLeave ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : deniedLeave.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No denied leave in your team</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Items a supervisor declines appear here so you can override.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deniedLeave.map(req => (
                <div key={req.id} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {req.employee?.first_name} {req.employee?.surname}
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                          {req.leave_type.replace('_', ' ')} Leave
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                        <span className="ml-2 text-[var(--text-muted)]">
                          ({req.total_days} day{req.total_days !== 1 ? 's' : ''})
                        </span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">{req.reason}</p>
                      )}
                      {req.supervisor_comment && (
                        <p className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                          <span className="text-[var(--text-muted)]">Supervisor denial: </span>{req.supervisor_comment}
                        </p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Denied: {formatTimestampDisplay(req.actioned_at)}
                      </p>
                      {getBalancePill(req)}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => overrideDeniedLeave(req.id)}
                        disabled={finalActionId === req.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {finalActionId === req.id ? '…' : 'Override → Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Performance Reviews — Secondary Approval Tab */}
      {activeTab === 'reviews' && (
        <div>
          {loadingPr ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : prReviews.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-[var(--text-muted)] mx-auto" />
              <p className="mt-3 text-[var(--text-primary)] font-medium">No performance reviews pending</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prReviews.map(r => {
                const emp = r.employee; const rvr = r.reviewer
                const isBusy = prActionId === r.id
                const isReturning = prCommentId === r.id && prCommentMode === 'return'
                const isApproving = prCommentId === r.id && prCommentMode === 'approve'
                return (
                  <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {emp?.first_name} {emp?.surname}
                          {emp?.employee_code && <span className="text-[var(--text-muted)] ml-1 text-xs">{emp.employee_code}</span>}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          {r.review_type.charAt(0).toUpperCase() + r.review_type.slice(1)} · {r.review_period}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Reviewed by {rvr ? `${rvr.first_name} ${rvr.surname}` : '—'}
                        </p>
                        {r.overall_rating !== null && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">Overall rating: {r.overall_rating}/5</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setPrCommentId(r.id); setPrCommentMode('approve'); setPrComment('') }} disabled={isBusy}
                          className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                          Approve
                        </button>
                        <button onClick={() => { setPrCommentId(r.id); setPrCommentMode('return'); setPrComment('') }} disabled={isBusy}
                          className="px-3 py-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                          Return
                        </button>
                      </div>
                    </div>
                    {(isApproving || isReturning) && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        <textarea value={prComment} onChange={e => setPrComment(e.target.value)} rows={2}
                          placeholder={isReturning ? 'Explain what needs to be corrected (required)…' : 'Optional comments…'}
                          className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setPrCommentId(null); setPrComment('') }}
                            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">Cancel</button>
                          <button disabled={isBusy || (isReturning && !prComment.trim())}
                            onClick={() => isApproving ? approvePrSecondary(r.id, prComment) : returnPrReview(r.id, prComment)}
                            className={`px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 ${isApproving ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
                            {isBusy ? '…' : isApproving ? 'Confirm Approve' : 'Confirm Return'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Performance Reviews — Final Approval Tab */}
      {activeTab === 'final_reviews' && isManager && (
        <div>
          {prFinalReviews.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-[var(--text-muted)] mx-auto" />
              <p className="mt-3 text-[var(--text-primary)] font-medium">No reviews awaiting final approval</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Items appear here once secondary approval is complete.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prFinalReviews.map(r => {
                const emp = r.employee; const rvr = r.reviewer
                const isBusy = prActionId === r.id
                const isReturning = prCommentId === r.id && prCommentMode === 'return'
                const isApproving = prCommentId === r.id && prCommentMode === 'approve'
                return (
                  <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {emp?.first_name} {emp?.surname}
                          {emp?.employee_code && <span className="text-[var(--text-muted)] ml-1 text-xs">{emp.employee_code}</span>}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          {r.review_type.charAt(0).toUpperCase() + r.review_type.slice(1)} · {r.review_period}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Reviewed by {rvr ? `${rvr.first_name} ${rvr.surname}` : '—'}</p>
                        {r.overall_rating !== null && <p className="text-xs text-[var(--text-muted)] mt-0.5">Overall rating: {r.overall_rating}/5</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setPrCommentId(r.id); setPrCommentMode('approve'); setPrComment('') }} disabled={isBusy}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                          Final Approve
                        </button>
                        <button onClick={() => { setPrCommentId(r.id); setPrCommentMode('return'); setPrComment('') }} disabled={isBusy}
                          className="px-3 py-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                          Return
                        </button>
                      </div>
                    </div>
                    {(isApproving || isReturning) && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        <textarea value={prComment} onChange={e => setPrComment(e.target.value)} rows={2}
                          placeholder={isReturning ? 'Explain what needs to be corrected (required)…' : 'Optional comments…'}
                          className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/30" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setPrCommentId(null); setPrComment('') }}
                            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">Cancel</button>
                          <button disabled={isBusy || (isReturning && !prComment.trim())}
                            onClick={() => isApproving ? approvePrFinal(r.id, prComment) : returnPrReview(r.id, prComment, true)}
                            className={`px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 ${isApproving ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
                            {isBusy ? '…' : isApproving ? 'Confirm Final Approve' : 'Confirm Return'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* My OT Tab */}
      {activeTab === 'my_ot' && (
        <div>
          {loadingMyOt ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : myOt.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No overtime requests yet</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">When you submit overtime on a timesheet it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myOt.map(row => {
                const statusColor =
                  row.status === 'approved' ? 'bg-green-100 text-green-700'
                  : row.status === 'denied' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
                const finalColor =
                  row.final_status === 'approved' ? 'bg-green-100 text-green-700'
                  : row.final_status === 'denied' ? 'bg-red-100 text-red-700'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                return (
                  <div key={row.id} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {row.timesheet_day?.date ? formatDateDisplay(row.timesheet_day.date) : '—'}
                          </p>
                          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                            {row.timesheet_day?.overtime_hours ?? 0}h OT
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${statusColor}`}>
                            Supervisor: {row.status}
                          </span>
                          {row.final_status && row.final_status !== 'pending' && (
                            <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${finalColor}`}>
                              Manager: {row.final_status}
                            </span>
                          )}
                        </div>
                        {row.timesheet_day?.overtime_reason && (
                          <p className="text-xs text-[var(--text-muted)] mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Reason: </span>{row.timesheet_day.overtime_reason}
                          </p>
                        )}
                        {row.approver_comment && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Approver note: </span>{row.approver_comment}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Submitted: {formatTimestampDisplay(row.submitted_at)}
                          {row.actioned_at && (
                            <span className="ml-2">· Actioned: {formatTimestampDisplay(row.actioned_at)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* My Leave Tab */}
      {activeTab === 'my_leave' && (
        <div>
          {loadingMyLeave ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : myLeave.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-[var(--text-secondary)] font-medium">No leave requests yet</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">When you apply for leave it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myLeave.map(req => {
                const statusColor =
                  req.status === 'approved' ? 'bg-green-100 text-green-700'
                  : req.status === 'denied' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
                const finalColor =
                  req.final_status === 'approved' ? 'bg-green-100 text-green-700'
                  : req.final_status === 'denied' ? 'bg-red-100 text-red-700'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                return (
                  <div key={req.id} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                          </p>
                          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                            {req.leave_type.replace('_', ' ')} Leave
                          </span>
                          <span className="text-xs bg-[var(--surface-secondary)] text-[var(--text-secondary)] rounded-full px-2 py-0.5">
                            {req.total_days} day{req.total_days !== 1 ? 's' : ''}
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${statusColor}`}>
                            Supervisor: {req.status}
                          </span>
                          {req.final_status && req.final_status !== 'pending' && (
                            <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${finalColor}`}>
                              Manager: {req.final_status}
                            </span>
                          )}
                        </div>
                        {req.reason && (
                          <p className="text-xs text-[var(--text-muted)] mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Reason: </span>{req.reason}
                          </p>
                        )}
                        {req.supervisor_comment && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">
                            <span className="text-[var(--text-muted)]">Supervisor note: </span>{req.supervisor_comment}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Submitted: {formatTimestampDisplay(req.submitted_at)}
                          {req.actioned_at && (
                            <span className="ml-2">· Actioned: {formatTimestampDisplay(req.actioned_at)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
