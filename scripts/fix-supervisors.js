import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(resolve(__dirname, '../.env.local'));
loadEnv(resolve(__dirname, '../.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: profiles } = await sb.from('profiles').select('id, email');
const byEmail = Object.fromEntries(profiles.map(p => [p.email.toLowerCase(), p.id]));

const supervisorFixes = [
  // --- Previously unresolved ---
  { employee: 'boitumelo@wearcheckrs.com',    supervisor: 'francoisp@wearcheckrs.com' },  // Francois Pienaar
  { employee: 'martiens@wearcheckrs.com',      supervisor: 'francoisp@wearcheckrs.com' },  // Francois Pienaar
  { employee: 'eugene@wearcheckrs.com',        supervisor: 'franciosp@wearcheckrs.com' },  // Francois Pretorius
  { employee: 'philip@wearcheckrs.com',        supervisor: null },                          // GM — no supervisor
  { employee: 'colleen.pyper@wearcheckrs.com', supervisor: 'johans@wearcheckrs.com' },     // Johan Stols
  { employee: 'ethel.mienie@wearcheckrs.com',  supervisor: 'johans@wearcheckrs.com' },     // Johan Stols
  { employee: 'teresa.venter@wearcheckrs.com', supervisor: 'johans@wearcheckrs.com' },     // Johan Stols
  // --- Organogram corrections ---
  { employee: 'francoisve@wearcheckrs.com',    supervisor: 'andrew@wearcheckrs.com' },     // van Eeden → Andrew Robb
  { employee: 'lesego@wearcheckrs.com',        supervisor: 'andrew@wearcheckrs.com' },     // Lesego → Andrew Robb
  { employee: 'rogerh@wearcheckrs.com',        supervisor: 'philip@wearcheckrs.com' },     // Roger → Philip Schutte
  { employee: 'louis@wearcheckrs.com',         supervisor: 'annemie@wearcheckrs.com' },    // Louis → Annemie Willer
  { employee: 'jaco@wearcheckrs.com',          supervisor: 'philip@wearcheckrs.com' },     // Jaco Willer → Philip Schutte
  { employee: 'gustav@wearcheckrs.com',        supervisor: 'epieterse@wearcheckrs.com' },  // Gustav → Eddie Snr
  { employee: 'hannest@wearcheckrs.com',       supervisor: 'epieterse@wearcheckrs.com' },  // Hannest → Eddie Snr
  { employee: 'mariette@wearcheckrs.com',      supervisor: 'epieterse@wearcheckrs.com' },  // Mariette → Eddie Snr
];

for (const { employee, supervisor } of supervisorFixes) {
  const empId = byEmail[employee];
  const supId = supervisor ? byEmail[supervisor] : null;
  if (!empId) { console.log(`[SKIP]  ${employee} — not found`); continue; }
  if (supervisor && !supId) { console.log(`[SKIP]  ${employee} — supervisor ${supervisor} not found`); continue; }
  const { error } = await sb.from('profiles').update({ supervisor_id: supId }).eq('id', empId);
  if (error) console.error(`[ERROR] ${employee}: ${error.message}`);
  else console.log(`[OK]    ${employee}  →  ${supervisor ?? 'no supervisor'}`);
}

// --- Exclude Leané from organogram (set inactive until further notice) ---
const leaneId = byEmail['leane@wearcheckrs.com'];
if (leaneId) {
  const { error } = await sb.from('profiles').update({ status: 'inactive' }).eq('id', leaneId);
  if (error) console.error(`[ERROR] leane status: ${error.message}`);
  else console.log(`[OK]    leane@wearcheckrs.com → status: inactive (excluded from organogram)`);
} else {
  console.log(`[SKIP]  leane@wearcheckrs.com — not found`);
}

console.log('\nDone.');
