import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import { getWeekBounds, formatDateISO } from '../lib/dateUtils'
import { IconClipboard, IconCalendar, IconBell, IconCheckCircle, IconArrowRight, IconClipboardCheck } from '../components/Icons'
import type { TimesheetStatus, Role } from '../types'

const SUPERVISOR_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} – ${fmt(sunday)}`
}

export default function DashboardPage() {
  const { profile } = useAuth()

  const [weekStatus, setWeekStatus] = useState<TimesheetStatus | null>(null)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [pendingOtCount, setPendingOtCount] = useState<number | null>(null)
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number | null>(null)
  const [annualLeaveRemaining, setAnnualLeaveRemaining] = useState<number | null>(null)
  const [monthlyOtHours, setMonthlyOtHours] = useState<number | null>(null)
  const [verifyWarning, setVerifyWarning] = useState(false)
  const [loading, setLoading] = useState(true)

  const isSupervisor = profile?.role && SUPERVISOR_ROLES.includes(profile.role)
  const displayRole = profile?.role?.replace(/_/g, ' ') ?? 'Employee'
  const weekRange = getWeekRange()

  useEffect(() => {
    if (profile?.id) fetchDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function fetchDashboardData() {
    setLoading(true)
    try {
      const { start } = getWeekBounds()
      const weekStartStr = formatDateISO(start)

      async function fetchWeekStatus() {
        try {
          const { data } = await supabase
            .from('timesheet_weeks')
            .select('status')
            .eq('employee_id', profile!.id)
            .eq('week_start', weekStartStr)
            .single()
          setWeekStatus(data?.status ?? null)
        } catch {
          setWeekStatus(null)
        }
      }

      async function fetchUnread() {
        try {
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', profile!.id)
            .eq('is_read', false)
          setUnreadCount(count ?? 0)
        } catch {
          setUnreadCount(null)
        }
      }

      async function fetchPendingOt() {
        try {
          const { count } = await supabase
            .from('ot_approvals')
            .select('id', { count: 'exact', head: true })
            .eq('approver_id', profile!.id)
            .eq('status', 'pending')
          setPendingOtCount(count ?? 0)
        } catch {
          setPendingOtCount(null)
        }
      }

      async function fetchPendingLeave() {
        try {
          const { count } = await supabase
            .from('leave_requests')
            .select('id', { count: 'exact', head: true })
            .eq('supervisor_id', profile!.id)
            .eq('status', 'pending')
          setPendingLeaveCount(count ?? 0)
        } catch {
          setPendingLeaveCount(null)
        }
      }

      const tasks: Promise<void>[] = [fetchWeekStatus(), fetchUnread(), fetchLeaveBalance(), fetchMonthlyOt(), fetchVerificationStatus()]
      if (isSupervisor) {
        tasks.push(fetchPendingOt(), fetchPendingLeave())
      }

      await Promise.all(tasks)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLeaveBalance() {
    try {
      const { data } = await supabase
        .from('leave_balances')
        .select('total_days, used_days')
        .eq('employee_id', profile!.id)
        .eq('leave_type', 'annual')
        .eq('year', new Date().getFullYear())
        .single()
      if (data) setAnnualLeaveRemaining(Math.max(0, data.total_days - data.used_days))
      else setAnnualLeaveRemaining(null)
    } catch {
      setAnnualLeaveRemaining(null)
    }
  }

  async function fetchMonthlyOt() {
    try {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

      const { data } = await supabase
        .from('timesheet_days')
        .select('overtime_hours, timesheet_week:timesheet_weeks!inner(employee_id)')
        .eq('timesheet_week.employee_id', profile!.id)
        .eq('overtime_flag', true)
        .gte('date', monthStart)
        .lt('date', monthEnd)

      const total = (data ?? []).reduce((sum, r) => sum + (r.overtime_hours ?? 0), 0)
      setMonthlyOtHours(Math.round(total * 10) / 10)
    } catch {
      setMonthlyOtHours(null)
    }
  }

  async function fetchVerificationStatus() {
    try {
      const now = new Date()
      if (now.getDate() < 5) { setVerifyWarning(false); return }
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const periodMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`
      const { data } = await supabase
        .from('timesheet_verifications')
        .select('status')
        .eq('employee_id', profile!.id)
        .eq('period_month', periodMonth)
        .single()
      setVerifyWarning(!data || data.status === 'pending' || data.status === 'overdue')
    } catch {
      setVerifyWarning(false)
    }
  }

  const timesheetStatusDisplay = weekStatus ?? 'draft'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Welcome header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {profile?.first_name ?? 'there'}
        </h1>
        <p className="text-gray-500 mt-1 capitalize">
          {displayRole}
          {profile?.department ? ` · ${profile.department.name}` : ''}
          {profile?.site ? ` · ${profile.site.name}` : ''}
        </p>
      </div>

      {/* Current week banner */}
      <div className="bg-[#1B5EA6] text-white rounded-lg p-5 mb-6">
        <p className="text-blue-200 text-sm">Current week</p>
        <p className="text-lg font-semibold mt-0.5">{weekRange}</p>
        <div className="mt-3">
          {loading ? (
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <span className="text-sm text-blue-100">Loading…</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <span className="text-sm">Timesheet:</span>
              <StatusBadge status={timesheetStatusDisplay} />
            </div>
          )}
        </div>
      </div>

      {/* Verification reminder banner */}
      {verifyWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <IconClipboardCheck className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Last month&apos;s hours not yet verified</p>
            <p className="text-xs text-amber-600 mt-0.5">Please review and verify your hours for last month.</p>
          </div>
          <Link to="/verify" className="text-xs font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap">
            Verify now
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard
          label="Timesheet status"
          value={loading ? '…' : (weekStatus ? weekStatus.charAt(0).toUpperCase() + weekStatus.slice(1) : 'No entry')}
          sub="This week"
        />
        <StatCard
          label="Notifications"
          value={loading ? '…' : (unreadCount ?? '—')}
          sub="Unread"
        />
        {isSupervisor && (
          <>
            <StatCard
              label="OT requests"
              value={loading ? '…' : (pendingOtCount ?? '—')}
              sub="Pending approval"
            />
            <StatCard
              label="Leave requests"
              value={loading ? '…' : (pendingLeaveCount ?? '—')}
              sub="Pending approval"
            />
          </>
        )}
        {!isSupervisor && (
          <>
            <StatCard
              label="Annual leave"
              value={loading ? '…' : (annualLeaveRemaining !== null ? annualLeaveRemaining : '—')}
              sub="Days remaining"
            />
            <StatCard
              label="OT this month"
              value={loading ? '…' : (monthlyOtHours !== null ? monthlyOtHours : '—')}
              sub="Hours"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick actions</h2>
        <div className="divide-y divide-gray-50">
          <Link to="/timesheets" className="flex items-center justify-between gap-3 text-sm text-gray-700 hover:text-[#1B5EA6] py-2">
            <div className="flex items-center gap-3">
              <IconClipboard className="w-4 h-4 text-gray-400" />
              Open this week&apos;s timesheet
            </div>
            <IconArrowRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link to="/leave" className="flex items-center justify-between gap-3 text-sm text-gray-700 hover:text-[#1B5EA6] py-2">
            <div className="flex items-center gap-3">
              <IconCalendar className="w-4 h-4 text-gray-400" />
              Apply for leave
            </div>
            <IconArrowRight className="w-4 h-4 text-gray-300" />
          </Link>
          {isSupervisor && (
            <Link to="/approvals" className="flex items-center justify-between gap-3 text-sm text-gray-700 hover:text-[#1B5EA6] py-2">
              <div className="flex items-center gap-3">
                <IconCheckCircle className="w-4 h-4 text-gray-400" />
                Review pending approvals
              </div>
              <IconArrowRight className="w-4 h-4 text-gray-300" />
            </Link>
          )}
          <Link to="/notifications" className="flex items-center justify-between gap-3 text-sm text-gray-700 hover:text-[#1B5EA6] py-2">
            <div className="flex items-center gap-3">
              <IconBell className="w-4 h-4 text-gray-400" />
              View notifications
            </div>
            <IconArrowRight className="w-4 h-4 text-gray-300" />
          </Link>
        </div>
      </div>
    </div>
  )
}
