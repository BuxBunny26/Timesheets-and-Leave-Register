/**
 * Clear Test Data — Shivon, Megan, Bianka
 * ----------------------------------------
 * These 3 accounts were used to test the app before rollout to real
 * employees (confirmed: they are the only 3 auth users that have ever
 * signed in — all other 112 employee accounts have never logged in, so
 * no real employee data exists in the system yet).
 *
 * Clears activity/test data for these 3 profiles WITHOUT touching their
 * profiles, auth accounts, or leave_balances (entitlements are left as-is):
 *   - ot_approvals        (employee_id)   ← deleted first (FK to timesheet_days)
 *   - attachments         (uploaded_by)
 *   - notifications       (recipient_id)
 *   - timesheet_verifications (employee_id)
 *   - leave_requests      (employee_id)
 *   - timesheet_weeks     (employee_id)   ← cascades timesheet_days
 *   - audit_log           (actor_id)
 *
 * Usage:
 *   node scripts/clear-test-user-data.js
 *   node scripts/clear-test-user-data.js --dry-run
 *
 * SETUP: .env.local must have SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(envPath) {
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnvFile(resolve(__dirname, '../.env.local'));
loadEnvFile(resolve(__dirname, '../.env'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
                  ?? process.env.VITE_SUPABASE_SERVICE_KEY
                  ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes('--dry-run');

const TEST_EMAILS = ['shivon@wearcheckrs.com', 'megan@wearcheckrs.com', 'bianka@wearcheckrs.com'];

const { data: profiles, error: profErr } = await supabase
  .from('profiles')
  .select('id, first_name, surname, email')
  .in('email', TEST_EMAILS);
if (profErr) { console.error(profErr); process.exit(1); }

const ids = profiles.map(p => p.id);
console.log('Target profiles:');
for (const p of profiles) console.log(`  ${p.first_name} ${p.surname} <${p.email}>  (${p.id})`);
console.log();

if (ids.length === 0) {
  console.log('No matching profiles found — nothing to do.');
  process.exit(0);
}

// Order matters: ot_approvals before timesheet_weeks (FK to timesheet_days).
const STEPS = [
  { table: 'ot_approvals',            column: 'employee_id' },
  { table: 'attachments',             column: 'uploaded_by' },
  { table: 'notifications',           column: 'recipient_id' },
  { table: 'timesheet_verifications', column: 'employee_id' },
  { table: 'leave_requests',          column: 'employee_id' },
  { table: 'timesheet_weeks',         column: 'employee_id' }, // cascades timesheet_days
  { table: 'audit_log',               column: 'actor_id' },
];

for (const { table, column } of STEPS) {
  const { count, error: countErr } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in(column, ids);
  if (countErr) { console.error(`[ERROR] count ${table}: ${countErr.message}`); continue; }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would delete ${count} row(s) from ${table} where ${column} in (...)`);
    continue;
  }

  const { error: delErr } = await supabase.from(table).delete().in(column, ids);
  if (delErr) console.error(`[ERROR] delete ${table}: ${delErr.message}`);
  else console.log(`[DEL] ${count} row(s) from ${table}`);
}

console.log(DRY_RUN ? '\nDry run — no changes written.' : '\nDone. Leave balances were left untouched.');
