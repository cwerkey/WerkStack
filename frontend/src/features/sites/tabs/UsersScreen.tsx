import { useState, useEffect, useCallback } from 'react';
import { useOutletContext }                   from 'react-router-dom';
import { Modal }        from '../../../components/ui/Modal';
import { EmptyState }   from '../../../components/ui/EmptyState';
import { Icon }         from '../../../components/ui/Icon';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCan }       from '../../../utils/can';
import { api }          from '../../../utils/api';
import type { SiteCtx } from '../../SiteShell';
import type { User, UserRole } from '@werkstack/shared';

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<UserRole, string> = {
  owner:  'var(--gold, #b89870)',
  admin:  'var(--accent, #c47c5a)',
  member: 'var(--text2, #8a9299)',
  viewer: 'var(--text3, #4e5560)',
};

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span style={{
      fontFamily:   "'JetBrains Mono', monospace",
      fontSize:     10,
      color:        ROLE_COLORS[role],
      background:   ROLE_COLORS[role] + '18',
      border:       `1px solid ${ROLE_COLORS[role]}44`,
      borderRadius: 3,
      padding:      '2px 7px',
    }}>
      {role}
    </span>
  );
}

// ── InviteModal ───────────────────────────────────────────────────────────────

interface InviteModalProps {
  open:    boolean;
  onClose: () => void;
  accent:  string;
  onSaved: (u: User) => void;
}

type InviteDraft = {
  email:    string;
  username: string;
  password: string;
  role:     'viewer' | 'member' | 'admin';
};

const blankInvite: InviteDraft = { email: '', username: '', password: '', role: 'member' };

function InviteModal({ open, onClose, accent, onSaved }: InviteModalProps) {
  const [f,    setF]    = useState<InviteDraft>(blankInvite);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const av = { '--accent': accent } as React.CSSProperties;

  useEffect(() => {
    if (!open) return;
    setF({ ...blankInvite });
    setErr('');
    setBusy(false);
  }, [open]);

  const set = <K extends keyof InviteDraft>(k: K, v: InviteDraft[K]) =>
    setF(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.email.trim())    { setErr('email is required'); return; }
    if (!f.username.trim()) { setErr('username is required'); return; }
    if (f.password.length < 8) { setErr('password must be at least 8 characters'); return; }
    setBusy(true);
    setErr('');
    try {
      const result = await api.post<User>('/api/org/users', {
        email:    f.email.trim(),
        username: f.username.trim(),
        password: f.password,
        role:     f.role,
      });
      onSaved(result!);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to invite user');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    background:   'var(--inputBg, #1a1d20)',
    border:       '1px solid var(--border2, #262c30)',
    borderRadius: 4,
    color:        'var(--text, #d4d9dd)',
    fontFamily:   "'JetBrains Mono', monospace",
    fontSize:     12,
    padding:      '5px 10px',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="invite team member"
      minWidth={440}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize:   10,
              color:      'var(--red, #c07070)',
              flex:       1,
            }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose}
            style={{ marginLeft: err ? 0 : 'auto', fontSize: 11, padding: '5px 14px' }}>
            cancel
          </button>
          <button
            className="act-primary"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={busy}
            style={{ ...av, fontSize: 11, padding: '5px 14px' }}
          >
            {busy ? 'inviting…' : 'invite'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">email</span>
          <input
            style={inputStyle}
            type="email"
            value={f.email}
            onChange={e => set('email', e.target.value)}
            placeholder="user@example.com"
            autoFocus
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">username</span>
          <input
            style={inputStyle}
            value={f.username}
            onChange={e => set('username', e.target.value)}
            placeholder="johndoe"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">initial password</span>
          <input
            style={inputStyle}
            type="password"
            value={f.password}
            onChange={e => set('password', e.target.value)}
            placeholder="min. 8 characters"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">role</span>
          <select
            style={inputStyle}
            value={f.role}
            onChange={e => set('role', e.target.value as InviteDraft['role'])}
          >
            <option value="viewer">viewer — read-only access</option>
            <option value="member">member — can add/edit most content</option>
            <option value="admin">admin — full access except owner actions</option>
          </select>
        </label>
      </form>
    </Modal>
  );
}

// ── UsersScreen ───────────────────────────────────────────────────────────────

export function UsersScreen() {
  const { accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const currentUser = useAuthStore(s => s.user);
  const { can }     = useCan();

  const [users,      setUsers]      = useState<User[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  const canWrite  = can('user', 'write');
  const canDelete = can('user', 'delete');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const result = await api.get<User[]>('/api/org/users');
      setUsers(result ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleInvited(u: User) {
    setUsers(prev => [...prev, u]);
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    if (newRole === 'owner') return; // owner role not grantable via UI
    setRoleChanging(userId);
    setErr('');
    try {
      const updated = await api.patch<User>(`/api/org/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? updated! : u));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to change role');
    } finally {
      setRoleChanging(null);
    }
  }

  async function handleDelete(userId: string) {
    setDeletingId(userId);
    setErr('');
    try {
      await api.delete(`/api/org/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to remove user');
    } finally {
      setDeletingId(null);
    }
  }

  // Can the current user act on a target user?
  function canActOn(target: User): boolean {
    if (!currentUser) return false;
    if (target.id === currentUser.id) return false;       // can't act on yourself
    if (target.role === 'owner') return false;            // can't demote/remove owner
    return canWrite;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .user-row:hover td { background: var(--rowBg, #0a0c0e) !important; }
        .del-btn:hover { color: var(--red, #c07070) !important; }
        .role-select:focus { outline: none; border-color: var(--accent, #c47c5a) !important; }
      `}</style>

      {/* Toolbar */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '10px 16px',
        borderBottom:   '1px solid var(--border, #1d2022)',
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    13,
          fontWeight:  700,
          color:       'var(--text, #d4d9dd)',
        }}>
          team members
        </span>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button
            className="act-primary"
            onClick={() => setInviteOpen(true)}
            style={{ ...av, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 12px' }}
          >
            <Icon name="plus" size={12} />
            invite
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {err && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize:   11,
            color:      'var(--red, #c07070)',
            padding:    '10px 16px',
          }}>
            {err}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '32px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
            loading…
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon="users"
            title="no team members"
            action={canWrite ? (
              <button className="btn-ghost" onClick={() => setInviteOpen(true)} style={{ fontSize: 11, padding: '5px 14px' }}>
                invite someone
              </button>
            ) : undefined}
          />
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>username</th>
                <th>email</th>
                <th style={{ width: 160 }}>role</th>
                <th style={{ width: 110 }}>joined</th>
                <th style={{ width: 48  }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf    = u.id === currentUser?.id;
                const actable   = canActOn(u);
                const isChanging = roleChanging === u.id;

                return (
                  <tr key={u.id} className="user-row">
                    {/* Username */}
                    <td className="pri" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                        {u.username}
                      </span>
                      {isSelf && (
                        <span style={{
                          fontFamily:   "'JetBrains Mono', monospace",
                          fontSize:     9,
                          color:        'var(--text3)',
                          background:   'var(--border, #1d2022)',
                          borderRadius: 3,
                          padding:      '1px 5px',
                        }}>
                          you
                        </span>
                      )}
                    </td>

                    {/* Email */}
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text2)' }}>
                      {u.email}
                    </td>

                    {/* Role — inline select if editable */}
                    <td>
                      {actable && !isChanging ? (
                        <select
                          className="role-select"
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                          style={{
                            background:   'transparent',
                            border:       '1px solid var(--border2, #262c30)',
                            borderRadius: 3,
                            color:        ROLE_COLORS[u.role],
                            fontFamily:   "'JetBrains Mono', monospace",
                            fontSize:     10,
                            padding:      '2px 6px',
                            cursor:       'pointer',
                          }}
                        >
                          <option value="viewer">viewer</option>
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                      {isChanging && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                          saving…
                        </span>
                      )}
                    </td>

                    {/* Joined */}
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td>
                      {canDelete && actable && (
                        <button
                          className="del-btn"
                          onClick={() => handleDelete(u.id)}
                          disabled={deletingId === u.id}
                          title={`remove ${u.username}`}
                          style={{ color: 'var(--text3)', padding: '2px 4px' }}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        accent={accent}
        onSaved={handleInvited}
      />
    </div>
  );
}
