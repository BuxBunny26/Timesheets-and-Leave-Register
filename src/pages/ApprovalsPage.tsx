import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateDisplay } from '../lib/dateUtils'
import { IconCheckCircle } from '../components/Icons'
import type { OTApprovalStatus, LeaveType, LeaveStatus } from '../types'

function formatTimestampDisplay(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Tab = 'ot' | 'leave' | 'final_ot' | 'final_leave' | 'denied_ot' | 'denied_leave'

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
  final_status?: 'pending' | 'approved' | 'denied'
  employee?: EmployeeSnippet
}

export default function ApprovalsPage() {
  const { profile } = useAuth()
  const isManager =
    profile?.role === 'manager' ||
    profile?.role === 'admin_manager' ||
    profile?.role === 'system_admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const parseTab = (raw: string | null): Tab => {
    if (raw === 'leave' || raw === 'final_ot' || raw === 'final_leave' || raw === 'denied_ot' || raw === 'denied_leave') return raw
    return 'ot'
  }
  const [activeTab, setActiveTab] = useState<Tab>(parseTab(searchParams.get('tab')))

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
      fetchOtApprovals()
      fetchLeaveApprovals()
      if (isManager && managerScope !== null) {
        fetchFinalOt()
        fetchFinalLeave()
        fetchDeniedOt()
        fetchDeniedLeave()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isManager, managerScope])

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
      setLeaveApprovals((data as LeaveRequestRow[]) ?? [])
    } catch (err) {
      setLeaveError('Failed to load leave approvals.')
      console.error(err)
    } finally {
      setLoadingLeave(false)
    }
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
      setFinalLeave((data as LeaveRequestRow[]) ?? [])
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
      setDeniedLeave((data as LeaveRequestRow[]) ?? [])
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

  const otCount = otApprovals.length
  const leaveCount = leaveApprovals.length
  const finalOtCount = finalOt.length
  const finalLeaveCount = finalLeave.length
  const deniedOtCount = deniedOt.length
  const deniedLeaveCount = deniedLeave.length

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
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-gray-500 text-sm mt-0.5">Review and action pending requests</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        <button
          onClick={() => selectTab('ot')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'ot'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
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
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
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
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
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
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
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
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
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
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Denied Leave
              {deniedLeaveCount > 0 && (
                <span className="ml-1.5 bg-gray-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {deniedLeaveCount}
                </span>
              )}
            </button>
          </>
        )}
      </div>

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
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-gray-600 font-medium">No pending OT approvals</p>
              <p className="mt-1 text-sm text-gray-400">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {otGroups.map(group => {
                const isExpanded = expandedGroups.has(group.key)
                const ids = group.rows.map(r => r.id)
                const isBusy = groupActionKey === group.key
                return (
                  <div key={group.key} className="bg-white rounded-lg border border-gray-200">
                    {/* Group header */}
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{group.employeeName}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          Week: {formatDateDisplay(group.weekStart)} – {formatDateDisplay(group.weekEnd)}
                        </p>
                        <p className="text-sm text-gray-600">
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
                      <div className="px-4 pb-4 -mt-2 border-t border-gray-100 pt-3">
                        <textarea
                          value={groupDenyComment}
                          onChange={e => setGroupDenyComment(e.target.value)}
                          rows={2}
                          placeholder="Reason for denying the whole week (optional)"
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setGroupDenyKey(null); setGroupDenyComment('') }}
                            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
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
                      <div className="border-t border-gray-100 divide-y divide-gray-100">
                        {group.rows.map(approval => (
                          <div key={approval.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {approval.timesheet_day?.date && (
                                  <p className="text-sm text-gray-900">
                                    {formatDateDisplay(approval.timesheet_day.date)}
                                    {approval.timesheet_day.overtime_hours != null && (
                                      <span className="ml-2 text-gray-600">
                                        · <strong>{approval.timesheet_day.overtime_hours}</strong> hr{approval.timesheet_day.overtime_hours !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </p>
                                )}
                                {approval.timesheet_day?.overtime_reason ? (
                                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                                    <span className="text-gray-400">Reason: </span>{approval.timesheet_day.overtime_reason}
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-400 italic mt-1">No reason provided</p>
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
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <textarea
                                  value={otDenyComment}
                                  onChange={e => setOtDenyComment(e.target.value)}
                                  rows={2}
                                  placeholder="Reason for denial (optional)"
                                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => { setOtDenyId(null); setOtDenyComment('') }}
                                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
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
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-gray-600 font-medium">No pending leave approvals</p>
              <p className="mt-1 text-sm text-gray-400">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaveApprovals.map(req => (
                <div
                  key={req.id}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {req.employee?.first_name} {req.employee?.surname}
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                          {req.leave_type.replace('_', ' ')} Leave
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                        <span className="ml-2 text-gray-400">
                          ({req.total_days} day{req.total_days !== 1 ? 's' : ''})
                        </span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-gray-500 mt-1">{req.reason}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted: {formatTimestampDisplay(req.submitted_at)}
                      </p>
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
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <textarea
                        value={leaveDenyComment}
                        onChange={e => setLeaveDenyComment(e.target.value)}
                        rows={2}
                        placeholder="Reason for denial (optional)"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setLeaveDenyId(null); setLeaveDenyComment('') }}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
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
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-gray-600 font-medium">No OT awaiting final approval</p>
              <p className="mt-1 text-sm text-gray-400">Items supervisors approve appear here for your sign-off.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {finalOt.map(row => {
                const employeeName = `${row.employee?.first_name ?? ''} ${row.employee?.surname ?? ''}`.trim() || 'Employee'
                const day = row.timesheet_day
                const week = day?.timesheet_week
                return (
                  <div key={row.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{employeeName}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {day?.date ? formatDateDisplay(day.date) : '—'}
                          {day?.overtime_hours != null && (
                            <span className="ml-2">· <strong>{day.overtime_hours}</strong> hr{day.overtime_hours !== 1 ? 's' : ''}</span>
                          )}
                        </p>
                        {week && (
                          <p className="text-xs text-gray-500 mt-0.5">Week {formatDateDisplay(week.week_start)} – {formatDateDisplay(week.week_end)}</p>
                        )}
                        {day?.overtime_reason && (
                          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                            <span className="text-gray-400">Reason: </span>{day.overtime_reason}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
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
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-gray-600 font-medium">No leave awaiting final approval</p>
              <p className="mt-1 text-sm text-gray-400">Items supervisors approve appear here for your sign-off.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {finalLeave.map(req => (
                <div key={req.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {req.employee?.first_name} {req.employee?.surname}
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                          {req.leave_type.replace('_', ' ')} Leave
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                        <span className="ml-2 text-gray-400">
                          ({req.total_days} day{req.total_days !== 1 ? 's' : ''})
                        </span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-gray-500 mt-1">{req.reason}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Supervisor approved: {formatTimestampDisplay(req.actioned_at)}
                      </p>
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
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-gray-600 font-medium">No denied OT in your team</p>
              <p className="mt-1 text-sm text-gray-400">Items a supervisor declines appear here so you can override.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deniedOt.map(row => {
                const employeeName = `${row.employee?.first_name ?? ''} ${row.employee?.surname ?? ''}`.trim() || 'Employee'
                const day = row.timesheet_day
                const week = day?.timesheet_week
                return (
                  <div key={row.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{employeeName}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {day?.date ? formatDateDisplay(day.date) : '—'}
                          {day?.overtime_hours != null && (
                            <span className="ml-2">· <strong>{day.overtime_hours}</strong> hr{day.overtime_hours !== 1 ? 's' : ''}</span>
                          )}
                        </p>
                        {week && (
                          <p className="text-xs text-gray-500 mt-0.5">Week {formatDateDisplay(week.week_start)} – {formatDateDisplay(week.week_end)}</p>
                        )}
                        {day?.overtime_reason && (
                          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                            <span className="text-gray-400">Reason: </span>{day.overtime_reason}
                          </p>
                        )}
                        {row.approver_comment && (
                          <p className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                            <span className="text-gray-400">Supervisor denial: </span>{row.approver_comment}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
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
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <IconCheckCircle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3 text-gray-600 font-medium">No denied leave in your team</p>
              <p className="mt-1 text-sm text-gray-400">Items a supervisor declines appear here so you can override.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deniedLeave.map(req => (
                <div key={req.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {req.employee?.first_name} {req.employee?.surname}
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 capitalize">
                          {req.leave_type.replace('_', ' ')} Leave
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDateDisplay(req.start_date)} – {formatDateDisplay(req.end_date)}
                        <span className="ml-2 text-gray-400">
                          ({req.total_days} day{req.total_days !== 1 ? 's' : ''})
                        </span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-gray-500 mt-1">{req.reason}</p>
                      )}
                      {req.supervisor_comment && (
                        <p className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                          <span className="text-gray-400">Supervisor denial: </span>{req.supervisor_comment}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Denied: {formatTimestampDisplay(req.actioned_at)}
                      </p>
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
    </div>
  )
}
