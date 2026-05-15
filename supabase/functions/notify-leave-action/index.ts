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
  const { leave_request_id } = await req.json().catch(() => ({}))

  const { data: leave } = await supabase
    .from('leave_requests')
    .select('*, employee:profiles!employee_id(first_name, surname, email)')
    .eq('id', leave_request_id)
    .single()

  if (!leave) return new Response(JSON.stringify({ ok: false }), { status: 200 })

  const emp = leave.employee as { first_name: string; surname: string; email: string }
  const statusLabel = leave.status === 'approved' ? 'approved' : 'denied'

  if (emp?.email) {
    await sendEmail(
      emp.email,
      `Leave request ${statusLabel}`,
      `<p>Hi ${emp.first_name},</p>
       <p>Your <strong>${leave.leave_type} leave</strong> request from <strong>${leave.start_date}</strong> to <strong>${leave.end_date}</strong> has been <strong>${statusLabel}</strong>.</p>
       ${leave.supervisor_comment ? `<p>Note from your supervisor: ${leave.supervisor_comment}</p>` : ''}
       <p>— WearCheck ARC Timesheets</p>`
    )
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
