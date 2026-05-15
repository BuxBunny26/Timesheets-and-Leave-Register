import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types'

const SUPERVISOR_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']

interface NavItem {
  to: string
  label: string
  icon: string
  exact?: boolean
  roles: Role[] | null
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '⊞', exact: true, roles: null },
  { to: '/timesheets', label: 'Timesheets', icon: '📋', roles: null },
  { to: '/leave', label: 'Leave', icon: '🌴', roles: null },
  { to: '/approvals', label: 'Approvals', icon: '✅', roles: SUPERVISOR_ROLES },
  { to: '/notifications', label: 'Notifications', icon: '🔔', roles: null },
  { to: '/profile', label: 'Profile', icon: '👤', roles: null },
]

export default function Layout() {
  const { profile, signOut } = useAuth()

  const visibleItems = navItems.filter(
    item => item.roles === null || (profile?.role && item.roles.includes(profile.role))
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-[#1B5EA6] text-white">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-700">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-[#1B5EA6] text-sm font-bold">W</span>
          </div>
          <div>
            <p className="font-semibold text-sm">WearCheck RS</p>
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
              <span>{item.icon}</span>
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
            <p className="font-semibold text-sm">WearCheck RS</p>
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
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
