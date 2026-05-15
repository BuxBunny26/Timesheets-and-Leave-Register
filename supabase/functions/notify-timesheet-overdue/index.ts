import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'WearCheck RS <timesheets@wearcheckrs.com>'

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Find employees who haven't submitted a timesheet for the current week
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1))
  const weekStart = monday.toISOString().split('T')[0]

  const { data: employees } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email')
    .eq('status', 'active')

  if (!employees) return new Response(JSON.stringify({ ok: true }), { status: 200 })

  const { data: submitted } = await supabase
    .from('timesheet_weeks')
    .select('employee_id')
    .eq('week_start', weekStart)
    .in('status', ['submitted', 'approved'])

  const submittedIds = new Set((submitted ?? []).map(t => t.employee_id))

  for (const emp of employees) {
    if (submittedIds.has(emp.id)) continue

    // Create in-app notification
    await supabase.from('notifications').insert({
      recipient_id: emp.id,
      type: 'timesheet_overdue',
      title: 'Timesheet not submitted',
      message: `Your timesheet for the week starting ${weekStart} is due. Please submit it as soon as possible.`,
      related_entity_type: 'timesheet_week',
    })

    // Send email
    if (emp.email) {
      await sendEmail(
        emp.email,
        'Reminder: Timesheet not submitted',
        `<p>Hi ${emp.first_name},</p>
         <p>Your timesheet for the week starting <strong>${weekStart}</strong> has not been submitted yet.</p>
         <p>Please log in and submit it as soon as possible.</p>
         <p>— WearCheck RS Timesheets</p>`
      )
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: employees.length }), { status: 200 })
})
