import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconChevronRight } from '../components/Icons'
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
  decision_level: string | null
  status: 'active' | 'inactive'
  division?: { name: string } | null
  site?: { name: string } | null
  department?: { name: string } | null
  supervisor?: { id: string; first_name: string; surname: string } | null
  details?: {
    passport_expiry: string | null
    drivers_licence_expiry: string | null
    start_date: string | null
    engagement_date: string | null
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

// ── Organogram components ─────────────────────────────────────────────────────

type OrgNode = Row & { children: OrgNode[] }

function buildOrgTree(employees: Row[]): OrgNode[] {
  const byId = new Map<string, OrgNode>()
  for (const emp of employees) byId.set(emp.id, { ...emp, children: [] })
  const roots: OrgNode[] = []
  for (const node of byId.values()) {
    const supId = node.supervisor?.id
    if (supId && byId.has(supId)) {
      byId.get(supId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortTree = (n: OrgNode) => {
    n.children.sort((a, b) => a.first_name.localeCompare(b.first_name))
    n.children.forEach(sortTree)
  }
  roots.sort((a, b) => a.first_name.localeCompare(b.first_name))
  roots.forEach(sortTree)
  return roots
}

function OrgNodeCard({ node, canClick }: { node: OrgNode; canClick: boolean }) {
  const hasReports = node.children.length > 0
  const cardClass = `rounded-lg px-3 py-2.5 w-44 text-center transition-all select-none ${
    hasReports
      ? 'bg-blue-50 border border-blue-200' + (canClick ? ' cursor-pointer hover:shadow-md hover:border-[#1B5EA6]' : '')
      : 'bg-[var(--surface)] border border-[var(--border)]' + (canClick ? ' cursor-pointer hover:border-gray-300 hover:shadow-md' : '')
  }`
  const inner = (
    <div className={cardClass}>
      <p className="text-[11px] font-semibold text-[var(--text-primary)] leading-tight">{node.first_name} {node.surname}</p>
      {node.job_title && (
        <p className="text-[10px] text-[#1B5EA6] mt-0.5 leading-tight line-clamp-2">{node.job_title}</p>
      )}
      {node.decision_level && !(node.job_title ?? '').toLowerCase().includes(node.decision_level.toLowerCase()) && (
        <p className="text-[9px] mt-0.5 font-medium" style={{ color: node.decision_level === 'Executive' ? '#7c3aed' : node.decision_level === 'Manager' ? '#1B5EA6' : node.decision_level === 'Supervisor' ? '#0d9488' : '#6b7280' }}>{node.decision_level}</p>
      )}
      {node.employee_code && (
        <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{node.employee_code}</p>
      )}
      {node.site?.name && (
        <p className="text-[9px] text-[var(--text-muted)]">{node.site.name}</p>
      )}
    </div>
  )
  return canClick ? <Link to={`/employees/${node.id}`}>{inner}</Link> : inner
}

function OrgTreeNode({ node, depth = 0, isRoot = false, forceExpand = false, canClick = true }: { node: OrgNode; depth?: number; isRoot?: boolean; forceExpand?: boolean; canClick?: boolean }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isExpanded = forceExpand || expanded
  return (
    <li className={isRoot ? 'flex flex-col items-center' : 'org-li'}>
      <OrgNodeCard node={node} canClick={canClick} />
      {node.children.length > 0 && !forceExpand && (
        <button
          onClick={e => { e.preventDefault(); setExpanded(x => !x) }}
          className="mt-1 text-[10px] text-[var(--text-muted)] hover:text-[#1B5EA6] transition-colors org-no-print"
        >
          {expanded ? '▾ collapse' : `▸ ${node.children.length} report${node.children.length !== 1 ? 's' : ''}`}
        </button>
      )}
      {isExpanded && node.children.length > 0 && (
        <ul className="org-ul">
          {node.children.map(child => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} forceExpand={forceExpand} canClick={canClick} />
          ))}
        </ul>
      )}
    </li>
  )
}

function OrgChart({ rows, canClick = true }: { rows: Row[]; canClick?: boolean }) {
  const [orgSiteFilter, setOrgSiteFilter] = useState('')
  const [orgDeptFilter, setOrgDeptFilter] = useState('')
  const [orgLevelFilter, setOrgLevelFilter] = useState('')
  const [printMode, setPrintMode] = useState(false)
  const printAreaRef = useRef<HTMLDivElement>(null)

  function handlePrint() {
    setPrintMode(true)
    setTimeout(() => {
      window.print()
      setPrintMode(false)
    }, 300)
  }

  const sites = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.site?.name) s.add(r.site.name)
    return Array.from(s).sort()
  }, [rows])
  const departments = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.department?.name) s.add(r.department.name)
    return Array.from(s).sort()
  }, [rows])
  const levels = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.decision_level) s.add(r.decision_level)
    return Array.from(s).sort()
  }, [rows])

  const filtered = useMemo(
    () => rows.filter(r =>
      (!orgSiteFilter  || r.site?.name === orgSiteFilter) &&
      (!orgDeptFilter  || (
        orgDeptFilter === 'Executives'
          ? (r.decision_level === 'Executive' || r.department?.name === 'Executives')
          : r.department?.name === orgDeptFilter
      )) &&
      (!orgLevelFilter || r.decision_level === orgLevelFilter)
    ),
    [rows, orgSiteFilter, orgDeptFilter, orgLevelFilter]
  )
  const roots = useMemo(() => buildOrgTree(filtered), [filtered])
  return (
    <div>
      <style>{`
        .org-ul { display: flex; padding-top: 24px; position: relative; list-style: none; margin: 0; padding-left: 0; }
        .org-ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 1px solid #d1d5db; height: 24px; }
        .org-li { display: flex; flex-direction: column; align-items: center; padding: 24px 10px 0; position: relative; list-style: none; }
        .org-li::before, .org-li::after { content: ''; position: absolute; top: 0; height: 24px; }
        .org-li::before { border-top: 1px solid #d1d5db; border-right: 1px solid #d1d5db; right: 50%; left: 0; }
        .org-li::after { border-top: 1px solid #d1d5db; left: 50%; right: 0; }
        .org-li:first-child::before { border-top: none; }
        .org-li:last-child::after { border-top: none; }
        .org-li:only-child::before { border: none; }
        .org-li:only-child::after { display: none; }
        @media print {
          @page { size: landscape; margin: 8mm; }
          body * { overflow: visible !important; }
          * { visibility: hidden !important; }
          .org-print-area, .org-print-area * { visibility: visible !important; }
          .org-print-area {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: max-content !important;
          }
          .org-no-print { display: none !important; }
        }
      `}</style>
      <div className="flex gap-3 items-center mb-4 p-3 bg-[var(--surface-secondary)] rounded-lg border border-[var(--border)] flex-wrap org-no-print">
        <select
          value={orgSiteFilter}
          onChange={e => setOrgSiteFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
        >
          <option value="">All sites</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={orgDeptFilter}
          onChange={e => setOrgDeptFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
        >
          <option value="">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={orgLevelFilter}
          onChange={e => setOrgLevelFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
        >
          <option value="">All levels</option>
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{filtered.length} employees shown</span>
        <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
          Blue card = has direct reports{canClick ? ' · Click card to view profile' : ''} · ▸/▾ to expand/collapse
        </span>
        <button
          onClick={handlePrint}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#1B5EA6] hover:bg-[#174f8c] text-white text-xs font-medium transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Export PDF
        </button>
      </div>
      <div ref={printAreaRef} className="overflow-x-auto pb-6 org-print-area">
        <ul className="flex gap-16 list-none pl-6 m-0">
          {roots.map(root => (
            <OrgTreeNode key={root.id} node={root} depth={0} isRoot={true} forceExpand={printMode} canClick={canClick} />
          ))}
        </ul>
      </div>
      {roots.length === 0 && (
        <div className="text-center py-10 text-[var(--text-muted)]">No employees to display.</div>
      )}
    </div>
  )
}

export default function EmployeeDirectoryPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAllowed = !!profile?.role && (MANAGER_ROLES as readonly string[]).includes(profile.role)

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [expiringOnly, setExpiringOnly] = useState(false)
  // Employees only see the organogram tab; managers default to directory
  const [activeTab, setActiveTab] = useState<'directory' | 'organogram'>(() => isAllowed ? 'directory' : 'organogram')

  useEffect(() => {
    if (!isAllowed) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          id, employee_code, first_name, surname, email, job_title, cell_number, status, supervisor_id, decision_level,
          division:divisions(name),
          site:sites(name),
          department:departments(name)
        `)
        .order('first_name')

      if (error) {
        console.error('Directory load failed:', error)
        setLoadError(error.message)
        setLoading(false)
        return
      }

      const ids = (profiles ?? []).map((p: { id: string }) => p.id)
      const supervisorIds = Array.from(new Set(
        (profiles ?? [])
          .map((p: { supervisor_id: string | null }) => p.supervisor_id)
          .filter((s): s is string => !!s)
      ))

      // Fetch details, certifications, and supervisor name lookup in parallel.
      // Each is a separate query to avoid PostgREST embed/RLS edge cases.
      const [{ data: detailRows }, { data: certs }, { data: supervisorRows }] = await Promise.all([
        ids.length > 0
          ? supabase
              .from('employee_details')
              .select('employee_id, passport_expiry, drivers_licence_expiry, start_date, engagement_date')
              .in('employee_id', ids)
          : Promise.resolve({ data: [] as { employee_id: string; passport_expiry: string | null; drivers_licence_expiry: string | null }[] }),
        ids.length > 0
          ? supabase
              .from('employee_certifications')
              .select('id, employee_id, certification_type_id, has_certification, expiry_date, attached, notes, created_at, updated_at')
              .in('employee_id', ids)
              .eq('has_certification', true)
              .not('expiry_date', 'is', null)
          : Promise.resolve({ data: [] as EmployeeCertification[] }),
        supervisorIds.length > 0
          ? supabase.rpc('get_supervisor_names', { supervisor_ids: supervisorIds })
          : Promise.resolve({ data: [] as { id: string; first_name: string; surname: string }[] }),
      ])

      const supByID = new Map<string, { id: string; first_name: string; surname: string }>()
      for (const s of (supervisorRows ?? []) as Array<{ id: string; first_name: string; surname: string }>) {
        supByID.set(s.id, s)
      }

      const detailByEmp = new Map<string, { passport_expiry: string | null; drivers_licence_expiry: string | null; start_date: string | null; engagement_date: string | null }>()
      for (const d of (detailRows ?? []) as Array<{ employee_id: string; passport_expiry: string | null; drivers_licence_expiry: string | null; start_date: string | null; engagement_date: string | null }>) {
        detailByEmp.set(d.employee_id, { passport_expiry: d.passport_expiry, drivers_licence_expiry: d.drivers_licence_expiry, start_date: d.start_date, engagement_date: d.engagement_date })
      }
      const certsByEmp = new Map<string, EmployeeCertification[]>()
      for (const c of (certs ?? []) as EmployeeCertification[]) {
        const arr = certsByEmp.get(c.employee_id) ?? []
        arr.push(c)
        certsByEmp.set(c.employee_id, arr)
      }

      const mapped: Row[] = (profiles ?? []).map((p: Record<string, unknown>) => {
        const det = detailByEmp.get(p.id as string) ?? null
        const passportExp = det?.passport_expiry ?? null
        const licenceExp = det?.drivers_licence_expiry ?? null
        const ecerts = certsByEmp.get(p.id as string) ?? []
        const expiringSoon = [
          ...ecerts.map(c => daysUntil(c.expiry_date)),
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
          decision_level: (p.decision_level as string) ?? null,
          status: p.status as 'active' | 'inactive',
          division: (Array.isArray(p.division) ? p.division[0] : p.division) as Row['division'],
          site: (Array.isArray(p.site) ? p.site[0] : p.site) as Row['site'],
          department: (Array.isArray(p.department) ? p.department[0] : p.department) as Row['department'],
          supervisor: p.supervisor_id ? (supByID.get(p.supervisor_id as string) ?? null) : null,
          details: { passport_expiry: passportExp, drivers_licence_expiry: licenceExp, start_date: det?.start_date ?? null, engagement_date: det?.engagement_date ?? null },
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

  // Lightweight fetch for regular employees — only org chart data, no sensitive fields.
  // Uses the org_chart_view which bypasses RLS and exposes non-sensitive fields only.
  useEffect(() => {
    if (isAllowed) return   // managers use the full fetch above
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      const { data, error } = await supabase
        .from('org_chart_view')
        .select('id, first_name, surname, job_title, decision_level, employee_code, status, supervisor_id, site_name, department_name')
      if (!cancelled) {
        if (error) {
          console.error('Org chart fetch failed:', error)
          setLoadError('Could not load organogram. Please ensure migration 086_org_chart_view.sql has been applied to the database.')
        } else if (data) {
          const mapped: Row[] = (data as {
            id: string; first_name: string; surname: string; job_title: string | null
            decision_level: string | null; employee_code: string | null; status: 'active' | 'inactive'
            supervisor_id: string | null; site_name: string | null; department_name: string | null
          }[]).map(p => ({
            id: p.id,
            first_name: p.first_name,
            surname: p.surname,
            job_title: p.job_title,
            decision_level: p.decision_level,
            employee_code: p.employee_code,
            status: p.status,
            email: '',
            cell_number: null,
            supervisor: p.supervisor_id ? { id: p.supervisor_id, first_name: '', surname: '' } : null,
            site: p.site_name ? { name: p.site_name } : null,
            department: p.department_name ? { name: p.department_name } : null,
            details: null,
            expiring_count: 0,
          }))
          setRows(mapped)
        }
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAllowed, profile])

  const sites = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.site?.name) s.add(r.site.name)
    return Array.from(s).sort()
  }, [rows])

  const departments = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.department?.name) s.add(r.department.name)
    return Array.from(s).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (siteFilter && r.site?.name !== siteFilter) return false
      if (departmentFilter && r.department?.name !== departmentFilter) return false
      if (expiringOnly && (r.expiring_count ?? 0) === 0) return false
      if (!term) return true
      const hay = [
        r.first_name, r.surname, r.email, r.employee_code ?? '',
        r.job_title ?? '', r.cell_number ?? '',
        r.department?.name ?? '',
        r.supervisor ? `${r.supervisor.first_name} ${r.supervisor.surname}` : '',
      ].join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [rows, search, siteFilter, departmentFilter, statusFilter, expiringOnly])

  if (!profile) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{isAllowed ? 'Employee Directory' : 'Organogram'}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {isAllowed
              ? 'Personal, contact, qualifications and certification details for all staff.'
              : 'Company organisational structure.'}
          </p>
        </div>
        {isAllowed && (
          <div className="text-xs text-[var(--text-muted)]">
            {loading ? 'Loading…' : `${filtered.length} of ${rows.length}`}
          </div>
        )}
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          Failed to load directory: {loadError}
        </div>
      )}

      {/* Tabs — only show Directory tab to managers/supervisors */}
      {isAllowed && (
      <div className="flex border-b border-[var(--border)]">
        {(['directory', 'organogram'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-[#1B5EA6] text-[#1B5EA6]'
                : 'border-transparent text-[var(--tab-inactive-text)] hover:text-[var(--tab-inactive-hover-text)]'
            }`}
          >
            {tab === 'directory' ? 'Directory' : 'Organogram'}
          </button>
        ))}
      </div>
      )}

      {activeTab === 'directory' && (<>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, job title, supervisor..."
          className="flex-1 min-w-[220px] px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
        />
        <select
          value={siteFilter}
          onChange={e => setSiteFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
        >
          <option value="">All sites</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={departmentFilter}
          onChange={e => setDepartmentFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
        >
          <option value="">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm px-3 py-2 border border-[var(--border)] rounded-md cursor-pointer">
          <input type="checkbox" checked={expiringOnly} onChange={e => setExpiringOnly(e.target.checked)} />
          Expiring soon
        </label>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--text-muted)]">Loading…</div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Job Title</th>
                  <th className="px-3 py-2 text-left font-medium">Division</th>
                  <th className="px-3 py-2 text-left font-medium">Department</th>
                  <th className="px-3 py-2 text-left font-medium">Supervisor</th>
                  <th className="px-3 py-2 text-left font-medium">Site</th>
                  <th className="px-3 py-2 text-left font-medium">Cell</th>
                  <th className="px-3 py-2 text-left font-medium">Start Date</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Alerts</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-blue-50/40 cursor-pointer"
                    onClick={() => navigate(`/employees/${r.id}`)}
                  >
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Link to={`/employees/${r.id}`} className="text-[#1B5EA6] hover:underline font-medium">
                        {r.first_name} {r.surname}
                      </Link>
                      {r.employee_code && (
                        <div className="text-[11px] text-[var(--text-muted)]">{r.employee_code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.email}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.job_title ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.division?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.department?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {r.supervisor ? `${r.supervisor.first_name} ${r.supervisor.surname}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.site?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.cell_number ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                      {r.details?.start_date
                        ? new Date(r.details.start_date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-[var(--text-secondary)]'}`}>
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
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Link
                        to={`/employees/${r.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#1B5EA6] hover:bg-[#174f8c] text-white text-xs font-medium whitespace-nowrap"
                      >
                        View <IconChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-8 text-center text-[var(--text-muted)]">No employees match the filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {filtered.map(r => (
              <Link key={r.id} to={`/employees/${r.id}`} className="block px-3 py-3 hover:bg-blue-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">{r.first_name} {r.surname}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{r.job_title ?? '—'} · {r.department?.name ?? '—'} · {r.site?.name ?? '—'}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{r.email}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-[var(--text-secondary)]'}`}>
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
              <div className="px-3 py-8 text-center text-[var(--text-muted)]">No employees match the filters.</div>
            )}
          </div>
        </div>
      )}
      </>)}

      {activeTab === 'organogram' && (
        loading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-[#1B5EA6] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <OrgChart rows={rows.filter(r => r.status === 'active')} canClick={isAllowed} />
        )
      )}
    </div>
  )
}
