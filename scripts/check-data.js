import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(p) { try { for (const l of readFileSync(p,'utf8').split('\n')) { const t=l.trim(); if(!t||t.startsWith('#')) continue; const e=t.indexOf('='); if(e===-1) continue; const k=t.slice(0,e).trim(),v=t.slice(e+1).trim(); if(!process.env[k]) process.env[k]=v; } } catch {} }
loadEnv(resolve(__dirname,'../.env.local')); loadEnv(resolve(__dirname,'../.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Birthday check
// Birthday view only exposes birthday_this_year (privacy migration 053 removed birth year)
const { data: births, error: be } = await sb
  .from('birthdays_this_year')
  .select('first_name, surname, birthday_this_year')
  .order('birthday_this_year');

// Verify specific DOBs directly from employee_details id_number
const { data: idRows } = await sb
  .from('profiles')
  .select('first_name, surname, employee_details(id_number)')
  .in('first_name', ['Philip','Megan','Nadhira','Morne','JJ','Peet','Annemie']);

console.log('=== Birthdays (upcoming from today) ===');
if (be) { console.error('Birthday view error:', be.message); }
else {
  const today = new Date().toISOString().split('T')[0];
  const upcoming = (births ?? []).filter(r => r.birthday_this_year >= today).slice(0, 15);
  upcoming.forEach(r =>
    console.log(`  ${r.birthday_this_year}  ${(r.first_name + ' ' + r.surname)}`)
  );
}

console.log('\n--- Specific checks (raw ID → DOB) ---');
(idRows ?? []).forEach(r => {
  const id = r.employee_details?.[0]?.id_number ?? r.employee_details?.id_number ?? null;
  let dob = '(no ID)';
  if (id && /^\d{13}$/.test(id)) {
    const yy = parseInt(id.slice(0,2)), mm = id.slice(2,4), dd = id.slice(4,6);
    const yr = yy <= 26 ? 2000+yy : 1900+yy;
    dob = `${yr}-${mm}-${dd}`;
  } else if (id) {
    dob = `(foreign ID: ${id})`;
  }
  console.log(`  ${(r.first_name+' '+r.surname).padEnd(22)} ID: ${id?.padEnd(15) ?? '(none)'.padEnd(15)}  DOB: ${dob}`);
});

// 2. Supervisor chain
console.log('\n=== Supervisor chain (key employees) ===');
const { data: profs } = await sb
  .from('profiles')
  .select('first_name, surname, email, job_title, supervisor_id')
  .in('email', ['philip@wearcheckrs.com','annemie@wearcheckrs.com','jaco@wearcheckrs.com','louis@wearcheckrs.com','rogerh@wearcheckrs.com','epieterse@wearcheckrs.com','edwardfp@wearcheckrs.com']);

// Also fetch supervisors by id
const supIds = [...new Set((profs ?? []).map(p => p.supervisor_id).filter(Boolean))];
const { data: supProfs } = supIds.length > 0
  ? await sb.from('profiles').select('id, first_name, surname').in('id', supIds)
  : { data: [] };
const supById = Object.fromEntries((supProfs ?? []).map(p => [p.id, `${p.first_name} ${p.surname}`]));

(profs ?? []).sort((a,b) => a.first_name.localeCompare(b.first_name)).forEach(p => {
  const sup = p.supervisor_id ? (supById[p.supervisor_id] ?? '(id not resolved)') : '(no supervisor)';
  console.log(`  ${(p.first_name + ' ' + p.surname).padEnd(24)}  → ${sup}`);
});

// 3. Counts
const { count: activeCount } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active');
const { count: inactiveCount } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'inactive');
const { count: idCount } = await sb.from('employee_details').select('*', { count: 'exact', head: true }).not('id_number', 'is', null);
const { count: noIdCount } = await sb.from('employee_details').select('*', { count: 'exact', head: true }).is('id_number', null);

console.log('\n=== Record counts ===');
console.log(`  Active employees:      ${activeCount}`);
console.log(`  Inactive employees:    ${inactiveCount}  (excluded from organogram)`);
console.log(`  With ID number:        ${idCount}`);
console.log(`  Without ID number:     ${noIdCount}`);
