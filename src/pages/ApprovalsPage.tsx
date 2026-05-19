import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateDisplay } from '../lib/dateUtils'
import { IconCheckCircle } from '../components/Icons'
import type { OTApprovalStatus, LeaveType, LeaveStatus } from '../types'

type Tab = 'ot' | 'leave'

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
  employee?: EmployeeSnippet
  timesheet_day?: { date: string; overtime_hours: number | null }
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
  employee?: EmployeeSnippet
}

export default function ApprovalsPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('ot')

  // OT state
  const [otApprovals, setOtApprovals] = useState<OTApprovalRow[]>([])
  const [loadingOt, setLoadingOt] = useState(true)
  const [otError, setOtError] = useState<string | null>(null)
  const [otActionId, setOtActionId] = useState<string | null>(null)
  const [otDenyComment, setOtDenyComment] = useState('')
  const [otDenyId, setOtDenyId] = useState<string | null>(null)

  // Leave state
  const [leaveApprovals, setLeaveApprovals] = useState<LeaveRequestRow[]>([])
  const [loadingLeave, setLoadingLeave] = useState(true)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [leaveActionId, setLeaveActionId] = useState<string | null>(null)
  const [leaveDenyComment, setLeaveDenyComment] = useState('')
  const [leaveDenyId, setLeaveDenyId] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.id) {
      fetchOtApprovals()
      fetchLeaveApprovals()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function fetchOtApprovals() {
    setLoadingOt(true)
    setOtError(null)
    try {
      const isManager =
        profile?.role === 'manager' ||
        profile?.role === 'admin_manager' ||
        profile?.role === 'system_admin'
      let query = supabase
        .from('ot_approvals')
        .select('*, employee:profiles!ot_approvals_employee_id_fkey(first_name, surname), timesheet_day:timesheet_days(date, overtime_hours)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })
      if (!isManager) {
        query = query.eq('approver_id', profile!.id)
      }
      const { data, error } = await query
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
      const isManager =
        profile?.role === 'manager' ||
        profile?.role === 'admin_manager' ||
        profile?.role === 'system_admin'
      let query = supabase
        .from('leave_requests')
        .select('*, employee:profiles!leave_requests_employee_id_fkey(first_name, surname)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })
      if (!isManager) {
        query = query.eq('supervisor_id', profile!.id)
      }
      const { data, error } = await query
      if (error) throw error
      setLeaveApprovals((data as LeaveRequestRow[]) ?? [])
    } catch (err) {
      setLeaveError('Failed to load leave approvals.')
      console.error(err)
    } finally {
      setLoadingLeave(false)
    }
  }

  async function approveOt(approvalId: string) {
    setOtActionId(approvalId)
    try {
      const { error } = await supabase
        .from('ot_approvals')
        .update({ status: 'approved', actioned_at: new Date().toISOString() })
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

  async function approveLeave(requestId: string) {
    setLeaveActionId(requestId)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved', actioned_at: new Date().toISOString() })
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-gray-500 text-sm mt-0.5">Review and action pending requests</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('ot')}
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
          onClick={() => setActiveTab('leave')}
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
              {otApprovals.map(approval => (
                <div
                  key={approval.id}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {approval.employee?.first_name} {approval.employee?.surname}
                      </p>
                      {approval.timesheet_day?.date && (
                        <p className="text-sm text-gray-600 mt-0.5">
                          Date: {formatDateDisplay(approval.timesheet_day.date)}
                        </p>
                      )}
                      {approval.timesheet_day?.overtime_hours != null && (
                        <p className="text-sm text-gray-600">
                          Hours: <strong>{approval.timesheet_day.overtime_hours}</strong>
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted: {formatDateDisplay(approval.submitted_at)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveOt(approval.id)}
                        disabled={otActionId === approval.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {otActionId === approval.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setOtDenyId(approval.id)}
                        disabled={otActionId === approval.id}
                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        Deny
                      </button>
                    </div>
                  </div>

                  {/* Deny form */}
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
                        Submitted: {formatDateDisplay(req.submitted_at)}
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
    </div>
  )
}
