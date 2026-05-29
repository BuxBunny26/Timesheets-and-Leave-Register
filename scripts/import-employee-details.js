/**
 * Employee HR Details Import — from the standardisation XLSX
 * ----------------------------------------------------------
 * Reads "Employees Details - Standardisation in Progress (X).xlsx" and:
 *   1. Matches each row to an existing profile by company email
 *   2. Updates profile cell_number / job_title / preferred_name if blank
 *   3. Upserts employee_details (passport, licence, medical, address, NoK, education, competencies)
 *   4. Upserts employee_certifications for the 9 known certification types
 *
 * Profiles that don't exist are SKIPPED (run import-employees.js first to
 * create the auth user + profile, then re-run this).
 *
 * Dates in the workbook are stored as text in DD/MM/YYYY format.
 *
 * Usage:
 *   node scripts/import-employee-details.js "C:\path\to\Employees Details - Standardisation in Progress (4).xlsx"
 *   node scripts/import-employee-details.js "...xlsx" --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
                  ?? process.env.VITE_SUPABASE_SERVICE_KEY
                  ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Column indexes (0-based) — matches the standardisation XLSX header
// ---------------------------------------------------------------------------
const C = {
  status1:        2,
  division:       3,   // "ARC-NDT" / "ARC-RCM" / "AFS"
  payCentre:      4,   // "WearCheck" / "GP Consult" / "AFS"
  empCode:        5,
  gender:         6,
  race:           7,
  idNumber:       8,
  nickName:       9,
  firstName:     10,
  surname:       11,
  email:         12,
  jobTitle:      13,
  supervisor:    14,
  site:          15,
  idAttached:    16,   // filename or null
  hasPassport:   17,
  passportNum:   18,
  passportExp:   19,
  passportAtt:   20,
  cellNumber:    21,
  cellOwner:     22,
  serviceProv:   23,
  whatsapp:      24,
  personalEmail: 25,
  hasLicence:    26,
  licenceNum:    27,
  licenceExp:    28,
  licenceAtt:    29,
  hasMedAid:     30,
  medAidProv:    31,
  medAidNum:     32,
  medPractName:  33,
  doctorContact: 34,
  allergiesDiet: 35,
  homeAddress:   36,
  complexStreet: 37,
  suburb:        38,
  city:          39,
  province:      40,
  country:       41,
  postalCode:    42,
  pinLocation:   43,
  nokName:       44,
  nokRelation:   45,
  nokContact:    46,
  dependants:    47,
  matric:        48,
  matricYear:    49,
  tradeCert:     50,
  diplomas:      51,
  // Certifications: pairs (held bool, attached filename).
  // The workbook does not store structured expiry dates for certifications —
  // they are typically embedded in the attached filename (e.g. "... Exp. 14.03.2028.pdf").
  // Leave expiry_date NULL; user can fill in via the UI.
  certPairs: [
    { code: 'balancing',       has: 52, att: 53 },
    { code: 'laser_alignment', has: 54, att: 55 },
    { code: 'mobius_cat_1',    has: 56, att: 57 },
    { code: 'mobius_cat_2',    has: 58, att: 59 },
    { code: 'mobius_cat_3',    has: 60, att: 61 },
    { code: 'mobius_cat_4',    has: 62, att: 63 },
    { code: 'infrared_1',      has: 64, att: 65 },
    { code: 'infrared_2',      has: 66, att: 67 },
    { code: 'infrared_3',      has: 68, att: 69 },
  ],
  compAlignment:    70,
  compBalancing:    71,
  compVibration:    72,
  compSampling:     73,
  compThermography: 74,
  compMotorCircuit: 75,
  compVibrationMon: 76,
  otherQualif:      77,
  startDate:        78,
  statusActive:     79,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function asBool(v) {
  if (v === true || v === false) return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'active';
}

function attachedAsBool(v) {
  // "Attached" columns hold a filename when present, or null when not.
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0 && s.toLowerCase() !== 'no' && s.toLowerCase() !== 'n/a';
}

function nullableText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'none') return null;
  return s;
}

function nullableInt(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse "DD/MM/YYYY" or "D/M/YYYY" → "YYYY-MM-DD"; returns null if unparseable. */
function parseDate(v) {
  if (v == null || v === '') return null;
  // Excel serial date
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y.toString().padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  // Already ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
    const day = parseInt(d, 10);
    const mon = parseInt(mo, 10);
    const yr  = parseInt(y, 10);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return `${yr.toString().padStart(4, '0')}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

function normaliseEmail(v) {
  if (!v) return null;
  return String(v).replace(/\s/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Build the patches for a single row
// ---------------------------------------------------------------------------
function buildDetailsPayload(row) {
  return {
    id_attached:                attachedAsBool(row[C.idAttached]),
    has_passport:               asBool(row[C.hasPassport]),
    passport_number:            nullableText(row[C.passportNum]),
    passport_expiry:            parseDate(row[C.passportExp]),
    passport_attached:          attachedAsBool(row[C.passportAtt]),

    cell_phone_contract_owner:  nullableText(row[C.cellOwner]),
    service_provider:           nullableText(row[C.serviceProv]),
    whatsapp_number:            nullableText(row[C.whatsapp]),
    personal_email:             nullableText(row[C.personalEmail]),

    has_drivers_licence:        asBool(row[C.hasLicence]),
    drivers_licence_number:     nullableText(row[C.licenceNum]),
    drivers_licence_expiry:     parseDate(row[C.licenceExp]),
    drivers_licence_attached:   attachedAsBool(row[C.licenceAtt]),

    has_medical_aid:            asBool(row[C.hasMedAid]),
    medical_aid_provider:       nullableText(row[C.medAidProv]),
    medical_aid_number:         nullableText(row[C.medAidNum]),
    medical_practitioner_name:  nullableText(row[C.medPractName]),
    doctor_contact_number:      nullableText(row[C.doctorContact]),
    allergies_diet:             nullableText(row[C.allergiesDiet]),

    home_address:               nullableText(row[C.homeAddress]),
    complex_street_name:        nullableText(row[C.complexStreet]),
    suburb:                     nullableText(row[C.suburb]),
    city:                       nullableText(row[C.city]),
    province:                   nullableText(row[C.province]),
    country:                    nullableText(row[C.country]),
    postal_code:                nullableText(row[C.postalCode]),
    home_pin_location:          nullableText(row[C.pinLocation]),

    next_of_kin_name:           nullableText(row[C.nokName]),
    next_of_kin_relationship:   nullableText(row[C.nokRelation]),
    next_of_kin_contact:        nullableText(row[C.nokContact]),

    matric:                     asBool(row[C.matric]),
    matric_year:                nullableInt(row[C.matricYear]),
    trade_certificate:          nullableText(row[C.tradeCert]),
    diplomas_degrees:           nullableText(row[C.diplomas]),
    other_qualification:        nullableText(row[C.otherQualif]),
    start_date:                 parseDate(row[C.startDate]),

    comp_alignment:                asBool(row[C.compAlignment]),
    comp_balancing:                asBool(row[C.compBalancing]),
    comp_vibration:                asBool(row[C.compVibration]),
    comp_sampling:                 asBool(row[C.compSampling]),
    comp_thermography:             asBool(row[C.compThermography]),
    comp_motor_circuit_analysis:   asBool(row[C.compMotorCircuit]),
    comp_vibration_monitoring:     asBool(row[C.compVibrationMon]),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const xlsxPath = process.argv[2];
  const dryRun   = process.argv.includes('--dry-run');
  if (!xlsxPath) {
    console.error('Usage: node scripts/import-employee-details.js "<path-to-xlsx>" [--dry-run]');
    process.exit(1);
  }

  console.log(`\nReading: ${xlsxPath}`);
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  console.log(`Loaded ${rows.length - 1} data row(s) (excluding header)\n`);

  // -- Existing profiles -------------------------------------------------
  console.log('Fetching existing profiles...');
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, cell_number, job_title, preferred_name');
  if (profErr) { console.error('Profile fetch failed:', profErr); process.exit(1); }
  const profileByEmail = new Map();
  for (const p of profiles ?? []) profileByEmail.set((p.email ?? '').toLowerCase(), p);
  console.log(`Found ${profiles?.length ?? 0} profile(s)`);

  // -- Cert types -----------------------------------------------------
  const { data: certTypes, error: ctErr } = await supabase
    .from('certification_types')
    .select('id, code');
  if (ctErr) { console.error('Cert type fetch failed:', ctErr); process.exit(1); }
  const certTypeByCode = new Map((certTypes ?? []).map(t => [t.code, t.id]));

  let matched = 0;
  let skipped = 0;
  let detailsOk = 0;
  let detailsErr = 0;
  let certsOk = 0;
  let certsErr = 0;
  const unmatchedEmails = [];
  const badDates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(v => v == null || v === '')) continue;

    const email = normaliseEmail(row[C.email]);
    if (!email) { skipped++; continue; }

    const profile = profileByEmail.get(email);
    if (!profile) {
      unmatchedEmails.push(email);
      skipped++;
      continue;
    }
    matched++;

    // Track date columns that failed to parse (for visibility)
    const checkDate = (label, val) => {
      if (val == null || val === '') return;
      if (parseDate(val) === null) badDates.push(`${email} ${label}="${val}"`);
    };
    checkDate('passport_exp', row[C.passportExp]);
    checkDate('licence_exp',  row[C.licenceExp]);
    checkDate('start_date',   row[C.startDate]);

    // -- Profile patch (only fill blanks) -----------------------------
    const profilePatch = {};
    const cell = nullableText(row[C.cellNumber]);
    if (cell && !profile.cell_number)  profilePatch.cell_number = cell;
    const job  = nullableText(row[C.jobTitle]);
    if (job  && !profile.job_title)    profilePatch.job_title = job;
    const nick = nullableText(row[C.nickName]);
    if (nick && !profile.preferred_name) profilePatch.preferred_name = nick;
    const statusActive = asBool(row[C.statusActive]);
    profilePatch.status = statusActive ? 'active' : 'inactive';

    if (Object.keys(profilePatch).length > 0 && !dryRun) {
      const { error } = await supabase.from('profiles').update(profilePatch).eq('id', profile.id);
      if (error) console.error(`  [profile ${email}] ${error.message}`);
    }

    // -- employee_details upsert --------------------------------------
    const details = buildDetailsPayload(row);
    if (!dryRun) {
      const { error } = await supabase
        .from('employee_details')
        .upsert({ employee_id: profile.id, ...details }, { onConflict: 'employee_id' });
      if (error) { detailsErr++; console.error(`  [details ${email}] ${error.message}`); }
      else detailsOk++;
    } else detailsOk++;

    // -- employee_certifications upsert -------------------------------
    const certPayload = [];
    for (const cp of C.certPairs) {
      const typeId = certTypeByCode.get(cp.code);
      if (!typeId) continue;
      const held = asBool(row[cp.has]);
      const att  = attachedAsBool(row[cp.att]);
      if (!held && !att) continue;
      certPayload.push({
        employee_id: profile.id,
        certification_type_id: typeId,
        has_certification: held,
        expiry_date: null,
        attached: att,
      });
    }
    if (certPayload.length > 0 && !dryRun) {
      const { error } = await supabase
        .from('employee_certifications')
        .upsert(certPayload, { onConflict: 'employee_id,certification_type_id' });
      if (error) { certsErr++; console.error(`  [certs ${email}] ${error.message}`); }
      else certsOk++;
    } else if (certPayload.length > 0) certsOk++;

    if (matched % 25 === 0) console.log(`  …${matched} processed`);
  }

  console.log('\n========================================');
  console.log(`Mode:             ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Matched profiles: ${matched}`);
  console.log(`Skipped rows:     ${skipped}`);
  console.log(`Details upserts:  ${detailsOk} ok, ${detailsErr} errors`);
  console.log(`Cert upserts:     ${certsOk} ok, ${certsErr} errors`);
  if (unmatchedEmails.length) {
    console.log(`\nUnmatched emails (no profile exists — run import-employees.js first):`);
    for (const e of unmatchedEmails) console.log(`  - ${e}`);
  }
  if (badDates.length) {
    console.log(`\nUnparseable date values (left as NULL):`);
    for (const b of badDates.slice(0, 30)) console.log(`  - ${b}`);
    if (badDates.length > 30) console.log(`  ... and ${badDates.length - 30} more`);
  }
  console.log('========================================\n');
}

main().catch(err => { console.error(err); process.exit(1); });
