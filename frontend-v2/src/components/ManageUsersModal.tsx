import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGetUsers, useUpdateUserRole, useDeleteUser } from '@/api/users';
import type { User } from '@werkstack/shared';
import styles from './ManageUsersModal.module.css';

// ─── Edit User Sub-Modal ─────────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const currentUser = useAuthStore(s => s.user);
  const updateRole  = useUpdateUserRole();
  const deleteUser  = useDeleteUser();

  const [role, setRole]     = useState(user.role);
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);

  const isSelf  = currentUser?.id === user.id;
  const isOwner = user.role === 'owner';

  async function handleSave() {
    if (role === user.role) { onClose(); return; }
    setBusy(true);
    setError('');
    try {
      await updateRole.mutateAsync({ id: user.id, role });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${user.username}? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteUser.mutateAsync(user.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.subModal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>
          edit user — {user.username}
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </h3>

        <div className={styles.field}>
          <span className={styles.label}>role</span>
          <select className={styles.select} value={role}
            onChange={e => setRole(e.target.value as any)}
            disabled={isSelf || isOwner}>
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
            {isOwner && <option value="owner">owner</option>}
          </select>
        </div>

        <div className={styles.footer}>
          {error && <span className={styles.errorText}>{error}</span>}
          {!isSelf && !isOwner && (
            <button className={styles.deleteBtn} onClick={handleDelete} disabled={busy}>
              remove user
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className={styles.btnGhost} onClick={onClose}>cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={busy || isSelf || isOwner}>
            {busy ? 'saving...' : 'save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export function ManageUsersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: users = [], isLoading } = useGetUsers();
  const [editUser, setEditUser] = useState<User | null>(null);

  useEffect(() => { if (open) setEditUser(null); }, [open]);

  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <h2 className={styles.title}>
            manage users
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </h2>

          {isLoading ? (
            <div className={styles.empty}>loading...</div>
          ) : users.length === 0 ? (
            <div className={styles.empty}>no users found</div>
          ) : (
            <div className={styles.userList}>
              {users.map(u => (
                <div key={u.id} className={styles.userRow}>
                  <div className={styles.avatar} style={{ backgroundColor: u.accentColor ?? '#c47c5a' }}>
                    {(u.username?.[0] ?? u.email[0]).toUpperCase()}
                  </div>
                  <div className={styles.userInfo}>
                    <div className={styles.userName}>{u.username}</div>
                    <div className={styles.userEmail}>{u.email}</div>
                  </div>
                  <span className={styles.roleBadge}>{u.role}</span>
                  <button className={styles.editBtn} onClick={() => setEditUser(u)}>edit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
      )}
    </>
  );
}
