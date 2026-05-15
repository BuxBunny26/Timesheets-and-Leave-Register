import { useState, useEffect, useCallback, useRef } from 'react'
import Holidays from 'date-holidays'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import {
  getWeekBounds,
  formatDateISO,
  getDaysOfWeek,
} from '../lib/dateUtils'
import type { TimesheetWeek, TimesheetDay, DayStatus, TimesheetStatus } from '../types'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_OPTIONS: DayStatus[] = ['present', 'leave', 'sick', 'awol', 'public_holiday', 'standby']

interface DayState {
  primary_status: DayStatus
  overtime_flag: boolean
  overtime_hours: number
  lol_flag: boolean
  loi_flag: boolean
  notes: string
  is_public_holiday: boolean
  holiday_name: string
  is_locked: boolean
}

function defaultDay(isHoliday: boolean, holidayName: string): DayState {
  return {
    primary_status: isHoliday ? 'public_holiday' : 'present',
    overtime_flag: false,
    overtime_hours: 0.5,
    lol_flag: false,
    loi_flag: false,
    notes: '',
    is_public_holiday: isHoliday,
    holiday_name: holidayName,
    is_locked: isHoliday,
  }
}

function formatWeekRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatDayHeading(d: Date, idx: number): string {
  const dayName = DAY_NAMES[idx]
  return `${dayName} ${d.getDate()} ${d.toLocaleDateString('en-ZA', { month: 'short' })}`
}

export default function TimesheetsPage() {
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekStart, setWeekStart] = useState<Date>(new Date())
  const [weekEnd, setWeekEnd] = useState<Date>(new Date())
  const [days, setDays] = useState<DayState[]>([])
  const [weekId, setWeekId] = useState<string | null>(null)
  const [weekStatus, setWeekStatus] = useState<TimesheetStatus>('draft')
  const [reviewerComment, setReviewerComment] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hd = useRef<InstanceType<typeof Holidays>>(new Holidays())

  // Init holidays based on country code
  useEffect(() => {
    const cc = profile?.country_code ?? 'ZA'
    hd.current = new Holidays(cc)
  }, [profile?.country_code])

  // Recalculate week bounds on offset change
  useEffect(() => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    const { start, end } = getWeekBounds(base)
    setWeekStart(start)
    setWeekEnd(end)
  }, [weekOffset])

  // Load timesheet when week changes
  useEffect(() => {
    if (!profile?.id) return
    loadWeek()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, profile?.id])

  function buildDaysFromDates(weekStartDate: Date): DayState[] {
    const dateArr = getDaysOfWeek(weekStartDate)
    return dateArr.map(d => {
      const holidayResult = hd.current.isHoliday(d)
      const isHoliday = !!holidayResult
      const holidayName = isHoliday && Array.isArray(holidayResult) && holidayResult.length > 0
        ? holidayResult[0].name
        : ''
      return defaultDay(isHoliday, holidayName)
    })
  }

  function mergeDaysWithDb(baseDays: DayState[], dbDays: TimesheetDay[]): DayState[] {
    const dateArr = getDaysOfWeek(weekStart)
    return baseDays.map((base, idx) => {
      const dateStr = formatDateISO(dateArr[idx])
      const db = dbDays.find(d => d.date === dateStr)
      if (!db) return base
      return {
        primary_status: db.primary_status,
        overtime_flag: db.overtime_flag,
        overtime_hours: db.overtime_hours ?? 0.5,
        lol_flag: db.lol_flag,
        loi_flag: db.loi_flag,
        notes: db.notes ?? '',
        is_public_holiday: base.is_public_holiday,
        holiday_name: base.holiday_name,
        is_locked: db.is_locked || base.is_public_holiday,
      }
    })
  }

  async function loadWeek() {
    setLoading(true)
    setSaveError(null)
    try {
      const baseDays = buildDaysFromDates(weekStart)
      const weekStartStr = formatDateISO(weekStart)

      // Try localStorage draft first for instant render
      const draftKey = `timesheet_draft_${profile!.id}_${weekStartStr}`
      const localDraft = localStorage.getItem(draftKey)

      const { data: week, error } = await supabase
        .from('timesheet_weeks')
        .select('*, days:timesheet_days(*)')
        .eq('employee_id', profile!.id)
        .eq('week_start', weekStartStr)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (week) {
        const typedWeek = week as TimesheetWeek & { days: TimesheetDay[] }
        setWeekId(typedWeek.id)
        setWeekStatus(typedWeek.status)
        setReviewerComment(typedWeek.reviewer_comment ?? null)
        const merged = mergeDaysWithDb(baseDays, typedWeek.days ?? [])
        setDays(merged)
      } else {
        // No DB record yet — use localStorage draft or blank
        setWeekId(null)
        setWeekStatus('draft')
        setReviewerComment(null)
        if (localDraft) {
          try {
            const parsed = JSON.parse(localDraft) as DayState[]
            // Restore public holiday flags from fresh computation
            const restored = parsed.map((d, i) => ({
              ...d,
              is_public_holiday: baseDays[i].is_public_holiday,
              holiday_name: baseDays[i].holiday_name,
              is_locked: baseDays[i].is_public_holiday || d.is_locked,
            }))
            setDays(restored)
          } catch {
            setDays(baseDays)
          }
        } else {
          setDays(baseDays)
        }
      }
    } catch (err) {
      setSaveError('Failed to load timesheet.')
      console.error(err)
      const baseDays = buildDaysFromDates(weekStart)
      setDays(baseDays)
    } finally {
      setLoading(false)
    }
  }

  const autoSave = useCallback(
    async (updatedDays: DayState[]) => {
      if (!profile?.id) return
      const weekStartStr = formatDateISO(weekStart)
      const weekEndStr = formatDateISO(weekEnd)
      const draftKey = `timesheet_draft_${profile.id}_${weekStartStr}`

      // Save to localStorage
      localStorage.setItem(draftKey, JSON.stringify(updatedDays))

      setSaving(true)
      setSaveError(null)
      try {
        // Upsert week
        const { data: upsertedWeek, error: weekErr } = await supabase
          .from('timesheet_weeks')
          .upsert(
            {
              employee_id: profile.id,
              week_start: weekStartStr,
              week_end: weekEndStr,
              status: 'draft',
            },
            { onConflict: 'employee_id,week_start' }
          )
          .select('id, status, reviewer_comment')
          .single()

        if (weekErr) throw weekErr

        const currentWeekId = upsertedWeek.id
        if (!weekId) setWeekId(currentWeekId)

        // Upsert each day
        const dateArr = getDaysOfWeek(weekStart)
        const dayUpserts = updatedDays.map((day, idx) => ({
          timesheet_week_id: currentWeekId,
          date: formatDateISO(dateArr[idx]),
          day_of_week: DAY_NAMES[idx],
          primary_status: day.primary_status,
          overtime_flag: day.overtime_flag,
          overtime_hours: day.overtime_flag ? day.overtime_hours : null,
          lol_flag: day.lol_flag,
          loi_flag: day.loi_flag,
          notes: day.notes || null,
        }))

        const { error: daysErr } = await supabase
          .from('timesheet_days')
          .upsert(dayUpserts, { onConflict: 'timesheet_week_id,date' })

        if (daysErr) throw daysErr
      } catch (err) {
        setSaveError('Auto-save failed. Draft saved locally.')
        console.error(err)
      } finally {
        setSaving(false)
      }
    },
    [profile, weekStart, weekEnd, weekId]
  )

  function handleDayChange(idx: number, partial: Partial<DayState>) {
    setDays(prev => {
      const updated = prev.map((d, i) => (i === idx ? { ...d, ...partial } : d))
      // Debounce auto-save
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (weekStatus === 'draft') autoSave(updated)
      }, 2000)
      return updated
    })
  }

  async function handleSubmit() {
    if (!weekId || !profile?.id) return
    setShowConfirm(false)
    setSaving(true)
    try {
      const { error } = await supabase
        .from('timesheet_weeks')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', weekId)
      if (error) throw error
      setWeekStatus('submitted')
    } catch (err) {
      setSaveError('Failed to submit timesheet.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const isLocked = weekStatus === 'submitted' || weekStatus === 'approved'
  const weekStartStr = formatDateISO(weekStart)
  const dateArr = getDaysOfWeek(weekStart)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-gray-500 text-sm mt-0.5">Weekly timesheet entry</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={weekStatus} />
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold"
        >
          ←
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-800 text-sm">{formatWeekRange(weekStart, weekEnd)}</p>
          {weekOffset === 0 && <p className="text-xs text-blue-600">Current week</p>}
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-blue-600 underline"
            >
              Go to current week
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold"
        >
          →
        </button>
      </div>

      {/* Rejection comment */}
      {weekStatus === 'rejected' && reviewerComment && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">Timesheet rejected</p>
          <p className="text-sm text-red-700 mt-1">{reviewerComment}</p>
        </div>
      )}

      {/* Error */}
      {saveError && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">{saveError}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Day grid: mobile = stack, desktop = 7 columns */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-4">
            {days.map((day, idx) => {
              const date = dateArr[idx]
              const locked = day.is_locked || isLocked
              const isWeekend = idx >= 5

              return (
                <div
                  key={weekStartStr + idx}
                  className={`bg-white rounded-lg border p-3 ${
                    isWeekend ? 'border-gray-100 bg-gray-50' : 'border-gray-200'
                  } ${locked && !day.is_public_holiday ? 'opacity-75' : ''}`}
                >
                  {/* Day heading */}
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    {formatDayHeading(date, idx)}
                  </p>

                  {/* Public holiday badge */}
                  {day.is_public_holiday && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 mb-2">
                      {day.holiday_name || 'Public Holiday'}
                    </span>
                  )}

                  {/* Primary status */}
                  <select
                    value={day.primary_status}
                    disabled={locked}
                    onChange={e =>
                      handleDayChange(idx, { primary_status: e.target.value as DayStatus })
                    }
                    className={`w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-2 bg-white ${
                      locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                    }`}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>

                  {/* OT */}
                  <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.overtime_flag}
                      disabled={locked}
                      onChange={e => handleDayChange(idx, { overtime_flag: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">OT</span>
                  </label>
                  {day.overtime_flag && (
                    <div className="mb-2">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={day.overtime_hours}
                        disabled={locked}
                        onChange={e =>
                          handleDayChange(idx, { overtime_hours: parseFloat(e.target.value) || 0.5 })
                        }
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                        placeholder="Hours"
                      />
                      {day.overtime_flag && (day.overtime_hours ?? 0) <= 0 && (
                        <p className="text-xs text-red-500 mt-0.5">Must be &gt; 0</p>
                      )}
                    </div>
                  )}

                  {/* LOL */}
                  <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.lol_flag}
                      disabled={locked}
                      onChange={e => handleDayChange(idx, { lol_flag: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">LOL</span>
                  </label>

                  {/* LOI */}
                  <label className="flex items-center gap-1.5 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.loi_flag}
                      disabled={locked}
                      onChange={e => handleDayChange(idx, { loi_flag: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">LOI</span>
                  </label>

                  {/* Notes */}
                  <textarea
                    value={day.notes}
                    disabled={locked}
                    onChange={e => handleDayChange(idx, { notes: e.target.value })}
                    rows={2}
                    placeholder="Notes…"
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none placeholder:text-gray-300"
                  />
                </div>
              )
            })}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            {weekStatus === 'draft' && (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={saving || !weekId}
                className="px-5 py-2 bg-[#1B5EA6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Submit timesheet
              </button>
            )}
            {weekStatus !== 'draft' && (
              <p className="text-sm text-gray-500 italic">
                Timesheet is <strong>{weekStatus}</strong> and cannot be edited.
              </p>
            )}
          </div>
        </>
      )}

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Submit timesheet?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Once submitted you cannot make changes. Are you sure?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 rounded-lg bg-[#1B5EA6] text-white text-sm font-medium hover:bg-blue-700"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
