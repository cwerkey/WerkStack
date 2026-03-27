import { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { SiteCtx } from '../../SiteShell';
import { Icon } from '../../../components/ui/Icon';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBoundary } from '../../../components/ui/ErrorBoundary';
import { TemplateOverlay } from '../../../components/ui/TemplateOverlay';
import { TemplateWizard } from './device_lib/TemplateWizard';
import { PcieWizard } from './device_lib/PcieWizard';
import { DeployModal } from './device_lib/DeployModal';
import { ExportModal, ImportModal } from './device_lib/ImportExportModal';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useTypesStore } from '../../../store/useTypesStore';
import { api } from '../../../utils/api';
import type { DeviceTemplate, PcieTemplate } from '@werkstack/shared';

type Tab = 'active' | 'shelf' | 'device_temps' | 'pcie_temps';

const TABS: { key: Tab; label: string }[] = [
  { key: 'active',       label: 'Active' },
  { key: 'shelf',        label: 'Shelf' },
  { key: 'device_temps', label: 'Templates' },
  { key: 'pcie_temps',   label: 'PCIe Cards' },
];

const PCIE_FF_GRID: Record<string, { cols: number; rows: number }> = {
  fh: { cols: 32, rows: 10 },
  lp: { cols: 32, rows: 6 },
  dw: { cols: 32, rows: 20 },
};

export function DeviceLibScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const [tab, setTab] = useState<Tab>('device_temps');

  // Device template state
  const deviceTemplates = useTemplateStore(s => s.deviceTemplates);
  const pcieTemplates   = useTemplateStore(s => s.pcieTemplates);
  const deviceTypes     = useTypesStore(s => s.deviceTypes);

  // Wizard state
  const [wizOpen, setWizOpen]         = useState(false);
  const [wizEdit, setWizEdit]         = useState<DeviceTemplate | null>(null);
  const [pcieOpen, setPcieOpen]       = useState(false);
  const [pcieEdit, setPcieEdit]       = useState<PcieTemplate | null>(null);
  const [deployOpen, setDeployOpen]   = useState(false);
  const [deployTpl, setDeployTpl]     = useState<DeviceTemplate | null>(null);
  const [exportOpen, setExportOpen]   = useState(false);
  const [exportTpl, setExportTpl]     = useState<DeviceTemplate | null>(null);
  const [importOpen, setImportOpen]   = useState(false);

  // Type filter
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);

  const handleDeleteDevice = useCallback(async (t: DeviceTemplate) => {
    if (!confirm(`Delete template "${t.make} ${t.model}"?`)) return;
    try {
      await api.delete(`/api/templates/devices/${t.id}`);
      useTemplateStore.getState().removeDeviceTemplate(t.id);
    } catch (err) {
      console.error('[delete template]', err);
    }
  }, []);

  const handleDeletePcie = useCallback(async (t: PcieTemplate) => {
    if (!confirm(`Delete PCIe template "${t.make} ${t.model}"?`)) return;
    try {
      await api.delete(`/api/templates/pcie/${t.id}`);
      useTemplateStore.getState().removePcieTemplate(t.id);
    } catch (err) {
      console.error('[delete pcie template]', err);
    }
  }, []);

  // Filter device templates by type
  const filteredDevices = deviceTemplates.filter(t =>
    typeFilter === null || typeFilter.has(t.category)
  );

  // Get device type display info
  const getTypeColor = (catId: string) => {
    const dt = deviceTypes.find(t => t.id === catId);
    return dt?.color ?? 'var(--text3, #4e5560)';
  };
  const getTypeName = (catId: string) => {
    const dt = deviceTypes.find(t => t.id === catId);
    return dt?.name ?? catId;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .btn-outline:hover { background: var(--accent-tint-s, #c47c5a18) !important; color: #d4906a !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .tpill:hover { filter: brightness(1.2); }
        .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
        .tmpl-card:hover { border-color: var(--border3, #2e3538) !important; }
        .confirm-danger-btn:hover { filter: brightness(1.1) !important; }
      `}</style>

      {/* Tab bar + actions */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        padding: '12px 14px 0',
        borderBottom: '2px solid var(--border, #1d2022)',
      }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <div
              key={t.key}
              className={`tab-wrap${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <button className="tab-btn-inner">{t.label}</button>
              <div className="tab-line" />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 6 }}>
          {tab === 'device_temps' && (
            <>
              <button className="btn-ghost" onClick={() => setImportOpen(true)}>
                <Icon name="upload" size={11} /> Import
              </button>
              <button className="act-primary" onClick={() => { setWizEdit(null); setWizOpen(true); }}>
                <Icon name="plus" size={11} /> New Template
              </button>
            </>
          )}
          {tab === 'pcie_temps' && (
            <button className="act-primary" onClick={() => { setPcieEdit(null); setPcieOpen(true); }}>
              <Icon name="plus" size={11} /> New PCIe Card
            </button>
          )}
        </div>
      </div>

      {/* Type filter pills (device_temps only) */}
      {tab === 'device_temps' && deviceTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="filter-label">type</span>
          <div className="filter-div" />
          <button
            className={`rpill${typeFilter === null ? ' on' : ''}`}
            onClick={() => setTypeFilter(typeFilter === null ? new Set() : null)}
          >
            all
          </button>
          {deviceTypes.map(dt => {
            const isOn = typeFilter === null || typeFilter.has(dt.id);
            return (
              <button
                key={dt.id}
                className={`tpill${isOn ? ' on' : ''}`}
                style={{
                  background: isOn ? dt.color : undefined,
                  color: isOn ? '#0c0d0e' : dt.color,
                  borderColor: isOn ? dt.color : 'transparent',
                }}
                onClick={() => {
                  if (typeFilter === null) {
                    // was "all" → select all minus this one
                    const allIds = new Set(deviceTypes.map(t => t.id));
                    allIds.delete(dt.id);
                    setTypeFilter(allIds);
                  } else {
                    const next = new Set(typeFilter);
                    if (next.has(dt.id)) next.delete(dt.id); else next.add(dt.id);
                    // If all re-selected, collapse to null
                    if (next.size === deviceTypes.length) setTypeFilter(null);
                    else setTypeFilter(next);
                  }
                }}
              >
                {dt.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* ── Active tab (stub) ──────────────────────────────────── */}
        {tab === 'active' && (
          <EmptyState
            icon="server"
            title="no active devices"
            subtitle="Deploy a device template to create active device instances. Rack placement comes in Phase 6."
          />
        )}

        {/* ── Shelf tab (stub) ───────────────────────────────────── */}
        {tab === 'shelf' && (
          <EmptyState
            icon="box"
            title="shelf is empty"
            subtitle="Shelved devices appear here when they are not assigned to a rack."
          />
        )}

        {/* ── Device Templates ───────────────────────────────────── */}
        {tab === 'device_temps' && (
          filteredDevices.length === 0 ? (
            <EmptyState
              icon="layers"
              title="no device templates"
              subtitle="Create a template to define the physical layout of a server, switch, NAS, or other device."
              action={
                <button className="act-primary" onClick={() => { setWizEdit(null); setWizOpen(true); }}>
                  <Icon name="plus" size={11} /> New Template
                </button>
              }
            />
          ) : (
            <div className="tmpl-grid">
              {filteredDevices.map(t => (
                <div key={t.id} className="tmpl-card">
                  {/* Mini preview */}
                  <div style={{ marginBottom: 8 }}>
                    <ErrorBoundary>
                      <TemplateOverlay
                        blocks={t.layout.front}
                        gridCols={t.formFactor === 'rack' ? 96 : (t.gridCols ?? 96)}
                        gridRows={t.formFactor === 'rack' ? t.uHeight * 12 : (t.gridRows ?? 12)}
                        width={210}
                        showLabels={false}
                      />
                    </ErrorBoundary>
                  </div>

                  {/* Info */}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    fontWeight: 700, color: 'var(--text, #d4d9dd)',
                    marginBottom: 2,
                  }}>
                    {t.make} {t.model}
                  </div>
                  <div style={{
                    display: 'flex', gap: 6, alignItems: 'center',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--text3, #4e5560)', marginBottom: 6,
                  }}>
                    <span className="badge" style={{
                      background: getTypeColor(t.category) + '22',
                      color: getTypeColor(t.category),
                    }}>
                      {getTypeName(t.category)}
                    </span>
                    <span>{t.formFactor}</span>
                    <span>{t.uHeight}U</span>
                    <span>{t.layout.front.length + t.layout.rear.length} blocks</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setDeployTpl(t); setDeployOpen(true); }}>
                      <Icon name="zap" size={10} /> Deploy
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setWizEdit(t); setWizOpen(true); }}>
                      <Icon name="edit" size={10} /> Edit
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setExportTpl(t); setExportOpen(true); }}>
                      <Icon name="download" size={10} /> Export
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red, #c07070)' }} onClick={() => handleDeleteDevice(t)}>
                      <Icon name="trash" size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── PCIe Templates ─────────────────────────────────────── */}
        {tab === 'pcie_temps' && (
          pcieTemplates.length === 0 ? (
            <EmptyState
              icon="cpu"
              title="no PCIe card templates"
              subtitle="Create templates for network cards, HBAs, GPUs, and other PCIe devices."
              action={
                <button className="act-primary" onClick={() => { setPcieEdit(null); setPcieOpen(true); }}>
                  <Icon name="plus" size={11} /> New PCIe Card
                </button>
              }
            />
          ) : (
            <div className="tmpl-grid">
              {pcieTemplates.map(t => {
                const grid = PCIE_FF_GRID[t.formFactor] ?? { cols: 32, rows: 10 };
                return (
                  <div key={t.id} className="tmpl-card">
                    {/* Mini preview */}
                    <div style={{ marginBottom: 8 }}>
                      <ErrorBoundary>
                        <TemplateOverlay
                          blocks={t.layout.rear}
                          gridCols={grid.cols}
                          gridRows={grid.rows}
                          width={210}
                          showLabels={false}
                        />
                      </ErrorBoundary>
                    </div>

                    {/* Info */}
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      fontWeight: 700, color: 'var(--text, #d4d9dd)',
                      marginBottom: 2,
                    }}>
                      {t.make} {t.model}
                    </div>
                    <div style={{
                      display: 'flex', gap: 6, alignItems: 'center',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      color: 'var(--text3, #4e5560)', marginBottom: 6,
                    }}>
                      <span className="badge" style={{ background: 'var(--blue, #7090b8)22', color: 'var(--blue, #7090b8)' }}>
                        PCIe {t.busSize}
                      </span>
                      <span>{t.formFactor === 'fh' ? 'Full-Height' : 'Half-Height'}</span>
                      <span>{t.layout.rear.length} ports</span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setPcieEdit(t); setPcieOpen(true); }}>
                        <Icon name="edit" size={10} /> Edit
                      </button>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red, #c07070)' }} onClick={() => handleDeletePcie(t)}>
                        <Icon name="trash" size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Modals */}
      <TemplateWizard
        open={wizOpen}
        onClose={() => setWizOpen(false)}
        initial={wizEdit}
        accent={accent}
      />
      <PcieWizard
        open={pcieOpen}
        onClose={() => setPcieOpen(false)}
        initial={pcieEdit}
        accent={accent}
      />
      <DeployModal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        template={deployTpl}
        accent={accent}
        siteId={site?.id ?? ''}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        template={exportTpl}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}
