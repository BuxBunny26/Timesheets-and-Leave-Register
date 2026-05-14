import { useAuth } from '../contexts/AuthContext'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
        {value ?? <span className="text-gray-400 italic">Not set</span>}
      </dd>
    </div>
  )
}

export default function ProfilePage() {
  const { profile } = useAuth()

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 text-gray-400">
        Loading profile...
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

      {/* Avatar / name header */}
      <div className="bg-[#1B5EA6] text-white rounded-lg p-6 mb-6 flex items-center gap-4">
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
          {profile.first_name[0]}{profile.surname[0]}
        </div>
        <div>
          <p className="text-lg font-semibold">{profile.first_name} {profile.surname}</p>
          <p className="text-blue-200 capitalize text-sm">{profile.role.replace(/_/g, ' ')}</p>
          {profile.employee_code && (
            <p className="text-blue-300 text-xs mt-0.5">{profile.employee_code}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-6">
        <dl className="divide-y divide-gray-100">
          <Field label="Email" value={profile.email} />
          <Field label="Cell number" value={profile.cell_number} />
          <Field label="Division" value={profile.division?.name} />
          <Field label="Department" value={profile.department?.name} />
          <Field label="Payment centre" value={profile.payment_centre?.name} />
          <Field label="Site" value={profile.site?.name} />
          <Field label="Country" value={profile.country_code} />
          <Field label="Status" value={profile.status} />
          <Field
            label="Member since"
            value={new Date(profile.created_at).toLocaleDateString('en-ZA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
        </dl>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        To update your profile details, contact your system administrator.
      </p>
    </div>
  )
}
