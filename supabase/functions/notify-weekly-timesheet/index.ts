// notify-weekly-timesheet
// Runs every Monday morning. For each active employee whose timesheet for the
// previous week (Mon-Sun) is not yet 'submitted' or 'approved', creates an
// in-app notification and sends a reminder email.

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

function previousMonday(today: Date): { start: string, end: string } {
  // Monday of current week
  const d = new Date(today)
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1))
  // Previous Monday is 7 days earlier
  const prevMon = new Date(d); prevMon.setDate(d.getDate() - 7)
  const prevSun = new Date(prevMon); prevSun.setDate(prevMon.getDate() + 6)
  const fmt = (x: Date) => x.toISOString().split('T')[0]
  return { start: fmt(prevMon), end: fmt(prevSun) }
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { start: weekStart, end: weekEnd } = previousMonday(new Date())

  const { data: employees } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email')
    .eq('status', 'active')

  if (!employees) return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 })

  const { data: submitted } = await supabase
    .from('timesheet_weeks')
    .select('employee_id')
    .eq('week_start', weekStart)
    .in('status', ['submitted', 'approved'])

  const submittedIds = new Set((submitted ?? []).map(t => t.employee_id))

  let sent = 0
  for (const emp of employees) {
    if (submittedIds.has(emp.id)) continue

    await supabase.from('notifications').insert({
      recipient_id: emp.id,
      type: 'weekly_timesheet_reminder',
      title: 'Fill in last week\'s timesheet',
      message: `Please complete your timesheet for ${weekStart} – ${weekEnd}.`,
      related_entity_type: 'timesheet_week',
    })

    if (emp.email) {
      await sendEmail(
        emp.email,
        `Reminder: Fill in your timesheet for ${weekStart} – ${weekEnd}`,
        `<p>Hi ${emp.first_name},</p>
         <p>It's Monday — please log in and complete your timesheet for the week of <strong>${weekStart}</strong> to <strong>${weekEnd}</strong>.</p>
         <p>— WearCheck ARC Timesheets</p>`
      )
    }
    sent++
  }

  return new Response(JSON.stringify({ ok: true, week: weekStart, sent }), { status: 200 })
})
