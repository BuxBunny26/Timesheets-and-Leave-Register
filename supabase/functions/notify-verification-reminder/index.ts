import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  // TODO: Send monthly verification reminder to employees who haven't verified their timesheet
  // Query timesheet_verifications for pending entries and notify via Resend
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
