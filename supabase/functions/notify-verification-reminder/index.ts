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

  const now = new Date()
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}` // previous month

  const { data: employees } = await supabase
    .from('profiles')
    .select('id, first_name, email')
    .eq('status', 'active')

  if (!employees) return new Response(JSON.stringify({ ok: true }), { status: 200 })

  const { data: verified } = await supabase
    .from('timesheet_verifications')
    .select('employee_id')
    .eq('period_month', periodMonth)
    .eq('status', 'verified')

  const verifiedIds = new Set((verified ?? []).map(v => v.employee_id))

  for (const emp of employees) {
    if (verifiedIds.has(emp.id)) continue

    await supabase.from('notifications').insert({
      recipient_id: emp.id,
      type: 'verification_reminder',
      title: 'Monthly timesheet verification due',
      message: `Please verify your timesheets for ${periodMonth} by the 14th.`,
    })

    if (emp.email) {
      await sendEmail(
        emp.email,
        `Action required: Verify your timesheets for ${periodMonth}`,
        `<p>Hi ${emp.first_name},</p>
         <p>Please log in and verify your timesheets for <strong>${periodMonth}</strong> by the 14th of this month.</p>
         <p>— WearCheck RS Timesheets</p>`
      )
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
