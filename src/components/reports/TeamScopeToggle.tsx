interface Props {
  isManager: boolean
  myTeamOnly: boolean
  onChange: (v: boolean) => void
}

/**
 * "My team only" toggle. Hidden for non-managers (supervisors always team-scoped).
 */
export default function TeamScopeToggle({ isManager, myTeamOnly, onChange }: Props) {
  if (!isManager) return null
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={myTeamOnly}
          onChange={e => onChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        My team only
      </label>
    </div>
  )
}
