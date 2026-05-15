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
  const { timesheet_week_id } = await req.json().catch(() => ({}))

  const { data: week } = await supabase
    .from('timesheet_weeks')
    .select('*, employee:profiles!employee_id(first_name, surname, email), days:timesheet_days(*)')
    .eq('id', timesheet_week_id)
    .single()

  if (!week) return new Response(JSON.stringify({ ok: false }), { status: 200 })

  const emp = week.employee as { first_name: string; surname: string; email: string }
  const days = (week.days as Array<{ date: string; day_of_week: string; primary_status: string; overtime_flag: boolean; overtime_hours: number | null; lol_flag: boolean; loi_flag: boolean }>) ?? []

  const dayRows = days
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => `<tr>
      <td style="padding:4px 8px;border:1px solid #e5e7eb">${d.day_of_week}</td>
      <td style="padding:4px 8px;border:1px solid #e5e7eb">${d.date}</td>
      <td style="padding:4px 8px;border:1px solid #e5e7eb;text-transform:capitalize">${d.primary_status.replace('_', ' ')}</td>
      <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${d.overtime_flag ? d.overtime_hours ?? '—' : '—'}</td>
      <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${d.lol_flag ? 'Yes' : '—'}</td>
      <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${d.loi_flag ? 'Yes' : '—'}</td>
    </tr>`).join('')

  if (emp?.email) {
    await sendEmail(
      emp.email,
      `Timesheet submitted — week of ${week.week_start}`,
      `<p>Hi ${emp.first_name},</p>
       <p>Your timesheet for the week of <strong>${week.week_start}</strong> has been submitted. Here is a copy:</p>
       <table style="border-collapse:collapse;font-size:13px;margin:16px 0">
         <thead><tr style="background:#1B5EA6;color:white">
           <th style="padding:6px 8px;text-align:left">Day</th>
           <th style="padding:6px 8px;text-align:left">Date</th>
           <th style="padding:6px 8px;text-align:left">Status</th>
           <th style="padding:6px 8px;text-align:center">OT hrs</th>
           <th style="padding:6px 8px;text-align:center">LOL</th>
           <th style="padding:6px 8px;text-align:center">LOI</th>
         </tr></thead>
         <tbody>${dayRows}</tbody>
       </table>
       <p>— WearCheck ARC Timesheets</p>`
    )
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
