// notify-cert-expiry
// Runs daily (schedule in Supabase Dashboard → Database → Cron).
// Finds certifications, passports, and driver's licences that expire in
// exactly 60, 30, or 7 days and notifies the employee + their direct
// supervisor via in-app notifications and (if configured) email.
//
// Idempotency: we set notifications.related_entity_type='cert_expiry' and
// related_entity_id to a synthetic key "<employee_id>:<item_code>:<days>".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'WearCheck ARC <timesheets@wearcheckrs.com>'

const WINDOWS = [60, 30, 7] as const

function isoDate(d: Date): string { return d.toISOString().split('T')[0] }

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

interface ExpiringItem {
  employee_id: string
  employee_first_name: string | null
  employee_surname: string | null
  employee_email: string | null
  supervisor_id: string | null
  supervisor_first_name: string | null
  supervisor_email: string | null
  item_code: string     // e.g. 'passport', 'drivers_licence', or cert code
  item_label: string    // human-readable
  expiry_date: string
  days_left: number
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Compute exact target dates for each alert window
  const targetByDays = new Map<number, string>()
  for (const n of WINDOWS) {
    const d = new Date(today)
    d.setDate(d.getDate() + n)
    targetByDays.set(n, isoDate(d))
  }
  const targetDates = Array.from(targetByDays.values())

  const items: ExpiringItem[] = []

  // 1. Certifications
  const { data: certs, error: certErr } = await supabase
    .from('employee_certifications')
    .select(`
      employee_id, expiry_date, has_certification,
      certification_type:certification_types ( code, name ),
      employee:profiles!employee_certifications_employee_id_fkey (
        id, first_name, surname, email, supervisor_id,
        supervisor:profiles!profiles_supervisor_id_fkey ( id, first_name, email )
      )
    `)
    .eq('has_certification', true)
    .in('expiry_date', targetDates)

  if (certErr) {
    console.error('Cert fetch failed:', certErr)
    return new Response(JSON.stringify({ ok: false, error: certErr.message }), { status: 500 })
  }

  for (const c of (certs ?? []) as unknown as Array<{
    employee_id: string
    expiry_date: string
    certification_type: { code: string; name: string } | null
    employee: {
      id: string; first_name: string | null; surname: string | null; email: string | null
      supervisor_id: string | null
      supervisor: { id: string; first_name: string | null; email: string | null } | null
    } | null
  }>) {
    if (!c.employee || !c.certification_type) continue
    const days = [...targetByDays.entries()].find(([_, d]) => d === c.expiry_date)?.[0]
    if (!days) continue
    items.push({
      employee_id: c.employee.id,
      employee_first_name: c.employee.first_name,
      employee_surname: c.employee.surname,
      employee_email: c.employee.email,
      supervisor_id: c.employee.supervisor_id,
      supervisor_first_name: c.employee.supervisor?.first_name ?? null,
      supervisor_email: c.employee.supervisor?.email ?? null,
      item_code: c.certification_type.code,
      item_label: c.certification_type.name,
      expiry_date: c.expiry_date,
      days_left: days,
    })
  }

  // 2. Passport + driver's licence (on employee_details)
  const { data: docs, error: docErr } = await supabase
    .from('employee_details')
    .select(`
      employee_id, has_passport, passport_expiry, has_drivers_licence, drivers_licence_expiry,
      employee:profiles!employee_details_employee_id_fkey (
        id, first_name, surname, email, supervisor_id,
        supervisor:profiles!profiles_supervisor_id_fkey ( id, first_name, email )
      )
    `)
    .or(
      `passport_expiry.in.(${targetDates.join(',')}),drivers_licence_expiry.in.(${targetDates.join(',')})`
    )

  if (docErr) {
    console.error('Details fetch failed:', docErr)
  } else {
    for (const r of (docs ?? []) as unknown as Array<{
      employee_id: string
      has_passport: boolean; passport_expiry: string | null
      has_drivers_licence: boolean; drivers_licence_expiry: string | null
      employee: {
        id: string; first_name: string | null; surname: string | null; email: string | null
        supervisor_id: string | null
        supervisor: { id: string; first_name: string | null; email: string | null } | null
      } | null
    }>) {
      if (!r.employee) continue
      const base = {
        employee_id: r.employee.id,
        employee_first_name: r.employee.first_name,
        employee_surname: r.employee.surname,
        employee_email: r.employee.email,
        supervisor_id: r.employee.supervisor_id,
        supervisor_first_name: r.employee.supervisor?.first_name ?? null,
        supervisor_email: r.employee.supervisor?.email ?? null,
      }
      if (r.has_passport && r.passport_expiry) {
        const days = [...targetByDays.entries()].find(([_, d]) => d === r.passport_expiry)?.[0]
        if (days) items.push({ ...base, item_code: 'passport', item_label: 'Passport', expiry_date: r.passport_expiry, days_left: days })
      }
      if (r.has_drivers_licence && r.drivers_licence_expiry) {
        const days = [...targetByDays.entries()].find(([_, d]) => d === r.drivers_licence_expiry)?.[0]
        if (days) items.push({ ...base, item_code: 'drivers_licence', item_label: "Driver's Licence", expiry_date: r.drivers_licence_expiry, days_left: days })
      }
    }
  }

  let notified = 0

  for (const it of items) {
    const key = `${it.employee_id}:${it.item_code}:${it.days_left}`

    // Idempotency: skip if we already sent this exact alert (we embed the
    // synthetic key in the message body so we can match it back).
    const { data: dup } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'cert_expiry')
      .eq('recipient_id', it.employee_id)
      .ilike('message', `%${key}%`)
      .limit(1)
    if (dup && dup.length > 0) continue

    const empName = `${it.employee_first_name ?? ''} ${it.employee_surname ?? ''}`.trim() || 'A team member'
    const dueLabel = it.days_left === 7 ? '7 days' : `${it.days_left} days`

    // 1. Notify employee
    await supabase.from('notifications').insert({
      recipient_id: it.employee_id,
      type: 'cert_expiry',
      title: `Your ${it.item_label} expires in ${dueLabel}`,
      message: `${it.item_label} expires on ${fmtDate(it.expiry_date)}. Please renew and upload a copy. [${key}]`,
      related_entity_type: 'cert_expiry',
    })
    if (it.employee_email) {
      await sendEmail(
        it.employee_email,
        `Reminder: your ${it.item_label} expires in ${dueLabel}`,
        `<p>Hi ${it.employee_first_name ?? ''},</p>
         <p>Your <strong>${it.item_label}</strong> expires on <strong>${fmtDate(it.expiry_date)}</strong> — ${dueLabel} from today.</p>
         <p>Please make arrangements to renew it and upload the updated copy on the WearCheck Timesheets portal.</p>
         <p>— WearCheck ARC Timesheets</p>`
      )
    }
    notified++

    // 2. Notify supervisor
    if (it.supervisor_id) {
      await supabase.from('notifications').insert({
        recipient_id: it.supervisor_id,
        type: 'cert_expiry',
        title: `${empName}'s ${it.item_label} expires in ${dueLabel}`,
        message: `${empName}'s ${it.item_label} expires on ${fmtDate(it.expiry_date)}. [${key}]`,
        related_entity_type: 'cert_expiry',
      })
      if (it.supervisor_email) {
        await sendEmail(
          it.supervisor_email,
          `Heads-up: ${empName}'s ${it.item_label} expires in ${dueLabel}`,
          `<p>Hi ${it.supervisor_first_name ?? ''},</p>
           <p><strong>${empName}</strong>'s <strong>${it.item_label}</strong> expires on <strong>${fmtDate(it.expiry_date)}</strong> — ${dueLabel} from today.</p>
           <p>Please follow up so they can renew it on time.</p>
           <p>— WearCheck ARC Timesheets</p>`
        )
      }
      notified++
    }
  }

  return new Response(JSON.stringify({ ok: true, notified, items: items.length }), { status: 200 })
})
