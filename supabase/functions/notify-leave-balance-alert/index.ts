// notify-leave-balance-alert
// Runs monthly (1st of each month, 07:00 UTC = 09:00 SAST).
// Finds employees whose remaining annual leave for the current FY ≥ 20 days.
// Sends one consolidated in-app alert + email per direct supervisor, and per
// manager (the supervisor's own supervisor with role manager/admin_manager).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'WearCheck ARC <timesheets@wearcheckrs.com>'
const THRESHOLD = 20

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
}

/** FY year for a given date (July–June cycle; year = the year the FY ends). */
function fyYear(d: Date): number {
  // getUTCMonth() is 0-indexed: 6 = July
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear()
}

function fyLabel(year: number): string {
  return `FY${year - 1}/${String(year).slice(-2)}`
}

type Profile = {
  id: string
  first_name: string | null
  surname: string | null
  email: string | null
  role: string | null
  supervisor_id: string | null
}

type EmployeeAlert = {
  id: string
  fullName: string
  remainingDays: number
}

function buildTableHtml(employees: EmployeeAlert[]): string {
  const rows = [...employees]
    .sort((a, b) => b.remainingDays - a.remainingDays)
    .map(
      (e) => `
        <tr>
          <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;">${e.fullName}</td>
          <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:bold;color:#b91c1c;">${e.remainingDays}</td>
        </tr>`,
    )
    .join('')
  return `
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;margin-top:16px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 14px;text-align:left;font-weight:600;border-bottom:2px solid #d1d5db;">Employee</th>
          <th style="padding:8px 14px;text-align:center;font-weight:600;border-bottom:2px solid #d1d5db;">Remaining Annual Leave (days)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildEmailHtml(
  recipientFirstName: string | null,
  employees: EmployeeAlert[],
  year: number,
): string {
  const label = fyLabel(year)
  const count = employees.length
  const plural = count > 1
  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="color:#1d4ed8;margin-bottom:4px;">Annual Leave Balance Alert — ${label}</h2>
      <p>Hi ${recipientFirstName ?? 'there'},</p>
      <p>
        The following team member${plural ? 's' : ''} currently
        ${plural ? 'have' : 'has'} <strong>${THRESHOLD} or more days</strong> of
        unused annual leave for <strong>${label}</strong>.
        Please work with ${plural ? 'them' : 'them'} to schedule their leave
        before the end of the financial year to avoid forfeiture.
      </p>
      ${buildTableHtml(employees)}
      <p style="margin-top:20px;">
        Please log in to the <strong>WearCheck ARC portal</strong> to review
        leave calendars and co-ordinate leave planning with your team.
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px;">
        — WearCheck ARC Timesheets<br>
        This is an automated monthly reminder. No action is required in this email.
      </p>
    </div>`
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const year = fyYear(today)

  // ── 1. Idempotency: skip if we already sent alerts this calendar month ────
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  ).toISOString()

  const { data: alreadySent } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'leave_balance_alert')
    .gte('created_at', monthStart)
    .limit(1)

  if (alreadySent && alreadySent.length > 0) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: 'already sent this month' }),
      { status: 200 },
    )
  }

  // ── 2. Fetch annual leave balances for this FY year ───────────────────────
  const { data: balances, error: balErr } = await supabase
    .from('leave_balances')
    .select('employee_id, total_days, used_days')
    .eq('leave_type', 'annual')
    .eq('year', year)

  if (balErr) {
    console.error('leave_balances fetch failed:', balErr)
    return new Response(JSON.stringify({ ok: false, error: balErr.message }), { status: 500 })
  }

  // Filter to employees with ≥ THRESHOLD remaining days
  const affectedRows = (balances ?? []).filter(
    (b) => (b.total_days - b.used_days) >= THRESHOLD,
  )

  if (affectedRows.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, notified: 0, reason: `no employees with ≥${THRESHOLD} days remaining` }),
      { status: 200 },
    )
  }

  const remainingByEmployee = new Map<string, number>()
  for (const r of affectedRows) remainingByEmployee.set(r.employee_id, r.total_days - r.used_days)

  // ── 3. Fetch profiles for affected employees ──────────────────────────────
  const { data: empProfiles, error: empErr } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email, role, supervisor_id')
    .in('id', [...remainingByEmployee.keys()])

  if (empErr) {
    console.error('employee profiles fetch failed:', empErr)
    return new Response(JSON.stringify({ ok: false, error: empErr.message }), { status: 500 })
  }

  const employees = (empProfiles ?? []) as Profile[]

  // ── 4. Fetch the direct supervisors ──────────────────────────────────────
  const supervisorIds = [
    ...new Set(employees.map((e) => e.supervisor_id).filter((id): id is string => !!id)),
  ]

  if (supervisorIds.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, notified: 0, reason: 'no supervisors found for affected employees' }),
      { status: 200 },
    )
  }

  const { data: supProfiles, error: supErr } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email, role, supervisor_id')
    .in('id', supervisorIds)

  if (supErr) {
    console.error('supervisor profiles fetch failed:', supErr)
    return new Response(JSON.stringify({ ok: false, error: supErr.message }), { status: 500 })
  }

  const supervisors = (supProfiles ?? []) as Profile[]
  const supervisorById = new Map<string, Profile>(supervisors.map((s) => [s.id, s]))

  // ── 5. Fetch managers (supervisors' supervisors with relevant roles) ───────
  const managerCandidateIds = [
    ...new Set(supervisors.map((s) => s.supervisor_id).filter((id): id is string => !!id)),
  ]

  const managerById = new Map<string, Profile>()
  if (managerCandidateIds.length > 0) {
    const { data: mgrProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, surname, email, role, supervisor_id')
      .in('id', managerCandidateIds)
      .in('role', ['manager', 'admin_manager'])

    for (const m of (mgrProfiles ?? []) as Profile[]) managerById.set(m.id, m)
  }

  // ── 6. Build recipient → employee-alert list ──────────────────────────────
  // Each supervisor sees their own direct reports.
  // Each manager sees all affected employees who report through their supervisors.
  const recipientAlerts = new Map<string, { profile: Profile; employees: EmployeeAlert[] }>()

  for (const emp of employees) {
    const remaining = remainingByEmployee.get(emp.id) ?? 0
    const alert: EmployeeAlert = {
      id: emp.id,
      fullName: `${emp.first_name ?? ''} ${emp.surname ?? ''}`.trim() || 'Unknown',
      remainingDays: remaining,
    }

    if (!emp.supervisor_id) continue
    const supervisor = supervisorById.get(emp.supervisor_id)
    if (!supervisor) continue

    // Add to supervisor's list
    if (!recipientAlerts.has(supervisor.id)) {
      recipientAlerts.set(supervisor.id, { profile: supervisor, employees: [] })
    }
    recipientAlerts.get(supervisor.id)!.employees.push(alert)

    // Add to manager's list (if the supervisor reports to a manager)
    if (supervisor.supervisor_id) {
      const manager = managerById.get(supervisor.supervisor_id)
      if (manager) {
        if (!recipientAlerts.has(manager.id)) {
          recipientAlerts.set(manager.id, { profile: manager, employees: [] })
        }
        recipientAlerts.get(manager.id)!.employees.push(alert)
      }
    }
  }

  // ── 7. Send notifications ─────────────────────────────────────────────────
  let notified = 0
  const label = fyLabel(year)

  for (const [recipientId, { profile, employees: empList }] of recipientAlerts) {
    if (empList.length === 0) continue

    const count = empList.length
    const plural = count > 1
    const title = `${count} team member${plural ? 's have' : ' has'} ${THRESHOLD}+ days annual leave remaining`
    const message =
      `${count} employee${plural ? 's' : ''} in your team ${plural ? 'have' : 'has'} ` +
      `${THRESHOLD} or more days of unused annual leave for ${label}. ` +
      `Please co-ordinate leave planning with your team.`

    // In-app notification
    await supabase.from('notifications').insert({
      recipient_id: recipientId,
      type: 'leave_balance_alert',
      title,
      message,
      related_entity_type: 'leave_balance_report',
    })

    // Email
    if (profile.email) {
      await sendEmail(
        profile.email,
        `Action Required: ${count} employee${plural ? 's' : ''} with ${THRESHOLD}+ days annual leave (${label})`,
        buildEmailHtml(profile.first_name, empList, year),
      )
    }

    notified++
  }

  console.log(`leave-balance-alert: notified ${notified} recipient(s), ${affectedRows.length} affected employee(s), FY year ${year}`)

  return new Response(
    JSON.stringify({ ok: true, notified, affectedEmployees: affectedRows.length, fyYear: year, threshold: THRESHOLD }),
    { status: 200 },
  )
})
