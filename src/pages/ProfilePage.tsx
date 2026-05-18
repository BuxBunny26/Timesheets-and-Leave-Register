import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { IconUser, IconCheck, IconXMark } from '../components/Icons'

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
        {value ?? <span className="text-gray-400 italic">Not set</span>}
      </dd>
    </div>
  )
}

function FormField({
  label,
  id,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] focus:border-transparent"
      />
    </div>
  )
}

export default function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [phone, setPhone] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isAdmin =
    profile?.role === 'admin_manager' || profile?.role === 'system_admin'

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? '')
      setSurname(profile.surname ?? '')
      setPreferredName(profile.preferred_name ?? '')
      setPhone(profile.phone ?? '')
      setEmergencyContactName(profile.emergency_contact_name ?? '')
      setEmergencyContactPhone(profile.emergency_contact_phone ?? '')
      setAvatarPreview(profile.avatar_url ?? null)
    }
  }, [profile])

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        surname: surname.trim(),
        preferred_name: preferredName.trim() || null,
        phone: phone.trim() || null,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
      })
      .eq('id', profile.id)

    setSaving(false)
    if (error) {
      showToast('error', 'Failed to save profile: ' + error.message)
    } else {
      showToast('success', 'Profile saved successfully.')
      await refreshProfile()
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${profile.id}/avatar.${ext}`

    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploadingAvatar(true)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      showToast('error', 'Avatar upload failed: ' + uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id)

    setUploadingAvatar(false)
    if (updateError) {
      showToast('error', 'Failed to save avatar URL: ' + updateError.message)
    } else {
      showToast('success', 'Avatar updated.')
      await refreshProfile()
    }
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 text-gray-400">
        Loading profile...
      </div>
    )
  }

  const initials = `${profile.first_name?.[0] ?? ''}${profile.surname?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {toast.type === 'success' ? (
            <IconCheck className="w-4 h-4 flex-shrink-0" />
          ) : (
            <IconXMark className="w-4 h-4 flex-shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Avatar + name header */}
      <div className="bg-[#1B5EA6] text-white rounded-xl p-6 flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-white/20 flex items-center justify-center">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-white">{initials}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-white text-[#1B5EA6] rounded-full flex items-center justify-center shadow-md hover:bg-blue-50 transition-colors disabled:opacity-50"
            title="Upload photo"
          >
            {uploadingAvatar ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-[#1B5EA6]" />
            ) : (
              <IconUser className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <p className="text-lg font-semibold">
            {profile.first_name} {profile.surname}
          </p>
          {profile.preferred_name && (
            <p className="text-blue-200 text-sm">Goes by: {profile.preferred_name}</p>
          )}
          <p className="text-blue-200 capitalize text-sm">{profile.role.replace(/_/g, ' ')}</p>
          {profile.employee_code && (
            <p className="text-blue-300 text-xs mt-0.5">{profile.employee_code}</p>
          )}
        </div>
      </div>

      {/* Read-only employment info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6">
        <h2 className="text-sm font-semibold text-gray-700 pt-4 pb-1 border-b border-gray-100">
          Employment Details
        </h2>
        <dl className="divide-y divide-gray-100">
          <ReadOnlyField label="Employee code" value={profile.employee_code} />
          <ReadOnlyField label="Division" value={profile.division?.name} />
          <ReadOnlyField label="Department" value={profile.department?.name} />
          <ReadOnlyField label="Site" value={profile.site?.name} />
          <ReadOnlyField label="Payment centre" value={profile.payment_centre?.name} />
          <ReadOnlyField
            label="Supervisor"
            value={
              profile.supervisor
                ? `${profile.supervisor.first_name} ${profile.supervisor.surname}`
                : (user?.user_metadata?.supervisor_name ?? undefined)
            }
          />
        </dl>
      </div>

      {/* Editable fields */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
          Personal Information
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="First name"
              id="first_name"
              value={firstName}
              onChange={setFirstName}
              placeholder="First name"
            />
            <FormField
              label="Surname"
              id="surname"
              value={surname}
              onChange={setSurname}
              placeholder="Surname"
            />
          </div>
          <FormField
            label="Preferred name"
            id="preferred_name"
            value={preferredName}
            onChange={setPreferredName}
            placeholder="What you like to be called (optional)"
          />
          <FormField
            label="Phone number"
            id="phone"
            value={phone}
            onChange={setPhone}
            type="tel"
            placeholder="+27 82 123 4567"
          />
        </div>
      </div>

      {/* Emergency contact */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
          Emergency Contact
        </h2>
        <div className="space-y-4">
          <FormField
            label="Contact name"
            id="emergency_contact_name"
            value={emergencyContactName}
            onChange={setEmergencyContactName}
            placeholder="Full name"
          />
          <FormField
            label="Contact phone"
            id="emergency_contact_phone"
            value={emergencyContactPhone}
            onChange={setEmergencyContactPhone}
            type="tel"
            placeholder="+27 82 123 4567"
          />
        </div>
      </div>

      {/* Admin section */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6">
          <h2 className="text-sm font-semibold text-gray-700 pt-4 pb-1 border-b border-gray-100">
            Admin Info
          </h2>
          <dl className="divide-y divide-gray-100">
            <ReadOnlyField label="Role" value={profile.role} />
            <ReadOnlyField label="Status" value={profile.status} />
            <ReadOnlyField label="Email" value={profile.email} />
            <ReadOnlyField label="Country code" value={profile.country_code} />
            <ReadOnlyField label="Supervisor ID" value={profile.supervisor_id} />
            <ReadOnlyField
              label="Member since"
              value={new Date(profile.created_at).toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
          </dl>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end pb-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#1B5EA6] hover:bg-[#154d8c] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
