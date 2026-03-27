import { useState, useEffect } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { ErrorBoundary } from '../../../../components/ui/ErrorBoundary';
import { GridEditor } from './GridEditor';
import { BlockPalette } from './BlockPalette';
import { api } from '../../../../utils/api';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import type { DeviceTemplate, PlacedBlock, GridLayout, FormFactor, BlockDef } from '@werkstack/shared';
import { DEFAULT_DEVICE_TYPES } from '@werkstack/shared';

interface TemplateWizardProps {
  open:       boolean;
  onClose:    () => void;
  initial?:   DeviceTemplate | null;
  accent:     string;
}

type Step = 'info' | 'editor';

const FORM_FACTORS: { value: FormFactor; label: string }[] = [
  { value: 'rack',       label: 'Rack-Mount' },
  { value: 'desktop',    label: 'Desktop' },
  { value: 'wall-mount', label: 'Wall-Mount' },
];

interface InfoForm {
  make:       string;
  model:      string;
  category:   string;
  formFactor: FormFactor;
  uHeight:    number;
  gridCols:   number;
  gridRows:   number;
  wattageMax: string;
  isShelf:    boolean;
}

function blankInfo(): InfoForm {
  return {
    make: '', model: '', category: 'dt-server',
    formFactor: 'rack', uHeight: 1, gridCols: 96, gridRows: 12,
    wattageMax: '', isShelf: false,
  };
}

export function TemplateWizard({ open, onClose, initial, accent }: TemplateWizardProps) {
  const [step, setStep] = useState<Step>('info');
  const [info, setInfo] = useState<InfoForm>(blankInfo());
  const [layout, setLayout] = useState<GridLayout>({ front: [], rear: [] });
  const [panel, setPanel] = useState<'front' | 'rear'>('front');
  const [activeTool, setActiveTool] = useState<BlockDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingPreset, setPendingPreset] = useState<PlacedBlock[] | null>(null);

  const upsertDeviceTemplate = useTemplateStore(s => s.upsertDeviceTemplate);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setInfo({
        make: initial.make,
        model: initial.model,
        category: initial.category,
        formFactor: initial.formFactor,
        uHeight: initial.uHeight,
        gridCols: initial.gridCols ?? 96,
        gridRows: initial.gridRows ?? initial.uHeight * 12,
        wattageMax: initial.wattageMax ? String(initial.wattageMax) : '',
        isShelf: initial.isShelf,
      });
      setLayout(initial.layout);
    } else {
      setInfo(blankInfo());
      setLayout({ front: [], rear: [] });
    }
    setStep('info');
    setPanel('front');
    setActiveTool(null);
    setError('');
    setSaving(false);
  }, [open, initial]);

  // For rack form factor, recalculate grid based on uHeight (unless shelf mode with custom grid)
  useEffect(() => {
    if (info.formFactor === 'rack' && !info.isShelf) {
      setInfo(prev => ({ ...prev, gridCols: 96, gridRows: prev.uHeight * 12 }));
    }
  }, [info.formFactor, info.uHeight, info.isShelf]);

  if (!open) return null;

  const setField = <K extends keyof InfoForm>(k: K, v: InfoForm[K]) =>
    setInfo(prev => ({ ...prev, [k]: v }));

  const canProceed = info.make.trim() && info.model.trim() && info.category.trim() && info.uHeight >= 1;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        make:       info.make.trim(),
        model:      info.model.trim(),
        category:   info.category.trim(),
        formFactor: info.formFactor,
        uHeight:    info.uHeight,
        gridCols:   (info.formFactor !== 'rack' || info.isShelf) ? info.gridCols : undefined,
        gridRows:   (info.formFactor !== 'rack' || info.isShelf) ? info.gridRows : undefined,
        wattageMax: info.wattageMax ? Number(info.wattageMax) : undefined,
        layout,
        isShelf:    info.isShelf,
      };

      let result: DeviceTemplate;
      if (initial) {
        result = await api.patch<DeviceTemplate>(`/api/templates/devices/${initial.id}`, payload);
      } else {
        result = await api.post<DeviceTemplate>('/api/templates/devices', payload);
      }
      upsertDeviceTemplate(result);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const effectiveCols = info.formFactor === 'rack' && !info.isShelf ? 96 : info.gridCols;
  const effectiveRows = info.formFactor === 'rack' && !info.isShelf ? info.uHeight * 12 : info.gridRows;

  const currentBlocks = panel === 'front' ? layout.front : layout.rear;
  const setCurrentBlocks = (blocks: PlacedBlock[]) => {
    setLayout(prev => ({ ...prev, [panel]: blocks }));
  };

  // Check if preset blocks conflict with existing blocks
  const hasPresetConflicts = (presetBlocks: PlacedBlock[]) => {
    for (const pb of presetBlocks) {
      const bw = pb.rotated ? pb.h : pb.w;
      const bh = pb.rotated ? pb.w : pb.h;
      for (const existing of currentBlocks) {
        const ew = existing.rotated ? existing.h : existing.w;
        const eh = existing.rotated ? existing.w : existing.h;
        if (pb.col < existing.col + ew && pb.col + bw > existing.col &&
            pb.row < existing.row + eh && pb.row + bh > existing.row) {
          return true;
        }
      }
    }
    return false;
  };

  const handleApplyPreset = (presetBlocks: PlacedBlock[]) => {
    if (currentBlocks.length > 0 && hasPresetConflicts(presetBlocks)) {
      setPendingPreset(presetBlocks);
    } else {
      // No conflicts — just add to existing blocks
      setCurrentBlocks([...currentBlocks, ...presetBlocks]);
    }
  };

  const handleConflictResolve = (mode: 'replace' | 'fill' | 'cancel') => {
    if (!pendingPreset) return;
    if (mode === 'cancel') {
      setPendingPreset(null);
      return;
    }
    if (mode === 'replace') {
      setCurrentBlocks(pendingPreset);
    } else {
      // Fill around — only add blocks that don't conflict
      const safe = pendingPreset.filter(pb => {
        const bw = pb.rotated ? pb.h : pb.w;
        const bh = pb.rotated ? pb.w : pb.h;
        return !currentBlocks.some(existing => {
          const ew = existing.rotated ? existing.h : existing.w;
          const eh = existing.rotated ? existing.w : existing.h;
          return pb.col < existing.col + ew && pb.col + bw > existing.col &&
                 pb.row < existing.row + eh && pb.row + bh > existing.row;
        });
      });
      setCurrentBlocks([...currentBlocks, ...safe]);
    }
    setPendingPreset(null);
  };

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-panel" style={{ width: step === 'editor' ? 'calc(100vw - 80px)' : 600, maxWidth: step === 'editor' ? 'none' : 'calc(100vw - 32px)' }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--border, #1d2022)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
            fontWeight: 700, color: accent,
          }}>
            {initial ? 'Edit Template' : 'New Device Template'}
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            <Icon name="x" size={12} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ padding: '12px 18px 0' }}>
          <div className="wizard-step-indicator">
            <div className={`wizard-step ${step === 'info' ? 'active' : 'done'}`}>
              <div className="wizard-step-num">1</div>
              <div className="wizard-step-label">Info</div>
              {<div className="wizard-step-line" />}
            </div>
            <div className={`wizard-step ${step === 'editor' ? 'active' : 'pending'}`}>
              <div className="wizard-step-num">2</div>
              <div className="wizard-step-label">Layout</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 18px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 'info' && (
            <>
              <div className="wiz-grid2">
                <div className="wiz-field">
                  <label className="wiz-label">Make / Manufacturer</label>
                  <input className="wiz-input" value={info.make} onChange={e => setField('make', e.target.value)} placeholder="Dell, Supermicro..." />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Model</label>
                  <input className="wiz-input" value={info.model} onChange={e => setField('model', e.target.value)} placeholder="R730xd, X11SSH..." />
                </div>
              </div>
              <div className="wiz-grid2">
                <div className="wiz-field">
                  <label className="wiz-label">Category</label>
                  <select
                    className="wiz-input"
                    value={info.category}
                    onChange={e => setField('category', e.target.value)}
                  >
                    {DEFAULT_DEVICE_TYPES.map(dt => (
                      <option key={dt.id} value={dt.id}>{dt.name}</option>
                    ))}
                  </select>
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Form Factor</label>
                  <select
                    className="wiz-input"
                    value={info.formFactor}
                    onChange={e => setField('formFactor', e.target.value as FormFactor)}
                  >
                    {FORM_FACTORS.map(ff => (
                      <option key={ff.value} value={ff.value}>{ff.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="wiz-grid3">
                <div className="wiz-field">
                  <label className="wiz-label">{info.formFactor === 'rack' ? 'U Height' : 'Grid Cols'}</label>
                  {info.formFactor === 'rack' ? (
                    <input className="wiz-input" type="number" min={1} max={48} value={info.uHeight} onChange={e => setField('uHeight', Math.max(1, parseInt(e.target.value) || 1))} />
                  ) : (
                    <input className="wiz-input" type="number" min={1} max={200} value={info.gridCols} onChange={e => setField('gridCols', Math.max(1, parseInt(e.target.value) || 1))} />
                  )}
                </div>
                {info.formFactor !== 'rack' && (
                  <div className="wiz-field">
                    <label className="wiz-label">Grid Rows</label>
                    <input className="wiz-input" type="number" min={1} max={200} value={info.gridRows} onChange={e => setField('gridRows', Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                )}
                <div className="wiz-field">
                  <label className="wiz-label">Max Wattage (optional)</label>
                  <input className="wiz-input" type="number" min={0} value={info.wattageMax} onChange={e => setField('wattageMax', e.target.value)} placeholder="—" />
                </div>
              </div>
            </>
          )}

          {step === 'editor' && (
            <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
              <BlockPalette
                activeTool={activeTool}
                onSelect={d => setActiveTool(activeTool?.type === d.type ? null : d)}
                panelFilter={panel}
                gridCols={effectiveCols}
                gridRows={effectiveRows}
                onApplyPreset={handleApplyPreset}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                {/* Panel toggle */}
                <div className="view-toggle">
                  <button
                    className={`view-toggle-btn${panel === 'front' ? ' on' : ''}`}
                    onClick={() => { setPanel('front'); setActiveTool(null); }}
                  >
                    Front
                  </button>
                  <button
                    className={`view-toggle-btn${panel === 'rear' ? ' on' : ''}`}
                    onClick={() => { setPanel('rear'); setActiveTool(null); }}
                  >
                    Rear
                  </button>
                </div>
                <ErrorBoundary>
                  <GridEditor
                    blocks={currentBlocks}
                    gridCols={effectiveCols}
                    gridRows={effectiveRows}
                    onChange={setCurrentBlocks}
                    activeTool={activeTool}
                    onClearTool={() => setActiveTool(null)}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '0 18px 8px',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--red, #c07070)',
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '11px 18px',
          borderTop: '1px solid var(--border2, #262c30)',
          display: 'flex', justifyContent: 'space-between', gap: 8,
          flexShrink: 0,
        }}>
          <div>
            {step === 'editor' && (
              <button className="btn-ghost" onClick={() => setStep('info')}>Back</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            {step === 'info' && (
              <button
                className="act-primary"
                disabled={!canProceed}
                onClick={() => setStep('editor')}
                style={{ opacity: canProceed ? 1 : 0.5 }}
              >
                Next
              </button>
            )}
            {step === 'editor' && (
              <button
                className="act-primary"
                disabled={saving}
                onClick={handleSave}
                style={{ opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : (initial ? 'Save' : 'Create')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conflict resolution dialog */}
      {pendingPreset && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }}>
          <div style={{
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 8,
            padding: '20px 24px',
            minWidth: 360,
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #d4d9dd)', marginBottom: 8 }}>
              Placement Conflict
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2, #8a9299)', marginBottom: 16, lineHeight: 1.5 }}>
              The preset overlaps with existing blocks. How would you like to proceed?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => handleConflictResolve('cancel')}>
                Cancel
              </button>
              <button className="btn-ghost" onClick={() => handleConflictResolve('fill')}
                style={{ borderColor: 'var(--accent, #c47c5a)', color: 'var(--accent, #c47c5a)' }}>
                Fill Around
              </button>
              <button className="act-primary" onClick={() => handleConflictResolve('replace')}>
                Replace All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
