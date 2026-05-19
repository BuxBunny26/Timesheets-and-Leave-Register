export function getWeekBounds(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function formatDateDisplay(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getDaysOfWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
}

export function countWorkingDays(start: Date, end: Date, holidayISO: Set<string> = new Set()): number {
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    const iso = formatDateISO(cur)
    if (day !== 0 && day !== 6 && !holidayISO.has(iso)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * Returns the FY-end year for the supplied date using a 1-July financial year.
 * E.g. 5 Aug 2025 → 2026 (FY 1 Jul 2025 – 30 Jun 2026).
 */
export function fyEndYearFor(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear()
}

/**
 * Returns the human label for a FY-end year.
 * 2026 → "FY 2026 (Jul 2025 – Jun 2026)".
 */
export function fyLabel(fyEndYear: number): string {
  const start = new Date(fyEndYear - 1, 6, 1)
  const end = new Date(fyEndYear, 5, 30)
  const fmt = (d: Date) => d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
  return `FY ${fyEndYear} (${fmt(start)} – ${fmt(end)})`
}
