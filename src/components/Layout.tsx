import { useEffect, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { IconGrid, IconClipboard, IconCalendar, IconCheckCircle, IconBell, IconUser, IconChartBar, IconFolder } from './Icons'
import { useNotifications } from '../contexts/NotificationsContext'
import { supabase } from '../lib/supabase'
import type { Role } from '../types'

const SUPERVISOR_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']
const MANAGER_ROLES: Role[] = ['manager', 'admin_manager', 'system_admin']

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  exact?: boolean
  roles: Role[] | null
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <IconGrid />, exact: true, roles: null },
  { to: '/timesheets', label: 'Timesheets', icon: <IconClipboard />, roles: null },
  { to: '/leave', label: 'Leave', icon: <IconCalendar />, roles: null },
  { to: '/approvals', label: 'Approvals', icon: <IconCheckCircle />, roles: SUPERVISOR_ROLES },
  { to: '/reports', label: 'Reports', icon: <IconChartBar />, exact: false, roles: null },
  { to: '/my-verification', label: 'Verify Month', icon: <IconCheckCircle />, roles: null },
  { to: '/documents', label: 'Documents', icon: <IconFolder />, exact: false, roles: null },
  { to: '/notifications', label: 'Notifications', icon: <IconBell />, roles: null },
  { to: '/profile', label: 'Profile', icon: <IconUser />, roles: null },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { unreadCount } = useNotifications()
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [verifyCount, setVerifyCount] = useState(0)

  const isManager = !!profile?.role && MANAGER_ROLES.includes(profile.role)
  const isSupervisor = !!profile?.role && SUPERVISOR_ROLES.includes(profile.role)

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadApprovals() {
      if (!profile || !isSupervisor) {
        setApprovalsCount(0)
        return
      }
      let otQ = supabase.from('ot_approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      let leaveQ = supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (!isManager) {
        otQ = otQ.eq('approver_id', profile.id)
        leaveQ = leaveQ.eq('supervisor_id', profile.id)
      }
      const [{ count: ot }, { count: lv }] = await Promise.all([otQ, leaveQ])
      if (!cancelled) setApprovalsCount((ot ?? 0) + (lv ?? 0))
    }

    async function loadVerifyMonth() {
      if (!profile) return
      // Previous calendar month
      const now = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const yr = prev.getFullYear()
      const mo = prev.getMonth() + 1
      const period = `${yr}-${String(mo).padStart(2, '0')}`
      const start = `${period}-01`
      const lastDay = new Date(yr, mo, 0).getDate()
      const end = `${period}-${String(lastDay).padStart(2, '0')}`

      const [{ data: verif }, { data: weekRows }] = await Promise.all([
        supabase
          .from('timesheet_verifications')
          .select('status')
          .eq('employee_id', profile.id)
          .eq('period_month', period)
          .maybeSingle(),
        supabase
          .from('timesheet_weeks')
          .select('week_start, week_end, status')
          .eq('employee_id', profile.id)
          .lte('week_start', end)
          .gte('week_end', start),
      ])

      if (cancelled) return
      if (verif?.status === 'verified') { setVerifyCount(0); return }

      // Expected ISO weeks (Mon-anchored) overlapping the month
      const startD = new Date(start)
      const endD = new Date(end)
      const firstMon = new Date(startD)
      const dayShift = (firstMon.getDay() + 6) % 7
      firstMon.setDate(firstMon.getDate() - dayShift)
      let expected = 0
      for (let d = new Date(firstMon); d <= endD; d.setDate(d.getDate() + 7)) expected++

      const weeks = weekRows ?? []
      const allSubmitted = weeks.length >= expected && weeks.every(w => w.status === 'submitted' || w.status === 'approved')
      setVerifyCount(weeks.length > 0 && allSubmitted ? 1 : 0)
    }

    loadApprovals()
    loadVerifyMonth()
    const interval = setInterval(() => { loadApprovals(); loadVerifyMonth() }, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [profile, isManager, isSupervisor])

  const visibleItems = navItems.filter(
    item => item.roles === null || (profile?.role && item.roles.includes(profile.role))
  )

  function badgeFor(to: string): number {
    if (to === '/approvals') return approvalsCount
    if (to === '/my-verification') return verifyCount
    if (to === '/notifications') return unreadCount
    return 0
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-[#1B5EA6] text-white">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-700">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-[#1B5EA6]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm">WearCheck</p>
            <p className="text-blue-200 text-xs">Timesheets</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleItems.map(item => {
            const badge = badgeFor(item.to)
            return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-white/20 text-white font-medium' : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.to === '/notifications' ? (
                <div className="relative">
                  <IconBell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
              ) : item.icon}
              <span className="flex-1">{item.label}</span>
              {badge > 0 && item.to !== '/notifications' && (
                <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-blue-700">
          <p className="text-xs text-blue-200 truncate">{profile?.first_name} {profile?.surname}</p>
          <p className="text-xs text-blue-300 capitalize">{profile?.role?.replace('_', ' ')}</p>
          <button
            onClick={signOut}
            className="mt-2 text-xs text-blue-200 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <header className="md:hidden bg-[#1B5EA6] text-white px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">WearCheck</p>
          </div>
          <button onClick={signOut} className="text-xs text-blue-200">Sign out</button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
        {visibleItems.map(item => {
          const badge = badgeFor(item.to)
          return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                isActive ? 'text-[#1B5EA6] font-medium' : 'text-gray-500'
              }`
            }
          >
            <span className="w-5 h-5 relative">
              {item.to === '/notifications' ? (
                <div className="relative">
                  <IconBell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
              ) : item.icon}
              {badge > 0 && item.to !== '/notifications' && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
