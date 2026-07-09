/**
 * Clear Employees Script
 * ----------------------
 * Deletes ALL Supabase auth users and their associated data EXCEPT for
 * the three accounts explicitly listed in KEEP_FIRST_NAMES below.
 *
 * Tables cleaned up in safe dependency order before auth users are deleted:
 *   1. profiles.supervisor_id  → NULL  (self-referential FK)
 *   2. timesheet_weeks.reviewed_by → NULL
 *   3. leave_requests.supervisor_id → NULL
 *   4. attachments.uploaded_by → NULL
 *   5. audit_log.actor_id → NULL
 *   6. notifications (deleted)
 *   7. timesheet_verifications (deleted)
 *   8. ot_approvals (deleted)
 *   9. timesheet_weeks → deleted (timesheet_days cascade)
 *  10. leave_requests (deleted)
 *  11. auth users deleted → profiles / employee_details /
 *      employee_certifications / performance_reviews /
 *      training_enrollments all cascade.
 *
 * Usage:
 *   node scripts/clear-employees.js
 *   node scripts/clear-employees.js --dry-run    ← preview only, no changes
 *
 * SETUP: ensure .env.local has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Accounts to KEEP (matched against profiles.first_name, case-insensitive) ──
const KEEP_FIRST_NAMES = ['megan', 'bianka', 'shivon'];

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
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
  console.error(
    '\nMissing env vars. Add to .env.local:\n' +
    '  VITE_SUPABASE_URL=https://...\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchAllUsers() {
  const all = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
    all.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
    page++;
  }
  return all;
}

function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function safeDelete(table, column, ids, label) {
  if (ids.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would delete from ${table} where ${column} in ${ids.length} value(s)`);
    return;
  }
  // Supabase .delete().in() has a limit per call; batch in chunks of 200
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) console.error(`  [WARN] ${table}.${column} delete: ${error.message}`);
  }
  console.log(`  [DEL] ${label ?? `${table}.${column}`}`);
}

async function safeNullify(table, column, ids, label) {
  if (ids.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would NULL ${table}.${column} for ${ids.length} value(s)`);
    return;
  }
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).update({ [column]: null }).in(column, chunk);
    if (error) console.error(`  [WARN] ${table}.${column} nullify: ${error.message}`);
  }
  console.log(`  [NULL] ${label ?? `${table}.${column}`}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Clear Employees Script');
  if (DRY_RUN) console.log('  *** DRY RUN — no changes will be made ***');
  console.log('══════════════════════════════════════════\n');

  // ── Fetch existing auth users ──────────────────────────────────────────
  console.log('Fetching auth users...');
  const allUsers = await fetchAllUsers();
  console.log(`  Found ${allUsers.length} auth user(s)\n`);

  if (allUsers.length === 0) {
    console.log('Nothing to delete.\n');
    return;
  }

  // ── Fetch profiles to get first_name mapping ───────────────────────────
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, first_name, surname, email, role');
  if (profErr) throw new Error(`Fetch profiles: ${profErr.message}`);

  const profileById = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  // ── Classify users ────────────────────────────────────────────────────
  const keepUsers   = [];
  const deleteUsers = [];

  for (const user of allUsers) {
    const profile = profileById[user.id];
    const firstName = (profile?.first_name ?? user.user_metadata?.first_name ?? '').toLowerCase().trim();
    const isKeep = KEEP_FIRST_NAMES.includes(firstName);
    (isKeep ? keepUsers : deleteUsers).push({ ...user, _profile: profile });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('Accounts to KEEP:');
  if (keepUsers.length === 0) {
    console.log('  (none matched)');
  } else {
    for (const u of keepUsers) {
      const p = u._profile;
      console.log(`  ✓ ${p?.first_name ?? '?'} ${p?.surname ?? ''} <${u.email}>  [${p?.role ?? 'no profile'}]`);
    }
  }

  console.log(`\nAccounts to DELETE (${deleteUsers.length}):`);
  for (const u of deleteUsers) {
    const p = u._profile;
    console.log(`  ✗ ${p?.first_name ?? '?'} ${p?.surname ?? ''} <${u.email ?? '(no email)'}>`);
  }

  if (deleteUsers.length === 0) {
    console.log('\nNothing to delete.\n');
    return;
  }

  // ── Warn about system_admin accounts in delete list ───────────────────
  const adminsToDrop = deleteUsers.filter(u => u._profile?.role === 'system_admin');
  if (adminsToDrop.length > 0) {
    console.warn('\n⚠  WARNING: The following system_admin account(s) are in the delete list:');
    for (const u of adminsToDrop) {
      console.warn(`   ${u._profile?.first_name} ${u._profile?.surname} <${u.email}>`);
    }
    console.warn('   You will not be able to log in with these accounts after deletion.\n');
  }

  // ── Confirm ───────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    const answer = await confirm(
      `\nProceed? This will permanently delete ${deleteUsers.length} account(s) and all their data. (yes/no): `
    );
    if (answer !== 'yes') {
      console.log('\nAborted.\n');
      process.exit(0);
    }
  }

  // ── Collect IDs ───────────────────────────────────────────────────────
  const deleteIds = deleteUsers.map(u => u.id);

  console.log('\n── Cleaning up related data ──────────────────────────────\n');

  // 1. Null-ify self-referential supervisor_id in profiles
  await safeNullify('profiles', 'supervisor_id', deleteIds, 'profiles.supervisor_id (unlink supervisors)');

  // 2. Null-ify timesheet_weeks.reviewed_by
  await safeNullify('timesheet_weeks', 'reviewed_by', deleteIds, 'timesheet_weeks.reviewed_by');

  // 3. Null-ify leave_requests.supervisor_id
  await safeNullify('leave_requests', 'supervisor_id', deleteIds, 'leave_requests.supervisor_id');

  // 4. Null-ify attachments.uploaded_by
  await safeNullify('attachments', 'uploaded_by', deleteIds, 'attachments.uploaded_by');

  // 5. Null-ify audit_log.actor_id
  await safeNullify('audit_log', 'actor_id', deleteIds, 'audit_log.actor_id');

  // 6. Delete notifications
  await safeDelete('notifications', 'recipient_id', deleteIds, 'notifications');

  // 7. Delete timesheet_verifications
  await safeDelete('timesheet_verifications', 'employee_id', deleteIds, 'timesheet_verifications');

  // 8a. Delete ot_approvals (employee side)
  await safeDelete('ot_approvals', 'employee_id', deleteIds, 'ot_approvals (employee_id)');
  // 8b. Delete ot_approvals (approver side)
  await safeDelete('ot_approvals', 'approver_id', deleteIds, 'ot_approvals (approver_id)');

  // 9. Delete timesheet_weeks (timesheet_days cascade)
  await safeDelete('timesheet_weeks', 'employee_id', deleteIds, 'timesheet_weeks + timesheet_days (cascade)');

  // 10. Delete leave_requests
  await safeDelete('leave_requests', 'employee_id', deleteIds, 'leave_requests');

  // ── Delete auth users (profiles + employee_details + certifications + ──
  //    performance_reviews + training_enrollments all cascade)            ──
  console.log('\n── Deleting auth users ───────────────────────────────────\n');

  let deleted = 0;
  let failed  = 0;

  for (const user of deleteUsers) {
    const p = user._profile;
    const label = `${p?.first_name ?? '?'} ${p?.surname ?? ''} <${user.email ?? user.id}>`;

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would delete: ${label}`);
      continue;
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`  [ERROR] ${label}: ${error.message}`);
      failed++;
    } else {
      console.log(`  [DEL] ${label}`);
      deleted++;
    }
  }

  console.log('\n══════════════════════════════════════════');
  if (DRY_RUN) {
    console.log('  DRY RUN complete — no changes were made.');
  } else {
    console.log(`  Done. Deleted ${deleted} user(s).${failed > 0 ? `  Errors: ${failed}` : ''}`);
    console.log(`  Kept: ${keepUsers.map(u => u._profile?.first_name ?? u.email).join(', ')}`);
  }
  console.log('══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
