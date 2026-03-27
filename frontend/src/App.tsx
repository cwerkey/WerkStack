import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useThemeStore, OS_THEME_TOKENS, themeToVars } from './store/useThemeStore';
import { useAuthStore }  from './store/useAuthStore';
import { useSiteStore }  from './store/useSiteStore';
import { useTypesStore }    from './store/useTypesStore';
import { useTemplateStore } from './store/useTemplateStore';
import { useRackStore }     from './store/useRackStore';
import { api }              from './utils/api';
import type { TypesData, DeviceTemplate, PcieTemplate, Rack, DeviceInstance, Connection, Drive } from '@werkstack/shared';

import { LoginPage }    from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { LandingPage }  from './features/landing/LandingPage';
import { SiteShell }    from './features/SiteShell';
import { RequireAuth }  from './components/ui/RequireAuth';

import { OverviewScreen }    from './features/sites/tabs/OverviewScreen';
import { RackViewScreen }    from './features/sites/tabs/RackViewScreen';
import { CableMapScreen }    from './features/sites/tabs/CableMapScreen';
import { TopologyScreen }    from './features/sites/tabs/TopologyScreen';
import { StorageScreen }     from './features/sites/tabs/StorageScreen';
import { OsStackScreen }     from './features/sites/tabs/OsStackScreen';
import { IpPlanScreen }      from './features/sites/tabs/IpPlanScreen';
import { GuidesScreen }      from './features/sites/tabs/GuidesScreen';
import { DeviceLibScreen }   from './features/sites/tabs/DeviceLibScreen';
import { TicketsScreen }     from './features/sites/tabs/TicketsScreen';
import { UsersScreen }       from './features/sites/tabs/UsersScreen';
import { RackSetupScreen }   from './features/sites/tabs/RackSetupScreen';
import { SiteOptionsScreen } from './features/sites/tabs/SiteOptionsScreen';
import { BlueprintScreen }   from './features/sites/tabs/BlueprintScreen';
import { LedgerScreen }      from './features/sites/tabs/LedgerScreen';
import { MonitorScreen }     from './features/sites/tabs/MonitorScreen';
import type { User, Site }   from '@werkstack/shared';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// ── Theme root — injects all CSS custom properties from the active theme mode
function ThemeRoot({ children }: { children: React.ReactNode }) {
  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];
  const vars    = themeToVars(th);

  return (
    <div style={vars as unknown as React.CSSProperties} id="theme-root">
      {children}
    </div>
  );
}

// ── Auth hydration — fires once on mount to restore session from httpOnly cookie
function AuthHydrator() {
  const setUser     = useAuthStore(s => s.setUser);
  const setHydrated = useAuthStore(s => s.setHydrated);
  const setSites    = useSiteStore(s => s.setSites);

  useEffect(() => {
    async function hydrate() {
      try {
        const res = await api.get<{ user: User; sites: Site[] }>('/api/auth/me');
        setUser(res.user);
        if (res.sites) setSites(res.sites);
      } catch {
        setUser(null);
      } finally {
        setHydrated(true);
      }
    }
    hydrate();
  }, [setUser, setHydrated, setSites]);

  return null;
}

// ── Types hydration — fetches all org + built-in types whenever a user session
//    becomes active. Resets the store when the user logs out.
function TypesHydrator() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const setAll = useTypesStore(s => s.setAll);
  const reset  = useTypesStore(s => s.reset);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    api.get<TypesData>('/api/types').then(setAll).catch(() => {
      // Non-fatal: store retains default empty arrays; screens fall back to
      // frontend/src/constants/defaultTypes.ts as needed.
    });
  }, [userId, setAll, reset]);

  return null;
}

// ── Templates hydration — fetches device + PCIe templates when user session is active.
function TemplatesHydrator() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const setAll = useTemplateStore(s => s.setAll);
  const reset  = useTemplateStore(s => s.reset);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    Promise.all([
      api.get<DeviceTemplate[]>('/api/templates/devices'),
      api.get<PcieTemplate[]>('/api/templates/pcie'),
    ]).then(([d, p]) => setAll(d, p)).catch(() => {
      // Non-fatal: store retains empty arrays
    });
  }, [userId, setAll, reset]);

  return null;
}

// ── Racks + Devices hydration — fetches per-site racks and device instances.
function RacksHydrator() {
  const userId     = useAuthStore(s => s.user?.id ?? null);
  const activeSite = useSiteStore(s => s.activeSiteId);
  const setAll     = useRackStore(s => s.setAll);
  const reset      = useRackStore(s => s.reset);

  useEffect(() => {
    if (!userId || !activeSite) {
      reset();
      return;
    }
    Promise.all([
      api.get<Rack[]>(`/api/sites/${activeSite}/racks`),
      api.get<DeviceInstance[]>(`/api/sites/${activeSite}/devices`),
      api.get<Connection[]>(`/api/sites/${activeSite}/connections`),
      api.get<Drive[]>(`/api/sites/${activeSite}/drives`),
    ]).then(([r, d, c, dr]) => setAll(r, d, c, dr)).catch(() => {
      // Non-fatal: store retains empty arrays
    });
  }, [userId, activeSite, setAll, reset]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeRoot>
          <AuthHydrator />
          <TypesHydrator />
          <TemplatesHydrator />
          <RacksHydrator />
          <Routes>
            {/* ── Public auth routes ─────────────────────────────────────── */}
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* ── Protected: landing — site picker ──────────────────────── */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <LandingPage />
                </RequireAuth>
              }
            />

            {/* ── Protected: site redirect ───────────────────────────────── */}
            <Route
              path="/sites/:siteId"
              element={
                <RequireAuth>
                  <Navigate to="overview" replace />
                </RequireAuth>
              }
            />

            {/* ── Protected: site shell — all 13 pages as nested routes ──── */}
            <Route
              path="/sites/:siteId/*"
              element={
                <RequireAuth>
                  <SiteShell />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview"     element={<OverviewScreen />} />
              <Route path="rack_view"    element={<RackViewScreen />} />
              <Route path="cable_map"    element={<CableMapScreen />} />
              <Route path="topology"     element={<TopologyScreen />} />
              <Route path="storage"      element={<StorageScreen />} />
              <Route path="os_stack"     element={<OsStackScreen />} />
              <Route path="ip_plan"      element={<IpPlanScreen />} />
              <Route path="guides"       element={<GuidesScreen />} />
              <Route path="device_lib"   element={<DeviceLibScreen />} />
              <Route path="tickets"      element={<TicketsScreen />} />
              <Route path="users"        element={<UsersScreen />} />
              <Route path="rack_setup"   element={<RackSetupScreen />} />
              <Route path="blueprints"   element={<BlueprintScreen />} />
              <Route path="ledger"       element={<LedgerScreen />} />
              <Route path="monitor"      element={<MonitorScreen />} />
              <Route path="site_options" element={<SiteOptionsScreen />} />
            </Route>

            {/* ── Catch-all ──────────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ThemeRoot>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
