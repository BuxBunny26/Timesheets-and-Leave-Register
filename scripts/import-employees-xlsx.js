/**
 * Import Employees from XLSX — "Employee List - 09.07.2026.xlsx" format
 * -----------------------------------------------------------------------
 * Columns (0-based):
 *   0  Employee Code
 *   1  First Names  (full legal first name(s))
 *   2  Preferred Name
 *   3  Surname
 *   4  Email Address
 *   5  Job Title
 *   6  ID Number
 *   7  Gender
 *   8  Race
 *   9  Province
 *  10  Site
 *  11  Manager (supervisor preferred name + surname)
 *  12  Legal Employer   ("GP Consult" | "RS" | "AFS")
 *
 * What this script does:
 *   1. Upserts new site codes that don't exist yet in the DB
 *   2. PASS 1 — creates or updates auth users + profiles
 *   3. PASS 2 — links supervisor_id by resolving manager names to emails
 *   4. PASS 3 — sets elevated roles for Nadhira (system_admin) and Megan (admin_manager)
 *
 * Safe to re-run — existing users are updated, not duplicated.
 *
 * Usage:
 *   node scripts/import-employees-xlsx.js "C:\path\to\Employee List - 09.07.2026.xlsx"
 *   node scripts/import-employees-xlsx.js "...xlsx" --dry-run
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

// ---------------------------------------------------------------------------
// Column indexes (0-based)  — updated 09.07.2026 format
// ---------------------------------------------------------------------------
const C = {
  empCode:       0,
  firstNames:    1,
  preferred:     2,
  surname:       3,
  email:         4,
  jobTitle:      5,
  idNumber:      6,
  gender:        7,
  race:          8,
  province:      9,
  department:   10,   // NEW
  decisionLevel:11,   // NEW
  site:         12,
  manager:      13,
  legalEmployer:14,
};

// ---------------------------------------------------------------------------
// Department name → code  (matches 069 migration)
// ---------------------------------------------------------------------------
const DEPT_NAME_MAP = {
  'reliability services':            'ORG-RS',
  'non destructive testing (ndt)':   'ORG-NDT',
  'administration':                  'ORG-ADMIN',
  'sales':                           'ORG-SALES',
  'digital':                         'ORG-DIGIT',
  'remote centre':                   'ORG-RC',
  'rope condition assessment (rca)': 'ORG-RCA',
  'technical compliance (tc)':       'ORG-TC',
};

// ---------------------------------------------------------------------------
// Legal Employer → { divCode, pcCode }
// ---------------------------------------------------------------------------
const EMPLOYER_MAP = {
  'gp consult': { divCode: 'GP_CONSULT', pcCode: 'GP_CONSULT' },
  'rs':         { divCode: 'ARC',        pcCode: 'WEARCHECK'  },
  'afs':        { divCode: 'AFS',        pcCode: 'AFS'        },
};

// ---------------------------------------------------------------------------
// Site name → existing site code   (lower-cased keys)
// ---------------------------------------------------------------------------
const SITE_NAME_MAP = {
  // Existing sites
  'longmeadow h/o':                'SA-HO',
  'longmeadow':                    'SA-HO',
  'all sites':                     'SA-ROA',
  'roamer':                        'SA-ROA',
  'springs':                       'SA-SPR',
  'valterra - mototolo':           'SA-MOT',
  'mototolo - steelpoort':         'SA-MOT',
  'steelpoort':                    'SA-MOT',
  'valterra - waterval':           'SA-WAT',
  'rbmr and pmr':                  'SA-RBM',
  'bmr and pmr':                   'SA-RBM',
  'samancor - tweefontein':        'SA-TWF',
  'samancor tweefontein':          'SA-TWF',
  'samancor ecm':                  'SA-TWF',   // ECM = Eastern Chrome Mines = Tweefontein
  'samancor ecm tweefontein':      'SA-TWF',
  'samancor - ecm tweefontein':    'SA-TWF',
  'samancor - tas':                'SA-TAS',
  'samancor tas':                  'SA-TAS',
  'samancor - doornbosch':         'SA-DBB',
  'samancor - mfc':                'SA-MFC',
  'samancor mfc':                  'SA-MFC',
  'samancor - millcell':           'SA-MLC',
  'samancor millcell':             'SA-MLC',
  'samancor wcm':                  'SA-WCM',   // new site — created below
  'samancor - mooinooi':           'SA-MOO',
  'seriti - khutala':              'SA-KHU',
  'seriti khutala':                'SA-KHU',
  'eskom - matimba':               'SA-MAT',
  'matimba power station':         'SA-MAT',
  'neopak - rosslyn':              'SA-NRP',
  'rosslyn':                       'SA-NRP',
  'samancor fmt':                  'SA-FMT',   // new site — created below
  'samancor dcr':                  'SA-DCR',   // new site — created below
  'samancor tcs':                  'SA-TCS',   // new site — created below
  'anglo - polokwane':             'SA-PLK',   // new site — created below
  'kwazulu natal - hillside':      'SA-KZH',
  'kwazulu natal - tronox':        'SA-KZT',
  'tronox':                        'SA-KZT',
  'durban sites':                  'SA-KZH',
  'remote centre':                 'SA-REM',
  'kathu':                         'SA-KAT',
  'namibia':                       'INT-NAW',
  'namibia - walvis bay':          'INT-NAW',
  'namibia - windhoek':            'INT-NAW2',
  'mozambique':                    'INT-MOZ',
  'africa':                        'INT-AF',    // new site — created below
  'middleburg':                    'SA-MDB',
  'middelburg':                    'SA-MDB',
  // AFS sites (new)
  'klerksdorp':                    'SA-KLD',
  'rustenburg':                    'SA-RST',
  'fochville':                     'SA-FOC',
  'witbank sites':                 'SA-WIT',
  'witbank':                       'SA-WIT',
  'randfontein':                   'SA-RAN',
  'krugersdorp':                   'SA-KRG',
  // Anglo sites (map to SA-RBM area)
  'anglo - rustenburg':            'SA-RBM',
  'anglo -rustenburg':             'SA-RBM',
  'anglo-rustenburg':              'SA-RBM',
};

// New sites to upsert into the DB before import
const NEW_SITES = [
  { code: 'SA-WCM', name: 'Samancor - WCM',       city: 'Rustenburg',   province: 'North West',    country_code: 'ZA' },
  { code: 'SA-FMT', name: 'Samancor - FMT',        city: 'Middelburg',   province: 'Mpumalanga',    country_code: 'ZA' },
  { code: 'SA-KLD', name: 'Klerksdorp',             city: 'Klerksdorp',   province: 'North West',    country_code: 'ZA' },
  { code: 'SA-RST', name: 'Rustenburg',             city: 'Rustenburg',   province: 'North West',    country_code: 'ZA' },
  { code: 'SA-FOC', name: 'Fochville',              city: 'Fochville',    province: 'Gauteng',       country_code: 'ZA' },
  { code: 'SA-WIT', name: 'Witbank',                city: 'eMalahleni',   province: 'Mpumalanga',    country_code: 'ZA' },
  { code: 'SA-RAN', name: 'Randfontein',            city: 'Randfontein',  province: 'Gauteng',       country_code: 'ZA' },
  { code: 'SA-KRG', name: 'Krugersdorp',            city: 'Krugersdorp',  province: 'Gauteng',       country_code: 'ZA' },
  { code: 'INT-AF', name: 'Africa (International)', city: 'Various',      province: 'Various',       country_code: 'MZ' },
  { code: 'SA-MDB', name: 'Middleburg',             city: 'Middleburg',   province: 'Mpumalanga',    country_code: 'ZA' },
  { code: 'SA-PLK', name: 'Anglo - Polokwane',        city: 'Polokwane',    province: 'Limpopo',       country_code: 'ZA' },
  { code: 'SA-DCR', name: 'Samancor - DCR',           city: 'Middelburg',   province: 'Mpumalanga',    country_code: 'ZA' },
  { code: 'SA-TCS', name: 'Samancor - TCS',           city: 'Middelburg',   province: 'Mpumalanga',    country_code: 'ZA' },
];

// ---------------------------------------------------------------------------
// Role derivation from job title
// ---------------------------------------------------------------------------
function deriveRole(jobTitle) {
  const t = (jobTitle ?? '').toLowerCase();
  if (t.includes('general manager'))            return 'manager';
  if (t.includes('divisional manager'))         return 'manager';
  if (t.includes('operations manager'))         return 'manager';
  if (t.includes('services manager'))           return 'manager';
  if (t.includes('service manager'))            return 'manager';
  if (t.includes('administrative manager'))     return 'manager';
  if (t.includes('administration manager'))     return 'manager';
  if (t.includes('technical & training'))       return 'manager';
  if (t.includes('bu manager'))                 return 'manager';
  if (t.includes('country manager'))            return 'manager';
  if (t.includes('sales manager'))              return 'manager';
  if (t.includes('manager tc'))                 return 'manager';
  if (t.includes('manager rca'))                return 'manager';
  if (t.includes('manager'))                    return 'manager';
  if (t.includes('co-ordinator'))               return 'supervisor';
  if (t.includes('coordinator'))                return 'supervisor';
  if (t.includes('site supervisor'))            return 'supervisor';
  if (t.includes('supervisor'))                 return 'supervisor';
  return 'employee';
}

// ---------------------------------------------------------------------------
// Parse rows from the XLSX sheet
// ---------------------------------------------------------------------------
function parseRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  return rows.slice(1)   // skip header
    .filter(r => r[C.email] && String(r[C.email]).includes('@'))
    .map(r => {
      const clean = (v) => (v == null ? '' : String(v).trim());
      const email = clean(r[C.email]).toLowerCase().replace(/\s+/g, '');
      return {
        empCode:        clean(r[C.empCode]).replace(/\s+/g, ''),
        firstNames:     clean(r[C.firstNames]),
        preferred:      clean(r[C.preferred]),
        surname:        clean(r[C.surname]),
        email,
        jobTitle:       clean(r[C.jobTitle]),
        idNumber:       clean(r[C.idNumber]).replace(/[^0-9A-Za-z:()]/g, ''),
        gender:         clean(r[C.gender]).replace(/^(m\s*-\s*|f\s*-\s*)/i, '').trim(),
        race:           clean(r[C.race]).replace(/^([a-z]\s*-\s*)/i, '').trim(),
        province:       clean(r[C.province]),
        department:     clean(r[C.department]),
        decisionLevel:  clean(r[C.decisionLevel]),
        site:           clean(r[C.site]),
        manager:        clean(r[C.manager]),
        legalEmployer:  clean(r[C.legalEmployer]),
      };
    });
}

// ---------------------------------------------------------------------------
// Build supervisor name → email lookup
// Three strategies per employee:
//   1. preferred + " " + surname
//   2. first word of preferred + " " + surname
//   3. first word of firstNames + " " + surname
// ---------------------------------------------------------------------------
function buildSupervisorLookup(employees) {
  const lookup = {};
  const add = (key, email) => {
    const k = key.toLowerCase().trim().replace(/\s+/g, ' ');
    if (k && !lookup[k]) lookup[k] = email;
  };
  for (const emp of employees) {
    if (!emp.email) continue;
    const last = emp.surname;
    const pref = emp.preferred;
    const legal = emp.firstNames.split(/\s+/)[0];

    add(`${pref} ${last}`, emp.email);
    const prefWord = pref.split(/\s+/)[0];
    if (prefWord !== pref) add(`${prefWord} ${last}`, emp.email);
    if (legal !== prefWord) add(`${legal} ${last}`, emp.email);
  }
  return lookup;
}

function resolveSupervisor(rawName, lookup) {
  if (!rawName || /^(n\/a|tba)$/i.test(rawName.trim())) return null;
  const name    = rawName.split('/')[0].trim();
  const stripped = name.replace(/\s+(snr|jnr|jr|sr)\.?$/i, '').trim();
  return lookup[stripped.toLowerCase()] ?? lookup[name.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Fetch all auth users (handles pagination)
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
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: node scripts/import-employees-xlsx.js "<path-to-xlsx>"');
    process.exit(1);
  }

  // -- Parse XLSX -----------------------------------------------------------
  const wb = XLSX.readFile(resolve(xlsxPath));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const employees = parseRows(ws);
  console.log(`\nLoaded ${employees.length} employee(s) with valid email from XLSX\n`);

  if (DRY_RUN) console.log('*** DRY RUN — no changes will be made ***\n');

  // -- Upsert new site codes ------------------------------------------------
  console.log('=== Upserting new site codes ===\n');
  for (const site of NEW_SITES) {
    if (DRY_RUN) { console.log(`  [DRY-RUN] Would upsert site: ${site.code}`); continue; }
    const { error } = await supabase.from('sites').upsert(site, { onConflict: 'code' });
    if (error) console.error(`  [WARN] site ${site.code}: ${error.message}`);
    else       console.log(`  [OK] ${site.code} — ${site.name}`);
  }

  // -- Fetch lookup tables --------------------------------------------------
  const [
    { data: divisions,      error: e1 },
    { data: paymentCentres, error: e2 },
    { data: sites,          error: e3 },
    { data: departments,    error: e4 },
  ] = await Promise.all([
    supabase.from('divisions').select('id, code'),
    supabase.from('payment_centres').select('id, code'),
    supabase.from('sites').select('id, code'),
    supabase.from('departments').select('id, code'),
  ]);
  if (e1 || e2 || e3 || e4) { console.error('Lookup table fetch error:', e1 ?? e2 ?? e3 ?? e4); process.exit(1); }

  const divMap  = Object.fromEntries((divisions      ?? []).map(r => [r.code, r.id]));
  const pcMap   = Object.fromEntries((paymentCentres ?? []).map(r => [r.code, r.id]));
  const siteMap = Object.fromEntries((sites          ?? []).map(r => [r.code, r.id]));
  const deptMap = Object.fromEntries((departments    ?? []).map(r => [r.code, r.id]));

  // -- Existing auth users --------------------------------------------------
  console.log('\nFetching existing auth users...');
  const existingUsers = await fetchAllUsers();
  const userByEmail   = Object.fromEntries(existingUsers.map(u => [u.email?.toLowerCase() ?? '', u.id]));
  console.log(`  Found ${existingUsers.length} existing auth user(s)\n`);

  // -- Supervisor name → email lookup ---------------------------------------
  const supervisorLookup = buildSupervisorLookup(employees);

  // =========================================================================
  // PASS 1 — create / update auth users + profiles
  // =========================================================================
  console.log('=== PASS 1: Creating / updating users ===\n');
  const emailToId = {};

  for (const emp of employees) {
    const { email, empCode, preferred, surname, firstNames, jobTitle, site, legalEmployer, department, decisionLevel } = emp;

    const displayFirst = preferred || firstNames.split(/\s+/)[0];
    const label = `${empCode} | ${displayFirst} ${surname} <${email}>`;

    // -- Auth user ----------------------------------------------------------
    let userId = userByEmail[email];
    if (!DRY_RUN) {
      if (userId) {
        // Update metadata in case name changed
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { first_name: displayFirst, surname, employee_code: empCode },
        });
        console.log(`[EXIST]  ${label}`);
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: 'WearCheck@2024!',
          email_confirm: true,
          user_metadata: { first_name: displayFirst, surname, employee_code: empCode },
        });
        if (createErr) { console.error(`[ERROR]  ${label} — ${createErr.message}`); continue; }
        userId = created.user.id;
        console.log(`[CREATE] ${label}`);
      }
    } else {
      userId = userByEmail[email] ?? `dry-run-${email}`;
      console.log(`[DRY-RUN] ${label}`);
    }
    emailToId[email] = userId;

    // -- Resolve org codes --------------------------------------------------
    const employer  = legalEmployer.toLowerCase().trim();
    const orgCodes  = EMPLOYER_MAP[employer] ?? { divCode: null, pcCode: null };

    const siteKey  = site.toLowerCase().trim();
    const siteCode = SITE_NAME_MAP[siteKey] ?? null;
    if (site && !siteCode) console.warn(`         [WARN] Unmapped site: "${site}"`);

    const deptCode = DEPT_NAME_MAP[department.toLowerCase().trim()] ?? null;
    if (department && !deptCode) console.warn(`         [WARN] Unmapped department: "${department}"`);

    const role = deriveRole(jobTitle);

    // -- Upsert profile -----------------------------------------------------
    if (!DRY_RUN) {
      const { error: profileErr } = await supabase.from('profiles').upsert(
        {
          id:                userId,
          employee_code:     empCode        || null,
          first_name:        displayFirst,
          surname,
          email,
          job_title:         jobTitle       || null,
          decision_level:    decisionLevel  || null,
          role,
          division_id:       orgCodes.divCode ? (divMap[orgCodes.divCode] ?? null) : null,
          department_id:     deptCode        ? (deptMap[deptCode]          ?? null) : null,
          payment_centre_id: orgCodes.pcCode  ? (pcMap[orgCodes.pcCode]   ?? null) : null,
          site_id:           siteCode         ? (siteMap[siteCode]         ?? null) : null,
          supervisor_id:     null,
        },
        { onConflict: 'id' }
      );
      if (profileErr) console.error(`         Profile error: ${profileErr.message}`);
    }
  }

  // Also capture IDs for users that already existed
  for (const emp of employees) {
    if (!emailToId[emp.email] && userByEmail[emp.email]) {
      emailToId[emp.email] = userByEmail[emp.email];
    }
  }

  // =========================================================================
  // PASS 2 — link supervisors
  // =========================================================================
  console.log('\n=== PASS 2: Linking supervisors ===\n');
  const unresolved = [];

  for (const emp of employees) {
    if (!emp.manager) continue;

    const empId    = emailToId[emp.email];
    const supEmail = resolveSupervisor(emp.manager, supervisorLookup);
    const supId    = supEmail ? (emailToId[supEmail] ?? userByEmail[supEmail]) : null;

    if (!empId) continue;
    if (!supId) {
      unresolved.push({ employee: `${emp.preferred} ${emp.surname} <${emp.email}>`, manager: emp.manager });
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY-RUN] ${emp.preferred} ${emp.surname}  →  ${emp.manager}`);
      continue;
    }

    const supEmp = employees.find(e => e.email === supEmail);
    const supDisplayName = supEmp
      ? `${supEmp.preferred} ${supEmp.surname}`
      : null;

    const { error } = await supabase.from('profiles').update({ supervisor_id: supId }).eq('id', empId);
    if (error) {
      console.error(`[ERROR] ${emp.email} supervisor link: ${error.message}`);
    } else {
      if (supDisplayName) {
        await supabase.auth.admin.updateUserById(empId, {
          user_metadata: { supervisor_name: supDisplayName },
        });
      }
      console.log(`[LINK]  ${emp.preferred} ${emp.surname}  →  ${emp.manager}`);
    }
  }

  if (unresolved.length > 0) {
    console.warn('\n--- Unresolved supervisor links (not in this employee list) ---');
    for (const u of unresolved) {
      console.warn(`  ${u.employee}  →  manager: "${u.manager}"`);
    }
  }

  // =========================================================================
  // PASS 3 — elevated roles
  // =========================================================================
  console.log('\n=== PASS 3: Setting elevated roles ===\n');

  const elevatedRoles = [
    { email: 'nadhira@wearcheckrs.com', role: 'system_admin'  },
    { email: 'megan@wearcheckrs.com',   role: 'admin_manager' },
  ];

  for (const { email, role } of elevatedRoles) {
    const uid = emailToId[email] ?? userByEmail[email];
    if (!uid) { console.warn(`[WARN]  ${email} not found — skipping.`); continue; }
    if (DRY_RUN) { console.log(`[DRY-RUN] ${email} → ${role}`); continue; }
    const { error } = await supabase.from('profiles').update({ role }).eq('id', uid);
    if (error) console.error(`[ERROR] ${email}: ${error.message}`);
    else       console.log(`[ROLE]  ${email} → ${role}`);
  }

  console.log('\n✓ Import complete.\n');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
