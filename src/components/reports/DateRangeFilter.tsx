import type { ReactNode } from 'react'

interface Props {
  startDate: string
  endDate: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onRun: () => void
  loading?: boolean
  children?: ReactNode
}

export default function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange, onRun, loading, children }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-5 pb-5 border-b border-[var(--border)]">
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">From</label>
        <input type="date" value={startDate} onChange={e => onStartChange(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]" />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To</label>
        <input type="date" value={endDate} onChange={e => onEndChange(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]" />
      </div>
      {children}
      <button onClick={onRun} disabled={loading}
        className="px-4 py-2 bg-[#1B5EA6] text-white text-sm font-medium rounded-lg hover:bg-[#154d8c] disabled:opacity-50 transition-colors">
        {loading ? 'Loading...' : 'Run report'}
      </button>
    </div>
  )
}
