import { useAuth } from '../contexts/AuthContext'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
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

  const displayRole = profile?.role?.replace(/_/g, ' ') ?? 'Employee'
  const weekRange = getWeekRange()

  return (
    <div className="max-w-4xl mx-auto">
      {/* Welcome header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {profile?.first_name ?? 'there'} 👋
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
        <div className="mt-3 inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-yellow-300 inline-block" />
          <span className="text-sm">Timesheet: Draft</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard label="Timesheets submitted" value="—" sub="This month" />
        <StatCard label="Leave days remaining" value="—" sub="Annual leave" />
        <StatCard label="OT requests" value="—" sub="Pending approval" />
        <StatCard label="Notifications" value="—" sub="Unread" />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick actions</h2>
        <div className="space-y-2">
          <a
            href="/timesheets"
            className="flex items-center gap-3 text-sm text-[#1B5EA6] hover:underline"
          >
            <span>📋</span> Open this week&apos;s timesheet
          </a>
          <a
            href="/leave"
            className="flex items-center gap-3 text-sm text-[#1B5EA6] hover:underline"
          >
            <span>🌴</span> Apply for leave
          </a>
          <a
            href="/notifications"
            className="flex items-center gap-3 text-sm text-[#1B5EA6] hover:underline"
          >
            <span>🔔</span> View notifications
          </a>
        </div>
      </div>
    </div>
  )
}
