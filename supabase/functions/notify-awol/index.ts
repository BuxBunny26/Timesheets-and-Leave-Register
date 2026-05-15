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

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { employee_id, date } = await req.json().catch(() => ({}))

  const { data: employee } = await supabase.from('profiles').select('*, supervisor:profiles!supervisor_id(first_name, email)').eq('id', employee_id).single()

  if (!employee) return new Response(JSON.stringify({ ok: false }), { status: 200 })

  const supervisor = employee.supervisor as { first_name: string; email: string } | null

  if (supervisor?.email) {
    await sendEmail(
      supervisor.email,
      `URGENT: AWOL — ${employee.first_name} ${employee.surname}`,
      `<p>Hi ${supervisor.first_name},</p>
       <p><strong>URGENT:</strong> ${employee.first_name} ${employee.surname} has been marked <strong>AWOL</strong> on ${date}.</p>
       <p>Please follow up immediately.</p>
       <p>— WearCheck ARC Timesheets</p>`
    )
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
