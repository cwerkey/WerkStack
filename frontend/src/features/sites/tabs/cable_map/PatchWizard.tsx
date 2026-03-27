import { useState, useEffect } from 'react';
import { useRackStore }        from '../../../../store/useRackStore';
import { useTypesStore }       from '../../../../store/useTypesStore';
import { useTemplateStore }    from '../../../../store/useTemplateStore';
import { useThemeStore, OS_THEME_TOKENS } from '../../../../store/useThemeStore';
import { api }                 from '../../../../utils/api';
import { BLOCK_DEFS }          from '@werkstack/shared';
import type { Connection, DeviceInstance, DeviceTemplate, PlacedBlock } from '@werkstack/shared';

// ── Medium helpers ────────────────────────────────────────────────────────────
const FIBER_TYPES  = new Set(['sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28']);
const COPPER_TYPES = new Set(['rj45']);

function getPortMedium(blockType: string): string {
  if (FIBER_TYPES.has(blockType))  return 'fiber';
  if (COPPER_TYPES.has(blockType)) return 'copper';
  return 'other';
}

function hasMismatch(a: string, b: string): boolean {
  const ma = getPortMedium(a);
  const mb = getPortMedium(b);
  if (ma === 'other' || mb === 'other') return false;
  return ma !== mb;
}

// ── Port option derived from template blocks ──────────────────────────────────
interface PortOption {
  blockId:   string;
  blockType: string;
  label:     string;
  panel:     'front' | 'rear';
}

function getPortOptions(device: DeviceInstance, templates: DeviceTemplate[]): PortOption[] {
  if (!device.templateId) return [];
  const tpl = templates.find(t => t.id === device.templateId);
  if (!tpl) return [];
  const result: PortOption[] = [];
  const process = (blocks: PlacedBlock[], panel: 'front' | 'rear') => {
    blocks.forEach(b => {
      const def = BLOCK_DEFS.find(d => d.type === b.type);
      if (def && (def.isNet || def.isPort)) {
        result.push({
          blockId:   b.id,
          blockType: b.type,
          label:     b.label ? `${b.label} (${def.label})` : def.label,
          panel,
        });
      }
    });
  };
  process(tpl.layout.front, 'front');
  process(tpl.layout.rear,  'rear');
  return result;
}

// ── Wizard state ──────────────────────────────────────────────────────────────
interface WState {
  step:         1 | 2 | 3 | 4;
  srcDeviceId:  string;
  srcPort:      string;
  srcBlockId:   string;
  srcBlockType: string;
  dstDeviceId:  string;
  dstPort:      string;
  dstBlockId:   string;
  dstBlockType: string;
  cableTypeId:  string;
  label:        string;
  notes:        string;
}

const BLANK: WState = {
  step: 1,
  srcDeviceId: '', srcPort: '', srcBlockId: '', srcBlockType: '',
  dstDeviceId: '', dstPort: '', dstBlockId: '', dstBlockType: '',
  cableTypeId: '', label: '', notes: '',
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  siteId:   string;
  initial?: Connection;
  onSave:   (conn: Connection) => void;
  onClose:  () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PatchWizard({ siteId, initial, onSave, onClose }: Props) {
  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];

  const devices   = useRackStore(s => s.devices);
  const templates = useTemplateStore(s => s.deviceTemplates);
  const cableTypes = useTypesStore(s => s.cableTypes);

  const [w, setW]     = useState<WState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (initial) {
      setW({
        step: 1,
        srcDeviceId:  initial.srcDeviceId,
        srcPort:      initial.srcPort      ?? '',
        srcBlockId:   initial.srcBlockId   ?? '',
        srcBlockType: initial.srcBlockType ?? '',
        dstDeviceId:  initial.dstDeviceId,
        dstPort:      initial.dstPort      ?? '',
        dstBlockId:   initial.dstBlockId   ?? '',
        dstBlockType: initial.dstBlockType ?? '',
        cableTypeId:  initial.cableTypeId  ?? '',
        label:        initial.label        ?? '',
        notes:        initial.notes        ?? '',
      });
    } else {
      setW(BLANK);
    }
    setError('');
  }, [initial]);

  const set = <K extends keyof WState>(k: K, v: WState[K]) => setW(p => ({ ...p, [k]: v }));

  // ── Derived ─────────────────────────────────────────────────────────────────
  const srcDevice   = devices.find(d => d.id === w.srcDeviceId);
  const dstDevice   = devices.find(d => d.id === w.dstDeviceId);
  const srcPorts    = srcDevice ? getPortOptions(srcDevice, templates) : [];
  const dstPorts    = dstDevice ? getPortOptions(dstDevice, templates) : [];
  const srcHasPorts = srcPorts.length > 0;
  const dstHasPorts = dstPorts.length > 0;
  const mismatch    = w.srcBlockType && w.dstBlockType
    ? hasMismatch(w.srcBlockType, w.dstBlockType)
    : false;

  // ── Step validation ──────────────────────────────────────────────────────────
  const step1Valid = !!w.srcDeviceId && (srcHasPorts ? !!w.srcBlockId : !!w.srcPort);
  const step2Valid = !!w.dstDeviceId && w.dstDeviceId !== w.srcDeviceId &&
    (dstHasPorts ? !!w.dstBlockId : !!w.dstPort);
  // ── Port selection handler ───────────────────────────────────────────────────
  function selectSrcPort(opt: PortOption) {
    setW(p => ({ ...p, srcPort: opt.label, srcBlockId: opt.blockId, srcBlockType: opt.blockType }));
  }
  function selectDstPort(opt: PortOption) {
    setW(p => ({ ...p, dstPort: opt.label, dstBlockId: opt.blockId, dstBlockType: opt.blockType }));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const body = {
        srcDeviceId:  w.srcDeviceId,
        srcPort:      w.srcPort      || undefined,
        srcBlockId:   w.srcBlockId   || undefined,
        srcBlockType: w.srcBlockType || undefined,
        dstDeviceId:  w.dstDeviceId,
        dstPort:      w.dstPort      || undefined,
        dstBlockId:   w.dstBlockId   || undefined,
        dstBlockType: w.dstBlockType || undefined,
        cableTypeId:  w.cableTypeId  || undefined,
        label:        w.label        || undefined,
        notes:        w.notes        || undefined,
      };
      const conn = initial?.id
        ? await api.patch<Connection>(`/api/sites/${siteId}/connections/${initial.id}`, body)
        : await api.post<Connection>(`/api/sites/${siteId}/connections`, body);
      onSave(conn);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 4,
    border: `1px solid ${th.border2}`, background: th.inputBg,
    color: th.text, fontFamily: th.fontData, fontSize: 12,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
    marginBottom: 4,
  };

  function PortPicker({ ports, selected, onSelect, textValue, onTextChange, hasTemplate }: {
    ports: PortOption[];
    selected: string;
    onSelect: (opt: PortOption) => void;
    textValue: string;
    onTextChange: (v: string) => void;
    hasTemplate: boolean;
  }) {
    if (!hasTemplate) {
      return (
        <input
          style={inputStyle}
          placeholder="port name (optional)"
          value={textValue}
          onChange={e => onTextChange(e.target.value)}
        />
      );
    }
    return (
      <div style={{
        maxHeight: 160, overflowY: 'auto', border: `1px solid ${th.border2}`,
        borderRadius: 4, background: th.inputBg,
      }}>
        {ports.map(opt => (
          <div
            key={opt.blockId}
            style={{
              padding: '6px 10px', cursor: 'pointer',
              background: selected === opt.blockId ? th.border2 : 'transparent',
              borderBottom: `1px solid ${th.border}`,
              fontFamily: th.fontData, fontSize: 12, color: th.text,
            }}
            onClick={() => onSelect(opt)}
          >
            <span>{opt.label}</span>
            <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginLeft: 8 }}>
              {opt.panel} · {opt.blockType}
            </span>
          </div>
        ))}
        {ports.length === 0 && (
          <div style={{ padding: '8px 10px', fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>
            no ports in template
          </div>
        )}
      </div>
    );
  }

  // ── Steps content ─────────────────────────────────────────────────────────────
  function renderStep() {
    switch (w.step) {
      case 1: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>source device *</label>
            <select
              style={inputStyle}
              value={w.srcDeviceId}
              onChange={e => setW(p => ({ ...p, srcDeviceId: e.target.value, srcPort: '', srcBlockId: '', srcBlockType: '' }))}
            >
              <option value="">— select device —</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {w.srcDeviceId && (
            <div>
              <label style={labelStyle}>source port</label>
              <PortPicker
                ports={srcPorts}
                selected={w.srcBlockId}
                onSelect={selectSrcPort}
                textValue={w.srcPort}
                onTextChange={v => setW(p => ({ ...p, srcPort: v }))}
                hasTemplate={srcHasPorts}
              />
            </div>
          )}
        </div>
      );

      case 2: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>destination device *</label>
            <select
              style={inputStyle}
              value={w.dstDeviceId}
              onChange={e => setW(p => ({ ...p, dstDeviceId: e.target.value, dstPort: '', dstBlockId: '', dstBlockType: '' }))}
            >
              <option value="">— select device —</option>
              {devices.filter(d => d.id !== w.srcDeviceId).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {w.dstDeviceId && (
            <div>
              <label style={labelStyle}>destination port</label>
              <PortPicker
                ports={dstPorts}
                selected={w.dstBlockId}
                onSelect={selectDstPort}
                textValue={w.dstPort}
                onTextChange={v => setW(p => ({ ...p, dstPort: v }))}
                hasTemplate={dstHasPorts}
              />
            </div>
          )}
          {mismatch && (
            <div style={{
              padding: '8px 12px', borderRadius: 4,
              background: `${th.red}22`, border: `1px solid ${th.red}`,
              fontFamily: th.fontLabel, fontSize: 11, color: th.red,
            }}>
              ⚠ medium mismatch: connecting a {getPortMedium(w.srcBlockType)} port to a {getPortMedium(w.dstBlockType)} port
            </div>
          )}
        </div>
      );

      case 3: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={labelStyle}>cable type (optional)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              style={{
                padding: '5px 12px', borderRadius: 999, fontSize: 11,
                fontFamily: th.fontLabel, cursor: 'pointer',
                border: `1px solid ${w.cableTypeId === '' ? '#fff' : th.border2}`,
                background: w.cableTypeId === '' ? th.border2 : 'transparent',
                color: w.cableTypeId === '' ? th.text : th.text3,
              }}
              onClick={() => set('cableTypeId', '')}
            >none</button>
            {cableTypes.map(ct => (
              <button
                key={ct.id}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 11,
                  fontFamily: th.fontLabel, cursor: 'pointer',
                  border: `1px solid ${w.cableTypeId === ct.id ? ct.color : th.border2}`,
                  background: w.cableTypeId === ct.id ? ct.color : 'transparent',
                  color: w.cableTypeId === ct.id ? '#0c0d0e' : th.text2,
                }}
                onClick={() => set('cableTypeId', ct.id)}
              >{ct.name}</button>
            ))}
          </div>
        </div>
      );

      case 4: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary */}
          <div style={{
            padding: '10px 12px', borderRadius: 4, background: th.rowBg,
            border: `1px solid ${th.border2}`, fontFamily: th.fontData, fontSize: 12,
          }}>
            <div style={{ marginBottom: 6, color: th.text }}>
              <span style={{ color: th.text2 }}>{srcDevice?.name ?? '?'}</span>
              {w.srcPort && <span style={{ color: th.text3 }}> : {w.srcPort}</span>}
              <span style={{ color: th.text3, margin: '0 8px' }}>
                {w.cableTypeId ? `— ${cableTypes.find(c => c.id === w.cableTypeId)?.name ?? w.cableTypeId} →` : '——→'}
              </span>
              <span style={{ color: th.text2 }}>{dstDevice?.name ?? '?'}</span>
              {w.dstPort && <span style={{ color: th.text3 }}> : {w.dstPort}</span>}
            </div>
            {mismatch && (
              <div style={{ fontSize: 11, color: th.red }}>⚠ medium mismatch</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>label (optional)</label>
            <input
              style={inputStyle}
              placeholder="e.g. uplink-1, mgmt"
              value={w.label}
              onChange={e => set('label', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>notes (optional)</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
              placeholder="additional notes"
              value={w.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>
          {error && (
            <div style={{ fontFamily: th.fontLabel, fontSize: 11, color: th.red }}>{error}</div>
          )}
        </div>
      );
    }
  }

  const STEP_LABELS = ['source', 'destination', 'cable type', 'details'];

  return (
    <div className="wizard-modal-overlay" onClick={onClose}>
      <div
        className="wizard-panel"
        style={{
          background: th.cardBg, border: `1px solid ${th.border2}`,
          borderRadius: 8, width: 480, maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${th.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: th.fontMain, fontSize: 13, color: th.text }}>
            {initial ? 'edit connection' : 'new connection'}
          </span>
          <button
            style={{ color: th.text3, fontFamily: th.fontLabel, fontSize: 12 }}
            onClick={onClose}
          >✕</button>
        </div>

        {/* Step indicators */}
        <div style={{
          display: 'flex', padding: '10px 18px', gap: 0,
          borderBottom: `1px solid ${th.border}`,
        }}>
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4;
            const active = w.step === n;
            const done   = w.step > n;
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? th.green : active ? '#c47c5a' : th.border2,
                  color: done || active ? '#0c0d0e' : th.text3,
                  fontFamily: th.fontLabel, fontSize: 10,
                }}>{done ? '✓' : n}</div>
                <span style={{
                  marginLeft: 6, fontFamily: th.fontLabel, fontSize: 10,
                  color: active ? th.text : th.text3,
                }}>{label}</span>
                {i < 3 && <div style={{ flex: 1, height: 1, background: th.border, margin: '0 8px' }} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ padding: 18 }}>
          {renderStep()}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 18px', borderTop: `1px solid ${th.border}`,
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <button
            style={{
              padding: '5px 14px', borderRadius: 4,
              border: `1px solid ${th.border2}`, background: 'transparent',
              color: th.text2, fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
            }}
            onClick={() => {
              if (w.step === 1) onClose();
              else setW(p => ({ ...p, step: (p.step - 1) as WState['step'] }));
            }}
          >{w.step === 1 ? 'cancel' : '← back'}</button>

          {w.step < 4 ? (
            <button
              disabled={
                (w.step === 1 && !step1Valid) ||
                (w.step === 2 && !step2Valid)
              }
              style={{
                padding: '5px 14px', borderRadius: 4,
                background: '#c47c5a', color: '#0c0d0e',
                border: '1px solid #c47c5a',
                fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
                opacity: ((w.step === 1 && !step1Valid) || (w.step === 2 && !step2Valid)) ? 0.4 : 1,
              }}
              onClick={() => setW(p => ({ ...p, step: (p.step + 1) as WState['step'] }))}
            >next →</button>
          ) : (
            <button
              disabled={saving}
              style={{
                padding: '5px 14px', borderRadius: 4,
                background: '#c47c5a', color: '#0c0d0e',
                border: '1px solid #c47c5a',
                fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
              onClick={handleSave}
            >{saving ? 'saving…' : initial ? 'save changes' : 'create connection'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
