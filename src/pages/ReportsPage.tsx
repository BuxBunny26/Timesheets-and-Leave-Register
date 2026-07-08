import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TimesheetReport from '../components/reports/TimesheetReport'
import TeamSummaryReport from '../components/reports/TeamSummaryReport'
import OvertimeReport from '../components/reports/OvertimeReport'
import LeaveReport from '../components/reports/LeaveReport'
import AwolReport from '../components/reports/AwolReport'
import PaymentCentreReport from '../components/reports/PaymentCentreReport'
import DepartmentReport from '../components/reports/DepartmentReport'
import VerificationReport from '../components/reports/VerificationReport'

const REPORT_TYPES = [
  { id: 'timesheet', label: 'Overall Timesheet', minRole: 'employee' as const },
  { id: 'team', label: 'Team Summary', minRole: 'supervisor' as const },
  { id: 'department', label: 'Department Summary', minRole: 'manager' as const },
  { id: 'payment', label: 'Payment Centre Export', minRole: 'admin' as const },
  { id: 'overtime', label: 'Overtime Report', minRole: 'employee' as const },
  { id: 'leave', label: 'Leave Report', minRole: 'employee' as const },
  { id: 'awol', label: 'AWOL Report', minRole: 'supervisor' as const },
  { id: 'verification', label: 'Monthly Verification', minRole: 'supervisor' as const },
]

const ALL_ROLES = ['employee', 'supervisor', 'manager', 'admin_manager', 'system_admin']

export default function ReportsPage() {
  const { profile } = useAuth()
  const [activeReport, setActiveReport] = useState('timesheet')

  const canAccess = profile && ALL_ROLES.includes(profile.role)
  if (!canAccess) return (
    <div className="max-w-2xl mx-auto py-12 text-center text-[var(--text-muted)]">
      You do not have permission to access reports.
    </div>
  )

  const isSupervisor = ['supervisor', 'manager', 'admin_manager', 'system_admin'].includes(profile!.role)
  const isManager = ['manager', 'admin_manager', 'system_admin'].includes(profile!.role)
  const isAdmin = ['admin_manager', 'system_admin'].includes(profile!.role)

  const visibleReports = REPORT_TYPES.filter(r => {
    if (r.minRole === 'employee') return true
    if (r.minRole === 'supervisor') return isSupervisor
    if (r.minRole === 'manager') return isManager
    if (r.minRole === 'admin') return isAdmin
    return false
  })

  // If the currently active tab is hidden for this role, fall back to first visible.
  if (!visibleReports.find(r => r.id === activeReport) && visibleReports.length > 0 && activeReport !== visibleReports[0].id) {
    setActiveReport(visibleReports[0].id)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Reports</h1>
        <p className="text-[var(--text-muted)] mt-1 text-sm">Generate and export timesheet, leave, and overtime reports.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <aside className="md:w-52 flex-shrink-0">
          {/* Mobile dropdown */}
          <select
            className="md:hidden w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
            value={activeReport}
            onChange={e => setActiveReport(e.target.value)}
          >
            {visibleReports.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {/* Desktop list */}
          <nav className="hidden md:block bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            {visibleReports.map(r => (
              <button
                key={r.id}
                onClick={() => setActiveReport(r.id)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-[var(--border)] last:border-0 transition-colors ${
                  activeReport === r.id
                    ? 'bg-[#1B5EA6] dark:bg-sky-500 text-white font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Report panel */}
        <div className="flex-1 min-w-0">
          {activeReport === 'timesheet' && <TimesheetReport />}
          {activeReport === 'team' && <TeamSummaryReport />}
          {activeReport === 'department' && <DepartmentReport />}
          {activeReport === 'payment' && <PaymentCentreReport />}
          {activeReport === 'overtime' && <OvertimeReport />}
          {activeReport === 'leave' && <LeaveReport />}
          {activeReport === 'awol' && <AwolReport />}
          {activeReport === 'verification' && <VerificationReport />}
        </div>
      </div>
    </div>
  )
}
