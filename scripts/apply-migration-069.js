import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(p) { try { for (const l of readFileSync(p,'utf8').split('\n')) { const t=l.trim(); if(!t||t.startsWith('#')) continue; const e=t.indexOf('='); if(e===-1) continue; const k=t.slice(0,e).trim(),v=t.slice(e+1).trim(); if(!process.env[k]) process.env[k]=v; } } catch {} }
loadEnv(resolve(__dirname,'../.env.local')); loadEnv(resolve(__dirname,'../.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} });

// 1. Upsert departments
const depts = [
  { code: 'ORG-RS',    name: 'Reliability Services',           division_code: null },
  { code: 'ORG-NDT',   name: 'Non Destructive Testing (NDT)',   division_code: null },
  { code: 'ORG-ADMIN', name: 'Administration',                  division_code: null },
  { code: 'ORG-SALES', name: 'Sales',                           division_code: null },
  { code: 'ORG-DIGIT', name: 'Digital',                         division_code: null },
  { code: 'ORG-RC',    name: 'Remote Centre',                   division_code: null },
  { code: 'ORG-RCA',   name: 'Rope Condition Assessment (RCA)', division_code: null },
  { code: 'ORG-TC',    name: 'Technical Compliance (TC)',        division_code: null },
];
for (const d of depts) {
  const { error } = await sb.from('departments').upsert(d, { onConflict: 'code' });
  if (error) console.error(`[ERROR] dept ${d.code}: ${error.message}`);
  else console.log(`[OK]   dept ${d.code} — ${d.name}`);
}

// 2. Add decision_level column — use Supabase's postgres REST endpoint via a
//    direct SQL query through the management API isn't available here.
//    Instead, attempt via a raw query using the pg schema trick.
console.log('\nNOTE: Run the following SQL manually in the Supabase SQL editor:');
console.log('  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS decision_level TEXT;');
console.log('\nDone.\n');
