import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { IconGrid, IconClipboard, IconCalendar, IconCheckCircle, IconBell, IconUser, IconChartBar } from './Icons'
import { useNotifications } from '../contexts/NotificationsContext'
import type { Role } from '../types'

const SUPERVISOR_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']

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
  { to: '/reports', label: 'Reports', icon: <IconChartBar />, exact: false, roles: ['manager', 'admin_manager', 'system_admin'] as Role[] },
  { to: '/notifications', label: 'Notifications', icon: <IconBell />, roles: null },
  { to: '/profile', label: 'Profile', icon: <IconUser />, roles: null },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { unreadCount } = useNotifications()

  const visibleItems = navItems.filter(
    item => item.roles === null || (profile?.role && item.roles.includes(profile.role))
  )

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
          {visibleItems.map(item => (
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
              {item.label}
            </NavLink>
          ))}
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
        {visibleItems.map(item => (
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
            <span className="w-5 h-5">
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
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
