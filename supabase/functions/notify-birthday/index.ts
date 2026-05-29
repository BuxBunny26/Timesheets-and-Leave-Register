// notify-birthday
// Runs daily at 07:00 (schedule in Supabase Dashboard → Database → Cron).
// Finds employees whose birthday is TODAY, then:
//   1. Sends an in-app "Happy Birthday!" notification to the employee
//   2. Sends an in-app notification to their supervisor ("It's <Name>'s birthday today")
// Idempotent: deduplicates via related_entity_type='birthday' + related_entity_id='<employee_id>:<YYYY>'

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function isoToday(): string { return new Date().toISOString().split('T')[0] }

interface BirthdayRow {
  employee_id: string
  first_name: string
  surname: string
  supervisor_id: string | null
  birthday_this_year: string
  turning_age: number
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const today = isoToday()

  // Fetch employees with birthday today
  const { data: rows, error } = await supabase
    .from('birthdays_this_year')
    .select('employee_id, first_name, surname, supervisor_id, birthday_this_year, turning_age')
    .eq('birthday_this_year', today)

  if (error) {
    console.error('Birthday fetch error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: 'No birthdays today' }), { status: 200 })
  }

  let sent = 0
  const yearKey = today.slice(0, 4) // YYYY for idempotency key

  for (const row of rows as BirthdayRow[]) {
    const entityId = `${row.employee_id}:${yearKey}`

    // Check idempotency — skip if we already sent this year
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('related_entity_type', 'birthday')
      .eq('related_entity_id', entityId)

    if ((count ?? 0) > 0) continue

    const fullName = `${row.first_name} ${row.surname}`
    const notifications: {
      recipient_id: string
      type: string
      title: string
      message: string
      related_entity_type: string
      related_entity_id: string
    }[] = []

    // 1. Notify the employee themselves
    notifications.push({
      recipient_id: row.employee_id,
      type: 'birthday',
      title: `Happy Birthday, ${row.first_name}!`,
      message: `Wishing you a wonderful ${row.turning_age}${ordinal(row.turning_age)} birthday from the Wearcheck team!`,
      related_entity_type: 'birthday',
      related_entity_id: entityId,
    })

    // 2. Notify their supervisor
    if (row.supervisor_id) {
      notifications.push({
        recipient_id: row.supervisor_id,
        type: 'birthday',
        title: `It's ${fullName}'s birthday today`,
        message: `${fullName} is turning ${row.turning_age} today. Wish them well!`,
        related_entity_type: 'birthday',
        related_entity_id: `${entityId}:sup`,
      })
    }

    const { error: insErr } = await supabase.from('notifications').insert(notifications)
    if (insErr) {
      console.error(`Failed to insert birthday notifications for ${fullName}:`, insErr)
    } else {
      sent += notifications.length
    }
  }

  return new Response(JSON.stringify({ sent, birthdaysToday: rows.length }), { status: 200 })
})

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
