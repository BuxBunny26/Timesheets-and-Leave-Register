import { useState, useMemo } from 'react'
import { useNotifications } from '../contexts/NotificationsContext'
import { IconBell, IconCheck } from '../components/Icons'
import type { Notification } from '../types'

// ── Category definitions ─────────────────────────────────────────────────────

type Category = 'all' | 'leave' | 'approved' | 'denied' | 'overtime' | 'timesheets' | 'other'

interface CategoryConfig {
  key: Category
  label: string
  types: string[]
  activeClass: string
  badgeClass: string
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'all',
    label: 'All',
    types: [],
    activeClass: 'bg-[#1B5EA6] text-white border-[#1B5EA6]',
    badgeClass: 'bg-blue-100 text-[#1B5EA6]',
  },
  {
    key: 'leave',
    label: 'Leave requests',
    types: ['leave_submitted', 'leave_final_returned'],
    activeClass: 'bg-sky-600 text-white border-sky-600',
    badgeClass: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'approved',
    label: 'Approved',
    types: ['leave_approved', 'leave_final_approved', 'ot_final_approved', 'timesheet_approved'],
    activeClass: 'bg-emerald-600 text-white border-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  {
    key: 'denied',
    label: 'Denied',
    types: ['leave_denied', 'leave_final_denied', 'ot_final_denied', 'timesheet_rejected'],
    activeClass: 'bg-red-600 text-white border-red-600',
    badgeClass: 'bg-red-100 text-red-700',
  },
  {
    key: 'overtime',
    label: 'Overtime',
    types: ['ot_submitted', 'ot_final_approved', 'ot_final_denied'],
    activeClass: 'bg-amber-500 text-white border-amber-500',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'timesheets',
    label: 'Timesheets',
    types: ['timesheet_submitted', 'timesheet_approved', 'timesheet_rejected'],
    activeClass: 'bg-violet-600 text-white border-violet-600',
    badgeClass: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'other',
    label: 'Other',
    types: [],
    activeClass: 'bg-gray-600 text-white border-gray-600',
    badgeClass: 'bg-gray-100 text-gray-600',
  },
]

const ALL_NAMED_TYPES = new Set(
  CATEGORIES.filter(c => c.key !== 'all' && c.key !== 'other').flatMap(c => c.types)
)

function matchesCategory(type: string, cat: CategoryConfig): boolean {
  if (cat.key === 'all') return true
  if (cat.key === 'other') return !ALL_NAMED_TYPES.has(type)
  return cat.types.includes(type)
}

// ── Dot colour by notification type ─────────────────────────────────────────

function dotColor(type: string, isRead: boolean): string {
  if (isRead) return 'bg-transparent'
  if (type === 'leave_approved' || type === 'leave_final_approved' || type === 'ot_final_approved' || type === 'timesheet_approved') return 'bg-emerald-500'
  if (type === 'leave_denied' || type === 'leave_final_denied' || type === 'ot_final_denied' || type === 'timesheet_rejected') return 'bg-red-500'
  if (type.startsWith('ot_')) return 'bg-amber-500'
  if (type.startsWith('timesheet_')) return 'bg-violet-500'
  if (type.startsWith('leave_')) return 'bg-sky-500'
  if (type === 'awol') return 'bg-red-600'
  return 'bg-gray-400'
}

function countFor(notifications: Notification[], cat: CategoryConfig): number {
  return notifications.filter(n => matchesCategory(n.type, cat)).length
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications()

  const [category, setCategory] = useState<Category>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const activeCat = CATEGORIES.find(c => c.key === category)!

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (!matchesCategory(n.type, activeCat)) return false
      const d = new Date(n.created_at)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        if (d > to) return false
      }
      return true
    })
  }, [notifications, activeCat, dateFrom, dateTo])

  const hasFilter = category !== 'all' || dateFrom || dateTo

  if (loading) return (
    <div className="max-w-3xl mx-auto flex justify-center py-12">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1B5EA6]" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 text-sm text-[#1B5EA6] hover:underline"
          >
            <IconCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => {
          const count = countFor(notifications, cat)
          const isActive = category === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                isActive
                  ? cat.activeClass
                  : 'border-[var(--border)] text-[var(--text-secondary)] bg-[var(--surface)] hover:border-[#1B5EA6] hover:text-[#1B5EA6]'
              }`}
            >
              {cat.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none ${isActive ? 'bg-white/25 text-white' : cat.badgeClass}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Date range filter */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-[var(--text-secondary)] flex-shrink-0">Date range</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={e => setDateFrom(e.target.value)}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
            aria-label="From date"
          />
          <span className="text-[var(--text-muted)] text-sm flex-shrink-0">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
            aria-label="To date"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs text-[var(--text-muted)] hover:text-[#1B5EA6] underline flex-shrink-0"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Results summary */}
      {hasFilter && (
        <p className="text-xs text-[var(--text-muted)] px-1">
          Showing <span className="font-medium">{filtered.length}</span> notification{filtered.length !== 1 ? 's' : ''}
          {category !== 'all' && <> in <span className="font-medium">{activeCat.label}</span></>}
          {(dateFrom || dateTo) && (
            <> &middot; {dateFrom || '…'} → {dateTo || 'now'}</>
          )}
          {hasFilter && (
            <> &middot; <button onClick={() => { setCategory('all'); setDateFrom(''); setDateTo('') }} className="text-[#1B5EA6] hover:underline">Clear all filters</button></>
          )}
        </p>
      )}

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-12 text-center">
          <IconBell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-[var(--text-muted)] font-medium">
            {notifications.length === 0 ? 'No notifications yet' : 'No notifications match these filters'}
          </p>
          {notifications.length === 0
            ? <p className="text-sm text-[var(--text-muted)] mt-1">You'll see alerts for timesheets, leave, and overtime here.</p>
            : <button onClick={() => { setCategory('all'); setDateFrom(''); setDateTo('') }} className="mt-2 text-sm text-[#1B5EA6] hover:underline">Clear filters</button>
          }
        </div>
      ) : (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
          {filtered.map(n => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markAsRead(n.id)}
              className={`flex gap-3 p-4 cursor-pointer transition-colors hover:bg-[var(--surface-secondary)] ${!n.is_read ? 'bg-blue-50/50' : ''}`}
            >
              <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dotColor(n.type, n.is_read)}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.is_read ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'}`}>
                  {n.title}
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">{n.message}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
