// email-notification
// Generic email-sender for in-app notifications. Wire this up to a Supabase
// Database Webhook on INSERT to `notifications` so every relevant in-app
// notification also goes out as an email via Resend.
//
// Supabase Webhook payload shape:
// { "type": "INSERT", "table": "notifications", "schema": "public",
//   "record": { ...notification row... }, "old_record": null }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'WearCheck ARC <timesheets@wearcheckrs.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://wearcheck-timesheets.netlify.app'

// Only these notification types trigger an email. Add more as needed.
const EMAILABLE_TYPES = new Set([
  'leave_submitted',
  'leave_approved',
  'leave_denied',
  'timesheet_submitted',
  'timesheet_submitted_supervisor',
  'timesheet_approved',
  'timesheet_rejected',
])

type NotificationRow = {
  id: string
  recipient_id: string
  type: string
  title: string
  message: string
  related_entity_type: string | null
  related_entity_id: string | null
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    console.error('Resend error:', res.status, await res.text())
  }
}

function ctaLink(notif: NotificationRow): string {
  // Map notification → in-app URL
  switch (notif.type) {
    case 'leave_submitted':
      return `${APP_URL}/approvals`
    case 'leave_approved':
    case 'leave_denied':
      return `${APP_URL}/leave`
    case 'timesheet_submitted_supervisor':
      return `${APP_URL}/approvals`
    case 'timesheet_submitted':
    case 'timesheet_approved':
    case 'timesheet_rejected':
      return `${APP_URL}/timesheets`
    default:
      return APP_URL
  }
}

function buildHtml(firstName: string | null, notif: NotificationRow): string {
  const greet = firstName ? `Hi ${firstName},` : 'Hi,'
  const link = ctaLink(notif)
  const cta = (() => {
    switch (notif.type) {
      case 'leave_submitted':
      case 'timesheet_submitted_supervisor':
        return 'Open approvals'
      case 'leave_approved':
      case 'leave_denied':
        return 'View leave'
      default:
        return 'Open timesheets'
    }
  })()
  return `
    <p>${greet}</p>
    <p><strong>${notif.title}</strong></p>
    <p>${notif.message}</p>
    <p><a href="${link}" style="display:inline-block;padding:8px 14px;background:#1B5EA6;color:#fff;text-decoration:none;border-radius:4px;">${cta}</a></p>
    <p style="color:#888;font-size:12px;">— WearCheck ARC Timesheets</p>
  `
}

serve(async (req) => {
  let body: { type?: string; table?: string; record?: NotificationRow } = {}
  try { body = await req.json() } catch { /* ignore */ }

  // Accept both webhook format and a direct {notification_id} call (for manual use)
  let row: NotificationRow | null = null
  if (body?.record && body.type === 'INSERT' && body.table === 'notifications') {
    row = body.record
  } else if ((body as { notification_id?: string })?.notification_id) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data } = await supabase
      .from('notifications')
      .select('id, recipient_id, type, title, message, related_entity_type, related_entity_id')
      .eq('id', (body as { notification_id: string }).notification_id)
      .single()
    row = data as NotificationRow | null
  }

  if (!row) {
    return new Response(JSON.stringify({ ok: false, reason: 'no notification row' }), { status: 200 })
  }

  if (!EMAILABLE_TYPES.has(row.type)) {
    return new Response(JSON.stringify({ ok: true, skipped: row.type }), { status: 200 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: recipient } = await supabase
    .from('profiles')
    .select('email, first_name')
    .eq('id', row.recipient_id)
    .single()

  if (!recipient?.email) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no recipient email' }), { status: 200 })
  }

  await sendEmail(recipient.email, row.title, buildHtml(recipient.first_name, row))

  return new Response(JSON.stringify({ ok: true, sent_to: recipient.email, type: row.type }), { status: 200 })
})
