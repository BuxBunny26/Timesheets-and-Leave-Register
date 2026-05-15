import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { IconEye, IconEyeOff } from '../components/Icons'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl text-center space-y-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="font-medium text-gray-900">Password updated</p>
            <p className="text-sm text-gray-500">Your password has been changed successfully.</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 bg-[#1B5EA6] hover:bg-[#154d8c] text-white text-sm font-medium rounded-lg transition-colors"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 bg-[#1B5EA6] rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        </div>
        <h2 className="mt-5 text-center text-2xl font-bold tracking-tight text-gray-900">Set new password</h2>
        <p className="mt-1 text-center text-sm text-gray-500">Must be at least 8 characters</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2.5 px-4 bg-[#1B5EA6] hover:bg-[#154d8c] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
