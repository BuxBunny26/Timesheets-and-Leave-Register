import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconFolder, IconDocument, IconDownload, IconTrash, IconXMark, IconSparkles, IconPencil } from '../components/Icons'
import type { Attachment, Profile, DocumentCategory } from '../types'
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_COLOURS } from '../types'

interface AttachmentRow extends Attachment {
  uploader?: Pick<Profile, 'id' | 'first_name' | 'surname'>
  week_start?: string
  employee_name?: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ADMIN_ROLES = ['admin_manager', 'system_admin']
const SUPERVISOR_ROLES = ['supervisor', 'manager', 'admin_manager', 'system_admin']

export default function DocumentsPage() {
  const { profile } = useAuth()
  const isAdmin = ADMIN_ROLES.includes(profile?.role ?? '')
  const isSupervisor = SUPERVISOR_ROLES.includes(profile?.role ?? '')

  const [rows, setRows] = useState<AttachmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState({ search: '', type: '' as '' | 'timesheet' | 'leave_request', month: '', category: '' as '' | DocumentCategory })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)

  useEffect(() => {
    loadDocuments()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh every 5 s while any document is still being classified.
  // Also retry classification on stale rows (uploaded > 15 s ago, still null).
  useEffect(() => {
    const pending = rows.filter(r => r.ai_classified_at === null)
    if (pending.length === 0) return
    const timer = setTimeout(async () => {
      const now = Date.now()
      for (const r of pending) {
        const uploadedMs = new Date(r.uploaded_at).getTime()
        if (now - uploadedMs > 15000) {
          await handleReclassify(r.id)
          return
        }
      }
      loadDocuments()
    }, 5000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  async function loadDocuments() {
    setLoading(true)
    setError(null)
    try {
      const { data: attachments, error: attErr } = await supabase
        .from('attachments')
        .select('*, uploader:uploaded_by(id, first_name, surname)')
        .order('uploaded_at', { ascending: false })

      if (attErr) throw attErr

      const rawAttachments = (attachments ?? []) as AttachmentRow[]

      // For timesheet attachments, fetch the week_start via timesheet_weeks
      const timesheetIds = rawAttachments
        .filter(a => a.linked_to_type === 'timesheet')
        .map(a => a.linked_to_id)

      let weekMap: Record<string, { week_start: string; employee_name: string }> = {}
      if (timesheetIds.length > 0) {
        const { data: weeks } = await supabase
          .from('timesheet_weeks')
          .select('id, week_start, employee:employee_id(first_name, surname)')
          .in('id', timesheetIds)

        if (weeks) {
          type WeekRow = { id: string; week_start: string; employee: { first_name: string; surname: string }[] | null }
          for (const w of (weeks as unknown as WeekRow[])) {
            const emp = Array.isArray(w.employee) ? w.employee[0] : w.employee
            weekMap[w.id] = {
              week_start: w.week_start,
              employee_name: emp ? `${emp.first_name} ${emp.surname}` : '—',
            }
          }
        }
      }

      const enriched: AttachmentRow[] = rawAttachments.map(a => ({
        ...a,
        week_start: a.linked_to_type === 'timesheet' ? weekMap[a.linked_to_id]?.week_start : undefined,
        employee_name: a.linked_to_type === 'timesheet'
          ? weekMap[a.linked_to_id]?.employee_name
          : a.uploader
            ? `${a.uploader.first_name} ${a.uploader.surname}`
            : '—',
      }))

      setRows(enriched)
    } catch (err) {
      console.error(err)
      setError('Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(att: AttachmentRow) {
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(att.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleReclassify(attId: string) {
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('classify-document', {
        body: { attachmentId: attId },
      })
      if (invokeErr) {
        console.error('classify-document invoke error:', invokeErr)
        setError(`Classification failed: ${invokeErr.message ?? 'edge function error'}`)
      } else if (data?.error) {
        console.error('classify-document returned error:', data.error)
        setError(`Classification failed: ${data.error}`)
      }
      await loadDocuments()
    } catch (err) {
      console.error('classify-document threw:', err)
      setError(`Classification failed: ${String(err)}`)
    }
  }

  async function handleUpdateCategory(attId: string, newCategory: DocumentCategory) {
    await supabase.from('attachments').update({
      category: newCategory,
      ai_classified_at: new Date().toISOString(),
    }).eq('id', attId)
    setRows(prev => prev.map(r => r.id === attId
      ? { ...r, category: newCategory, ai_classified_at: r.ai_classified_at ?? new Date().toISOString() }
      : r
    ))
    setEditingCategoryId(null)
  }

  async function handleDelete(att: AttachmentRow) {
    if (!window.confirm(`Delete "${att.ai_display_name ?? att.display_name}"? This cannot be undone.`)) return
    setDeleting(att.id)
    await supabase.storage.from('attachments').remove([att.storage_path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setRows(prev => prev.filter(r => r.id !== att.id))
    setDeleting(null)
  }

  const filtered = rows.filter(r => {
    if (filter.type && r.linked_to_type !== filter.type) return false
    if (filter.category && r.category !== filter.category) return false
    if (filter.month && r.week_start && !r.week_start.startsWith(filter.month)) return false
    if (filter.month && !r.week_start && !r.uploaded_at.startsWith(filter.month)) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      const name = (r.ai_display_name ?? r.display_name).toLowerCase()
      return name.includes(q) || (r.employee_name ?? '').toLowerCase().includes(q)
    }
    return true
  })

  if (!isAdmin) {
    // Non-admins fall through to the rendered list; RLS limits what they can see.
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <IconFolder className="w-5 h-5 text-[#1B5EA6]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-500 text-sm">
            {isAdmin
              ? 'All uploaded attachments across timesheets and leave requests'
              : isSupervisor
                ? 'Your uploads and documents submitted by your direct reports'
                : 'Documents you have uploaded to your timesheets and leave requests'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search employee or file name…"
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <select
          value={filter.type}
          onChange={e => setFilter(f => ({ ...f, type: e.target.value as typeof filter.type }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All types</option>
          <option value="timesheet">Timesheet</option>
          <option value="leave_request">Leave</option>
        </select>
        <select
          value={filter.category}
          onChange={e => setFilter(f => ({ ...f, category: e.target.value as typeof filter.category }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All categories</option>
          {(Object.entries(DOCUMENT_CATEGORY_LABELS) as [DocumentCategory, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          type="month"
          value={filter.month}
          onChange={e => setFilter(f => ({ ...f, month: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        />
        {(filter.search || filter.type || filter.month || filter.category) && (
          <button
            onClick={() => setFilter({ search: '', type: '', month: '', category: '' })}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <IconXMark className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <IconFolder className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No documents found</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Week</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Size</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(att => (
                <tr key={att.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconDocument className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate max-w-[200px]">
                          {att.ai_display_name ?? att.display_name}
                        </p>
                        {att.ai_display_name && att.ai_display_name !== att.display_name && (
                          <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{att.display_name}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{att.employee_name ?? '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {editingCategoryId === att.id ? (
                      <select
                        defaultValue={att.category ?? 'other'}
                        onChange={e => handleUpdateCategory(att.id, e.target.value as DocumentCategory)}
                        onBlur={() => setEditingCategoryId(null)}
                        autoFocus
                        className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white"
                      >
                        {(Object.entries(DOCUMENT_CATEGORY_LABELS) as [DocumentCategory, string][]).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    ) : att.ai_classified_at === null ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400 italic">Classifying…</span>
                        <button type="button" onClick={() => handleReclassify(att.id)} title="Retry classification" className="p-0.5 rounded hover:bg-gray-100">
                          <IconSparkles className="w-3 h-3 text-blue-500" />
                        </button>
                        <button type="button" onClick={() => setEditingCategoryId(att.id)} title="Set category manually" className="p-0.5 rounded hover:bg-gray-100">
                          <IconPencil className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${DOCUMENT_CATEGORY_COLOURS[att.category ?? 'other']}`}>
                          <IconSparkles className="w-3 h-3" />
                          {DOCUMENT_CATEGORY_LABELS[att.category ?? 'other']}
                        </span>
                        <button type="button" onClick={() => setEditingCategoryId(att.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 transition-opacity" title="Edit category">
                          <IconPencil className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {att.week_start ? formatDate(att.week_start) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{formatBytes(att.file_size_bytes)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(att.uploaded_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(att)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                        title="Download"
                      >
                        <IconDownload className="w-4 h-4" />
                      </button>
                      {(isAdmin || att.uploaded_by === profile?.id) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(att)}
                          disabled={deleting === att.id}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-50"
                          title="Delete"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">{filtered.length} document{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}
    </div>
  )
}
