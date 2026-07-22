import { useState } from 'react'
import { IconXMark, IconClipboard, IconCheck } from './Icons'
import { formatDateDisplay } from '../lib/dateUtils'

interface OutOfOfficeModalProps {
  startDate: string
  endDate: string
  supervisorName: string
  supervisorEmail: string | null
  onClose: () => void
}

export default function OutOfOfficeModal({
  startDate,
  endDate,
  supervisorName,
  supervisorEmail,
  onClose,
}: OutOfOfficeModalProps) {
  const [copied, setCopied] = useState(false)

  const contact = supervisorEmail
    ? `${supervisorName} (${supervisorEmail})`
    : supervisorName

  const isSingleDay = startDate === endDate
  const absenceClause = isSingleDay
    ? `out of the office for the ${formatDateDisplay(startDate)}`
    : `out of the office from ${formatDateDisplay(startDate)} until ${formatDateDisplay(endDate)}`

  const template = [
    'Good day,',
    '',
    `Thank you for your email. I am currently ${absenceClause}. Should you have any urgent queries please feel free to reach out to ${contact}.`,
    '',
    'Kind regards',
  ].join('\n')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(template)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard API unavailable — silently ignore
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[var(--surface)] rounded-xl shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Don't forget your Out of Office!
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              Your leave has been approved — set up an auto-reply in Outlook before you go.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 ml-3 shrink-0 transition-colors"
            aria-label="Close"
          >
            <IconXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wide font-medium">
            Template — copy &amp; paste into Outlook
          </p>
          <div className="bg-[var(--surface-secondary)] rounded-lg p-4 border border-[var(--border)]">
            <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
              {template}
            </pre>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">
            In Outlook: <span className="font-medium">File → Automatic Replies → Send automatic replies</span>
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-[#1B5EA6] hover:bg-[#154d8c] text-white'
            }`}
          >
            {copied ? (
              <IconCheck className="w-4 h-4" />
            ) : (
              <IconClipboard className="w-4 h-4" />
            )}
            {copied ? 'Copied!' : 'Copy template'}
          </button>
        </div>
      </div>
    </div>
  )
}
