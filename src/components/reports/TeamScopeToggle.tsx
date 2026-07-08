interface Props {
  show: boolean
  myTeamOnly: boolean
  onChange: (v: boolean) => void
}

/**
 * "My team only" toggle styled as a pill button to match adjacent inputs.
 * Only shown when `show` is true (admin-tier roles); supervisors and employees
 * are always team/self scoped so they don't need a toggle.
 */
export default function TeamScopeToggle({ show, myTeamOnly, onChange }: Props) {
  if (!show) return null
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Scope</label>
      <button
        type="button"
        onClick={() => onChange(!myTeamOnly)}
        aria-pressed={myTeamOnly}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5EA6] ${
          myTeamOnly
            ? 'bg-[#1B5EA6] border-[#1B5EA6] text-white hover:bg-[#154d8a]'
            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
        }`}
      >
        <span
          className={`flex items-center justify-center w-4 h-4 rounded border ${
            myTeamOnly ? 'bg-[var(--surface)] border-white text-[#1B5EA6]' : 'border-[var(--border)] text-transparent'
          }`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        My team only
      </button>
    </div>
  )
}
