import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// No external API — classification is done locally with keyword matching.
// Zero cost. No API keys needed beyond the standard Supabase service role.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─────────────────────────────────────────────────────────────────────────────
// Category definitions
// Order matters — more specific phrases are listed first so they win over
// broader matches. Keywords are checked against filename + extracted PDF text.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES: { key: string; label: string; keywords: string[] }[] = [
  {
    key: 'accident_report',
    label: 'Accident Report',
    keywords: [
      'accident report', 'incident report', 'injury report', 'near miss',
      'hazard report', 'safety incident', 'coida', "workman's comp", 'workmen comp',
    ],
  },
  {
    key: 'affidavit',
    label: 'Affidavit',
    keywords: [
      'affidavit', 'sworn statement', 'statutory declaration',
      'commissioner of oaths', 'deponent', 'solemnly declare',
    ],
  },
  {
    key: 'medical_report',
    label: 'Medical Report',
    keywords: [
      'medical report', 'lab result', 'laboratory result', 'blood test',
      'blood result', 'x-ray', 'xray', 'radiolog', 'specialist report',
      'referral letter', 'mri', 'ct scan', 'pathology report', 'sonar',
    ],
  },
  {
    key: 'doctors_certificate',
    label: "Doctor's Certificate",
    keywords: [
      'medical certificate', 'med cert', 'fit for duty', 'unfit for duty',
      'fitness for work', 'incapacity certificate', 'sick certificate',
      'certificate of illness', 'doctors certificate', "doctor's certificate",
    ],
  },
  {
    key: 'sick_note',
    label: 'Sick Note',
    keywords: [
      'sick note', 'sickness note', 'sick leave note', 'absence note',
      'excused absence', 'medical excuse', 'off sick', 'ill note',
      'doctor note', "doctor's note", 'dr note',
    ],
  },
  {
    key: 'leave_form',
    label: 'Leave Form',
    keywords: [
      'leave form', 'leave application', 'leave request', 'annual leave',
      'family responsibility leave', 'study leave', 'unpaid leave',
      'maternity leave', 'paternity leave', 'compassionate leave',
      'leave approval', 'leave authoris',
    ],
  },
  {
    key: 'overtime_form',
    label: 'Overtime Form',
    keywords: [
      'overtime form', 'overtime authoris', 'overtime authoriz',
      'ot authoris', 'ot authoriz', 'ot approval', 'ot form',
      'overtime approval', 'additional hours authoris',
    ],
  },
  {
    key: 'id_document',
    label: 'ID Document',
    keywords: [
      'identity document', 'national id', 'id copy', 'id card',
      'identification document', "driver's license", 'drivers license',
      'drivers licence', 'passport copy',
    ],
  },
  {
    key: 'payslip',
    label: 'Payslip',
    keywords: [
      'payslip', 'pay slip', 'salary slip', 'wage slip',
      'earnings statement', 'pay stub', 'nett pay', 'net pay',
      'gross pay', 'salary advice', 'remuneration statement',
    ],
  },
  {
    key: 'contract',
    label: 'Contract',
    keywords: [
      'employment contract', 'contract of employment', 'service agreement',
      'appointment letter', 'terms of employment', 'conditions of employment',
      'letter of appointment',
    ],
  },
]

// Shorter words only checked against the filename — too broad for full body text
const FILENAME_KEYWORDS: { key: string; words: string[] }[] = [
  { key: 'sick_note',           words: ['sick', 'ill', 'unwell'] },
  { key: 'doctors_certificate', words: ['doctor', 'dr ', 'dr_', 'clinic', 'hospital'] },
  { key: 'leave_form',          words: ['leave'] },
  { key: 'overtime_form',       words: [' ot ', '_ot_', '-ot-', 'overtime'] },
  { key: 'id_document',         words: ['passport', ' id ', '_id_', '-id-', 'identity'] },
  { key: 'payslip',             words: ['payslip', 'salary', 'wages'] },
  { key: 'accident_report',     words: ['accident', 'incident', 'injury', 'hazard'] },
  { key: 'affidavit',           words: ['affidavit', 'sworn', 'declaration'] },
]

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { attachmentId } = await req.json()
    if (!attachmentId) return jsonResponse({ error: 'attachmentId is required' }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: attachment, error: attErr } = await supabase
      .from('attachments')
      .select('id, storage_path, mime_type, display_name')
      .eq('id', attachmentId)
      .single()

    if (attErr || !attachment) return jsonResponse({ error: 'Attachment not found' }, 404)

    const mime: string = attachment.mime_type ?? ''
    const fileName: string = attachment.display_name ?? ''

    // Build the text we will search: always the filename; for PDFs also the body
    let fullText = fileName
    if (mime === 'application/pdf') {
      const { data: blob } = await supabase.storage
        .from('attachments')
        .download(attachment.storage_path)
      if (blob) {
        const pdfText = extractPdfText(await blob.arrayBuffer())
        if (pdfText.length > 0) fullText += ' ' + pdfText
      }
    }

    const category    = classify(fullText.toLowerCase(), fileName.toLowerCase())
    const dateStr     = extractDate(fullText)
    const displayName = dateStr ? `${category.label} - ${dateStr}` : category.label

    await supabase
      .from('attachments')
      .update({
        category: category.key,
        ai_display_name: displayName,
        ai_classified_at: new Date().toISOString(),
      })
      .eq('id', attachmentId)

    return jsonResponse({ ok: true, category: category.key, display_name: displayName })
  } catch (err) {
    console.error('classify-document error:', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Two-pass keyword classifier
// ─────────────────────────────────────────────────────────────────────────────
function classify(fullTextLower: string, fileNameLower: string): { key: string; label: string } {
  // Pass 1: multi-word phrases against full text (more accurate, less false positives)
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (fullTextLower.includes(kw.toLowerCase())) {
        return { key: cat.key, label: cat.label }
      }
    }
  }
  // Pass 2: short single words against filename only
  for (const entry of FILENAME_KEYWORDS) {
    const catDef = CATEGORIES.find(c => c.key === entry.key)!
    for (const word of entry.words) {
      if (fileNameLower.includes(word.toLowerCase())) {
        return { key: catDef.key, label: catDef.label }
      }
    }
  }
  return { key: 'other', label: 'Misc Document' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date extraction — tries several common formats
// ─────────────────────────────────────────────────────────────────────────────
function extractDate(text: string): string | null {
  // ISO: 2026-05-19 or 20260519
  const iso = text.match(/\b(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])\b/)
  if (iso) {
    const [, y, m, d] = iso
    return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m) - 1]} ${y}`
  }
  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/_.](0[1-9]|1[0-2])[-/_.](20\d{2})\b/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m) - 1]} ${y}`
  }
  // "19 May 2026" or "May 2026"
  const allMonths = [...MONTHS_LONG, ...MONTHS_SHORT].join('|')
  const monthMatch = text.match(
    new RegExp(`\\b(\\d{1,2}[\\s_-]+)?(${allMonths})[\\s_,.-]+(20\\d{2})\\b`, 'i'),
  )
  if (monthMatch) {
    const day = monthMatch[1]?.replace(/[_\-\s]/g, '').trim()
    return day
      ? `${parseInt(day)} ${monthMatch[2]} ${monthMatch[3]}`
      : `${monthMatch[2]} ${monthMatch[3]}`
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic PDF text extraction (digitally generated PDFs only — not scanned)
// ─────────────────────────────────────────────────────────────────────────────
function extractPdfText(bytes: ArrayBuffer): string {
  const content = new TextDecoder('latin1').decode(bytes)
  const parts: string[] = []

  const tjRe = /\(([^)(]{1,300}(?:\\.[^)(]*)*)\)\s*Tj/g
  let m: RegExpExecArray | null
  while ((m = tjRe.exec(content)) !== null) {
    const t = decodePdfStr(m[1])
    if (/[a-zA-Z]{2,}/.test(t)) parts.push(t)
  }

  const tjArrRe = /\[([^\]]*)\]\s*TJ/g
  while ((m = tjArrRe.exec(content)) !== null) {
    const strRe = /\(([^)(]{1,300}(?:\\.[^)(]*)*)\)/g
    let sm: RegExpExecArray | null
    while ((sm = strRe.exec(m[1])) !== null) {
      const t = decodePdfStr(sm[1])
      if (/[a-zA-Z]{2,}/.test(t)) parts.push(t)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function decodePdfStr(s: string): string {
  return s
    .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\').replace(/\\\(/g, '(').replace(/\\\)/g, ')')
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: To upgrade to AI-powered classification in future, replace the
// classify() function body with a call to OpenAI GPT-4o-mini. The rest of
// the function (download, update DB, date extraction) stays the same.
// ─────────────────────────────────────────────────────────────────────────────

