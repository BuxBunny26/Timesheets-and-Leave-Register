import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types'

const MANAGER_ROLES: Role[] = ['manager', 'admin_manager', 'system_admin']

/**
 * Returns an "allowed employee ids" filter that each report should apply.
 *
 *  - For supervisors: scope = own profile id + every profile whose `supervisor_id` is them.
 *  - For managers/admins: scope = null when "My team only" toggle is OFF (no restriction),
 *    or the supervisor's own team when toggle is ON.
 *
 * `myTeamOnly` defaults to `true` for supervisors and stays locked there.
 */
export function useTeamScope() {
  const { profile } = useAuth()
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [myTeamOnly, setMyTeamOnly] = useState(true)
  const isManager = !!profile?.role && MANAGER_ROLES.includes(profile.role)

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('profiles')
      .select('id')
      .eq('supervisor_id', profile.id)
      .then(({ data }) => {
        const ids = (data ?? []).map(d => d.id as string)
        setTeamIds([profile.id, ...ids])
      })
  }, [profile?.id])

  // When manager+ and toggle is off, no restriction. Otherwise restrict to team.
  const scope: string[] | null = (isManager && !myTeamOnly) ? null : teamIds

  return { scope, isManager, myTeamOnly, setMyTeamOnly, teamIds }
}
