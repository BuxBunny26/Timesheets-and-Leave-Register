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

/** Working day (1..N) of the current month, counting only Mon-Fri.
 *  Public holidays are ignored for simplicity.  */
function workingDayOfMonth(today: Date): number {
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate()
  let wd = 0
  for (let day = 1; day <= d; day++) {
    const dow = new Date(y, m, day).getDay()
    if (dow !== 0 && dow !== 6) wd++
  }
  return wd
}

/** Period to verify = the PREVIOUS calendar month. e.g. on 1 May we verify April. */
function previousMonthKey(today: Date): string {
  const y = today.getFullYear(), m = today.getMonth() // 0-indexed
  if (m === 0) return `${y - 1}-12`
  return `${y}-${String(m).padStart(2, '0')}`
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const today = new Date()
  const wd = workingDayOfMonth(today)
  const periodMonth = previousMonthKey(today)

  // Action gates:
  //   WD 1-4 -> remind employees who have not verified.
  //   WD 7   -> escalate to supervisors with the list of unverified team members
  //             plus team members whose previous-month timesheets are incomplete.
  const isEmployeeReminderDay = wd >= 1 && wd <= 4
  const isSupervisorEscalationDay = wd === 7

  if (!isEmployeeReminderDay && !isSupervisorEscalationDay) {
    return new Response(JSON.stringify({ ok: true, skipped: true, workingDay: wd }), { status: 200 })
  }

  const { data: employees } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email, supervisor_id')
    .eq('status', 'active')
  if (!employees) return new Response(JSON.stringify({ ok: true }), { status: 200 })

  const { data: verified } = await supabase
    .from('timesheet_verifications')
    .select('employee_id, status')
    .eq('period_month', periodMonth)
    .eq('status', 'verified')
  const verifiedIds = new Set((verified ?? []).map(v => v.employee_id))

  // --- Employee reminders (WD 1-4) ---
  if (isEmployeeReminderDay) {
    let sent = 0
    for (const emp of employees) {
      if (verifiedIds.has(emp.id)) continue

      await supabase.from('notifications').insert({
        recipient_id: emp.id,
        type: 'verification_reminder',
        title: 'Verify your hours for ' + periodMonth,
        message: `Please log in and verify your overtime / leave totals for ${periodMonth}.`,
      })
      if (emp.email) {
        await sendEmail(
          emp.email,
          `Action required: Verify your ${periodMonth} hours`,
          `<p>Hi ${emp.first_name},</p>
           <p>Please log in and verify your overtime and leave totals for <strong>${periodMonth}</strong>.</p>
           <p>This is reminder day ${wd} of 4. Supervisors are notified on working day 7.</p>
           <p>— WearCheck ARC Timesheets</p>`
        )
      }
      sent++
    }
    return new Response(JSON.stringify({ ok: true, mode: 'employee', workingDay: wd, periodMonth, sent }), { status: 200 })
  }

  // --- Supervisor escalation (WD 7) ---
  // For each supervisor, build a list of their direct reports who either:
  //   (a) have not verified the period, or
  //   (b) have at least one week in the period with status != approved.
  // Then notify the supervisor with the list.

  // Compute the previous month's date range (for week_start lookups)
  const [yStr, mStr] = periodMonth.split('-')
  const periodYear = Number(yStr), periodMonthIdx = Number(mStr) - 1
  const periodStart = `${yStr}-${mStr}-01`
  const lastDay = new Date(periodYear, periodMonthIdx + 1, 0).getDate()
  const periodEnd = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`

  const { data: weeks } = await supabase
    .from('timesheet_weeks')
    .select('employee_id, week_start, status')
    .gte('week_start', periodStart)
    .lte('week_start', periodEnd)

  // employee_id -> { incompleteWeeks: string[] }
  const incompleteByEmp = new Map<string, string[]>()
  for (const w of weeks ?? []) {
    if (w.status !== 'approved' && w.status !== 'submitted') {
      const list = incompleteByEmp.get(w.employee_id) ?? []
      list.push(w.week_start)
      incompleteByEmp.set(w.employee_id, list)
    }
  }

  // Group employees by supervisor_id
  const bySupervisor = new Map<string, { emp: typeof employees[number]; verified: boolean; incompleteWeeks: string[] }[]>()
  for (const emp of employees) {
    if (!emp.supervisor_id) continue
    const isVerified = verifiedIds.has(emp.id)
    const inc = incompleteByEmp.get(emp.id) ?? []
    if (isVerified && inc.length === 0) continue
    const list = bySupervisor.get(emp.supervisor_id) ?? []
    list.push({ emp, verified: isVerified, incompleteWeeks: inc })
    bySupervisor.set(emp.supervisor_id, list)
  }

  // Look up supervisor contact info
  const supIds = [...bySupervisor.keys()]
  const { data: supervisors } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email')
    .in('id', supIds)

  let supSent = 0
  for (const sup of supervisors ?? []) {
    const issues = bySupervisor.get(sup.id) ?? []
    if (issues.length === 0) continue

    const rows = issues.map(i => {
      const parts: string[] = []
      if (!i.verified) parts.push('not verified')
      if (i.incompleteWeeks.length > 0) parts.push(`${i.incompleteWeeks.length} incomplete week(s)`)
      return `<li>${i.emp.first_name} ${i.emp.surname} — ${parts.join(', ')}</li>`
    }).join('')

    await supabase.from('notifications').insert({
      recipient_id: sup.id,
      type: 'verification_escalation',
      title: `Team verification overdue (${periodMonth})`,
      message: `${issues.length} team member(s) have not verified their ${periodMonth} hours or have incomplete timesheets.`,
    })

    if (sup.email) {
      await sendEmail(
        sup.email,
        `Team verification overdue for ${periodMonth}`,
        `<p>Hi ${sup.first_name},</p>
         <p>The following team members have outstanding verification or incomplete timesheets for <strong>${periodMonth}</strong>:</p>
         <ul>${rows}</ul>
         <p>Please follow up to ensure their records are corrected.</p>
         <p>— WearCheck ARC Timesheets</p>`
      )
    }
    supSent++
  }

  return new Response(JSON.stringify({ ok: true, mode: 'supervisor', workingDay: wd, periodMonth, supervisorsNotified: supSent }), { status: 200 })
})
