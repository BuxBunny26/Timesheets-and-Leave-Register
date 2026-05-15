import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Notification } from '../types'
import { useAuth } from '../contexts/AuthContext'

export function useNotifications() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.is_read).length)
    }
    setLoading(false)
  }, [profile])

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  const markAllAsRead = useCallback(async () => {
    if (!profile) return
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', profile.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    fetchNotifications()

    // Supabase Realtime — subscribe to new notifications for this user
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification
          setNotifications(prev => [newNotif, ...prev])
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, fetchNotifications])

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refetch: fetchNotifications }
}
