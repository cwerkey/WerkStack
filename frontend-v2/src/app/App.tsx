import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/providers/QueryProvider';
import { AppShell } from '@/layouts/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { User, Site } from '@werkstack/shared';
import {
  OverviewPage, RackViewHub, DeviceLibrary,
  PoolsPage, SharesPage, DisksPage,
  OsOverviewPage, TopologyPage,
  SubnetsPage, LeasesPage, VlansPage,
  ActivityPage, GuidesPage, TodoListPage,
  SettingsPage, LoginPage, NotFoundPage,
} from '@/app/routes';

function AuthHydrator() {
  const setUser     = useAuthStore(s => s.setUser);
  const setHydrated = useAuthStore(s => s.setHydrated);

  useEffect(() => {
    api.get<{ user: User; sites: Site[] }>('/api/auth/me')
      .then(res => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setHydrated(true));
  }, [setUser, setHydrated]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthHydrator />
        <Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading…</div>}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="infrastructure/rack"                              element={<RackViewHub />} />
              <Route path="infrastructure/rack/:zoneId"                    element={<RackViewHub />} />
              <Route path="infrastructure/rack/:zoneId/:rackId"            element={<RackViewHub />} />
              <Route path="infrastructure/rack/:zoneId/:rackId/:deviceId"  element={<RackViewHub />} />
              <Route path="infrastructure/devices" element={<DeviceLibrary />} />
              <Route path="storage/pools"          element={<PoolsPage />} />
              <Route path="storage/shares"         element={<SharesPage />} />
              <Route path="storage/disks"          element={<DisksPage />} />
              <Route path="os"                     element={<OsOverviewPage />} />
              <Route path="topology"               element={<TopologyPage />} />
              <Route path="network/subnets"        element={<SubnetsPage />} />
              <Route path="network/leases"         element={<LeasesPage />} />
              <Route path="network/vlans"          element={<VlansPage />} />
              <Route path="activity"               element={<ActivityPage />} />
              <Route path="docs/guides"            element={<GuidesPage />} />
              <Route path="docs/todos"             element={<TodoListPage />} />
              <Route path="settings/*"             element={<SettingsPage />} />
              <Route path="*"                      element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
