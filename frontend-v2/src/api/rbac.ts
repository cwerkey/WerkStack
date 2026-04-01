import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PermissionCategory =
  | 'infrastructure' | 'storage' | 'networking' | 'os'
  | 'topology' | 'docs' | 'activity' | 'settings';

export interface PermissionEntry {
  id: string;
  groupId: string;
  category: PermissionCategory;
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
}

export interface SecurityGroup {
  id: string;
  orgId: string;
  siteId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  permissions: PermissionEntry[];
  userCount: number;
}

export interface GroupUser {
  id: string;
  orgId: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  assignedAt: string;
}

export interface CategoryPermission {
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
}

export type ResolvedPermissions = Record<PermissionCategory, CategoryPermission>;

export interface CreateGroupPayload {
  name: string;
  description?: string | null;
  permissions: {
    category: PermissionCategory;
    canRead: boolean;
    canWrite: boolean;
    canExecute: boolean;
  }[];
}

export interface UpdateGroupPayload extends CreateGroupPayload {
  id: string;
}

// ── Security Group Hooks ──────────────────────────────────────────────────────

export function useGetSecurityGroups(siteId: string) {
  return useQuery({
    queryKey: ['security-groups', siteId],
    queryFn: () => api.get<SecurityGroup[]>(`/api/sites/${siteId}/security-groups`),
    enabled: !!siteId,
  });
}

export function useCreateSecurityGroup(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGroupPayload) =>
      api.post<SecurityGroup>(`/api/sites/${siteId}/security-groups`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-groups', siteId] }),
  });
}

export function useUpdateSecurityGroup(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateGroupPayload) =>
      api.put<SecurityGroup>(`/api/sites/${siteId}/security-groups/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-groups', siteId] }),
  });
}

export function useDeleteSecurityGroup(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      api.delete<void>(`/api/sites/${siteId}/security-groups/${groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-groups', siteId] }),
  });
}

// ── Group Users Hooks ─────────────────────────────────────────────────────────

export function useGetGroupUsers(siteId: string, groupId: string) {
  return useQuery({
    queryKey: ['security-group-users', siteId, groupId],
    queryFn: () => api.get<GroupUser[]>(`/api/sites/${siteId}/security-groups/${groupId}/users`),
    enabled: !!siteId && !!groupId,
  });
}

export function useAddUserToGroup(siteId: string, groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<unknown>(`/api/sites/${siteId}/security-groups/${groupId}/users`, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-group-users', siteId, groupId] });
      qc.invalidateQueries({ queryKey: ['security-groups', siteId] });
    },
  });
}

export function useRemoveUserFromGroup(siteId: string, groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete<void>(`/api/sites/${siteId}/security-groups/${groupId}/users/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-group-users', siteId, groupId] });
      qc.invalidateQueries({ queryKey: ['security-groups', siteId] });
    },
  });
}

// ── Permission Resolution Hooks ───────────────────────────────────────────────

export function useGetMyPermissions(siteId: string) {
  return useQuery({
    queryKey: ['my-permissions', siteId],
    queryFn: () => api.get<ResolvedPermissions>(`/api/sites/${siteId}/security-groups/me/permissions`),
    enabled: !!siteId,
  });
}

export function useGetUserPermissions(siteId: string, userId: string) {
  return useQuery({
    queryKey: ['user-permissions', siteId, userId],
    queryFn: () => api.get<ResolvedPermissions>(`/api/sites/${siteId}/security-groups/users/${userId}/permissions`),
    enabled: !!siteId && !!userId,
  });
}
