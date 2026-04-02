import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { useSiteStore } from '@/stores/siteStore';
import {
  useGetSecurityGroups,
  useCreateSecurityGroup,
  useUpdateSecurityGroup,
  useDeleteSecurityGroup,
  useGetGroupUsers,
  useAddUserToGroup,
  useRemoveUserFromGroup,
  type SecurityGroup,
  type PermissionCategory,
  type CreateGroupPayload,
} from '@/api/rbac';
import TemplatesSettings from './TemplatesSettings';
import ZonesRacksSettings from './ZonesRacksSettings';
import GitSyncSettings from './GitSyncSettings';
import ThemeSettings from './ThemeSettings';
import MonitoringSettings from './MonitoringSettings';
import QueryErrorState from '@/components/QueryErrorState';
import styles from './SettingsPage.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: PermissionCategory[] = [
  'infrastructure', 'storage', 'networking', 'os',
  'topology', 'docs', 'activity', 'settings',
];

const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  infrastructure: 'Infrastructure',
  storage: 'Storage',
  networking: 'Networking',
  os: 'OS',
  topology: 'Topology',
  docs: 'Docs',
  activity: 'Activity',
  settings: 'Settings',
};

// ── User types ────────────────────────────────────────────────────────────────

interface OrgUser {
  id: string;
  orgId: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
}

function useGetOrgUsers() {
  return useQuery({
    queryKey: ['org-users'],
    queryFn: () => api.get<OrgUser[]>('/api/org/users'),
  });
}

function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; username: string; password: string; role: string }) =>
      api.post<OrgUser>('/api/org/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-users'] }),
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: { display: 'flex', flexDirection: 'column' as const, height: '100%', overflow: 'hidden', background: '#161a1d' },
  header: { padding: '20px 24px 0', borderBottom: '1px solid #2a3038' },
  h1: { fontSize: '20px', fontWeight: 600, margin: '0 0 16px', color: '#d4d9dd', fontFamily: 'Inter, system-ui, sans-serif' },
  tabBar: { display: 'flex', gap: '0' },
  content: { flex: 1, overflow: 'auto', padding: '20px 24px' },
  subTabBar: { display: 'flex', gap: '6px', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', fontFamily: 'Inter, system-ui, sans-serif' },
  th: { textAlign: 'left' as const, padding: '8px 12px', color: '#8a9299', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid #2a3038', fontWeight: 500 },
  td: { padding: '8px 12px', color: '#d4d9dd', borderBottom: '1px solid #1e2428' },
  tdMuted: { padding: '8px 12px', color: '#8a9299', borderBottom: '1px solid #1e2428', fontSize: '12px' },
  input: { background: '#161a1d', border: '1px solid #2a3038', borderRadius: '4px', padding: '5px 10px', color: '#d4d9dd', fontSize: '12px', fontFamily: 'Inter, system-ui, sans-serif', width: '100%', outline: 'none', boxSizing: 'border-box' as const },
  select: { background: '#161a1d', border: '1px solid #2a3038', borderRadius: '4px', padding: '5px 10px', color: '#d4d9dd', fontSize: '12px', fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' },
  label: { fontSize: '10px', color: '#8a9299', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px', display: 'block' },
  formGroup: { marginBottom: '12px' },
  splitLayout: { display: 'flex', gap: '20px', height: '100%' },
  sidebar: { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  main: { flex: 1, minWidth: 0 },
  emptyState: { textAlign: 'center' as const, padding: '40px 20px', color: '#8a9299', fontSize: '13px' },
  permGrid: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', fontFamily: 'Inter, system-ui, sans-serif' },
};

// ── Invite Modal ──────────────────────────────────────────────────────────────

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const invite = useInviteUser();

  useEffect(() => {
    if (open) {
      setEmail('');
      setUsername('');
      setPassword('');
      setRole('member');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!email || !username || !password) {
      setError('All fields are required');
      return;
    }
    invite.mutate(
      { email, username, password, role },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to invite user'),
      }
    );
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#d4d9dd', fontFamily: 'Inter, system-ui, sans-serif' }}>Invite User</h3>
        {error && <div style={{ color: '#e06060', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}
        <div style={S.formGroup}>
          <label style={S.label}>Email</label>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Username</label>
          <input style={S.input} type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Role</label>
          <select style={S.select} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="viewer">Viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={handleSubmit} disabled={invite.isPending}>
            {invite.isPending ? 'Inviting...' : 'Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Group Modal ────────────────────────────────────────────────────────

function CreateGroupModal({ open, onClose, siteId }: { open: boolean; onClose: () => void; siteId: string }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState(() => defaultPerms(false));
  const [error, setError] = useState('');
  const create = useCreateSecurityGroup(siteId);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setPerms(defaultPerms(false));
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const togglePerm = (cat: PermissionCategory, field: 'canRead' | 'canWrite' | 'canExecute') => {
    setPerms((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [field]: !prev[cat][field] },
    }));
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const permissions = CATEGORIES.map((cat) => ({
      category: cat,
      canRead: perms[cat].canRead,
      canWrite: perms[cat].canWrite,
      canExecute: perms[cat].canExecute,
    }));
    create.mutate(
      { name: name.trim(), description: description.trim() || null, permissions },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create group'),
      }
    );
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} style={{ minWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#d4d9dd', fontFamily: 'Inter, system-ui, sans-serif' }}>Create Security Group</h3>
        {error && <div style={{ color: '#e06060', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}
        <div style={S.formGroup}>
          <label style={S.label}>Name</label>
          <input style={S.input} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Description</label>
          <input style={S.input} type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={S.label}>Permissions</label>
          <PermissionMatrix perms={perms} onChange={togglePerm} />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Permission Matrix Component ───────────────────────────────────────────────

interface PermState {
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
}

function defaultPerms(allOn: boolean): Record<PermissionCategory, PermState> {
  const result = {} as Record<PermissionCategory, PermState>;
  for (const cat of CATEGORIES) {
    result[cat] = { canRead: allOn, canWrite: allOn, canExecute: allOn };
  }
  return result;
}

function PermissionMatrix({
  perms,
  onChange,
  readOnly = false,
}: {
  perms: Record<PermissionCategory, PermState>;
  onChange: (cat: PermissionCategory, field: 'canRead' | 'canWrite' | 'canExecute') => void;
  readOnly?: boolean;
}) {
  return (
    <table style={S.permGrid}>
      <thead>
        <tr>
          <th style={{ ...S.th, width: '140px' }}>Category</th>
          <th style={{ ...S.th, textAlign: 'center', width: '70px' }}>Read</th>
          <th style={{ ...S.th, textAlign: 'center', width: '70px' }}>Write</th>
          <th style={{ ...S.th, textAlign: 'center', width: '70px' }}>Execute</th>
        </tr>
      </thead>
      <tbody>
        {CATEGORIES.map((cat, i) => (
          <tr key={cat} style={{ background: i % 2 === 0 ? '#1a1e22' : '#161a1d' }}>
            <td style={{ padding: '6px 12px', color: '#d4d9dd', fontSize: '13px' }}>
              {CATEGORY_LABELS[cat]}
            </td>
            {(['canRead', 'canWrite', 'canExecute'] as const).map((field) => (
              <td key={field} style={{ padding: '6px 12px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={perms[cat]?.[field] ?? false}
                  onChange={() => onChange(cat, field)}
                  disabled={readOnly}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Users Sub-tab ─────────────────────────────────────────────────────────────

function UsersTab({ siteId }: { siteId: string }) {
  const usersQ = useGetOrgUsers();
  const { data: users, isLoading } = usersQ;
  const { data: groups } = useGetSecurityGroups(siteId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  if (usersQ.error) {
    return <QueryErrorState error={usersQ.error} onRetry={() => usersQ.refetch()} />;
  }

  if (isLoading) {
    return <div style={S.emptyState}>Loading users...</div>;
  }

  if (!users?.length) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button className={styles.primaryBtn} onClick={() => setInviteOpen(true)}>Invite User</button>
        </div>
        <div style={S.emptyState}>No users found</div>
        <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      </div>
    );
  }

  // Build a map of user -> groups
  const userGroupMap: Record<string, string[]> = {};
  if (groups) {
    for (const g of groups) {
      // We need to know which users are in each group; this is populated per-group lazily
      // For the overview, we show group counts from the group data
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className={styles.primaryBtn} onClick={() => setInviteOpen(true)}>Invite User</button>
      </div>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Username</th>
                <th style={S.th}>Email</th>
                <th style={S.th}>Role</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={styles.tableRow}
                  style={{ cursor: 'pointer', background: selectedUser === user.id ? '#1e2428' : undefined }}
                  onClick={() => setSelectedUser(selectedUser === user.id ? null : user.id)}
                >
                  <td style={S.td}>{user.username}</td>
                  <td style={S.tdMuted}>{user.email}</td>
                  <td style={S.td}>
                    <span className={styles.pill}>{user.role}</span>
                  </td>
                  <td style={S.td}>
                    <button
                      className={styles.ghostBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(selectedUser === user.id ? null : user.id);
                      }}
                    >
                      Groups
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedUser && groups && (
          <UserGroupAssignment
            userId={selectedUser}
            siteId={siteId}
            groups={groups}
            onClose={() => setSelectedUser(null)}
          />
        )}
      </div>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

// ── User Group Assignment Panel ───────────────────────────────────────────────

function UserGroupAssignment({
  userId,
  siteId,
  groups,
  onClose,
}: {
  userId: string;
  siteId: string;
  groups: SecurityGroup[];
  onClose: () => void;
}) {
  return (
    <div style={{ width: '260px', flexShrink: 0, background: '#1a1e22', border: '1px solid #2a3038', borderRadius: '4px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#d4d9dd' }}>Group Membership</span>
        <button className={styles.ghostBtn} onClick={onClose} style={{ padding: '2px 8px' }}>x</button>
      </div>
      {groups.map((group) => (
        <GroupCheckbox key={group.id} group={group} userId={userId} siteId={siteId} />
      ))}
    </div>
  );
}

function GroupCheckbox({ group, userId, siteId }: { group: SecurityGroup; userId: string; siteId: string }) {
  const { data: groupUsers } = useGetGroupUsers(siteId, group.id);
  const addUser = useAddUserToGroup(siteId, group.id);
  const removeUser = useRemoveUserFromGroup(siteId, group.id);

  const isMember = groupUsers?.some((u) => u.id === userId) ?? false;

  const handleToggle = () => {
    if (isMember) {
      removeUser.mutate(userId);
    } else {
      addUser.mutate(userId);
    }
  };

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', cursor: 'pointer', fontSize: '12px', color: '#d4d9dd' }}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={isMember}
        onChange={handleToggle}
        disabled={addUser.isPending || removeUser.isPending}
      />
      {group.name}
      {group.isDefault && <span style={{ fontSize: '10px', color: '#8a9299' }}>(default)</span>}
    </label>
  );
}

// ── Security Groups Sub-tab ───────────────────────────────────────────────────

function SecurityGroupsTab({ siteId }: { siteId: string }) {
  const { data: groups, isLoading } = useGetSecurityGroups(siteId);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedGroup = groups?.find((g) => g.id === selectedGroupId) ?? null;

  useEffect(() => {
    if (groups?.length && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  if (isLoading) {
    return <div style={S.emptyState}>Loading security groups...</div>;
  }

  return (
    <div style={S.splitLayout}>
      <div style={S.sidebar}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Groups</span>
          <button className={styles.primaryBtn} style={{ padding: '3px 10px', fontSize: '10px' }} onClick={() => setCreateOpen(true)}>
            + Create
          </button>
        </div>
        {groups?.map((group) => (
          <div
            key={group.id}
            className={`${styles.groupCard} ${selectedGroupId === group.id ? styles.groupCardActive : ''}`}
            onClick={() => setSelectedGroupId(group.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#d4d9dd' }}>{group.name}</span>
              {group.isDefault && (
                <span style={{ fontSize: '9px', color: '#8a9299', background: '#262c30', padding: '1px 6px', borderRadius: '8px' }}>default</span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#8a9299', marginTop: '4px' }}>
              {group.userCount} user{group.userCount !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={S.main}>
        {selectedGroup ? (
          <GroupDetail group={selectedGroup} siteId={siteId} />
        ) : (
          <div style={S.emptyState}>Select a security group to view its permissions</div>
        )}
      </div>

      <CreateGroupModal open={createOpen} onClose={() => setCreateOpen(false)} siteId={siteId} />
    </div>
  );
}

// ── Group Detail Panel ────────────────────────────────────────────────────────

function GroupDetail({ group, siteId }: { group: SecurityGroup; siteId: string }) {
  const update = useUpdateSecurityGroup(siteId);
  const deleteGroup = useDeleteSecurityGroup(siteId);
  const [editName, setEditName] = useState(group.name);
  const [editDesc, setEditDesc] = useState(group.description ?? '');
  const [perms, setPerms] = useState<Record<PermissionCategory, PermState>>(() => buildPermsFromGroup(group));
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // Reset when group changes
  useEffect(() => {
    setEditName(group.name);
    setEditDesc(group.description ?? '');
    setPerms(buildPermsFromGroup(group));
    setDirty(false);
    setConfirmDelete(false);
    setError('');
  }, [group.id, group.name, group.description, group.permissions]);

  const togglePerm = useCallback((cat: PermissionCategory, field: 'canRead' | 'canWrite' | 'canExecute') => {
    setPerms((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [field]: !prev[cat][field] },
    }));
    setDirty(true);
  }, []);

  const handleSave = () => {
    const permissions = CATEGORIES.map((cat) => ({
      category: cat,
      canRead: perms[cat].canRead,
      canWrite: perms[cat].canWrite,
      canExecute: perms[cat].canExecute,
    }));
    update.mutate(
      { id: group.id, name: editName.trim(), description: editDesc.trim() || null, permissions },
      {
        onSuccess: () => {
          setDirty(false);
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update'),
      }
    );
  };

  const handleDelete = () => {
    deleteGroup.mutate(group.id, {
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete'),
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={S.formGroup}>
            <label style={S.label}>Name</label>
            <input
              style={{ ...S.input, maxWidth: '300px' }}
              type="text"
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setDirty(true); }}
              disabled={group.isDefault}
            />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Description</label>
            <input
              style={{ ...S.input, maxWidth: '400px' }}
              type="text"
              value={editDesc}
              onChange={(e) => { setEditDesc(e.target.value); setDirty(true); }}
              placeholder="Optional description"
            />
          </div>
        </div>
      </div>

      {error && <div style={{ color: '#e06060', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}

      <div style={{ marginBottom: '16px' }}>
        <label style={{ ...S.label, marginBottom: '8px' }}>Permission Matrix</label>
        <PermissionMatrix perms={perms} onChange={togglePerm} />
      </div>

      {/* Group users */}
      <GroupUsersList groupId={group.id} siteId={siteId} />

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #2a3038' }}>
        <div>
          {!confirmDelete ? (
            <button className={styles.dangerBtn} onClick={() => setConfirmDelete(true)}>
              Delete Group
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#e06060' }}>Are you sure?</span>
              <button className={styles.dangerBtn} onClick={handleDelete} disabled={deleteGroup.isPending}>
                {deleteGroup.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button className={styles.ghostBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
        <button className={styles.primaryBtn} onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function buildPermsFromGroup(group: SecurityGroup): Record<PermissionCategory, PermState> {
  const result = defaultPerms(false);
  for (const p of group.permissions) {
    result[p.category] = {
      canRead: p.canRead,
      canWrite: p.canWrite,
      canExecute: p.canExecute,
    };
  }
  return result;
}

// ── Group Users List ──────────────────────────────────────────────────────────

function GroupUsersList({ groupId, siteId }: { groupId: string; siteId: string }) {
  const { data: groupUsers, isLoading } = useGetGroupUsers(siteId, groupId);
  const { data: allUsers } = useGetOrgUsers();
  const addUser = useAddUserToGroup(siteId, groupId);
  const removeUser = useRemoveUserFromGroup(siteId, groupId);
  const [addingUser, setAddingUser] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const availableUsers = allUsers?.filter((u) => !groupUsers?.some((gu) => gu.id === u.id)) ?? [];

  const handleAddUser = () => {
    if (!selectedUserId) return;
    addUser.mutate(selectedUserId, {
      onSuccess: () => {
        setAddingUser(false);
        setSelectedUserId('');
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label style={S.label}>Users in this Group</label>
        <button className={styles.ghostBtn} style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => setAddingUser(!addingUser)}>
          {addingUser ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {addingUser && availableUsers.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <select
            style={{ ...S.select, flex: 1 }}
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Select a user...</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
            ))}
          </select>
          <button className={styles.primaryBtn} style={{ padding: '3px 10px' }} onClick={handleAddUser} disabled={!selectedUserId || addUser.isPending}>
            Add
          </button>
        </div>
      )}

      {addingUser && availableUsers.length === 0 && (
        <div style={{ fontSize: '12px', color: '#8a9299', marginBottom: '8px' }}>All org users are already in this group</div>
      )}

      {isLoading ? (
        <div style={{ fontSize: '12px', color: '#8a9299' }}>Loading...</div>
      ) : !groupUsers?.length ? (
        <div style={{ fontSize: '12px', color: '#8a9299' }}>No users assigned</div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Username</th>
              <th style={S.th}>Email</th>
              <th style={S.th}>Role</th>
              <th style={{ ...S.th, width: '80px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupUsers.map((user) => (
              <tr key={user.id} className={styles.tableRow}>
                <td style={S.td}>{user.username}</td>
                <td style={S.tdMuted}>{user.email}</td>
                <td style={S.td}>
                  <span className={styles.pill}>{user.role}</span>
                </td>
                <td style={S.td}>
                  <button
                    className={styles.dangerBtn}
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                    onClick={() => removeUser.mutate(user.id)}
                    disabled={removeUser.isPending}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────

type MainTab = 'users-permissions' | 'templates' | 'zones-racks' | 'monitoring' | 'git-sync' | 'theme';
type SubTab = 'users' | 'security-groups';

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: 'users-permissions', label: 'Users & Permissions' },
  { id: 'templates', label: 'Templates' },
  { id: 'zones-racks', label: 'Zones & Racks' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'git-sync', label: 'Git Sync' },
  { id: 'theme', label: 'Theme' },
];

export default function SettingsPage() {
  const currentSite = useSiteStore((s) => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const [mainTab, setMainTab] = useState<MainTab>('users-permissions');
  const [subTab, setSubTab] = useState<SubTab>('users');

  return (
    <div className={styles.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Settings</h1>
        <div style={S.tabBar}>
          {MAIN_TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tabBtn} ${mainTab === t.id ? styles.tabBtnActive : ''}`}
              onClick={() => setMainTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.content}>
        {mainTab === 'users-permissions' && (
          <div>
            <div style={S.subTabBar}>
              <button
                className={`${styles.subTab} ${subTab === 'users' ? styles.subTabActive : ''}`}
                onClick={() => setSubTab('users')}
              >
                Users
              </button>
              <button
                className={`${styles.subTab} ${subTab === 'security-groups' ? styles.subTabActive : ''}`}
                onClick={() => setSubTab('security-groups')}
              >
                Security Groups
              </button>
            </div>

            {!siteId ? (
              <div style={S.emptyState}>Select a site to manage permissions</div>
            ) : subTab === 'users' ? (
              <UsersTab siteId={siteId} />
            ) : (
              <SecurityGroupsTab siteId={siteId} />
            )}
          </div>
        )}

        {mainTab === 'templates' && <TemplatesSettings siteId={siteId} />}

        {mainTab === 'zones-racks' && (
          !siteId ? (
            <div style={S.emptyState}>Select a site to manage zones and racks</div>
          ) : (
            <ZonesRacksSettings siteId={siteId} />
          )
        )}

        {mainTab === 'monitoring' && <MonitoringSettings siteId={siteId} />}

        {mainTab === 'git-sync' && <GitSyncSettings siteId={siteId} />}

        {mainTab === 'theme' && <ThemeSettings />}
      </div>
    </div>
  );
}
