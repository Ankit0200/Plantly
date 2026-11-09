import { useState, useEffect, useRef, useCallback } from 'react'
import type { NotificationItem } from '../types'
import { getNotifications, markNotificationRead, markAllNotificationsRead, postEvent } from '../api'

interface Props {
  onOpenPestReport: () => void
}

export default function NotificationBell({ onOpenPestReport }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    getNotifications()
      .then(res => {
        setNotifications(res.notifications)
        setUnread(res.unread_count)
      })
      .catch(() => {})
  }, [])

  // Poll every 60 seconds
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 60000)
    return () => clearInterval(interval)
  }, [refresh])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleRead = async (id: number) => {
    await markNotificationRead(id).catch(() => {})
    postEvent('alert_opened', { notification_id: id }).catch(() => {})
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  const handleReadAll = async () => {
    await markAllNotificationsRead().catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="notif-wrapper" ref={dropdownRef}>
      <button
        className="notif-bell"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <strong>Notifications</strong>
            <div className="notif-header-actions">
              <button className="notif-action-btn" onClick={onOpenPestReport}>Report pest</button>
              {unread > 0 && (
                <button className="notif-action-btn" onClick={handleReadAll}>Mark all read</button>
              )}
            </div>
          </div>
          {notifications.length === 0 ? (
            <div className="notif-empty">No notifications yet</div>
          ) : (
            <div className="notif-list">
              {notifications.map(n => (
                <button
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'notif-unread'}`}
                  onClick={() => !n.read && handleRead(n.id)}
                >
                  <div className="notif-item-icon">{n.read ? '🔔' : '🔴'}</div>
                  <div className="notif-item-content">
                    <div className="notif-item-title">{n.title}</div>
                    <div className="notif-item-body">{n.body}</div>
                    <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
