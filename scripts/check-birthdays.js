import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(p) { try { for (const l of readFileSync(p,'utf8').split('\n')) { const t=l.trim(); if(!t||t.startsWith('#')) continue; const e=t.indexOf('='); if(e===-1) continue; const k=t.slice(0,e).trim(),v=t.slice(e+1).trim(); if(!process.env[k]) process.env[k]=v; } } catch {} }
loadEnv(resolve(__dirname,'../.env.local')); loadEnv(resolve(__dirname,'../.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} });

// 1. Show actual view columns
const { data: sample, error: e1 } = await sb.from('birthdays_this_year').select('*').limit(1);
if (e1) { console.error('View error:', e1.message); }
else { console.log('View columns:', sample && sample[0] ? Object.keys(sample[0]) : []); }

// 2. Show all birthdays ordered by birthday_this_year
const { data, error } = await sb.from('birthdays_this_year').select('*').order('birthday_this_year');
if (error) { console.error('Query error:', error.message); process.exit(1); }

for (const r of data) {
  console.log(r.birthday_this_year, '|', r.first_name, r.surname);
}
console.log('\nTotal with birthdays:', data.length);
