// can — permission helper for the WerkStack role system.
//
// Permission model:
//   read < write < delete  (level hierarchy)
//   owner bypasses ALL checks (always returns true)
//
// Each role has a maximum level it can perform per task group.
// 'none' means that role has zero access to that group.
//
// Usage (inside a component):
//   const { can } = useCan();
//   if (can('device', 'write')) { ... }
//
// Usage (inside an event handler — avoid stale closures):
//   const role = useAuthStore.getState().user?.role;
//   if (canStatic(role, 'device', 'delete')) { ... }

import { useAuthStore }  from '../store/useAuthStore';
import type { UserRole } from '@werkstack/shared';

export type Level = 'read' | 'write' | 'delete';

export type TaskGroup =
  | 'site'     // site-level management (create/rename/delete a site)
  | 'rack'     // rack CRUD within a site
  | 'device'   // device instances (add, edit, move, delete)
  | 'template' // device & PCIe card templates
  | 'cable'    // cable connections & patch entries
  | 'storage'  // storage pools, drives, shares
  | 'network'  // subnets & IP assignments
  | 'guide'    // markdown guides
  | 'ticket'   // ticket CRUD
  | 'user';    // user & membership management

// ─── Level rank map ────────────────────────────────────────────────────────
const LEVEL_RANK: Record<Level, number> = { read: 0, write: 1, delete: 2 };

// ─── Permission matrix ─────────────────────────────────────────────────────
// Maps each non-owner role to the maximum Level allowed per TaskGroup.
// 'none' = no access regardless of requested level.

type MaxLevel = Level | 'none';
type RoleMatrix = Record<TaskGroup, MaxLevel>;

const ROLE_MATRIX: Record<Exclude<UserRole, 'owner'>, RoleMatrix> = {
  admin: {
    site:     'delete',
    rack:     'delete',
    device:   'delete',
    template: 'delete',
    cable:    'delete',
    storage:  'delete',
    network:  'delete',
    guide:    'delete',
    ticket:   'delete',
    user:     'write',   // admins can invite/edit members, not delete the owner
  },
  member: {
    site:     'read',    // members can view sites, not manage them
    rack:     'read',    // members view racks (rack CRUD requires admin)
    device:   'write',   // members can add/edit devices
    template: 'write',   // members can create/edit templates
    cable:    'write',   // members can document connections
    storage:  'write',   // members can manage drives, pools, shares
    network:  'read',    // members view subnets; IP assignment is write (below)
    guide:    'write',   // members can author guides
    ticket:   'write',   // members can open & update tickets
    user:     'none',    // members cannot see or touch user management
  },
  viewer: {
    site:     'read',
    rack:     'read',
    device:   'read',
    template: 'read',
    cable:    'read',
    storage:  'read',
    network:  'read',
    guide:    'read',
    ticket:   'read',
    user:     'none',
  },
};

// ─── useCan hook ───────────────────────────────────────────────────────────

/**
 * useCan — React hook. Returns a `can(taskGroup, level)` function bound to
 * the currently logged-in user's role. Re-evaluates on role change.
 */
export function useCan() {
  const role = useAuthStore(s => s.user?.role);

  function can(taskGroup: TaskGroup, level: Level): boolean {
    return canStatic(role, taskGroup, level);
  }

  return { can };
}

// ─── canStatic — non-hook version ─────────────────────────────────────────

/**
 * canStatic — non-hook version for use inside event handlers or async
 * callbacks where calling a React hook would be invalid.
 *
 * @example
 *   function handleDelete() {
 *     const role = useAuthStore.getState().user?.role;
 *     if (!canStatic(role, 'device', 'delete')) return;
 *     ...
 *   }
 */
export function canStatic(
  role: UserRole | undefined,
  taskGroup: TaskGroup,
  level: Level
): boolean {
  if (!role) return false;

  // Owner bypasses all permission checks
  if (role === 'owner') return true;

  const matrix   = ROLE_MATRIX[role];
  const maxLevel = matrix[taskGroup];

  if (maxLevel === 'none') return false;

  return LEVEL_RANK[level] <= LEVEL_RANK[maxLevel];
}
