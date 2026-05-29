import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconBadgeCheck, IconDownload } from '../components/Icons'

// ─── Types ────────────────────────────────────────────────────────────────────

type CertType = {
  id: string
  code: string
  name: string
  category: string | null
  display_order: number
}

type RawCertRow = {
  id: string
  employee_id: string
  certification_type_id: string
  has_certification: boolean
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  expiring_30: 'Expiring ≤30 days',
  expiring_60: 'Expiring ≤60 days',
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

function StatusBadge({ status }: { status: CertStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOURS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function exportCSV(rows: EnrichedCert[]) {
  const headers = ['Employee', 'Employee Code', 'Certification', 'Category', 'Expiry Date', 'Status', 'Notes']
  const escape = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      escape(`${r.profiles?.first_name} ${r.profiles?.surname}`),
      escape(r.profiles?.employee_code),
      escape(r.certification_types?.name),
      escape(r.certification_types?.category),
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function CertificationsDashboardPage() {
  const { profile } = useAuth()
  const [certTypes, setCertTypes] = useState<CertType[]>([])
  const [rows, setRows] = useState<EnrichedCert[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterCertType, setFilterCertType] = useState<string>('all') // cert type id or 'all'
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')

  // Sort
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const isManager = ['manager', 'admin_manager', 'system_admin'].includes(profile?.role ?? '')
  const isSupervisor = profile?.role === 'supervisor'

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [{ data: types }, { data: certs }] = await Promise.all([
        supabase.from('certification_types').select('id, code, name, category, display_order').order('display_order'),
        supabase
          .from('employee_certifications')
          .select(`
            id, employee_id, certification_type_id, has_certification, expiry_date, notes,
            profiles!employee_certifications_employee_id_fkey(first_name, surname, employee_code, site_id, department_id, status),
            certification_types!employee_certifications_certification_type_id_fkey(name, code, category, display_order)
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

  // Summary counts
  const summary = useMemo(() => ({
    total: rows.length,
    expired: rows.filter(r => r.cert_status === 'expired').length,
    expiring30: rows.filter(r => r.cert_status === 'expiring_30').length,
    expiring60: rows.filter(r => r.cert_status === 'expiring_60').length,
    valid: rows.filter(r => r.cert_status === 'valid' || r.cert_status === 'no_expiry').length,
  }), [rows])

  const filtered = useMemo(() => {
    let result = rows
    if (filterCertType !== 'all') result = result.filter(r => r.certification_type_id === filterCertType)
    if (filterStatus !== 'all') result = result.filter(r => r.cert_status === filterStatus)
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
        cmp = `${a.profiles?.surname} ${a.profiles?.first_name}`.localeCompare(`${b.profiles?.surname} ${b.profiles?.first_name}`)
      } else if (sortField === 'cert') {
        cmp = (a.certification_types?.display_order ?? 0) - (b.certification_types?.display_order ?? 0)
      } else if (sortField === 'expiry') {
        cmp = (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999')
      } else if (sortField === 'status') {
        const order: Record<CertStatus, number> = { expired: 0, expiring_30: 1, expiring_60: 2, valid: 3, no_expiry: 4 }
        cmp = order[a.cert_status] - order[b.cert_status]
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, filterCertType, filterStatus, search, sortField, sortDir])

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
      {/* Header */}
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
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Certifications', value: summary.total, colour: 'text-gray-900', bg: 'bg-white' },
              { label: 'Expired', value: summary.expired, colour: 'text-red-700', bg: 'bg-red-50' },
              { label: 'Expiring ≤30 days', value: summary.expiring30, colour: 'text-orange-700', bg: 'bg-orange-50' },
              { label: 'Valid / No Expiry', value: summary.valid, colour: 'text-green-700', bg: 'bg-green-50' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} border border-gray-200 rounded-lg p-4`}>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.colour}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Search employee or certification…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            />
            <select
              value={filterCertType}
              onChange={e => setFilterCertType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            >
              <option value="all">All Certifications</option>
              {certTypes.map(ct => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1B5EA6]"
            >
              {(Object.keys(STATUS_LABELS) as (FilterStatus)[]).map(k => (
                <option key={k} value={k}>{STATUS_LABELS[k]}</option>
              ))}
            </select>
            {(filterCertType !== 'all' || filterStatus !== 'all' || search) && (
              <button
                onClick={() => { setFilterCertType('all'); setFilterStatus('all'); setSearch('') }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No certifications match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                        onClick={() => toggleSort('name')}
                      >
                        Employee <SortIndicator field="name" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                        onClick={() => toggleSort('cert')}
                      >
                        Certification <SortIndicator field="cert" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                        onClick={() => toggleSort('expiry')}
                      >
                        Expiry Date <SortIndicator field="expiry" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                        onClick={() => toggleSort('status')}
                      >
                        Status <SortIndicator field="status" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/employees/${r.employee_id}`}
                            className="font-medium text-gray-900 hover:text-[#1B5EA6]"
                          >
                            {r.profiles?.first_name} {r.profiles?.surname}
                          </Link>
                          {r.profiles?.employee_code && (
                            <p className="text-xs text-gray-400">{r.profiles.employee_code}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <IconBadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span>{r.certification_types?.name}</span>
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
                            <p className="text-xs text-gray-400 mt-0.5">{r.days_until_expiry} days left</p>
                          )}
                          {r.days_until_expiry !== null && r.days_until_expiry < 0 && (
                            <p className="text-xs text-red-500 mt-0.5">{Math.abs(r.days_until_expiry)} days ago</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
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
    </div>
  )
}
