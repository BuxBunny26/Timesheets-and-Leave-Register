import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconChevronLeft, IconPlus, IconXMark, IconCheck } from '../components/Icons'
import type { Profile, EmployeeDetails, EmployeeDependant, EmployeeCertification, CertificationType } from '../types'

type DetailsForm = Omit<EmployeeDetails, 'employee_id' | 'created_at' | 'updated_at'>

const EMPTY_DETAILS: DetailsForm = {
  id_attached: false,
  has_passport: false,
  passport_number: null, passport_expiry: null, passport_attached: false,
  cell_phone_contract_owner: null, service_provider: null, whatsapp_number: null, personal_email: null,
  has_drivers_licence: false, drivers_licence_number: null, drivers_licence_expiry: null, drivers_licence_attached: false,
  has_medical_aid: false, medical_aid_provider: null, medical_aid_number: null,
  medical_practitioner_name: null, doctor_contact_number: null, allergies_diet: null,
  home_address: null, complex_street_name: null, suburb: null, city: null, province: null, country: null, postal_code: null, home_pin_location: null,
  next_of_kin_name: null, next_of_kin_relationship: null, next_of_kin_contact: null,
  matric: false, matric_year: null, trade_certificate: null, diplomas_degrees: null, other_qualification: null, start_date: null,
  comp_alignment: false, comp_balancing: false, comp_vibration: false, comp_sampling: false,
  comp_thermography: false, comp_motor_circuit_analysis: false, comp_vibration_monitoring: false,
}

const COMPETENCIES: { key: keyof DetailsForm; label: string }[] = [
  { key: 'comp_alignment',                label: 'Alignment' },
  { key: 'comp_balancing',                label: 'Balancing' },
  { key: 'comp_vibration',                label: 'Vibration' },
  { key: 'comp_sampling',                 label: 'Sampling' },
  { key: 'comp_thermography',             label: 'Thermography' },
  { key: 'comp_motor_circuit_analysis',   label: 'Motor Circuit Analysis' },
  { key: 'comp_vibration_monitoring',     label: 'Vibration Monitoring & Analysis' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  )
}

function Field({
  label, value, onChange, disabled, type = 'text', placeholder,
}: {
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  disabled?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B5EA6]"
      />
    </label>
  )
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  )
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function ExpiryBadge({ iso }: { iso: string | null | undefined }) {
  const d = daysUntil(iso)
  if (d === null) return null
  let cls = 'bg-gray-100 text-gray-600'
  let text = `${d} days`
  if (d < 0) { cls = 'bg-red-100 text-red-700'; text = 'Expired' }
  else if (d <= 7) cls = 'bg-red-100 text-red-700'
  else if (d <= 30) cls = 'bg-orange-100 text-orange-700'
  else if (d <= 60) cls = 'bg-amber-100 text-amber-700'
  else if (d <= 180) cls = 'bg-emerald-100 text-emerald-700'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{text}</span>
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: viewer } = useAuth()
  const navigate = useNavigate()

  const [employee, setEmployee] = useState<Profile | null>(null)
  const [details, setDetails] = useState<DetailsForm>(EMPTY_DETAILS)
  const [dependants, setDependants] = useState<EmployeeDependant[]>([])
  const [certTypes, setCertTypes] = useState<CertificationType[]>([])
  const [certs, setCerts] = useState<Record<string, EmployeeCertification>>({}) // keyed by certification_type_id
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isSelf = viewer?.id === id
  const isAdmin = viewer?.role === 'admin_manager' || viewer?.role === 'system_admin'
  const canEdit = !!(isSelf || isAdmin)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: prof }, { data: det }, { data: deps }, { data: types }, { data: ec }] = await Promise.all([
        supabase.from('profiles')
          .select('*, division:divisions(*), department:departments(*), payment_centre:payment_centres(*), site:sites(*), supervisor:profiles!profiles_supervisor_id_fkey(id, first_name, surname, email)')
          .eq('id', id).maybeSingle(),
        supabase.from('employee_details').select('*').eq('employee_id', id).maybeSingle(),
        supabase.from('employee_dependants').select('*').eq('employee_id', id).order('created_at'),
        supabase.from('certification_types').select('*').order('display_order'),
        supabase.from('employee_certifications').select('*').eq('employee_id', id),
      ])
      if (cancelled) return
      setEmployee((prof as unknown as Profile) ?? null)
      if (det) {
        const { employee_id: _e, created_at: _c, updated_at: _u, ...rest } = det as EmployeeDetails
        setDetails(rest)
      } else {
        setDetails(EMPTY_DETAILS)
      }
      setDependants((deps as EmployeeDependant[]) ?? [])
      setCertTypes((types as CertificationType[]) ?? [])
      const map: Record<string, EmployeeCertification> = {}
      for (const c of (ec as EmployeeCertification[]) ?? []) map[c.certification_type_id] = c
      setCerts(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const update = (patch: Partial<DetailsForm>) => setDetails(prev => ({ ...prev, ...patch }))
  const nullable = (s: string) => s.trim() === '' ? null : s.trim()
  const nullableInt = (s: string) => {
    if (s.trim() === '') return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }

  async function saveAll() {
    if (!id || !canEdit) return
    setSaving(true)
    try {
      // 1. Upsert employee_details
      const { error: edErr } = await supabase
        .from('employee_details')
        .upsert({ employee_id: id, ...details }, { onConflict: 'employee_id' })
      if (edErr) throw edErr

      // 2. Upsert certifications (only rows the user toggled or set fields on)
      const certRows = certTypes
        .map(t => certs[t.id])
        .filter(Boolean) as EmployeeCertification[]
      if (certRows.length > 0) {
        const payload = certRows.map(c => ({
          ...(c.id ? { id: c.id } : {}),
          employee_id: id,
          certification_type_id: c.certification_type_id,
          has_certification: c.has_certification,
          expiry_date: c.expiry_date,
          attached: c.attached,
          notes: c.notes,
        }))
        const { error: cErr } = await supabase
          .from('employee_certifications')
          .upsert(payload, { onConflict: 'employee_id,certification_type_id' })
        if (cErr) throw cErr
      }

      showToast('success', 'Saved')
    } catch (e) {
      console.error(e)
      showToast('error', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function addDependant() {
    if (!id || !canEdit) return
    const name = prompt('Dependant full name?')
    if (!name) return
    const dob = prompt('Date of birth (YYYY-MM-DD), or leave blank:')
    const { data, error } = await supabase
      .from('employee_dependants')
      .insert({ employee_id: id, name, date_of_birth: dob || null })
      .select().single()
    if (error) { showToast('error', error.message); return }
    setDependants(prev => [...prev, data as EmployeeDependant])
  }

  async function removeDependant(depId: string) {
    if (!canEdit) return
    if (!confirm('Remove this dependant?')) return
    const { error } = await supabase.from('employee_dependants').delete().eq('id', depId)
    if (error) { showToast('error', error.message); return }
    setDependants(prev => prev.filter(d => d.id !== depId))
  }

  function setCert(typeId: string, patch: Partial<EmployeeCertification>) {
    setCerts(prev => {
      const existing = prev[typeId] ?? {
        id: '',
        employee_id: id ?? '',
        certification_type_id: typeId,
        has_certification: false,
        expiry_date: null,
        attached: false,
        notes: null,
        created_at: '',
        updated_at: '',
      }
      return { ...prev, [typeId]: { ...existing, ...patch } as EmployeeCertification }
    })
  }

  const certWarnings = useMemo(() => {
    const warn: string[] = []
    for (const t of certTypes) {
      const c = certs[t.id]
      if (!c?.has_certification || !c.expiry_date) continue
      const d = daysUntil(c.expiry_date)
      if (d !== null && d <= 60) warn.push(`${t.name}: ${d < 0 ? 'expired' : `${d} days`}`)
    }
    const pExp = daysUntil(details.passport_expiry)
    if (details.has_passport && pExp !== null && pExp <= 60) warn.push(`Passport: ${pExp < 0 ? 'expired' : `${pExp} days`}`)
    const lExp = daysUntil(details.drivers_licence_expiry)
    if (details.has_drivers_licence && lExp !== null && lExp <= 60) warn.push(`Driver's licence: ${lExp < 0 ? 'expired' : `${lExp} days`}`)
    return warn
  }, [certs, certTypes, details])

  if (loading) return <div className="text-center py-10 text-gray-500">Loading…</div>
  if (!employee) return <div className="text-center py-10 text-red-600">Employee not found or you don't have access.</div>

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
            <IconChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{employee.surname}, {employee.first_name}</h1>
            <p className="text-sm text-gray-500">
              {employee.job_title ?? '—'} · {employee.site?.name ?? '—'} · {employee.supervisor ? `Supervisor: ${employee.supervisor.first_name} ${employee.supervisor.surname}` : 'No supervisor'}
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={saveAll}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-[#1B5EA6] hover:bg-[#174f8c] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            <IconCheck className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-xs text-gray-600">
          You have read-only access to this profile.
        </div>
      )}

      {certWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-800">
          <div className="font-medium mb-1">Expiring within 60 days</div>
          <ul className="list-disc ml-5">
            {certWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <Section title="Identity">
        <Toggle label="ID attached" checked={details.id_attached} onChange={v => update({ id_attached: v })} disabled={!canEdit} />
        <Toggle label="Has passport" checked={details.has_passport} onChange={v => update({ has_passport: v })} disabled={!canEdit} />
        <Toggle label="Passport attached" checked={details.passport_attached} onChange={v => update({ passport_attached: v })} disabled={!canEdit} />
        <Field label="Passport number" value={details.passport_number} onChange={v => update({ passport_number: nullable(v) })} disabled={!canEdit} />
        <div>
          <Field label="Passport expiry" type="date" value={details.passport_expiry} onChange={v => update({ passport_expiry: nullable(v) })} disabled={!canEdit} />
          <div className="mt-1"><ExpiryBadge iso={details.passport_expiry} /></div>
        </div>
      </Section>

      <Section title="Contact">
        <Field label="Cell number" value={employee.cell_number} onChange={() => {}} disabled placeholder="Edit in Profile page" />
        <Field label="Cell phone contract owner" value={details.cell_phone_contract_owner} onChange={v => update({ cell_phone_contract_owner: nullable(v) })} disabled={!canEdit} />
        <Field label="Service provider" value={details.service_provider} onChange={v => update({ service_provider: nullable(v) })} disabled={!canEdit} />
        <Field label="WhatsApp (if different)" value={details.whatsapp_number} onChange={v => update({ whatsapp_number: nullable(v) })} disabled={!canEdit} />
        <Field label="Personal e-mail" type="email" value={details.personal_email} onChange={v => update({ personal_email: nullable(v) })} disabled={!canEdit} />
        <Field label="Company e-mail" value={employee.email} onChange={() => {}} disabled />
      </Section>

      <Section title="Driver's Licence">
        <Toggle label="Has driver's licence" checked={details.has_drivers_licence} onChange={v => update({ has_drivers_licence: v })} disabled={!canEdit} />
        <Toggle label="Attached" checked={details.drivers_licence_attached} onChange={v => update({ drivers_licence_attached: v })} disabled={!canEdit} />
        <Field label="Licence number" value={details.drivers_licence_number} onChange={v => update({ drivers_licence_number: nullable(v) })} disabled={!canEdit} />
        <div>
          <Field label="Licence expiry" type="date" value={details.drivers_licence_expiry} onChange={v => update({ drivers_licence_expiry: nullable(v) })} disabled={!canEdit} />
          <div className="mt-1"><ExpiryBadge iso={details.drivers_licence_expiry} /></div>
        </div>
      </Section>

      <Section title="Medical">
        <Toggle label="Has medical aid" checked={details.has_medical_aid} onChange={v => update({ has_medical_aid: v })} disabled={!canEdit} />
        <Field label="Medical aid provider" value={details.medical_aid_provider} onChange={v => update({ medical_aid_provider: nullable(v) })} disabled={!canEdit} />
        <Field label="Medical aid number" value={details.medical_aid_number} onChange={v => update({ medical_aid_number: nullable(v) })} disabled={!canEdit} />
        <Field label="Medical practitioner" value={details.medical_practitioner_name} onChange={v => update({ medical_practitioner_name: nullable(v) })} disabled={!canEdit} />
        <Field label="Doctor's contact number" value={details.doctor_contact_number} onChange={v => update({ doctor_contact_number: nullable(v) })} disabled={!canEdit} />
        <Field label="Allergies / dietary restrictions" value={details.allergies_diet} onChange={v => update({ allergies_diet: nullable(v) })} disabled={!canEdit} />
      </Section>

      <Section title="Home Address">
        <Field label="Home address" value={details.home_address} onChange={v => update({ home_address: nullable(v) })} disabled={!canEdit} />
        <Field label="Complex name / street name" value={details.complex_street_name} onChange={v => update({ complex_street_name: nullable(v) })} disabled={!canEdit} />
        <Field label="Suburb" value={details.suburb} onChange={v => update({ suburb: nullable(v) })} disabled={!canEdit} />
        <Field label="City" value={details.city} onChange={v => update({ city: nullable(v) })} disabled={!canEdit} />
        <Field label="Province" value={details.province} onChange={v => update({ province: nullable(v) })} disabled={!canEdit} />
        <Field label="Country" value={details.country} onChange={v => update({ country: nullable(v) })} disabled={!canEdit} />
        <Field label="Postal code" value={details.postal_code} onChange={v => update({ postal_code: nullable(v) })} disabled={!canEdit} />
        <Field label="Home pin location (Google Maps link)" value={details.home_pin_location} onChange={v => update({ home_pin_location: nullable(v) })} disabled={!canEdit} />
      </Section>

      <Section title="Next of Kin">
        <Field label="Name & surname" value={details.next_of_kin_name} onChange={v => update({ next_of_kin_name: nullable(v) })} disabled={!canEdit} />
        <Field label="Relationship" value={details.next_of_kin_relationship} onChange={v => update({ next_of_kin_relationship: nullable(v) })} disabled={!canEdit} />
        <Field label="Contact number" value={details.next_of_kin_contact} onChange={v => update({ next_of_kin_contact: nullable(v) })} disabled={!canEdit} />
      </Section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Dependants (Children)</h2>
          {canEdit && (
            <button onClick={addDependant} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
              <IconPlus className="w-3 h-3" /> Add
            </button>
          )}
        </div>
        {dependants.length === 0 ? (
          <p className="text-sm text-gray-500">No dependants on file.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {dependants.map(d => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{d.name}</span>
                  {d.date_of_birth && <span className="text-gray-500 ml-2">DOB {d.date_of_birth}</span>}
                </div>
                {canEdit && (
                  <button onClick={() => removeDependant(d.id)} className="text-red-600 hover:text-red-800 p-1">
                    <IconXMark className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Section title="Education & Start Date">
        <Toggle label="Matric" checked={details.matric} onChange={v => update({ matric: v })} disabled={!canEdit} />
        <Field label="Matric completed year" type="number" value={details.matric_year} onChange={v => update({ matric_year: nullableInt(v) })} disabled={!canEdit} />
        <Field label="Start date" type="date" value={details.start_date} onChange={v => update({ start_date: nullable(v) })} disabled={!canEdit} />
        <Field label="Trade certificate" value={details.trade_certificate} onChange={v => update({ trade_certificate: nullable(v) })} disabled={!canEdit} />
        <Field label="Diplomas / degrees" value={details.diplomas_degrees} onChange={v => update({ diplomas_degrees: nullable(v) })} disabled={!canEdit} />
        <Field label="Other qualification" value={details.other_qualification} onChange={v => update({ other_qualification: nullable(v) })} disabled={!canEdit} />
      </Section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Certifications</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Certification</th>
                <th className="px-3 py-2 text-left font-medium">Held</th>
                <th className="px-3 py-2 text-left font-medium">Expiry (YYYY-MM-DD)</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Attached</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {certTypes.map(t => {
                const c = certs[t.id]
                return (
                  <tr key={t.id}>
                    <td className="px-3 py-2 text-gray-900">{t.name}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={c?.has_certification ?? false}
                        onChange={e => setCert(t.id, { has_certification: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        disabled={!canEdit || !(c?.has_certification ?? false)}
                        value={c?.expiry_date ?? ''}
                        onChange={e => setCert(t.id, { expiry_date: e.target.value || null })}
                        className="px-2 py-1 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-3 py-2"><ExpiryBadge iso={c?.expiry_date} /></td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={c?.attached ?? false}
                        onChange={e => setCert(t.id, { attached: e.target.checked })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Section title="Competencies">
        {COMPETENCIES.map(c => (
          <Toggle
            key={c.key}
            label={c.label}
            checked={Boolean(details[c.key])}
            onChange={v => update({ [c.key]: v } as Partial<DetailsForm>)}
            disabled={!canEdit}
          />
        ))}
      </Section>

      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={saveAll}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-[#1B5EA6] hover:bg-[#174f8c] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            <IconCheck className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <div>
        <Link to="/employees" className="text-sm text-[#1B5EA6] hover:underline">← Back to directory</Link>
      </div>
    </div>
  )
}
