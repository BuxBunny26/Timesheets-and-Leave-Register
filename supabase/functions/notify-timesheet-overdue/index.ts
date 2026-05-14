import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  // TODO: Query employees who haven't submitted timesheets for the current week
  // Send notifications via Resend + insert into notifications table
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
