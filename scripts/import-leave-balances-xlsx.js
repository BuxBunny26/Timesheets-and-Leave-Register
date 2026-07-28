/**
 * Import Leave Balances from XLSX — Sage "Leave History Per Period" report
 * -----------------------------------------------------------------------
 * Format: repeating employee blocks in a single flat sheet.
 *
 *   Row: "Employee Display Name","","","<CODE> - <Name>",...   ← block header
 *   Row: (blank)
 *   Row: "","Employee Display Name","Company",...,"Cycle Start Date",
 *        "Leave Type Description","Leave Definition Display","Start",
 *        "Adj.","","Accr.","Taken","End",""                    ← column header
 *   Row(s): "","<CODE> - <Name>","<Company>",...,<serial>,
 *           "ANNUAL_LEAVE - Annual Leave", ..., Start, Adj, "", Accr, Taken, End
 *
 * Only 3 leave types appear in this report and map to our leave_type codes:
 *   ANNUAL_LEAVE -> annual
 *   FAMILY       -> family
 *   SICK_LEAVE   -> sick
 *
 * The "End" column is the employee's current remaining balance as of the
 * report's payperiod end date. We import it as:
 *   total_days = End   (current usable balance going forward)
 *   used_days  = 0     (in-app usage tracking starts fresh from this cutoff)
 *   year       = FY-end year of the payperiod end date (1 Jul – 30 Jun FY)
 *   leave_type = mapped code ('annual' | 'family' | 'sick')
 *
 * NOTE: leave_balances in production only has
 *   (id, employee_id, leave_type, year, total_days, used_days, updated_at).
 * The leave_type_id / cycle_start / cycle_end columns added by migrations
 * 077/088 are NOT present on the live table — do not reference them here.
 *
 * Upsert key: (employee_id, leave_type, year) — matches AdminPage's balance
 * editor so re-running this script or editing balances later stays consistent.
 *
 * Safe to re-run — existing rows for the same employee/type/year are updated.
 *
 * Usage:
 *   node scripts/import-leave-balances-xlsx.js "C:\path\to\Wearcheck Leave Report - 30 June 2026.xlsx"
 *   node scripts/import-leave-balances-xlsx.js "...xlsx" --dry-run
 *
 * SETUP: .env.local must have SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load env files (.env.local takes precedence, .env as fallback)
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
    '  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n' +
    '\nGet it from: https://supabase.com/dashboard/project/dmctmgrtjafnelrpnvin/settings/api\n'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes('--dry-run');
const FILE = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));

if (!FILE) {
  console.error('Usage: node scripts/import-leave-balances-xlsx.js "<path.xlsx>" [--dry-run]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Leave type description prefix -> our leave_type code
// ---------------------------------------------------------------------------
const LEAVE_TYPE_MAP = {
  ANNUAL_LEAVE: 'annual',
  FAMILY:       'family',
  SICK_LEAVE:   'sick',
};

function fyEndYearFor(date) {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

// ---------------------------------------------------------------------------
// 1. Parse workbook
// ---------------------------------------------------------------------------
const wb = XLSX.readFile(FILE);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Payperiod Display row: "124 - GP_MONTHLY - (01/06/2026 - 30/06/2026)"
const periodRow = rows.find(r => r[0] === 'Payperiod Display');
const periodStr = periodRow ? String(periodRow[3]) : '';
const dateMatches = [...periodStr.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
if (dateMatches.length < 2) {
  console.error(`Could not find payperiod end date in: "${periodStr}"`);
  process.exit(1);
}
const [, ed, em, ey] = dateMatches[dateMatches.length - 1];
const periodEndISO = `${ey}-${em}-${ed}`;
const periodEndDate = new Date(`${periodEndISO}T00:00:00`);
const fyYear = fyEndYearFor(periodEndDate);

console.log(`Payperiod end: ${periodEndISO}  →  FY ${fyYear}`);

// ---------------------------------------------------------------------------
// 2. Extract per-employee balance rows
// ---------------------------------------------------------------------------
// employeeCode -> { annual: {...}, family: {...}, sick: {...} }
const balancesByCode = new Map();
const unmappedTypes = new Set();

for (const r of rows) {
  const empField = r[1];
  const company = r[2];
  const leaveTypeDesc = r[9];
  if (typeof empField !== 'string' || !empField.includes(' - ')) continue;
  if (!company || !leaveTypeDesc) continue;

  const code = empField.split(' - ')[0].trim();
  const typePrefix = String(leaveTypeDesc).split(' - ')[0].trim();
  const leaveTypeText = LEAVE_TYPE_MAP[typePrefix];
  if (!leaveTypeText) {
    unmappedTypes.add(typePrefix);
    continue;
  }

  const start = Number(r[11]) || 0;
  const adj   = Number(r[12]) || 0;
  const accr  = Number(r[14]) || 0;
  const taken = Number(r[15]) || 0;
  const end   = Number(r[16]) || 0;

  if (!balancesByCode.has(code)) balancesByCode.set(code, {});
  balancesByCode.get(code)[leaveTypeText] = { start, adj, accr, taken, end };
}

if (unmappedTypes.size) {
  console.warn('WARNING: unrecognised leave type descriptions skipped:', [...unmappedTypes]);
}

console.log(`Parsed ${balancesByCode.size} employees from report.`);

// ---------------------------------------------------------------------------
// 3. Resolve employee_code -> profiles.id and leave_types.code -> id
// ---------------------------------------------------------------------------
const codes = [...balancesByCode.keys()];
const { data: profiles, error: profErr } = await supabase
  .from('profiles')
  .select('id, employee_code, first_name, surname, status')
  .in('employee_code', codes);
if (profErr) { console.error(profErr); process.exit(1); }

const profileByCode = new Map(profiles.map(p => [p.employee_code, p]));

const missingCodes = codes.filter(c => !profileByCode.has(c));
if (missingCodes.length) {
  console.warn(`WARNING: ${missingCodes.length} employee code(s) in report not found in profiles — skipped:`);
  console.warn('  ' + missingCodes.join(', '));
}

// ---------------------------------------------------------------------------
// 4. Build upsert rows
// ---------------------------------------------------------------------------
const upsertRows = [];
for (const [code, types] of balancesByCode) {
  const profile = profileByCode.get(code);
  if (!profile) continue;

  for (const [leaveTypeText, bal] of Object.entries(types)) {
    upsertRows.push({
      employee_id: profile.id,
      leave_type: leaveTypeText,
      year: fyYear,
      total_days: bal.end,
      used_days: 0,
    });
  }
}

console.log(`Prepared ${upsertRows.length} leave_balances upsert rows for ${profileByCode.size} matched employees.`);

if (DRY_RUN) {
  console.log('\n--- DRY RUN — sample rows ---');
  for (const row of upsertRows.slice(0, 10)) {
    const p = profiles.find(p => p.id === row.employee_id);
    console.log(`${p?.employee_code}  ${p?.first_name} ${p?.surname}  [${p?.status}]  ${row.leave_type.padEnd(8)} total_days=${row.total_days}`);
  }
  console.log(`... (${upsertRows.length} total)`);
  console.log('\nDry run — no changes written.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 5. Upsert in batches
// ---------------------------------------------------------------------------
const BATCH_SIZE = 200;
let written = 0;
for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
  const batch = upsertRows.slice(i, i + BATCH_SIZE);
  const { error } = await supabase
    .from('leave_balances')
    .upsert(batch, { onConflict: 'employee_id,leave_type,year' });
  if (error) {
    console.error(`Batch ${i}-${i + batch.length} failed:`, error);
    process.exit(1);
  }
  written += batch.length;
  console.log(`Upserted ${written}/${upsertRows.length}...`);
}

console.log(`\nDone. Upserted ${written} leave_balances rows for FY ${fyYear}.`);
