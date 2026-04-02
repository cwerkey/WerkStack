import { useState, useEffect } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { ErrorBoundary } from '../../../../components/ui/ErrorBoundary';
import { GridEditor } from './GridEditor';
import { BlockPalette } from './BlockPalette';
import { api } from '../../../../utils/api';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import type { PcieTemplate, PcieFormFactor, PcieBusSize, PlacedBlock, BlockDef } from '@werkstack/shared';

interface PcieWizardProps {
  open:     boolean;
  onClose:  () => void;
  initial?: PcieTemplate | null;
  accent:   string;
}

type Step = 'info' | 'editor';

const FORM_FACTORS: { value: PcieFormFactor; label: string; cols: number; rows: number }[] = [
  { value: 'fh',    label: 'Full Height',     cols: 5,  rows: 33 },
  { value: 'lp',    label: 'Low Profile',     cols: 5,  rows: 17 },
  { value: 'fh-dw', label: 'Full Height DW',  cols: 11, rows: 33 },
  { value: 'lp-dw', label: 'Low Profile DW',  cols: 11, rows: 17 },
];

const BUS_SIZES: PcieBusSize[] = ['x1', 'x4', 'x8', 'x16'];

interface InfoForm {
  manufacturer: string;
  make:       string;
  model:      string;
  busSize:    PcieBusSize;
  formFactor: PcieFormFactor;
  laneWidth:  number;
  doubleSlot: boolean;
}

function blankInfo(): InfoForm {
  return { manufacturer: '', make: '', model: '', busSize: 'x16', formFactor: 'fh', laneWidth: 1, doubleSlot: false };
}

function getGrid(ff: PcieFormFactor, doubleSlot: boolean): { cols: number; rows: number } {
  const f = FORM_FACTORS.find(x => x.value === ff);
  const cols = f?.cols ?? 4;
  const rows = f?.rows ?? 33;
  return { cols, rows: doubleSlot ? rows * 2 : rows };
}

export function PcieWizard({ open, onClose, initial, accent }: PcieWizardProps) {
  const [step, setStep] = useState<Step>('info');
  const [info, setInfo] = useState<InfoForm>(blankInfo());
  const [blocks, setBlocks] = useState<PlacedBlock[]>([]);
  const [activeTool, setActiveTool] = useState<BlockDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const upsertPcieTemplate = useTemplateStore(s => s.upsertPcieTemplate);
  const [manufacturers, setManufacturers] = useState<string[]>([]);

  useEffect(() => {
    api.get<string[]>('/api/templates/manufacturers').then(setManufacturers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setInfo({
        manufacturer: initial.manufacturer ?? '',
        make: initial.make,
        model: initial.model,
        busSize: initial.busSize,
        formFactor: initial.formFactor,
        laneWidth: initial.laneWidth,
        doubleSlot: (initial as any).doubleSlot ?? false,
      });
      setBlocks(initial.layout.rear);
    } else {
      setInfo(blankInfo());
      setBlocks([]);
    }
    setStep('info');
    setActiveTool(null);
    setError('');
    setSaving(false);
  }, [open, initial]);

  if (!open) return null;

  const setField = <K extends keyof InfoForm>(k: K, v: InfoForm[K]) =>
    setInfo(prev => ({ ...prev, [k]: v }));

  const canProceed = info.make.trim() && info.model.trim();
  const grid = getGrid(info.formFactor, info.doubleSlot);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        manufacturer: info.manufacturer.trim() || undefined,
        make: info.make.trim(),
        model: info.model.trim(),
        busSize: info.busSize,
        formFactor: info.formFactor,
        laneWidth: info.laneWidth,
        doubleSlot: info.doubleSlot,
        layout: { rear: blocks },
      };

      let result: PcieTemplate;
      if (initial) {
        result = await api.patch<PcieTemplate>(`/api/templates/pcie/${initial.id}`, payload);
      } else {
        result = await api.post<PcieTemplate>('/api/templates/pcie', payload);
      }
      upsertPcieTemplate(result);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
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
            {initial ? 'Edit PCIe Template' : 'New PCIe Card Template'}
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
              <div className="wizard-step-line" />
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
              <div className="wiz-grid3">
                <div className="wiz-field">
                  <label className="wiz-label">Manufacturer</label>
                  <input
                    className="wiz-input"
                    list="pcie-mfr-list"
                    value={info.manufacturer}
                    onChange={e => setField('manufacturer', e.target.value)}
                    placeholder="Intel, Mellanox..."
                  />
                  <datalist id="pcie-mfr-list">
                    {manufacturers.map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Make</label>
                  <input className="wiz-input" value={info.make} onChange={e => setField('make', e.target.value)} placeholder="ConnectX, X710..." />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Model</label>
                  <input className="wiz-input" value={info.model} onChange={e => setField('model', e.target.value)} placeholder="DA2, 4Lx EN..." />
                </div>
              </div>
              <div className="wiz-grid3">
                <div className="wiz-field">
                  <label className="wiz-label">Form Factor</label>
                  <select
                    className="wiz-input"
                    value={info.formFactor}
                    onChange={e => setField('formFactor', e.target.value as PcieFormFactor)}
                  >
                    {FORM_FACTORS.map(ff => (
                      <option key={ff.value} value={ff.value}>{ff.label}</option>
                    ))}
                  </select>
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Bus Size</label>
                  <select
                    className="wiz-input"
                    value={info.busSize}
                    onChange={e => setField('busSize', e.target.value as PcieBusSize)}
                  >
                    {BUS_SIZES.map(bs => (
                      <option key={bs} value={bs}>{bs}</option>
                    ))}
                  </select>
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Lane Depth</label>
                  <input className="wiz-input" type="number" min={1} max={4} value={info.laneWidth} onChange={e => setField('laneWidth', Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setField('doubleSlot', !info.doubleSlot)}
                  style={{
                    padding: '5px 14px',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    background: info.doubleSlot ? accent : 'transparent',
                    color: info.doubleSlot ? '#fff' : 'var(--text2, #8a9299)',
                    border: `1px solid ${info.doubleSlot ? accent : 'var(--border2, #262c30)'}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Double Slot
                </button>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                  {info.doubleSlot ? 'card occupies two slot heights' : 'single slot'}
                </span>
              </div>
            </>
          )}

          {step === 'editor' && (
            <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
              <BlockPalette
                activeTool={activeTool}
                onSelect={d => setActiveTool(activeTool?.type === d.type ? null : d)}
                panelFilter="rear"
                gridCols={grid.cols}
                gridRows={grid.rows}
                onApplyPreset={newBlocks => setBlocks(prev => [...prev, ...newBlocks])}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--text3, #4e5560)',
                }}>
                  PCIe Card — Rear Bracket ({grid.cols}×{grid.rows})
                </div>
                <ErrorBoundary>
                  <GridEditor
                    blocks={blocks}
                    gridCols={grid.cols}
                    gridRows={grid.rows}
                    onChange={setBlocks}
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
    </div>
  );
}
