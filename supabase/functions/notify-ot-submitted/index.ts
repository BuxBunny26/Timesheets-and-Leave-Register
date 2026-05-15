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

// Called via webhook payload: { timesheet_day_id, employee_id, approver_id, hours, date }
serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const body = await req.json().catch(() => ({}))

  const { employee_id, approver_id, hours, date } = body

  if (!approver_id) return new Response(JSON.stringify({ ok: false, error: 'No approver' }), { status: 200 })

  const { data: approver } = await supabase.from('profiles').select('email, first_name').eq('id', approver_id).single()
  const { data: employee } = await supabase.from('profiles').select('first_name, surname').eq('id', employee_id).single()

  if (approver?.email && employee) {
    await sendEmail(
      approver.email,
      `Overtime approval required — ${employee.first_name} ${employee.surname}`,
      `<p>Hi ${approver.first_name},</p>
       <p><strong>${employee.first_name} ${employee.surname}</strong> has submitted <strong>${hours} overtime hours</strong> on ${date} pending your approval.</p>
       <p>Please log in to review and approve or deny this request.</p>
       <p>— WearCheck RS Timesheets</p>`
    )
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
