import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconEye, IconEyeOff } from '../components/Icons'

/**
 * Forced first-time password creation screen.
 *
 * Shown instead of the normal app whenever the signed-in user's
 * profile.must_change_password is TRUE (i.e. they're still on the shared
 * default password from onboarding). On success, updates the auth password
 * and clears the flag, then lets them into the app.
 */
export default function CreatePasswordPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) { setError(pwError.message); return }

      if (profile?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', profile.id)
        if (profileError) { setError(profileError.message); return }
      }

      await refreshProfile()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 bg-[#1B5EA6] rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        </div>
        <h2 className="mt-5 text-center text-2xl font-bold tracking-tight text-[var(--text-primary)]">Welcome to WearCheck ARC</h2>
        <p className="mt-1 text-center text-sm text-[var(--text-muted)]">
          For security, please create your own password to continue.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[var(--surface)] py-8 px-6 shadow-sm border border-[var(--border)] rounded-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">New password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full px-3 py-2.5 pr-10 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-muted)] hover:text-gray-600" tabIndex={-1}>
                  {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Must be at least 8 characters</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="block w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2.5 px-4 bg-[#1B5EA6] hover:bg-[#154d8c] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Saving...' : 'Create password & continue'}
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="w-full text-center text-xs text-[var(--text-muted)] hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
