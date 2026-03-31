import { lazy } from 'react';

export const OverviewPage    = lazy(() => import('@/pages/OverviewPage'));
export const RackViewHub     = lazy(() => import('@/pages/Infrastructure/RackViewHub'));
export const DeviceLibrary   = lazy(() => import('@/pages/DeviceLibrary'));
export const PoolsPage       = lazy(() => import('@/pages/PoolsPage'));
export const SharesPage      = lazy(() => import('@/pages/SharesPage'));
export const DisksPage       = lazy(() => import('@/pages/DisksPage'));
export const OsOverviewPage  = lazy(() => import('@/pages/OsOverviewPage'));
export const TopologyPage    = lazy(() => import('@/pages/TopologyPage'));
export const SubnetsPage     = lazy(() => import('@/pages/SubnetsPage'));
export const LeasesPage      = lazy(() => import('@/pages/LeasesPage'));
export const VlansPage       = lazy(() => import('@/pages/VlansPage'));
export const ActivityPage    = lazy(() => import('@/pages/ActivityPage'));
export const GuidesPage      = lazy(() => import('@/pages/GuidesPage'));
export const TodoListPage    = lazy(() => import('@/pages/TodoListPage'));
export const SettingsPage    = lazy(() => import('@/pages/SettingsPage'));
export const LoginPage       = lazy(() => import('@/pages/LoginPage'));
export const NotFoundPage    = lazy(() => import('@/pages/NotFoundPage'));
