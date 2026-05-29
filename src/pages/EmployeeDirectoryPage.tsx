import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { EmployeeCertification } from '../types'

const MANAGER_ROLES = ['supervisor', 'manager', 'admin_manager', 'system_admin'] as const

interface Row {
  id: string
  employee_code: string | null
  first_name: string
  surname: string
  email: string
  job_title: string | null
  cell_number: string | null
  status: 'active' | 'inactive'
  site?: { name: string } | null
  supervisor?: { id: string; first_name: string; surname: string } | null
  details?: {
    passport_expiry: string | null
    drivers_licence_expiry: string | null
  } | null
  expiring_count?: number
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function expiryPill(iso: string | null | undefined, label: string) {
  const d = daysUntil(iso)
  if (d === null) return null
  if (d < 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">{label} expired</span>
  if (d <= 30) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">{label} {d}d</span>
  if (d <= 60) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">{label} {d}d</span>
  return null
}

export default function EmployeeDirectoryPage() {
  const { profile } = useAuth()
  const isAllowed = !!profile?.role && (MANAGER_ROLES as readonly string[]).includes(profile.role)

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [expiringOnly, setExpiringOnly] = useState(false)

  useEffect(() => {
    if (!isAllowed) return
    let cancelled = false

    async function load() {
      setLoading(true)
      // Profiles + joined site/supervisor/details
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          id, employee_code, first_name, surname, email, job_title, cell_number, status,
          site:sites(name),
          supervisor:profiles!profiles_supervisor_id_fkey(id, first_name, surname),
          details:employee_details(passport_expiry, drivers_licence_expiry)
        `)
        .order('surname')

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      const ids = (profiles ?? []).map((p: { id: string }) => p.id)
      let certsByEmp = new Map<string, EmployeeCertification[]>()
      if (ids.length > 0) {
        const { data: certs } = await supabase
          .from('employee_certifications')
          .select('id, employee_id, has_certification, expiry_date')
          .in('employee_id', ids)
          .eq('has_certification', true)
          .not('expiry_date', 'is', null)
        for (const c of (certs ?? []) as EmployeeCertification[]) {
          const arr = certsByEmp.get(c.employee_id) ?? []
          arr.push(c)
          certsByEmp.set(c.employee_id, arr)
        }
      }

      const mapped: Row[] = (profiles ?? []).map((p: Record<string, unknown>) => {
        const detailsRaw = p.details as unknown
        const det = Array.isArray(detailsRaw) ? detailsRaw[0] : detailsRaw
        const passportExp = (det as { passport_expiry?: string | null } | null)?.passport_expiry ?? null
        const licenceExp = (det as { drivers_licence_expiry?: string | null } | null)?.drivers_licence_expiry ?? null
        const certs = certsByEmp.get(p.id as string) ?? []
        const expiringSoon = [
          ...certs.map(c => daysUntil(c.expiry_date)),
          daysUntil(passportExp),
          daysUntil(licenceExp),
        ].filter((d): d is number => d !== null && d <= 60).length

        return {
          id: p.id as string,
          employee_code: (p.employee_code as string) ?? null,
          first_name: p.first_name as string,
          surname: p.surname as string,
          email: p.email as string,
          job_title: (p.job_title as string) ?? null,
          cell_number: (p.cell_number as string) ?? null,
          status: p.status as 'active' | 'inactive',
          site: (Array.isArray(p.site) ? p.site[0] : p.site) as Row['site'],
          supervisor: (Array.isArray(p.supervisor) ? p.supervisor[0] : p.supervisor) as Row['supervisor'],
          details: { passport_expiry: passportExp, drivers_licence_expiry: licenceExp },
          expiring_count: expiringSoon,
        }
      })

      if (!cancelled) {
        setRows(mapped)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isAllowed])

  const sites = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.site?.name) s.add(r.site.name)
    return Array.from(s).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (siteFilter && r.site?.name !== siteFilter) return false
      if (expiringOnly && (r.expiring_count ?? 0) === 0) return false
      if (!term) return true
      const hay = [
        r.first_name, r.surname, r.email, r.employee_code ?? '',
        r.job_title ?? '', r.cell_number ?? '',
        r.supervisor ? `${r.supervisor.first_name} ${r.supervisor.surname}` : '',
      ].join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [rows, search, siteFilter, statusFilter, expiringOnly])

  if (!profile) return null
  if (!isAllowed) return <Navigate to="/" replace />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Employee Directory</h1>
          <p className="text-sm text-gray-500">Personal, contact, qualifications and certification details for all staff.</p>
        </div>
        <div className="text-xs text-gray-500">{filtered.length} of {rows.length}</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, job title, supervisor..."
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
        />
        <select
          value={siteFilter}
          onChange={e => setSiteFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All sites</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm px-3 py-2 border border-gray-300 rounded-md cursor-pointer">
          <input type="checkbox" checked={expiringOnly} onChange={e => setExpiringOnly(e.target.checked)} />
          Expiring soon
        </label>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading…</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Surname, Name</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Job Title</th>
                  <th className="px-3 py-2 text-left font-medium">Supervisor</th>
                  <th className="px-3 py-2 text-left font-medium">Site</th>
                  <th className="px-3 py-2 text-left font-medium">Cell</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-2">
                      <Link to={`/employees/${r.id}`} className="text-[#1B5EA6] hover:underline font-medium">
                        {r.surname}, {r.first_name}
                      </Link>
                      {r.employee_code && (
                        <div className="text-[11px] text-gray-500">{r.employee_code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.email}</td>
                    <td className="px-3 py-2 text-gray-700">{r.job_title ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.supervisor ? `${r.supervisor.first_name} ${r.supervisor.surname}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.site?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{r.cell_number ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {expiryPill(r.details?.passport_expiry, 'Passport')}
                        {expiryPill(r.details?.drivers_licence_expiry, 'Licence')}
                        {(r.expiring_count ?? 0) > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                            {r.expiring_count} expiring
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">No employees match the filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map(r => (
              <Link key={r.id} to={`/employees/${r.id}`} className="block px-3 py-3 hover:bg-blue-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{r.surname}, {r.first_name}</p>
                    <p className="text-xs text-gray-500 truncate">{r.job_title ?? '—'} · {r.site?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{r.email}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {expiryPill(r.details?.passport_expiry, 'Passport')}
                  {expiryPill(r.details?.drivers_licence_expiry, 'Licence')}
                  {(r.expiring_count ?? 0) > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                      {r.expiring_count} expiring
                    </span>
                  )}
                </div>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-gray-500">No employees match the filters.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
