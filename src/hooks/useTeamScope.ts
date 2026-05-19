import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types'

const ADMIN_ROLES: Role[] = ['manager', 'admin_manager', 'system_admin']

/**
 * Resolves which employee_ids the current viewer is allowed to see in reports.
 *
 *  - employee:        scope = [self]                         (no toggle)
 *  - supervisor:      scope = self + direct reports          (no toggle)
 *  - manager+:        scope = self + supervisors + their reports (recursive 1 level)
 *                     Toggle ("My team only") defaults OFF -> scope = null (unrestricted).
 *                     Toggle ON                              -> scope = recursive team.
 *  - admin_manager / system_admin behave the same as manager re: scoping.
 *
 * `null` scope means "no restriction" (admins viewing the whole org).
 */
export function useTeamScope() {
  const { profile } = useAuth()
  const [teamIds, setTeamIds] = useState<string[]>([])
  const isAdmin = !!profile?.role && ADMIN_ROLES.includes(profile.role)
  const isSupervisor = profile?.role === 'supervisor'
  // Admins default to seeing everything; supervisors are locked to their team.
  const [myTeamOnly, setMyTeamOnly] = useState(!isAdmin)

  useEffect(() => {
    if (!profile?.id) return
    if (isAdmin) {
      // Recursive: profile -> direct reports -> their reports
      supabase
        .from('profiles')
        .select('id')
        .eq('supervisor_id', profile.id)
        .then(async ({ data: level1 }) => {
          const level1Ids = (level1 ?? []).map(r => r.id as string)
          if (level1Ids.length === 0) {
            setTeamIds([profile.id])
            return
          }
          const { data: level2 } = await supabase
            .from('profiles')
            .select('id')
            .in('supervisor_id', level1Ids)
          const level2Ids = (level2 ?? []).map(r => r.id as string)
          setTeamIds([profile.id, ...level1Ids, ...level2Ids])
        })
      return
    }
    if (isSupervisor) {
      supabase
        .from('profiles')
        .select('id')
        .eq('supervisor_id', profile.id)
        .then(({ data }) => {
          const ids = (data ?? []).map(r => r.id as string)
          setTeamIds([profile.id, ...ids])
        })
      return
    }
    // Regular employee: only themselves
    setTeamIds([profile.id])
  }, [profile?.id, isAdmin, isSupervisor])

  // Effective filter applied to queries:
  //   admin + toggle OFF -> null (no restriction)
  //   admin + toggle ON  -> teamIds
  //   supervisor         -> teamIds (always)
  //   employee           -> [self]   (always)
  const scope: string[] | null = (isAdmin && !myTeamOnly) ? null : teamIds

  return { scope, isAdmin, isSupervisor, myTeamOnly, setMyTeamOnly, teamIds }
}
