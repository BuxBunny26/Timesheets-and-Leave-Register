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

const fixes = [
  { email: 'jj@wearcheckrs.com',   job_title: 'Technical Advisor' },
  { email: 'lesego@wearcheckrs.com', job_title: 'Integration Specialist' },
  { email: 'deon@wearcheckrs.com',   job_title: 'Mpumalanga Co-ordinator' },
];

for (const { email, job_title } of fixes) {
  const { error } = await sb.from('profiles').update({ job_title }).eq('email', email);
  if (error) console.error(`[ERROR] ${email}: ${error.message}`);
  else console.log(`[OK]    ${email}  →  "${job_title}"`);
}

console.log('\nDone.');
