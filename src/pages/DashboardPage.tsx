import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import LeaveCalendar from '../components/LeaveCalendar'
import type { BirthdayMarker, AnniversaryMarker } from '../components/LeaveCalendar'
import { getWeekBounds, formatDateISO, fyEndYearFor } from '../lib/dateUtils'
import { IconClipboard, IconCalendar, IconBell, IconCheckCircle, IconArrowRight } from '../components/Icons'
import type { TimesheetStatus, Role } from '../types'

const SUPERVISOR_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']

function StatCard({ label, value, sub, onClick }: { label: string; value: string | number; sub?: string; onClick?: () => void }) {
  const base = 'bg-[var(--surface)] rounded-lg shadow-sm border border-[var(--border)] p-5 text-left'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} w-full transition hover:shadow-md hover:border-[#1B5EA6]/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]/40`}
      >
        <p className="text-sm text-[var(--text-muted)]">{label}</p>
        <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
      </button>
    )
  }
  return (
    <div className={base}>
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
      {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
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
  const navigate = useNavigate()

  const [weekStatus, setWeekStatus] = useState<TimesheetStatus | null>(null)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [pendingOtCount, setPendingOtCount] = useState<number | null>(null)
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [birthdays, setBirthdays] = useState<BirthdayMarker[]>([])
  const [anniversaries, setAnniversaries] = useState<AnniversaryMarker[]>([])
  const [annualLeaveRemaining, setAnnualLeaveRemaining] = useState<number | null>(null)
  const [otHoursThisMonth, setOtHoursThisMonth] = useState<number | null>(null)

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

      async function fetchLeaveBalance() {
        try {
          const fy = fyEndYearFor(new Date())
          const { data } = await supabase
            .from('leave_balances')
            .select('total_days, used_days')
            .eq('employee_id', profile!.id)
            .eq('leave_type', 'annual')
            .eq('year', fy)
            .maybeSingle()
          const row = data as { total_days: number; used_days: number } | null
          setAnnualLeaveRemaining(row ? Math.max(0, row.total_days - row.used_days) : null)
        } catch {
          setAnnualLeaveRemaining(null)
        }
      }

      async function fetchOtThisMonth() {
        try {
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          const { data } = await supabase
            .from('ot_approvals')
            .select('status, final_status, timesheet_day:timesheet_days(date, overtime_hours)')
            .eq('employee_id', profile!.id)
            .gte('submitted_at', monthStart.toISOString())
          let total = 0
          for (const row of (data ?? []) as unknown as { status: string; final_status: string | null; timesheet_day: { date: string; overtime_hours: number | null } | null }[]) {
            const approved = row.final_status === 'approved' || (row.status === 'approved' && !row.final_status)
            if (approved) total += row.timesheet_day?.overtime_hours ?? 0
          }
          setOtHoursThisMonth(total)
        } catch {
          setOtHoursThisMonth(null)
        }
      }

      const tasks: Promise<void>[] = [fetchWeekStatus(), fetchUnread()]
      if (isSupervisor) {
        tasks.push(fetchPendingOt(), fetchPendingLeave())
      } else {
        tasks.push(fetchLeaveBalance(), fetchOtThisMonth())
      }

      // Load birthdays for the calendar (all users)
      supabase
        .from('birthdays_this_year')
        .select('employee_id, first_name, surname, birthday_this_year')
        .then(({ data }) => { if (data) setBirthdays(data as BirthdayMarker[]) })

      // Load work anniversaries (supervisors and above)
      if (isSupervisor) {
        supabase
          .from('profiles')
          .select('id, first_name, surname, employee_details!employee_details_employee_id_fkey(start_date)')
          .eq('status', 'active')
          .then(({ data }) => {
            if (!data) return
            const currentYear = new Date().getFullYear()
            const markers: AnniversaryMarker[] = []
            for (const p of data as { id: string; first_name: string; surname: string; employee_details: { start_date: string }[] | null }[]) {
              const startRaw = p.employee_details?.[0]?.start_date
              if (!startRaw) continue
              const startDate = new Date(startRaw + 'T00:00:00')
              if (isNaN(startDate.getTime())) continue
              const anniversaryISO = `${currentYear}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
              const years = currentYear - startDate.getFullYear()
              if (years <= 0) continue
              markers.push({
                employee_id: p.id,
                first_name: p.first_name,
                surname: p.surname,
                anniversary_this_year: anniversaryISO,
                years_of_service: years,
              })
            }
            setAnniversaries(markers)
          })
      }

      await Promise.all(tasks)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const timesheetStatusDisplay = weekStatus ?? 'draft'

  return (
    <div className="max-w-5xl mx-auto">
      {/* Welcome header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Welcome, {profile?.first_name ?? 'there'}
        </h1>
        <p className="text-[var(--text-muted)] mt-1 capitalize">
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard
          label="Timesheet status"
          value={loading ? '…' : (weekStatus ? weekStatus.charAt(0).toUpperCase() + weekStatus.slice(1) : 'No entry')}
          sub="This week"
          onClick={() => navigate('/timesheets')}
        />
        <StatCard
          label="Notifications"
          value={loading ? '…' : (unreadCount ?? '—')}
          sub="Unread"
          onClick={() => navigate('/notifications')}
        />
        {isSupervisor && (
          <>
            <StatCard
              label="OT requests"
              value={loading ? '…' : (pendingOtCount ?? '—')}
              sub="Pending approval"
              onClick={() => navigate('/approvals?tab=ot')}
            />
            <StatCard
              label="Leave requests"
              value={loading ? '…' : (pendingLeaveCount ?? '—')}
              sub="Pending approval"
              onClick={() => navigate('/approvals?tab=leave')}
            />
          </>
        )}
        {!isSupervisor && (
          <>
            <StatCard
              label="Leave days"
              value={loading ? '…' : (annualLeaveRemaining !== null ? annualLeaveRemaining : '—')}
              sub="Annual leave remaining"
              onClick={() => navigate('/leave')}
            />
            <StatCard
              label="OT hours"
              value={loading ? '…' : (otHoursThisMonth !== null ? otHoursThisMonth : '—')}
              sub="Approved this month"
            />
          </>
        )}
      </div>

      {/* Team leave calendar */}
      <div className="mb-6">
        <LeaveCalendar birthdays={birthdays} anniversaries={anniversaries} />
      </div>

      {/* Quick actions */}
      <div className="bg-[var(--surface)] rounded-lg shadow-sm border border-[var(--border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Quick actions</h2>
        <div className="divide-y divide-[var(--border)]">
          <a href="/timesheets" className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)] hover:text-[#1B5EA6] py-2">
            <div className="flex items-center gap-3">
              <IconClipboard className="w-4 h-4 text-[var(--text-muted)]" />
              Open this week&apos;s timesheet
            </div>
            <IconArrowRight className="w-4 h-4 text-gray-300" />
          </a>
          <a href="/leave" className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)] hover:text-[#1B5EA6] py-2">
            <div className="flex items-center gap-3">
              <IconCalendar className="w-4 h-4 text-[var(--text-muted)]" />
              Apply for leave
            </div>
            <IconArrowRight className="w-4 h-4 text-gray-300" />
          </a>
          {isSupervisor && (
            <a href="/approvals" className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)] hover:text-[#1B5EA6] py-2">
              <div className="flex items-center gap-3">
                <IconCheckCircle className="w-4 h-4 text-[var(--text-muted)]" />
                Review pending approvals
              </div>
              <IconArrowRight className="w-4 h-4 text-gray-300" />
            </a>
          )}
          <a href="/notifications" className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)] hover:text-[#1B5EA6] py-2">
            <div className="flex items-center gap-3">
              <IconBell className="w-4 h-4 text-[var(--text-muted)]" />
              View notifications
            </div>
            <IconArrowRight className="w-4 h-4 text-gray-300" />
          </a>
        </div>
      </div>
    </div>
  )
}
