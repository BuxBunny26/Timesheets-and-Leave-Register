export default function NotificationsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Notifications</h1>
      <p className="text-gray-500 mb-6">Your alerts and updates.</p>
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10 text-center">
        <span className="text-4xl">🔔</span>
        <p className="mt-4 text-gray-600 font-medium">Notifications coming in Phase 2</p>
        <p className="mt-1 text-sm text-gray-400">
          Receive alerts for timesheet approvals, leave decisions, and overtime requests.
        </p>
      </div>
    </div>
  )
}
