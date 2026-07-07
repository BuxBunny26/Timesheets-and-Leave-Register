import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IconXMark } from './Icons'

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
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <IconXMark className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8 italic">
              No wishes yet — be the first! 🎉
            </p>
          ) : (
            messages.map(m => (
              <div
                key={m.id}
                className={`rounded-lg p-3 ${
                  m.author_id === profile?.id
                    ? 'bg-blue-50 border border-blue-100'
                    : 'bg-gray-50 border border-gray-100'
                }`}
              >
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.message}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-gray-400">
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
        <div className="p-4 border-t border-gray-100">
          {isSelf ? (
            <p className="text-xs text-center text-gray-400 italic">
              This is your card — view the wishes your colleagues left for you above.
            </p>
          ) : myMsg ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">You've already sent your wishes ✓</p>
              <button
                onClick={() => deleteMessage(myMsg.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove &amp; rewrite
              </button>
            </div>
          ) : (
            <div className="space-y-2">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] resize-none"
              />
              {error && (
                <p className="text-xs text-red-600">{error}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{newMsg.length}/500</span>
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
