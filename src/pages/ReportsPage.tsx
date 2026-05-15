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
  { id: 'timesheet', label: 'Individual Timesheet' },
  { id: 'team', label: 'Team Summary' },
  { id: 'department', label: 'Department Summary' },
  { id: 'payment', label: 'Payment Centre Export' },
  { id: 'overtime', label: 'Overtime Report' },
  { id: 'leave', label: 'Leave Report' },
  { id: 'awol', label: 'AWOL Report' },
  { id: 'verification', label: 'Monthly Verification' },
]

export default function ReportsPage() {
  const { profile } = useAuth()
  const [activeReport, setActiveReport] = useState('timesheet')

  const canAccess = profile && ['manager', 'admin_manager', 'system_admin'].includes(profile.role)
  if (!canAccess) return (
    <div className="max-w-2xl mx-auto py-12 text-center text-gray-500">
      You do not have permission to access reports.
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 mt-1 text-sm">Generate and export timesheet, leave, and overtime reports.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <aside className="md:w-52 flex-shrink-0">
          {/* Mobile dropdown */}
          <select
            className="md:hidden w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
            value={activeReport}
            onChange={e => setActiveReport(e.target.value)}
          >
            {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {/* Desktop list */}
          <nav className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
            {REPORT_TYPES.map(r => (
              <button
                key={r.id}
                onClick={() => setActiveReport(r.id)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 transition-colors ${
                  activeReport === r.id
                    ? 'bg-[#1B5EA6] text-white font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
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
