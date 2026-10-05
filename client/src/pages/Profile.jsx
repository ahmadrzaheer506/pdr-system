import React, { useEffect, useRef, useState } from 'react';
import { Camera, Lock, Mail, Shield, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { ROLES } from '../lib/roles';
import { Avatar, PageLoading, useToast, Toast, avatarUrl } from '../components/ui.jsx';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import NotificationPrefsForm from '../components/NotificationPrefsForm.jsx';

function roleLabel(role) {
  if (role === ROLES.ADMIN) return 'Owner / Admin';
  if (role === ROLES.OFFICE) return 'Office';
  return 'Field operative';
}

/**
 * Signed-in profile: name, photo, locked email, and password change.
 * Staff also manage notification preferences here (office has Settings).
 */
export default function Profile() {
  const { user, refresh } = useAuth();
  const { toast, show } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setName(user?.name || '');
  }, [user?.name]);

  if (!user) return <PageLoading />;

  const dirty = name.trim() !== (user.name || '').trim();

  const saveName = async (e) => {
    e.preventDefault();
    const next = name.trim();
    if (!next) {
      show('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/profile', { name: next });
      await refresh();
      show('Profile updated');
    } catch (err) {
      show(err.message || 'Could not update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setPhotoBusy(true);
    try {
      await api.upload('/auth/avatar', fd);
      await refresh();
      show('Photo updated');
    } catch (err) {
      show(err.message || 'Could not update photo', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await api.del('/auth/avatar');
      await refresh();
      show('Photo removed');
    } catch (err) {
      show(err.message || 'Could not remove photo', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Your name, photo, sign-in email, and password.</p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="relative w-fit">
            <Avatar name={name || user.name} color={user.color} src={avatarUrl(user)} size={20} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-navy-900 text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              aria-label="Change profile photo"
              title="Change photo"
            >
              <Camera size={14} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              aria-label="Upload profile photo"
              onChange={uploadPhoto}
            />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900 truncate">{user.name}</div>
            <div className="text-sm text-slate-500 truncate">{user.email}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <Shield size={12} />
              {roleLabel(user.role)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {photoBusy ? 'Updating…' : user.avatar_file ? 'Change photo' : 'Upload photo'}
              </button>
              {user.avatar_file && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                  disabled={photoBusy}
                  onClick={removePhoto}
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">PNG or JPEG, up to 2MB.</p>
          </div>
        </div>
      </section>

      <form
        onSubmit={saveName}
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-5"
      >
        <div>
          <h2 className="font-semibold text-slate-900">Personal details</h2>
          <p className="text-xs text-slate-400 mt-0.5">Shown across jobs, quotes, and the team.</p>
        </div>
        <div>
          <label className="label" htmlFor="profile-name">Full name</label>
          <input
            id="profile-name"
            className="input max-w-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            maxLength={120}
          />
        </div>
        <div>
          <label className="label" htmlFor="profile-email">Email</label>
          <div className="relative max-w-lg">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="profile-email"
              className="input pl-9 bg-slate-50 text-slate-500 cursor-not-allowed"
              value={user.email || ''}
              disabled
              readOnly
              autoComplete="email"
            />
            <Lock size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Email can only be changed by an owner in Settings.</p>
        </div>
        <button className="btn-primary" disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <ChangePasswordForm bare />
      </section>

      {user.role === ROLES.STAFF && <NotificationPrefsForm />}

      <Toast {...toast} />
    </div>
  );
}
