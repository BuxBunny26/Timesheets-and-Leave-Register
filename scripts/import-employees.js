/**
 * Employee Import Script — Wearcheck CSV Format
 * -----------------------------------------------
 * Reads the Wearcheck semicolon-delimited employee CSV and:
 *   1. Creates Supabase Auth users (password: WearCheck@2024!)
 *   2. Populates profiles with org structure data
 *   3. Links employees to supervisors (resolved by name)
 *   4. Sets nadhira@wearcheckrs.com as system_admin
 *
 * SETUP:
 *   1. Get your Service Role Key from:
 *      https://supabase.com/dashboard/project/dmctmgrtjafnelrpnvin/settings/api
 *   2. Add to .env.local:
 *      SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   3. Run:
 *      node scripts/import-employees.js "C:\path\to\Employee_Mapping.csv"
 *
 * CSV FORMAT (semicolon-delimited):
 *   Employee No ; First Name ; Preferred Name ; Last Name ; Email Address ;
 *   Mobile Number ; Job Title ; Division ; Payment Centre ; Work Location ; Supervisor
 *
 * Safe to re-run — existing users are updated, not duplicated.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
function loadEnvFile(envPath) {
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // fine if file doesn't exist
  }
}

loadEnvFile(resolve(__dirname, '../.env.local'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
// Accept either common naming convention
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
                  ?? process.env.VITE_SUPABASE_SERVICE_KEY
                  ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '\nMissing env vars. Add to .env.local:\n' +
    '  VITE_SUPABASE_URL=https://dmctmgrtjafnelrpnvin.supabase.co\n' +
    '  VITE_SUPABASE_SERVICE_KEY=eyJ...   <-- service_role key from Supabase Dashboard\n' +
    '\nGet it from: https://supabase.com/dashboard/project/dmctmgrtjafnelrpnvin/settings/api\n' +
    'Make sure the key contains "dmctmgrtjafnelrpnvin" (the timesheets project), not another project.\n'
  );
  process.exit(1);
}

// Note: JWT tokens are base64-encoded so we can't reliably check the project ref
// by string search — the check was removed to avoid false positives.

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Wearcheck CSV column indexes (semicolon-delimited)
// Employee No ; First Name ; Preferred Name ; Last Name ; Email Address ;
// Mobile Number ; Job Title ; Division(dept) ; Payment Centre ; Work Location ; Supervisor
// ---------------------------------------------------------------------------
const C = {
  empCode:    0,
  firstName:  1,
  preferred:  2,
  lastName:   3,
  email:      4,
  phone:      5,
  jobTitle:   6,
  dept:       7,   // labelled "Division" in CSV but maps to our department
  paymentCtr: 8,
  location:   9,
  supervisor: 10,
};

// ---------------------------------------------------------------------------
// Site name → site code
// ---------------------------------------------------------------------------
const SITE_MAP = {
  'longmeadow h/o':                         'SA-HO',
  'longmeadow h.o':                         'SA-HO',
  'kwazulu natal':                          'SA-KZH',
  'kwa-zulu natal':                         'SA-KZH',
  'kwazulu natal - hillside':               'SA-KZH',
  'kwazulu natal - tronox':                 'SA-KZT',
  'valterra - mototolo':                    'SA-MOT',
  'mototolo':                               'SA-MOT',
  'steelpoort':                             'SA-MOT',   // closest site
  'valterra - waterval':                    'SA-WAT',
  'waterval':                               'SA-WAT',
  'rbmr and pmr':                           'SA-RBM',
  'rbmr':                                   'SA-RBM',
  'pmr':                                    'SA-RBM',
  'samancor - ecm tweefontein':             'SA-TWF',
  'samancor - tweefontein':                 'SA-TWF',
  'samancor tweefontein':                   'SA-TWF',
  'samancor ecm tweefontein':               'SA-TWF',
  'samancor - tas':                         'SA-TAS',
  'samancor - doornbosch':                  'SA-DBB',
  'samancor - mfc':                         'SA-MFC',
  'samancor - mooinooi':                    'SA-MOO',
  'samancor - millcell':                    'SA-MLC',
  'seriti - khutala':                       'SA-KHU',
  'eskom - matimba':                        'SA-MAT',
  'neopak - rosslyn':                       'SA-NRP',
  'springs':                                'SA-SPR',
  'remote centre':                          'SA-REM',
  'remote center':                          'SA-REM',
  'kathu':                                  'SA-KAT',
  'roamer':                                 'SA-ROA',
  'namibia':                                'INT-NAW',
  'namibia - walvis bay':                   'INT-NAW',
  'namibia - windhoek':                     'INT-NAW2',
  'mozambique':                             'INT-MOZ',
};

// Handles multi-site entries like "Samancor Tweefontein / Samancor Doornbosch"
// Uses " / " (spaced slash) so that "H/O" in "Longmeadow H/O" is NOT split.
function resolveLocation(raw) {
  if (!raw) return null;
  const first = raw.split(' / ')[0].trim().toLowerCase();
  return SITE_MAP[first] ?? null;
}

// ---------------------------------------------------------------------------
// Payment centre name → code
// ---------------------------------------------------------------------------
const PC_NAME_MAP = {
  'wearcheck':  'WEARCHECK',
  'gp consult': 'GP_CONSULT',
  'gp_consult': 'GP_CONSULT',
  'afs':        'AFS',
};

// ---------------------------------------------------------------------------
// Derive division code from department code + payment centre
// GP Consult employees share ARC-* department codes but belong to their own division
// ---------------------------------------------------------------------------
function divisionFromDept(dept, pcCode) {
  const d = dept.trim().toUpperCase();
  if (d.startsWith('AFS') || d === 'AFS') return 'AFS';
  if (pcCode === 'GP_CONSULT') return 'GP_CONSULT';
  if (d.startsWith('ARC'))    return 'ARC';
  if (pcCode === 'WEARCHECK') return 'ARC';
  return null;
}

// ---------------------------------------------------------------------------
// Derive role from job title (conservative — only explicit manager/supervisor)
// ---------------------------------------------------------------------------
function deriveRole(jobTitle) {
  const t = (jobTitle ?? '').toLowerCase();
  if (t.includes('general manager'))           return 'manager';
  if (t.includes('country manager'))           return 'manager';
  if (t.includes('divisional manager'))        return 'manager';
  if (t.includes('operations manager'))        return 'manager';
  if (t.includes('service manager'))           return 'manager';
  if (t.includes('tc manager'))                return 'manager';
  if (t.includes('rca operations manager'))    return 'manager';
  if (t.includes('administration manager'))    return 'manager';
  if (t.includes('financial manager'))         return 'manager';
  if (t.includes('technical & training'))      return 'manager';
  if (t.includes('arc centre manager'))        return 'manager';
  if (t.includes('business unit manager'))     return 'manager';
  if (t.includes('site manager'))              return 'manager';
  if (t.includes('manager'))                   return 'manager';
  if (t.includes('site supervisor'))           return 'supervisor';
  if (t.includes('supervisor'))                return 'supervisor';
  return 'employee';
}

// ---------------------------------------------------------------------------
// Parse semicolon-delimited CSV (handles Windows line endings)
// ---------------------------------------------------------------------------
function parseWearcheckCSV(raw) {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  // skip header row (index 0)
  return lines.slice(1).map(line => {
    const cols = line.split(';').map(v => v.trim());
    return {
      empCode:    cols[C.empCode]?.replace(/^nan$/i, '').replace(/^unknown$/i, '') || null,
      firstName:  cols[C.firstName]  || '',
      preferred:  cols[C.preferred]  || '',
      lastName:   cols[C.lastName]   || '',
      email:      (cols[C.email]     || '').replace(/\s/g, '').toLowerCase(),
      phone:      cols[C.phone]      || null,
      jobTitle:   cols[C.jobTitle]   || '',
      dept:       (cols[C.dept]      || '').trim(),
      paymentCtr: (cols[C.paymentCtr] || '').trim(),
      location:   cols[C.location]   || '',
      supervisor: cols[C.supervisor] || '',
    };
  }).filter(r => r.email && r.email.includes('@'));  // skip rows without valid email
}

// ---------------------------------------------------------------------------
// Build supervisor name → email lookup from the employee list itself
// Three strategies per employee, all lowercased:
//   1. preferred + " " + lastName          e.g. "peet peacock"
//   2. firstWord(preferred) + " " + lastName  e.g. "eddie pieterse" (handles "Eddie Snr")
//   3. firstWord(firstName) + " " + lastName  e.g. "micheal pretorius" (uses legal first name)
// ---------------------------------------------------------------------------
function buildSupervisorLookup(employees) {
  const lookup = {};

  const add = (key, email) => {
    const k = key.toLowerCase().trim().replace(/\s+/g, ' ');
    if (k && !lookup[k]) lookup[k] = email;
  };

  for (const emp of employees) {
    if (!emp.email) continue;
    const last      = emp.lastName.trim();
    const preferred = emp.preferred.trim();
    const firstName = emp.firstName.trim();

    // Strategy 1: preferred + last
    add(`${preferred} ${last}`, emp.email);

    // Strategy 2: first word of preferred + last (handles "Eddie Snr Pieterse" → "Eddie Pieterse")
    const prefWord = preferred.split(/\s+/)[0];
    if (prefWord !== preferred) add(`${prefWord} ${last}`, emp.email);

    // Strategy 3: first word of legal first name + last (handles "Micheal Francios Pretorius")
    const legalWord = firstName.split(/\s+/)[0];
    if (legalWord !== prefWord) add(`${legalWord} ${last}`, emp.email);
  }

  return lookup;
}

// Resolve a supervisor name string to an email.
// Handles "X / Y" (multiple supervisors — picks first) and strips Snr/Jnr suffixes.
function resolveSupervisor(rawName, lookup) {
  if (!rawName) return null;
  // take first if multiple supervisors listed
  const name = rawName.split('/')[0].trim();
  // strip honorifics from end
  const stripped = name.replace(/\s+(snr|jnr|jr|sr)\.?$/i, '').trim();

  return lookup[stripped.toLowerCase()]
    ?? lookup[name.toLowerCase()]
    ?? null;
}

// ---------------------------------------------------------------------------
// Fetch all auth users (handles Supabase pagination)
// ---------------------------------------------------------------------------
async function fetchAllUsers() {
  const all = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    all.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
    page++;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/import-employees.js "<path-to-csv>"');
    process.exit(1);
  }

  const raw       = readFileSync(resolve(csvPath), 'utf8');
  const employees = parseWearcheckCSV(raw);
  console.log(`\nLoaded ${employees.length} employee(s) with email from CSV\n`);

  // -- Lookup tables -------------------------------------------------------
  const [
    { data: divisions,      error: e1 },
    { data: departments,    error: e2 },
    { data: paymentCentres, error: e3 },
    { data: sites,          error: e4 },
  ] = await Promise.all([
    supabase.from('divisions').select('id, code'),
    supabase.from('departments').select('id, code'),
    supabase.from('payment_centres').select('id, code'),
    supabase.from('sites').select('id, code'),
  ]);

  if (e1 || e2 || e3 || e4) {
    console.error('Failed to fetch lookup tables:', e1 ?? e2 ?? e3 ?? e4);
    process.exit(1);
  }

  const divMap  = Object.fromEntries((divisions      ?? []).map(r => [r.code, r.id]));
  const deptMap = Object.fromEntries((departments    ?? []).map(r => [r.code, r.id]));
  const pcMap   = Object.fromEntries((paymentCentres ?? []).map(r => [r.code, r.id]));
  const siteMap = Object.fromEntries((sites          ?? []).map(r => [r.code, r.id]));

  // -- Existing auth users -------------------------------------------------
  console.log('Fetching existing auth users...');
  const existingUsers = await fetchAllUsers();
  const userByEmail   = Object.fromEntries(existingUsers.map(u => [u.email?.toLowerCase() ?? '', u.id]));
  console.log(`Found ${existingUsers.length} existing auth user(s)\n`);

  // -- Supervisor name → email lookup (built from CSV itself) --------------
  const supervisorLookup = buildSupervisorLookup(employees);

  // -------------------------------------------------------------------------
  // PASS 1 — create/update auth users and populate profiles
  // -------------------------------------------------------------------------
  console.log('=== PASS 1: Creating / updating users ===\n');
  const emailToId = {};

  for (const emp of employees) {
    const { email, empCode, preferred, lastName, firstName, phone, jobTitle, dept, paymentCtr, location } = emp;

    // Resolve display names
    const displayFirst = preferred || firstName.split(/\s+/)[0] || firstName;
    const label = `${empCode ?? '?'} | ${displayFirst} ${lastName} <${email}>`;

    // Auth user
    let userId = userByEmail[email];
    if (userId) {
      console.log(`[EXIST]  ${label}`);
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: 'WearCheck@2024!',
        email_confirm: true,
        user_metadata: { first_name: displayFirst, surname: lastName, employee_code: empCode },
      });
      if (createErr) {
        console.error(`[ERROR]  ${label} — ${createErr.message}`);
        continue;
      }
      userId = created.user.id;
      console.log(`[CREATE] ${label}`);
    }
    emailToId[email] = userId;

    // Resolve org structure
    const deptCode = dept.replace(/^\s+/, '').toUpperCase();   // trim leading spaces seen in CSV
    const pcCode   = PC_NAME_MAP[(paymentCtr ?? '').toLowerCase().trim()] ?? null;
    const divCode  = divisionFromDept(deptCode, pcCode);
    const siteCode = resolveLocation(location);
    const role     = deriveRole(jobTitle);

    // Upsert profile
    const { error: profileErr } = await supabase.from('profiles').upsert(
      {
        id:                userId,
        employee_code:     empCode   ?? null,
        first_name:        displayFirst,
        surname:           lastName,
        email,
        cell_number:       phone     ?? null,
        job_title:         jobTitle  || null,
        role,
        division_id:       divCode   ? (divMap[divCode]   ?? null) : null,
        department_id:     deptCode  ? (deptMap[deptCode] ?? null) : null,
        payment_centre_id: pcCode    ? (pcMap[pcCode]     ?? null) : null,
        site_id:           siteCode  ? (siteMap[siteCode] ?? null) : null,
        supervisor_id:     null,
      },
      { onConflict: 'id' }
    );

    if (profileErr) console.error(`         Profile error: ${profileErr.message}`);

    // Warn on unresolved org codes
    if (deptCode && !deptMap[deptCode] && deptCode !== 'AFS')
      console.warn(`         [WARN] Unknown department code: "${deptCode}"`);
    if (pcCode && !pcMap[pcCode])
      console.warn(`         [WARN] Unknown payment centre code: "${pcCode}" — run migration 019 first`);
    if (location && !siteCode)
      console.warn(`         [WARN] Unmapped location: "${location}"`);
  }

  // Also capture IDs for users that already existed before this run
  for (const emp of employees) {
    if (!emailToId[emp.email] && userByEmail[emp.email]) {
      emailToId[emp.email] = userByEmail[emp.email];
    }
  }

  // -------------------------------------------------------------------------
  // PASS 2 — link supervisors (name → email → UUID)
  // -------------------------------------------------------------------------
  console.log('\n=== PASS 2: Linking supervisors ===\n');
  const unresolved = [];

  for (const emp of employees) {
    if (!emp.supervisor) continue;

    const empId     = emailToId[emp.email];
    const supEmail  = resolveSupervisor(emp.supervisor, supervisorLookup);
    const supId     = supEmail ? (emailToId[supEmail] ?? userByEmail[supEmail]) : null;

    if (!empId)  continue;

    if (!supId) {
      unresolved.push({ employee: `${emp.preferred} ${emp.lastName} <${emp.email}>`, supervisor: emp.supervisor });
      continue;
    }

    // Derive supervisor's display name from the employee list (for user metadata)
    const supEmp = employees.find(e => e.email === supEmail);
    const supDisplayName = supEmp
      ? `${(supEmp.preferred || supEmp.firstName.split(/\s+/)[0]).trim()} ${supEmp.lastName.trim()}`
      : null;

    const { error } = await supabase.from('profiles').update({ supervisor_id: supId }).eq('id', empId);
    if (error) {
      console.error(`[ERROR] ${emp.email} supervisor link: ${error.message}`);
    } else {
      // Also store supervisor name in auth user metadata so the profile page can
      // display it without needing a cross-profile RLS join.
      if (supDisplayName) {
        await supabase.auth.admin.updateUserById(empId, {
          user_metadata: { supervisor_name: supDisplayName },
        });
      }
      console.log(`[LINK]  ${emp.preferred} ${emp.lastName}  →  ${emp.supervisor}`);
    }
  }

  if (unresolved.length > 0) {
    console.warn('\n--- Unresolved supervisor links (set manually via SQL) ---');
    for (const u of unresolved) {
      console.warn(`  ${u.employee}  →  supervisor "${u.supervisor}"`);
    }
    console.warn(`\nSQL to fix (example):`);
    console.warn(`  UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE email = 'supervisor@wearcheckrs.com')`);
    console.warn(`  WHERE email = 'employee@wearcheckrs.com';\n`);
  }

  // -------------------------------------------------------------------------
  // PASS 3 — set elevated roles for specific accounts
  // -------------------------------------------------------------------------
  console.log('=== PASS 3: Setting elevated roles ===\n');

  const elevatedRoles = [
    { email: 'nadhira@wearcheckrs.com',  role: 'system_admin'  },
    { email: 'megan@wearcheckrs.com',    role: 'admin_manager' },
  ];

  for (const { email, role } of elevatedRoles) {
    const uid = emailToId[email] ?? userByEmail[email];
    if (uid) {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', uid);
      if (error) console.error(`[ERROR] Could not set ${role} for ${email}: ${error.message}`);
      else       console.log(`[ROLE]  ${email} → ${role}`);
    } else {
      console.warn(`[WARN]  ${email} not found — skipping role assignment.`);
    }
  }

  console.log('\n✓ Import complete.\n');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
