import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IconXMark } from './Icons'

// ── Quick-select message templates ────────────────────────────────────────────
const BIRTHDAY_TEMPLATES = [
  'Happy Birthday! 🎂 Wishing you an amazing day filled with joy!',
  'Many happy returns of the day! 🎈 Hope this year brings you great health and happiness!',
  'Happy Birthday! 🎉 Your energy and dedication make our team special — enjoy your day!',
  'Wishing you a wonderful birthday! 🥳 May this year be your best one yet!',
  'Happy Birthday! 🎊 Thank you for everything you bring to the team. Enjoy your special day!',
  'Congratulations and warmest birthday wishes! 🌟 Hope the year ahead is full of success!',
]

const ANNIVERSARY_TEMPLATES = [
  'Congratulations on your work anniversary! 🏅 Thank you for your dedication and hard work!',
  'Happy work anniversary! 🌟 Your contributions make a real difference every single day!',
  'Congratulations on another year! 🎊 It\'s a privilege working alongside you!',
  'Happy anniversary! 🏆 Thank you for your continued commitment and excellence!',
]


type Message = {
  id: string
  author_id: string
  message: string
  created_at: string
  author_name: string
}

interface Props {
  employee: { id: string; first_name: string; surname: string }
  occasion: 'birthday' | 'anniversary'
  year: number
  onClose: () => void
}

export default function CelebrationCardModal({ employee, occasion, year, onClose }: Props) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [newMsg, setNewMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myMsg = messages.find(m => m.author_id === profile?.id)
  const isSelf = profile?.id === employee.id

  const title = occasion === 'birthday'
    ? `🎂 Birthday card — ${employee.first_name} ${employee.surname}`
    : `🏅 Anniversary card — ${employee.first_name} ${employee.surname}`

  useEffect(() => {
    void loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('celebration_messages')
      .select('id, author_id, message, created_at')
      .eq('employee_id', employee.id)
      .eq('occasion', occasion)
      .eq('year', year)
      .order('created_at')

    if (data && data.length > 0) {
      const authorIds = [...new Set(data.map((m: { author_id: string }) => m.author_id))]
      const { data: authors } = await supabase
        .from('profiles')
        .select('id, first_name, surname')
        .in('id', authorIds)
      const authorMap = new Map(
        ((authors ?? []) as { id: string; first_name: string; surname: string }[])
          .map(a => [a.id, `${a.first_name} ${a.surname}`])
      )
      setMessages(
        (data as { id: string; author_id: string; message: string; created_at: string }[]).map(m => ({
          ...m,
          author_name: authorMap.get(m.author_id) ?? 'Unknown',
        }))
      )
    } else {
      setMessages([])
    }
    setLoading(false)
  }

  async function submitMessage() {
    if (!profile || !newMsg.trim()) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase
      .from('celebration_messages')
      .upsert(
        {
          employee_id: employee.id,
          author_id: profile.id,
          occasion,
          year,
          message: newMsg.trim(),
        },
        { onConflict: 'employee_id,author_id,occasion,year' }
      )
    if (err) {
      setError(err.message)
    } else {
      setNewMsg('')
      await loadMessages()
    }
    setSubmitting(false)
  }

  async function deleteMessage(id: string) {
    await supabase.from('celebration_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--surface-secondary)] text-[var(--text-muted)]"
            aria-label="Close"
          >
            <IconXMark className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8 italic">
              No wishes yet — be the first! 🎉
            </p>
          ) : (
            messages.map(m => (
              <div
                key={m.id}
                className={`rounded-lg p-3 ${
                  m.author_id === profile?.id
                    ? 'bg-blue-50 border border-blue-100'
                    : 'bg-[var(--surface-secondary)] border border-[var(--border)]'
                }`}
              >
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{m.message}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-[var(--text-muted)]">
                    {m.author_name}
                    {m.author_id === profile?.id && (
                      <span className="ml-1 text-blue-400">(you)</span>
                    )}
                    {' · '}
                    {new Date(m.created_at).toLocaleDateString('en-ZA', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  {m.author_id === profile?.id && (
                    <button
                      onClick={() => deleteMessage(m.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Compose */}
        <div className="p-4 border-t border-[var(--border)]">
          {isSelf ? (
            <p className="text-xs text-center text-[var(--text-muted)] italic">
              This is your card — view the wishes your colleagues left for you above.
            </p>
          ) : myMsg ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-muted)]">You've already sent your wishes ✓</p>
              <button
                onClick={() => deleteMessage(myMsg.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove &amp; rewrite
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Quick-select templates */}
              <div>
                <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">
                  Quick wishes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(occasion === 'birthday' ? BIRTHDAY_TEMPLATES : ANNIVERSARY_TEMPLATES).map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setNewMsg(tpl)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors text-left ${
                        newMsg === tpl
                          ? 'bg-[#1B5EA6] border-[#1B5EA6] text-white'
                          : 'bg-[var(--surface-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[#1B5EA6] hover:text-[#1B5EA6]'
                      }`}
                    >
                      {tpl.length > 48 ? tpl.slice(0, 48) + '…' : tpl}
                    </button>
                  ))}
                  {newMsg && !( occasion === 'birthday' ? BIRTHDAY_TEMPLATES : ANNIVERSARY_TEMPLATES).includes(newMsg) && (
                    <span className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-muted)] italic">
                      Custom message
                    </span>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">or personalise</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              {/* Textarea — pre-filled by template or free-type */}
              <textarea
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                placeholder={
                  occasion === 'birthday'
                    ? `Write a birthday message for ${employee.first_name}…`
                    : `Congratulate ${employee.first_name} on their ${year} anniversary…`
                }
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] resize-none"
              />
              {error && (
                <p className="text-xs text-red-600">{error}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">{newMsg.length}/500</span>
                <button
                  onClick={() => void submitMessage()}
                  disabled={submitting || !newMsg.trim()}
                  className="px-4 py-1.5 bg-[#1B5EA6] hover:bg-[#174f8c] text-white text-sm rounded-md disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Sending…' : 'Send wishes 🎉'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
