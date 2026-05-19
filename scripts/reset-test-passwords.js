/**
 * One-off: reset known passwords for two test accounts.
 * Run: node scripts/reset-test-passwords.js
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (same as import script).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  for (const line of readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
} catch { /* ignore */ }

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1) }

const admin = createClient(URL, KEY)

const TARGETS = [
  { email: 'bianka@wearcheckrs.com', password: 'Test1234!' },
  { email: 'shivon@wearcheckrs.com', password: 'Test1234!' },
]

async function findUserByEmail(email) {
  // listUsers is paginated; cap at a few pages
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => (x.email ?? '').toLowerCase() === email.toLowerCase())
    if (u) return u
    if (data.users.length < 200) return null
  }
  return null
}

for (const t of TARGETS) {
  try {
    const u = await findUserByEmail(t.email)
    if (!u) { console.log(`SKIP ${t.email}: no auth user`); continue }
    const { error } = await admin.auth.admin.updateUserById(u.id, {
      password: t.password,
      email_confirm: true,
    })
    if (error) throw error
    console.log(`OK   ${t.email} -> ${t.password}`)
  } catch (e) {
    console.error(`FAIL ${t.email}:`, e.message)
  }
}
