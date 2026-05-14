import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  // TODO: Send a copy of an approved timesheet to the employee and their supervisor
  // Generate PDF or Excel from timesheet data and email via Resend
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
