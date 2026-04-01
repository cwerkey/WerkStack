import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import type { LayoutItem as GlItem, EventCallback } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useSiteStore } from '@/stores/siteStore';
import {
  useGetDashboardSummary,
  useGetDashboardWidgetData,
  useGetDashboardLayout,
  useSaveDashboardLayout,
  type LayoutItem,
} from '@/api/dashboard';
import { DeviceListWidget } from './widgets/DeviceListWidget';
import { NetworkWidget }    from './widgets/NetworkWidget';
import { StorageWidget }    from './widgets/StorageWidget';
import { ActivityWidget }   from './widgets/ActivityWidget';

const DEFAULT_LAYOUT: LayoutItem[] = [
  { widgetKey: 'device-list', x: 0, y: 0, w: 6, h: 4, visible: true },
  { widgetKey: 'network',     x: 6, y: 0, w: 6, h: 4, visible: true },
  { widgetKey: 'storage',     x: 0, y: 4, w: 6, h: 4, visible: true },
  { widgetKey: 'activity',    x: 6, y: 4, w: 6, h: 4, visible: true },
];

function toGlLayout(items: LayoutItem[]): GlItem[] {
  return items.map(it => ({ i: it.widgetKey, x: it.x, y: it.y, w: it.w, h: it.h }));
}

function fromGlLayout(items: readonly GlItem[], prevItems: LayoutItem[]): LayoutItem[] {
  return [...items].map(gl => {
    const prev = prevItems.find(p => p.widgetKey === gl.i);
    return { widgetKey: gl.i, x: gl.x, y: gl.y, w: gl.w, h: gl.h, visible: prev?.visible ?? true };
  });
}

interface StatCardProps {
  label:    string;
  value:    number | string;
  onClick?: () => void;
  alert?:   boolean;
}

function StatCard({ label, value, onClick, alert }: StatCardProps) {
  const isAlert = alert && Number(value) > 0;
  return (
    <button
      onClick={onClick}
      style={{
        flex: '1 1 100px',
        minWidth: 90,
        background: isAlert ? 'var(--color-error-tint)' : 'var(--color-surface)',
        border: `1px solid ${isAlert ? 'var(--color-error)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      className={onClick ? 'stat-card-btn' : undefined}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: isAlert ? 'var(--color-error)' : 'var(--color-text)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
    </button>
  );
}

interface WidgetCardProps {
  title:    string;
  children: React.ReactNode;
  loading?: boolean;
}

function WidgetCard({ title, children, loading }: WidgetCardProps) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      <div
        className="widget-drag-handle"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'grab',
          userSelect: 'none',
          background: 'var(--color-surface-2)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-dim)', marginRight: 2 }}>⠿</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        {loading && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-dim)' }}>loading…</span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const navigate    = useNavigate();
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId      = currentSite?.id ?? '';

  const summaryQ   = useGetDashboardSummary(siteId);
  const widgetsQ   = useGetDashboardWidgetData(siteId);
  const layoutQ    = useGetDashboardLayout(siteId);
  const saveLayout = useSaveDashboardLayout(siteId);

  const [glLayout, setGlLayout]     = useState<GlItem[]>(toGlLayout(DEFAULT_LAYOUT));
  const [savedItems, setSavedItems] = useState<LayoutItem[]>(DEFAULT_LAYOUT);

  const { containerRef, width, mounted } = useContainerWidth();

  useEffect(() => {
    if (layoutQ.data) {
      setGlLayout(toGlLayout(layoutQ.data));
      setSavedItems(layoutQ.data);
    }
  }, [layoutQ.data]);

  const handleLayoutChange = useCallback((newLayout: readonly GlItem[]) => {
    setGlLayout([...newLayout]);
  }, []);

  const handleLayoutStop: EventCallback = useCallback((newLayout) => {
    const items = fromGlLayout(newLayout, savedItems);
    setSavedItems(items);
    saveLayout.mutate(items);
  }, [savedItems, saveLayout]);

  function handleReset() {
    setGlLayout(toGlLayout(DEFAULT_LAYOUT));
    setSavedItems(DEFAULT_LAYOUT);
    saveLayout.mutate(DEFAULT_LAYOUT);
  }

  const s     = summaryQ.data;
  const wData = widgetsQ.data;

  if (!currentSite) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-muted)', fontSize: 13 }}>
        Select a site to view the dashboard.
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100%', background: 'var(--color-bg)' }}>
      <style>{`
        .stat-card-btn:hover { border-color: var(--color-accent) !important; }
        .device-row:hover  { background: var(--color-hover) !important; }
        .network-row:hover { background: var(--color-hover) !important; }
        .storage-row:hover { background: var(--color-hover) !important; }
        .activity-row:hover { background: var(--color-hover) !important; }
        .widget-drag-handle:active { cursor: grabbing !important; }
        .reset-btn:hover { background: var(--color-surface-2) !important; border-color: var(--color-border-2) !important; }
        .react-grid-item.react-grid-placeholder {
          background: var(--color-accent-tint) !important;
          border-radius: var(--radius-md) !important;
          opacity: 0.6 !important;
        }
        .react-resizable-handle { opacity: 0.3; }
        .react-resizable-handle:hover { opacity: 0.8; }
      `}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Overview</h1>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{currentSite.name}</div>
        </div>
        <button
          className="reset-btn"
          onClick={handleReset}
          style={{
            fontSize: 11,
            padding: '6px 12px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Reset Layout
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Devices"  value={s?.totalDevices ?? '—'} onClick={() => navigate('/infrastructure/devices')} />
        <StatCard label="Racks"    value={s?.rackCount    ?? '—'} onClick={() => navigate('/infrastructure/rack')} />
        <StatCard label="Watts"    value={s?.powerWatts   ?? '—'} />
        <StatCard label="Drives"   value={s?.driveCount   ?? '—'} onClick={() => navigate('/storage/disks')} />
        <StatCard label="Subnets"  value={s?.subnetCount  ?? '—'} onClick={() => navigate('/network/subnets')} />
        <StatCard label="Alerts"   value={s?.alertCount   ?? '—'} onClick={() => navigate('/activity')} alert />
      </div>

      {/* Widget grid */}
      <div ref={containerRef as React.RefObject<HTMLDivElement>}>
        {mounted && (
          <GridLayout
            width={width}
            layout={glLayout}
            gridConfig={{ cols: 12, rowHeight: 72, margin: [12, 12], containerPadding: [0, 0] }}
            dragConfig={{ handle: '.widget-drag-handle' }}
            onLayoutChange={handleLayoutChange}
            onDragStop={handleLayoutStop}
            onResizeStop={handleLayoutStop}
          >
            <div key="device-list">
              <WidgetCard title="Device List" loading={widgetsQ.isLoading}>
                <DeviceListWidget devices={wData?.devices ?? []} />
              </WidgetCard>
            </div>
            <div key="network">
              <WidgetCard title="Network" loading={widgetsQ.isLoading}>
                <NetworkWidget subnets={wData?.subnets ?? []} vlanCount={wData?.vlanCount ?? 0} />
              </WidgetCard>
            </div>
            <div key="storage">
              <WidgetCard title="Storage" loading={widgetsQ.isLoading}>
                <StorageWidget pools={wData?.pools ?? []} driveCount={wData?.driveCount ?? 0} />
              </WidgetCard>
            </div>
            <div key="activity">
              <WidgetCard title="Recent Activity" loading={widgetsQ.isLoading}>
                <ActivityWidget activity={wData?.activity ?? []} />
              </WidgetCard>
            </div>
          </GridLayout>
        )}
      </div>
    </div>
  );
}
