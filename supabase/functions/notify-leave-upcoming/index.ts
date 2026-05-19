// notify-leave-upcoming
// Runs daily (schedule in Supabase Dashboard → Database → Cron).
// Finds approved leave that starts in exactly 2 working days (skipping weekends
// and ZA public holidays for the employee's site) and notifies the supervisor
// + the employee themselves.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'WearCheck ARC <timesheets@wearcheckrs.com>'

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Add `n` working days to `from`, skipping weekends and `holidaySet` ISO dates. */
function addWorkingDays(from: Date, n: number, holidaySet: Set<string>): Date {
  const cur = new Date(from)
  let added = 0
  while (added < n) {
    cur.setDate(cur.getDate() + 1)
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6 && !holidaySet.has(isoDate(cur))) added++
  }
  return cur
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Today (UTC midnight is good enough — schedule the cron in SAST anyway)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Pull holidays for the next ~10 days so addWorkingDays has data
  const horizonEnd = new Date(today)
  horizonEnd.setDate(horizonEnd.getDate() + 14)
  const { data: holidays } = await supabase
    .from('public_holidays')
    .select('date, country_code')
    .gte('date', isoDate(today))
    .lte('date', isoDate(horizonEnd))

  // Group holiday dates by country
  const holidaysByCountry = new Map<string, Set<string>>()
  for (const h of holidays ?? []) {
    const cc = (h as { country_code: string }).country_code || 'ZA'
    if (!holidaysByCountry.has(cc)) holidaysByCountry.set(cc, new Set())
    holidaysByCountry.get(cc)!.add((h as { date: string }).date)
  }

  // Approved leave with start_date in the next 5 calendar days (we'll filter
  // down to exactly +2 working days based on each employee's site country)
  const windowEnd = new Date(today)
  windowEnd.setDate(windowEnd.getDate() + 5)

  const { data: leaves, error } = await supabase
    .from('leave_requests')
    .select(`
      id, employee_id, supervisor_id, leave_type, start_date, end_date, total_days,
      employee:profiles!leave_requests_employee_id_fkey (
        id, first_name, surname, email,
        site:sites ( country_code )
      ),
      supervisor:profiles!leave_requests_supervisor_id_fkey (
        id, first_name, email
      )
    `)
    .eq('status', 'approved')
    .gte('start_date', isoDate(today))
    .lte('start_date', isoDate(windowEnd))

  if (error) {
    console.error('Fetch leaves failed:', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  let notified = 0

  for (const lr of (leaves ?? []) as unknown as Array<{
    id: string
    employee_id: string
    supervisor_id: string | null
    leave_type: string
    start_date: string
    end_date: string
    total_days: number | null
    employee: { id: string; first_name: string | null; surname: string | null; email: string | null; site: { country_code: string | null } | null } | null
    supervisor: { id: string; first_name: string | null; email: string | null } | null
  }>) {
    const cc = lr.employee?.site?.country_code ?? 'ZA'
    const holidaySet = holidaysByCountry.get(cc) ?? new Set<string>()
    const target = addWorkingDays(today, 2, holidaySet)
    if (isoDate(target) !== lr.start_date) continue

    // Idempotency: skip if we already sent a leave_upcoming notification for this request
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'leave_upcoming')
      .eq('related_entity_type', 'leave_request')
      .eq('related_entity_id', lr.id)
      .limit(1)
    if (existing && existing.length > 0) continue

    const empName = `${lr.employee?.first_name ?? ''} ${lr.employee?.surname ?? ''}`.trim() || 'A team member'
    const dateRange = lr.end_date && lr.end_date !== lr.start_date
      ? `${fmtDate(lr.start_date)} – ${fmtDate(lr.end_date)}`
      : fmtDate(lr.start_date)

    // 1) Notify supervisor
    if (lr.supervisor_id) {
      await supabase.from('notifications').insert({
        recipient_id: lr.supervisor_id,
        type: 'leave_upcoming',
        title: `${empName} is on leave in 2 working days`,
        message: `${empName} (${lr.leave_type}) — ${dateRange}.`,
        related_entity_type: 'leave_request',
        related_entity_id: lr.id,
      })
      if (lr.supervisor?.email) {
        await sendEmail(
          lr.supervisor.email,
          `Heads-up: ${empName} on leave from ${fmtDate(lr.start_date)}`,
          `<p>Hi ${lr.supervisor.first_name ?? ''},</p>
           <p><strong>${empName}</strong> is scheduled to be on <strong>${lr.leave_type}</strong> leave starting <strong>${fmtDate(lr.start_date)}</strong> (until ${fmtDate(lr.end_date)}).</p>
           <p>That is two working days from now — please plan accordingly.</p>
           <p>— WearCheck ARC Timesheets</p>`
        )
      }
      notified++
    }

    // 2) Self-reminder to the employee
    if (lr.employee?.id) {
      await supabase.from('notifications').insert({
        recipient_id: lr.employee.id,
        type: 'leave_upcoming',
        title: `Reminder: your leave starts in 2 working days`,
        message: `${lr.leave_type} leave — ${dateRange}.`,
        related_entity_type: 'leave_request',
        related_entity_id: lr.id,
      })
      if (lr.employee.email) {
        await sendEmail(
          lr.employee.email,
          `Reminder: your leave starts ${fmtDate(lr.start_date)}`,
          `<p>Hi ${lr.employee.first_name ?? ''},</p>
           <p>This is a reminder that your <strong>${lr.leave_type}</strong> leave starts on <strong>${fmtDate(lr.start_date)}</strong> (until ${fmtDate(lr.end_date)}) — two working days from now.</p>
           <p>Please make sure any hand-overs are in place.</p>
           <p>— WearCheck ARC Timesheets</p>`
        )
      }
      notified++
    }
  }

  return new Response(JSON.stringify({ ok: true, notified }), { status: 200 })
})
