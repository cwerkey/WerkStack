import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/providers/QueryProvider';
import { AppShell } from '@/layouts/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { User, Site } from '@werkstack/shared';
import {
  OverviewPage, RackViewHub, DeviceLibrary,
  PoolsPage, SharesPage, DisksPage,
  OsOverviewPage, TopologyPage,
  SubnetsPage, LeasesPage, VlansPage,
  ActivityPage, GuidesPage, TodoListPage,
  SettingsPage, LoginPage, SetupPage, NotFoundPage,
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
        <ErrorBoundary>
          <Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading…</div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route
                path="/*"
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<ErrorBoundary><OverviewPage /></ErrorBoundary>} />
                <Route path="infrastructure/rack"                              element={<ErrorBoundary><RackViewHub /></ErrorBoundary>} />
                <Route path="infrastructure/rack/:zoneId"                    element={<ErrorBoundary><RackViewHub /></ErrorBoundary>} />
                <Route path="infrastructure/rack/:zoneId/:rackId"            element={<ErrorBoundary><RackViewHub /></ErrorBoundary>} />
                <Route path="infrastructure/rack/:zoneId/:rackId/:deviceId"  element={<ErrorBoundary><RackViewHub /></ErrorBoundary>} />
                <Route path="infrastructure/devices" element={<ErrorBoundary><DeviceLibrary /></ErrorBoundary>} />
                <Route path="storage/pools"          element={<ErrorBoundary><PoolsPage /></ErrorBoundary>} />
                <Route path="storage/shares"         element={<ErrorBoundary><SharesPage /></ErrorBoundary>} />
                <Route path="storage/disks"          element={<ErrorBoundary><DisksPage /></ErrorBoundary>} />
                <Route path="os"                     element={<ErrorBoundary><OsOverviewPage /></ErrorBoundary>} />
                <Route path="topology"               element={<ErrorBoundary><TopologyPage /></ErrorBoundary>} />
                <Route path="network/subnets"        element={<ErrorBoundary><SubnetsPage /></ErrorBoundary>} />
                <Route path="network/leases"         element={<ErrorBoundary><LeasesPage /></ErrorBoundary>} />
                <Route path="network/vlans"          element={<ErrorBoundary><VlansPage /></ErrorBoundary>} />
                <Route path="activity"               element={<ErrorBoundary><ActivityPage /></ErrorBoundary>} />
                <Route path="docs/guides"            element={<ErrorBoundary><GuidesPage /></ErrorBoundary>} />
                <Route path="docs/todos"             element={<ErrorBoundary><TodoListPage /></ErrorBoundary>} />
                <Route path="settings/*"             element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                <Route path="*"                      element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
