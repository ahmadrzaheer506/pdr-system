import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Menu, User, X } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';
import { formatNotificationTime, unreadBadgeLabel } from '../lib/notifications.js';
import { Avatar, Modal, avatarUrl } from './ui.jsx';
import BrandLogo from './BrandLogo.jsx';

function roleLabel(role) {
  if (role === 'ADMIN') return 'Owner / Admin';
  if (role === 'OFFICE') return 'Office';
  return 'Field operative';
}

/**
 * Persistent app header — profile popover and notifications drawer.
 * Used on every authenticated office and staff page.
 */
export default function AppHeader({
  onMenuClick,
  showMenuButton = false,
  showLogo = false,
  profileHref = '/profile',
  onChangePassword,
  className = '',
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(() => {
    api.get('/notifications').then((d) => {
      setItems(Array.isArray(d.notifications) ? d.notifications : []);
      setUnreadCount(Number(d.unread) || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 60000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const onDocClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    document.body.style.overflow = 'hidden';
    loadNotifications();
    return () => { document.body.style.overflow = ''; };
  }, [notificationsOpen, loadNotifications]);

  const openNotification = async (n) => {
    try {
      if (!n.read_at) await api.put(`/notifications/${n.id}/read`);
    } catch { /* still open the linked record */ }
    setNotificationsOpen(false);
    if (n.href) navigate(n.href);
    loadNotifications();
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      loadNotifications();
    } catch { /* keep the list */ }
  };

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
      setProfileOpen(false);
    }
  };

  return (
    <>
      <header className={`sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200/60 bg-white px-4 shadow-sm md:px-6 ${className}`}>
        {showMenuButton && (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95 md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}

        {showLogo ? (
          <BrandLogo className="h-10 w-auto max-w-[75px]" />
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
            aria-label="Notifications"
          >
            <Bell size={22} className="transition-transform group-hover:scale-110" strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[1.25rem] animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 px-1 text-[10px] font-bold text-white shadow-lg shadow-brand-500/30 ring-2 ring-white">
                {unreadBadgeLabel(unreadCount)}
              </span>
            )}
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className={`group inline-flex items-center rounded-full p-0.5 ring-2 ring-offset-1 transition-all duration-200 active:scale-95 ${
                profileOpen
                  ? 'ring-brand-500/60 ring-offset-brand-50'
                  : 'ring-transparent hover:ring-slate-200 hover:ring-offset-slate-50'
              }`}
              aria-label="Account menu"
              aria-expanded={profileOpen}
            >
              <Avatar name={user?.name} color={user?.color} src={avatarUrl(user)} size={8} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-3 w-80 origin-top-right animate-in fade-in slide-in-from-top-2 zoom-in-95 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 duration-200">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-4 ring-1 ring-slate-200/50">
                  <Avatar name={user?.name} color={user?.color} src={avatarUrl(user)} size={12} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-slate-900">{user?.name}</div>
                    {user?.email && <div className="truncate text-xs text-slate-500 mt-0.5">{user.email}</div>}
                    <div className="mt-1.5 inline-flex items-center rounded-md bg-white/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200/50">
                      {roleLabel(user?.role)}
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 space-y-0.5 p-1">
                  {profileHref && (
                    <Link
                      to={profileHref}
                      onClick={() => setProfileOpen(false)}
                      className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <User size={16} />
                      </div>
                      <span>Profile Settings</span>
                    </Link>
                  )}
                  {onChangePassword && (
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); onChangePassword(); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <KeyRound size={16} />
                      </div>
                      <span>Change Password</span>
                    </button>
                  )}
                  <div className="my-1.5 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); setLogoutOpen(true); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-rose-600 transition-all hover:bg-rose-50 hover:text-rose-700 active:scale-[0.98]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                      <LogOut size={16} />
                    </div>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notifications drawer */}
      {notificationsOpen && (
        <div className="fixed inset-0 z-[60] animate-in fade-in duration-200">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-all"
            aria-label="Close notifications"
            onClick={() => setNotificationsOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col animate-in slide-in-from-right duration-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200/60 bg-gradient-to-b from-slate-50/50 to-white px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-95"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 p-4 space-y-2.5">
              {items.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Nothing yet.</p>
              ) : items.map((n) => {
                const unread = !n.read_at;
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`group w-full text-left cursor-pointer rounded-2xl border px-4 py-4 shadow-sm transition-all hover:shadow-md active:scale-[0.98] ${
                      unread
                        ? 'border-brand-200/60 bg-gradient-to-br from-brand-50/80 to-brand-50/40 hover:border-brand-300'
                        : 'border-slate-200/60 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">{n.title}</p>
                          {unread && (
                            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/40" />
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600 mt-1.5">{n.message}</p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-slate-400 mt-0.5">{formatNotificationTime(n.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-slate-200/60 bg-white px-6 py-4 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.04)]">
              <button
                type="button"
                className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-200 active:scale-[0.98]"
                onClick={markAllRead}
              >
                Mark all as read
              </button>
            </div>
          </aside>
        </div>
      )}

      <Modal open={logoutOpen} onClose={() => !loggingOut && setLogoutOpen(false)} title="Sign out">
        <p className="text-sm text-slate-600">Are you sure you want to sign out?</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={loggingOut} onClick={() => setLogoutOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={loggingOut} onClick={doLogout}>
            {loggingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </Modal>
    </>
  );
}
