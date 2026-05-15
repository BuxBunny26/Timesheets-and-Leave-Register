import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconEye, IconEyeOff, IconChevronLeft } from '../components/Icons'

type View = 'login' | 'forgot' | 'forgot-sent'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setError(error.message)
    else setView('forgot-sent')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-14 h-14 bg-[#1B5EA6] rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>
        <h2 className="mt-5 text-center text-2xl font-bold tracking-tight text-gray-900">
          WearCheck ARC
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          Timesheet &amp; Leave Management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl">

          {/* LOGIN VIEW */}
          {view === 'login' && (
            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                  placeholder="you@wearcheckrs.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="block w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => { setView('forgot'); setError('') }}
                    className="text-xs text-[#1B5EA6] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1B5EA6] hover:bg-[#154d8c] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD VIEW */}
          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-5">
              <button
                type="button"
                onClick={() => { setView('login'); setError('') }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 -mt-1 mb-1"
              >
                <IconChevronLeft className="w-4 h-4" /> Back to sign in
              </button>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Reset your password</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                  placeholder="you@wearcheckrs.com"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1B5EA6] hover:bg-[#154d8c] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          )}

          {/* FORGOT SENT VIEW */}
          {view === 'forgot-sent' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Check your email</p>
                <p className="text-sm text-gray-500 mt-1">
                  We sent a password reset link to <span className="font-medium">{email}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setView('login'); setError('') }}
                className="text-sm text-[#1B5EA6] hover:underline"
              >
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
