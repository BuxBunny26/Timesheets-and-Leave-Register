import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconBadgeCheck, IconDownload, IconEye, IconXMark } from '../components/Icons'

// --- Types --------------------------------------------------------------------

type CertType = {
  id: string
  code: string
  name: string
  category: string | null
  technology: string | null
  cert_level: string | null
  display_order: number
}

type RawCertRow = {
  id: string
  employee_id: string
  certification_type_id: string
  has_certification: boolean
  attached: boolean
  expiry_date: string | null
  notes: string | null
  profiles: {
    first_name: string
    surname: string
    employee_code: string | null
    site_id: string | null
    department_id: string | null
    status: string
  } | null
  certification_types: {
    name: string
    code: string
    category: string | null
    technology: string | null
    cert_level: string | null
    display_order: number
  } | null
}

type CertStatus = 'expired' | 'expiring_30' | 'expiring_60' | 'valid' | 'no_expiry'

type EnrichedCert = RawCertRow & {
  cert_status: CertStatus
  days_until_expiry: number | null
}

type FilterStatus = 'all' | CertStatus
type SortField = 'name' | 'cert' | 'expiry' | 'status'
type SortDir = 'asc' | 'desc'

type Attachment = {
  id: string
  display_name: string
  storage_path: string
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_at: string
}

// --- Helpers ------------------------------------------------------------------

function computeCertStatus(expiryIso: string | null): { status: CertStatus; days: number | null } {
  if (!expiryIso) return { status: 'no_expiry', days: null }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiryIso + 'T00:00:00')
  const days = Math.round((exp.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { status: 'expired', days }
  if (days <= 30) return { status: 'expiring_30', days }
  if (days <= 60) return { status: 'expiring_60', days }
  return { status: 'valid', days }
}

const STATUS_LABELS: Record<CertStatus | 'all', string> = {
  all: 'All',
  expired: 'Expired',
  expiring_30: 'Expiring =30 days',
  expiring_60: 'Expiring =60 days',
  valid: 'Valid',
  no_expiry: 'No Expiry',
}

const STATUS_COLOURS: Record<CertStatus, string> = {
  expired: 'bg-red-100 text-red-800',
  expiring_30: 'bg-orange-100 text-orange-800',
  expiring_60: 'bg-yellow-100 text-yellow-800',
  valid: 'bg-green-100 text-green-800',
  no_expiry: 'bg-gray-100 text-gray-700',
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: CertStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOURS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function exportCSV(rows: EnrichedCert[]) {
  const headers = ['Employee', 'Employee Code', 'Certification', 'Technology', 'Level', 'Expiry Date', 'Status', 'Notes']
  const escape = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      escape(`${r.profiles?.first_name} ${r.profiles?.surname}`),
      escape(r.profiles?.employee_code),
      escape(r.certification_types?.name),
      escape(r.certification_types?.technology),
      escape(r.certification_types?.cert_level),
      escape(r.expiry_date),
      escape(STATUS_LABELS[r.cert_status]),
      escape(r.notes),
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `certifications-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Component ----------------------------------------------------------------

export default function CertificationsDashboardPage() {
  const { profile } = useAuth()
  const [certTypes, setCertTypes] = useState<CertType[]>([])
  const [rows, setRows] = useState<EnrichedCert[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterTechnology, setFilterTechnology] = useState<string>('all')
  const [filterLevel, setFilterLevel] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')

  // Sort
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Certificate viewer modal
  const [viewCert, setViewCert] = useState<{ certId: string; employeeName: string; certName: string } | null>(null)
  const [certAttachments, setCertAttachments] = useState<Attachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)

  const isManager = ['manager', 'admin_manager', 'system_admin'].includes(profile?.role ?? '')
  const isSupervisor = profile?.role === 'supervisor'

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [{ data: types }, { data: certs }] = await Promise.all([
        supabase
          .from('certification_types')
          .select('id, code, name, category, technology, cert_level, display_order')
          .order('display_order'),
        supabase
          .from('employee_certifications')
          .select(`
            id, employee_id, certification_type_id, has_certification, attached, expiry_date, notes,
            profiles!employee_certifications_employee_id_fkey(first_name, surname, employee_code, site_id, department_id, status),
            certification_types!employee_certifications_certification_type_id_fkey(name, code, category, technology, cert_level, display_order)
          `)
          .eq('has_certification', true)
      ])

      if (cancelled) return
      if (types) setCertTypes(types as CertType[])
      if (certs) {
        const enriched: EnrichedCert[] = (certs as unknown as RawCertRow[]).map(r => {
          const { status, days } = computeCertStatus(r.expiry_date)
          return { ...r, cert_status: status, days_until_expiry: days }
        })
        setRows(enriched)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile])

  async function openCertViewer(cert: EnrichedCert) {
    setViewCert({
      certId: cert.id,
      employeeName: `${cert.profiles?.first_name ?? ''} ${cert.profiles?.surname ?? ''}`.trim(),
      certName: cert.certification_types?.name ?? 'Certificate',
    })
    setLoadingAttachments(true)
    setCertAttachments([])
    const { data } = await supabase
      .from('attachments')
      .select('id, display_name, storage_path, file_size_bytes, mime_type, uploaded_at')
      .eq('linked_to_type', 'certification')
      .eq('linked_to_id', cert.id)
      .order('uploaded_at', { ascending: false })
    setCertAttachments((data as Attachment[]) ?? [])
    setLoadingAttachments(false)
  }

  async function downloadAttachment(att: Attachment) {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(att.storage_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const technologies = useMemo(() => {
    const seen = new Set<string>()
    certTypes.forEach(ct => { if (ct.technology) seen.add(ct.technology) })
    return Array.from(seen).sort()
  }, [certTypes])

  const levels = useMemo(() => {
    const seen = new Set<string>()
    certTypes.forEach(ct => {
      if (ct.cert_level && (filterTechnology === 'all' || ct.technology === filterTechnology)) {
        seen.add(ct.cert_level)
      }
    })
    const order = ['CAT I', 'CAT II', 'CAT III', 'CAT IV', 'Level I', 'Level II', 'Level III']
    return Array.from(seen).sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [certTypes, filterTechnology])

  const summary = useMemo(() => ({
    total: rows.length,
    expired: rows.filter(r => r.cert_status === 'expired').length,
    expiring30: rows.filter(r => r.cert_status === 'expiring_30').length,
    valid: rows.filter(r => r.cert_status === 'valid' || r.cert_status === 'no_expiry').length,
  }), [rows])

  const filtered = useMemo(() => {
    let result = rows
    if (filterTechnology !== 'all')
      result = result.filter(r => r.certification_types?.technology === filterTechnology)
    if (filterLevel !== 'all')
      result = result.filter(r => r.certification_types?.cert_level === filterLevel)
    if (filterStatus !== 'all')
      result = result.filter(r => r.cert_status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        `${r.profiles?.first_name} ${r.profiles?.surname}`.toLowerCase().includes(q) ||
        (r.profiles?.employee_code ?? '').toLowerCase().includes(q) ||
        (r.certification_types?.name ?? '').toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') {
        cmp = `${a.profiles?.first_name} ${a.profiles?.surname}`.localeCompare(`${b.profiles?.first_name} ${b.profiles?.surname}`)
      } else if (sortField === 'cert') {
        cmp = (a.certification_types?.display_order ?? 0) - (b.certification_types?.display_order ?? 0)
      } else if (sortField === 'expiry') {
        cmp = (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999')
      } else if (sortField === 'status') {
        const statusOrder: Record<CertStatus, number> = { expired: 0, expiring_30: 1, expiring_60: 2, valid: 3, no_expiry: 4 }
        cmp = statusOrder[a.cert_status] - statusOrder[b.cert_status]
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, filterTechnology, filterLevel, filterStatus, search, sortField, sortDir])

  const anyFilter = filterTechnology !== 'all' || filterLevel !== 'all' || filterStatus !== 'all' || !!search.trim()

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#1B5EA6] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (!isManager && !isSupervisor) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        You don't have access to view certifications.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Certifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of all employee certifications and expiry status.</p>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <IconDownload className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading&hellip;</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Certifications', value: summary.total, colour: 'text-gray-900', bg: 'bg-white' },
              { label: 'Expired', value: summary.expired, colour: 'text-red-700', bg: 'bg-red-50' },
              { label: 'Expiring =30 days', value: summary.expiring30, colour: 'text-orange-700', bg: 'bg-orange-50' },
              { label: 'Valid / No Expiry', value: summary.valid, colour: 'text-green-700', bg: 'bg-green-50' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} border border-gray-200 rounded-lg p-4`}>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.colour}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Search employee or certification..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            />
            <select
              value={filterTechnology}
              onChange={e => { setFilterTechnology(e.target.value); setFilterLevel('all') }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            >
              <option value="all">All Technologies</option>
              {technologies.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {levels.length > 0 && (
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
              >
                <option value="all">All Levels</option>
                {levels.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            >
              {(Object.keys(STATUS_LABELS) as FilterStatus[]).map(k => (
                <option key={k} value={k}>{STATUS_LABELS[k]}</option>
              ))}
            </select>
            {anyFilter && (
              <button
                onClick={() => { setFilterTechnology('all'); setFilterLevel('all'); setFilterStatus('all'); setSearch('') }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No certifications match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('name')}>
                        Employee <SortIndicator field="name" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('cert')}>
                        Certification <SortIndicator field="cert" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('expiry')}>
                        Expiry <SortIndicator field="expiry" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('status')}>
                        Status <SortIndicator field="status" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Certificate</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link to={`/employees/${r.employee_id}`} className="font-medium text-gray-900 hover:text-[#1B5EA6]">
                            {r.profiles?.first_name} {r.profiles?.surname}
                          </Link>
                          {r.profiles?.employee_code && (
                            <p className="text-xs text-gray-400">{r.profiles.employee_code}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <IconBadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <div>
                              <p>{r.certification_types?.name}</p>
                              {r.certification_types?.technology && (
                                <p className="text-xs text-gray-400">
                                  {r.certification_types.technology}
                                  {r.certification_types.cert_level ? ` \u00b7 ${r.certification_types.cert_level}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {r.expiry_date
                            ? new Date(r.expiry_date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                            : <span className="text-gray-400">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.cert_status} />
                          {r.days_until_expiry !== null && r.days_until_expiry >= 0 && r.days_until_expiry <= 60 && (
                            <p className="text-xs text-gray-400 mt-0.5">{r.days_until_expiry}d left</p>
                          )}
                          {r.days_until_expiry !== null && r.days_until_expiry < 0 && (
                            <p className="text-xs text-red-500 mt-0.5">{Math.abs(r.days_until_expiry)}d ago</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openCertViewer(r)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                              r.attached
                                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
                            }`}
                          >
                            <IconEye className="w-3 h-3" />
                            {r.attached ? 'View' : 'No file'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">
                          {r.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {viewCert && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setViewCert(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{viewCert.certName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{viewCert.employeeName}</p>
              </div>
              <button onClick={() => setViewCert(null)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <IconXMark className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {loadingAttachments ? (
                <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
              ) : certAttachments.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No certificate file has been uploaded for this record.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {certAttachments.map(att => (
                    <li key={att.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{att.display_name}</p>
                        <p className="text-xs text-gray-400">
                          {att.mime_type ?? 'File'}{att.file_size_bytes ? ` · ${formatBytes(att.file_size_bytes)}` : ''}
                          {' · '}{new Date(att.uploaded_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <button
                        onClick={() => downloadAttachment(att)}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B5EA6] border border-[#1B5EA6] rounded-lg hover:bg-blue-50"
                      >
                        <IconEye className="w-3 h-3" /> Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
