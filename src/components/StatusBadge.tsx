const colours: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  resubmitted: 'bg-violet-100 text-violet-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  denied: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  verified: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colours[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
