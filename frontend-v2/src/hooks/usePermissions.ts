import { useGetMyPermissions, type PermissionCategory, type ResolvedPermissions } from '@/api/rbac';
import { useSiteStore } from '@/stores/siteStore';

const FULL_ACCESS: ResolvedPermissions = {
  infrastructure: { canRead: true, canWrite: true, canExecute: true },
  storage:        { canRead: true, canWrite: true, canExecute: true },
  networking:     { canRead: true, canWrite: true, canExecute: true },
  os:             { canRead: true, canWrite: true, canExecute: true },
  topology:       { canRead: true, canWrite: true, canExecute: true },
  docs:           { canRead: true, canWrite: true, canExecute: true },
  activity:       { canRead: true, canWrite: true, canExecute: true },
  settings:       { canRead: true, canWrite: true, canExecute: true },
};

export function usePermissions() {
  const currentSite = useSiteStore((s) => s.currentSite);
  const siteId = currentSite?.id ?? '';
  const { data, isLoading } = useGetMyPermissions(siteId);

  // Graceful degradation: full access while loading or if no permissions returned
  const permissions: ResolvedPermissions = data ?? FULL_ACCESS;

  const canRead = (category: PermissionCategory): boolean =>
    permissions[category]?.canRead ?? true;

  const canWrite = (category: PermissionCategory): boolean =>
    permissions[category]?.canWrite ?? true;

  const canExecute = (category: PermissionCategory): boolean =>
    permissions[category]?.canExecute ?? true;

  return { canRead, canWrite, canExecute, isLoading, permissions };
}
