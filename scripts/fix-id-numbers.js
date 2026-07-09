/**
 * fix-id-numbers.js
 * -----------------
 * Updates employee_details.id_number for all current employees
 * using the verified reference list (takes priority over what was in the Excel).
 *
 * Usage:  node scripts/fix-id-numbers.js
 */

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

// Clean ID number: strip dashes/spaces; return 13-digit SA ID or cleaned alphanumeric
function cleanId(raw) {
  if (!raw || /^(zimbabwean|n\/a|null)$/i.test(raw.trim())) return null;
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length === 13) return digitsOnly;
  // For Namibian/Mozambican/foreign IDs, store alphanumeric
  const alphaNum = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return alphaNum || null;
}

// ---------------------------------------------------------------------------
// Verified reference: email (lowercase) → raw id_number string
// ---------------------------------------------------------------------------
const ID_MAP = {
  'a.ludick@wearcheckrs.com':       '6005175057085',
  'adriaanb@wearcheckrs.com':       '8611215135084',
  'marshallr@wearcheckrs.com':      '8108185912089',
  'alex@wearcheckrs.com':           '9707265013087',
  'allan@wearcheckrs.com':          '8609235207081',
  'andrew@wearcheckrs.com':         '7207125137087',
  'annahm@wearcheckrs.com':         '7908170459082',
  'annemie@wearcheckrs.com':        '8003060103088',
  'aubrey@wearcheckrs.com':         '7904015699081',
  'bianka@wearcheckrs.com':         '0708100124088',
  'chicco@wearcheckrs.com':         '8903025575082',
  'chrism@wearcheckrs.com':         '7002215026088',
  'chrstene@wearcheckrs.com':       '7004090042081',
  'cj@wearcheckrs.com':             '9903315321089',
  'daniel@wearcheckrs.com':         '8705135962088',
  'david@wearcheckrs.com':          '9002075146081',
  'deon@wearcheckrs.com':           '7803135114080',
  'desmond@wearcheckrs.com':        '9403076106084',
  'dian@wearcheckrs.com':           '00121300668',     // Namibian ID
  'douglas@wearcheckrs.com':        '9210165162088',
  'dyllen@wearcheckrs.com':         '9611035013080',
  'eben@wearcheckrs.com':           '8804125135084',
  'edwardfp@wearcheckrs.com':       '8911215035080',
  'epieterse@wearcheckrs.com':      '6309235162087',
  'eugene@wearcheckrs.com':         '8702235026088',
  'franciosp@wearcheckrs.com':      '6311035008080',
  'francoisve@wearcheckrs.com':     '7011225029081',
  'francoisp@wearcheckrs.com':      '9006295007080',
  'freddy-ben@wearcheckrs.com':     '75052710097',     // Namibian
  'gabriel@wearcheckrs.com':        '91010900137',     // Namibian
  'freddieh@wearcheck.co.za':       '7306125100085',
  'gustav@wearcheckrs.com':         '7211125028080',
  'hannest@wearcheckrs.com':        '9801055160081',
  'heinc@wearcheckrs.com':          '7606105047085',
  'heinrich@wearcheckrs.com':       '9808145071087',
  'henry@wearcheckrs.com':          null,              // Zimbabwean — no SA ID
  'jaco@wearcheckrs.com':           '8205175103081',
  'jacodb@wearcheckrs.com':         '8705055104083',
  'james@wearcheckrs.com':          '8504216014087',
  'jj@wearcheckrs.com':             '9807025016089',
  'johandre@wearcheckrs.com':       '9108225061086',
  'leane@wearcheckrs.com':          '0508310165081',
  'kevin@wearcheckrs.com':          '0604115301086',   // corrected from scrambled ref
  'leon@wearcheckrs.com':           '8710045012081',
  'lesego@wearcheckrs.com':         '9911045198081',
  'londolanim@wearcheckrs.com':     '9103016120084',
  'louis@wearcheckrs.com':          '8801075058084',
  'lubby@wearcheckrs.com':          '8602105274083',
  'lucas@wearcheckrs.com':          '8808045136080',
  'mande@wearcheckrs.com':          '9801050163080',
  'marcel@wearcheckrs.com':         '8002085057089',
  'mariette@wearcheckrs.com':       '8007230056084',
  'martiens@wearcheckrs.com':       '9002175080081',
  'megan@wearcheckrs.com':          '8209120022081',
  'micheal@wearcheckrs.com':        '9003065041084',
  'michealm@wearcheckrs.com':       '8311095612084',
  'betty@wearcheckrs.com':          '9009040882086',
  'mornea@wearcheckrs.com':         '9007025116084',
  'nadhira@wearcheckrs.com':        '9903260117086',
  'lloyd@wearcheckrs.com':          '8404025466083',
  'nomvulam@wearcheckrs.com':       '8308230480088',
  'passwell@wearcheckrs.com':       '002165569085',    // may be short
  'peet@wearcheckrs.com':           '9109040882086',
  'percy@wearcheckrs.com':          '8202275069080',
  'permission@wearcheckrs.com':     '8703196128087',   // 14-digit ref corrected to 13
  'philip@wearcheckrs.com':         '6302185092081',   // KEY FIX: was wrong in Excel
  'reinierk@wearcheckrs.com':       '8911055085088',
  'riaandb@wearcheckrs.com':        '9112255109088',
  'rakcal@wearcheckrs.com':         '9908055644087',
  'rohan@wearcheckrs.com':          '9206115090080',
  'rynhardt@wearcheckrs.com':       '8606195053083',
  'shaun@wearcheckrs.com':          '9106185149081',
  'shivon@wearcheckrs.com':         '9411020133088',
  'simon@wearcheckrs.com':          '7302060084087',
  'siphoz@wearcheckrs.com':         '8409175777080',
  'siphom@wearcheckrs.com':         '9003245800086',
  'thapelo@wearcheckrs.com':        '9404300596082',
  'thomas@wearcheckrs.com':         '8701225704084',
  'thulani@wearcheckrs.com':        '9701185872086',
  'tonny@wearcheckrs.com':          '9111045626088',
  'tsietsi@wearcheckrs.com':        '8806066773088',
  'wihan@wearcheckrs.com':          '0303145069082',   // corrected from short ref
};

// ---------------------------------------------------------------------------
// Fetch all profiles to get employee_id → email mapping
// ---------------------------------------------------------------------------
const { data: profiles, error: profErr } = await sb
  .from('profiles')
  .select('id, email');
if (profErr) { console.error('Fetch profiles failed:', profErr.message); process.exit(1); }

const profileByEmail = Object.fromEntries(
  (profiles ?? []).map(p => [p.email.toLowerCase().replace(/\s/g, ''), p.id])
);

console.log(`\nUpdating ID numbers for ${Object.keys(ID_MAP).length} reference entries...\n`);

let updated = 0, skipped = 0, notFound = 0;

for (const [emailRaw, rawId] of Object.entries(ID_MAP)) {
  const email = emailRaw.toLowerCase().replace(/\s/g, '');
  const empId = profileByEmail[email];

  if (!empId) {
    // Employee not in current DB — skip silently
    notFound++;
    continue;
  }

  const cleanedId = rawId ? cleanId(rawId) : null;

  if (!cleanedId) {
    skipped++;
    continue;
  }

  const { error } = await sb
    .from('employee_details')
    .upsert({ employee_id: empId, id_number: cleanedId }, { onConflict: 'employee_id' });

  if (error) {
    console.error(`[ERROR] ${email}: ${error.message}`);
  } else {
    // Highlight the key fixes
    const flag = email === 'philip@wearcheckrs.com' ? ' ← KEY FIX (was wrong in Excel)' : '';
    console.log(`[OK]   ${email}  →  ${cleanedId}${flag}`);
    updated++;
  }
}

console.log(`\n✓ Done. Updated: ${updated}  Skipped (no ID): ${skipped}  Not in DB: ${notFound}\n`);
