import { useState, useEffect, useCallback, useRef } from 'react'
import Holidays from 'date-holidays'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/StatusBadge'
import TeamOverview from '../components/TeamOverview'
import { IconPaperclip, IconDocument, IconTrash, IconDownload, IconXMark } from '../components/Icons'
import {
  getWeekBounds,
  formatDateISO,
  getDaysOfWeek,
} from '../lib/dateUtils'
import type { TimesheetWeek, TimesheetDay, DayStatus, TimesheetStatus, Attachment } from '../types'
import type { Role } from '../types'

const MANAGER_ROLES: Role[] = ['supervisor', 'manager', 'admin_manager', 'system_admin']
type ViewMode = 'my' | 'team'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_OPTIONS: DayStatus[] = ['present', 'leave', 'sick', 'awol', 'public_holiday', 'standby']
const WEEKEND_STATUS_OPTIONS: DayStatus[] = ['leave', 'sick', 'awol', 'public_holiday', 'standby']

interface DayState {
  primary_status: DayStatus | ''
  overtime_flag: boolean
  overtime_hours: number
  overtime_reason: string
  lol_flag: boolean
  loi_flag: boolean
  notes: string
  is_public_holiday: boolean
  holiday_name: string
  is_locked: boolean
}

function defaultDay(isHoliday: boolean, holidayName: string, isWeekend = false): DayState {
  return {
    primary_status: isHoliday ? 'public_holiday' : isWeekend ? '' : 'present',
    overtime_flag: false,
    overtime_hours: 0.5,
    overtime_reason: '',
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
  const [viewMode, setViewMode] = useState<ViewMode>('my')
  const canSeeTeam = profile?.role && MANAGER_ROLES.includes(profile.role)
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
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    return dateArr.map((d, i) => {
      const holidayResult = hd.current.isHoliday(d)
      const isHoliday = !!holidayResult
      const holidayName = isHoliday && Array.isArray(holidayResult) && holidayResult.length > 0
        ? holidayResult[0].name
        : ''
      return defaultDay(isHoliday, holidayName, i >= 5)
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
        overtime_reason: db.overtime_reason ?? '',
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

        // Upsert each day — skip weekend days with no status selected
        const dateArr = getDaysOfWeek(weekStart)
        const dayUpserts = updatedDays
          .map((day, idx) => ({ day, idx }))
          .filter(({ day }) => day.primary_status !== '')
          .map(({ day, idx }) => ({
            timesheet_week_id: currentWeekId,
            date: formatDateISO(dateArr[idx]),
            day_of_week: DAY_NAMES[idx],
            primary_status: day.primary_status,
            overtime_flag: day.overtime_flag,
            overtime_hours: day.overtime_flag ? day.overtime_hours : null,
            overtime_reason: day.overtime_flag ? (day.overtime_reason || null) : null,
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

  // Ensure the week record exists in DB and return its id
  async function ensureWeekSaved(): Promise<string | null> {
    if (weekId) return weekId
    if (!profile?.id) return null
    const weekStartStr = formatDateISO(weekStart)
    const weekEndStr = formatDateISO(weekEnd)
    const { data, error } = await supabase
      .from('timesheet_weeks')
      .upsert(
        { employee_id: profile.id, week_start: weekStartStr, week_end: weekEndStr, status: 'draft' },
        { onConflict: 'employee_id,week_start' }
      )
      .select('id')
      .single()
    if (error || !data) return null
    setWeekId(data.id)
    return data.id
  }

  async function loadAttachments(id: string) {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('linked_to_type', 'timesheet')
      .eq('linked_to_id', id)
      .order('uploaded_at', { ascending: false })
    if (data) setAttachments(data as Attachment[])
  }

  async function handleFileUpload(file: File) {
    if (!profile?.id) return
    setUploadingFile(true)
    setUploadError(null)
    const currentWeekId = await ensureWeekSaved()
    if (!currentWeekId) {
      setUploadError('Could not save timesheet. Please try again.')
      setUploadingFile(false)
      return
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${profile.id}/${formatDateISO(weekStart)}/${Date.now()}_${safeName}`
    const { error: storageErr } = await supabase.storage.from('attachments').upload(path, file)
    if (storageErr) {
      setUploadError(storageErr.message)
      setUploadingFile(false)
      return
    }
    const { error: dbErr } = await supabase.from('attachments').insert({
      linked_to_type: 'timesheet',
      linked_to_id: currentWeekId,
      display_name: file.name,
      storage_path: path,
      file_size_bytes: file.size,
      mime_type: file.type,
      uploaded_by: profile.id,
    })
    if (dbErr) {
      setUploadError(dbErr.message)
      setUploadingFile(false)
      return
    }
    await loadAttachments(currentWeekId)
    setUploadingFile(false)
  }

  async function handleDownloadAttachment(attachment: Attachment) {
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(attachment.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDeleteAttachment(attachment: Attachment) {
    await supabase.storage.from('attachments').remove([attachment.storage_path])
    await supabase.from('attachments').delete().eq('id', attachment.id)
    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  // Load attachments when weekId becomes known
  useEffect(() => {
    if (weekId) loadAttachments(weekId)
    else setAttachments([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId])

  const isLocked = weekStatus === 'submitted' || weekStatus === 'approved'
  const hasOtWithoutReason = days.some(d => d.overtime_flag && !d.overtime_reason.trim())
  const weekStartStr = formatDateISO(weekStart)
  const dateArr = getDaysOfWeek(weekStart)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {viewMode === 'my' ? 'Weekly timesheet entry' : 'Team timesheet overview'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'my' && <StatusBadge status={weekStatus} />}
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
      </div>

      {/* View toggle */}
      {canSeeTeam && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
          <button
            type="button"
            onClick={() => setViewMode('my')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'my'
                ? 'bg-white text-[#1B5EA6] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            My Timesheet
          </button>
          <button
            type="button"
            onClick={() => setViewMode('team')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'team'
                ? 'bg-white text-[#1B5EA6] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Team Overview
          </button>
        </div>
      )}

      {/* Team overview */}
      {viewMode === 'team' && <TeamOverview />}

      {/* My timesheet (hidden when in team mode) */}
      {viewMode === 'my' && (<>

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

                  {/* Primary status — no 'present' on weekends */}
                  <select
                    value={day.primary_status}
                    disabled={locked}
                    onChange={e => {
                      const newStatus = e.target.value as DayStatus | ''
                      handleDayChange(idx, { primary_status: newStatus })
                    }}
                    className={`w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-2 bg-white ${
                      locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                    }`}
                  >
                    {isWeekend && <option value="">— select —</option>}
                    {(isWeekend ? WEEKEND_STATUS_OPTIONS : STATUS_OPTIONS).map(s => (
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
                      onChange={e => handleDayChange(idx, { overtime_flag: e.target.checked, overtime_reason: '' })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">OT</span>
                  </label>
                  {day.overtime_flag && (
                    <div className="mb-2 space-y-1">
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
                        <p className="text-xs text-red-500">Must be &gt; 0</p>
                      )}
                      <textarea
                        value={day.overtime_reason}
                        disabled={locked}
                        onChange={e => handleDayChange(idx, { overtime_reason: e.target.value })}
                        rows={2}
                        placeholder="OT reason (required)…"
                        className={`w-full text-xs border rounded px-2 py-1 resize-none placeholder:text-gray-300 ${
                          !day.overtime_reason.trim() && !locked ? 'border-red-300 bg-red-50' : 'border-gray-200'
                        }`}
                      />
                      {!day.overtime_reason.trim() && !locked && (
                        <p className="text-xs text-red-500">Reason required</p>
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

          {/* Attachments */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <IconPaperclip className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Attachments</h3>
                {attachments.length > 0 && (
                  <span className="text-xs text-gray-400">({attachments.length})</span>
                )}
              </div>
              {!isLocked && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B5EA6] border border-[#1B5EA6] rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <IconPaperclip className="w-3.5 h-3.5" />
                    {uploadingFile ? 'Uploading…' : 'Add file'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                      e.target.value = ''
                    }}
                  />
                </>
              )}
            </div>

            {attachments.length === 0 && weekId && (
              <p className="text-xs text-gray-400 italic">No attachments yet. Upload sick notes, OT approval emails, or any supporting documents.</p>
            )}
            {attachments.length === 0 && !weekId && !isLocked && (
              <p className="text-xs text-gray-400 italic">No attachments yet. Click "Add file" to upload a sick note, OT approval email, or any supporting document.</p>
            )}

            {uploadError && (
              <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-200 rounded px-3 py-2">
                <p className="text-xs text-red-700">{uploadError}</p>
                <button onClick={() => setUploadError(null)}><IconXMark className="w-3.5 h-3.5 text-red-500" /></button>
              </div>
            )}

            {attachments.length > 0 && (
              <ul className="space-y-2">
                {attachments.map(att => (
                  <li key={att.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconDocument className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{att.display_name}</p>
                        {att.file_size_bytes && (
                          <p className="text-[10px] text-gray-400">{formatBytes(att.file_size_bytes)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500"
                        title="Download"
                      >
                        <IconDownload className="w-3.5 h-3.5" />
                      </button>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att)}
                          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                          title="Remove"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            {weekStatus === 'draft' && hasOtWithoutReason && (
              <p className="text-xs text-red-600">Please add a reason for all overtime days before submitting.</p>
            )}
            {weekStatus === 'draft' && (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={saving || !weekId || hasOtWithoutReason}
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
      </>)}
    </div>
  )
}
