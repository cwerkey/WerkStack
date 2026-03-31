import { useState, useEffect, useMemo } from 'react';
import type {
  Connection,
  DeviceInstance,
  DeviceTemplate,
  PlacedBlock,
  ModuleInstance,
  PcieTemplate,
  CableType,
} from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { buildVirtualFaceplateWithMeta } from '@/components/portAggregator';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectionWizardProps {
  open: boolean;
  siteId: string;
  // Source (pre-filled)
  srcDevice: DeviceInstance;
  srcBlock: PlacedBlock;
  // All data needed for destination step
  devices: DeviceInstance[];
  templates: DeviceTemplate[];
  modules: ModuleInstance[];
  pcieTemplates: PcieTemplate[];
  cableTypes: CableType[];
  // All existing connections to know which ports are taken
  allConnections: Connection[];
  // Callbacks
  onSubmit: (payload: Omit<Connection, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onClose: () => void;
}

// ─── Compatibility helpers ────────────────────────────────────────────────────

const OPTICAL_FAMILY = new Set(['sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28']);

function arePortsCompatible(srcType: string, dstType: string): boolean {
  if (srcType === dstType) return true;
  if (OPTICAL_FAMILY.has(srcType) && OPTICAL_FAMILY.has(dstType)) return true;
  return false;
}

function suggestCableType(srcType: string, dstType: string, cableTypes: CableType[]): string {
  const types = [srcType, dstType];

  const hasOptical = types.some(t => OPTICAL_FAMILY.has(t));
  const hasRj45    = types.some(t => t === 'rj45');
  const hasUsb     = types.some(t => t === 'usb-a' || t === 'usb-c');
  const hasSerial  = types.some(t => t === 'serial');
  const hasPower   = types.some(t => t === 'power');
  const hasVideo   = types.some(t => t === 'hdmi' || t === 'displayport' || t === 'vga');

  let keywords: string[] = [];
  if (hasRj45)    keywords = ['cat', 'ethernet'];
  else if (hasOptical) keywords = ['sfp', 'dac', 'fiber'];
  else if (hasUsb)     keywords = ['usb'];
  else if (hasSerial)  keywords = ['serial'];
  else if (hasPower)   keywords = ['iec', 'power'];
  else if (hasVideo)   keywords = ['video', srcType];

  if (keywords.length > 0) {
    const match = cableTypes.find(ct =>
      keywords.some(kw => ct.name.toLowerCase().includes(kw))
    );
    if (match) return match.id;
  }

  return cableTypes[0]?.id ?? '';
}

// ─── Step indicator ───────────────────────────────────────────────────────────

interface StepDotProps {
  num: number;
  label: string;
  state: 'active' | 'done' | 'pending';
}

function StepDot({ num, label, state }: StepDotProps) {
  const color =
    state === 'active'  ? '#c47c5a' :
    state === 'done'    ? '#3a8c4a' :
                          '#3a4248';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, fontWeight: 600,
        color: state === 'pending' ? '#8a9299' : '#fff',
      }}>
        {state === 'done' ? '✓' : num}
      </div>
      <span style={{
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 10,
        color: state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#5a6068',
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#d4d9dd',
  background: '#0e1012',
  border: '1px solid #2a3038',
  borderRadius: 4,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter,system-ui,sans-serif',
  fontSize: 11,
  color: '#8a9299',
  marginBottom: 4,
  display: 'block',
};

const readonlyRowStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 4,
  background: '#0e1012',
  border: '1px solid #2a3038',
  color: '#d4d9dd',
  fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

// ─── Main component ───────────────────────────────────────────────────────────

export function ConnectionWizard({
  open,
  srcDevice,
  srcBlock,
  devices,
  templates,
  modules,
  pcieTemplates,
  cableTypes,
  allConnections,
  onSubmit,
  onClose,
}: ConnectionWizardProps) {
  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 2 state ────────────────────────────────────────────────────────────
  const [deviceSearch, setDeviceSearch]   = useState('');
  const [dstDeviceId, setDstDeviceId]     = useState<string | null>(null);
  const [dstBlockId, setDstBlockId]       = useState<string | null>(null);
  const [dstBlockType, setDstBlockType]   = useState<string | null>(null);
  const [dstBlockLabel, setDstBlockLabel] = useState('');
  const [useExternal, setUseExternal]     = useState(false);
  const [externalLabel, setExternalLabel] = useState('');

  // ── Step 3 state ────────────────────────────────────────────────────────────
  const [cableTypeId, setCableTypeId] = useState('');
  const [cableLabel, setCableLabel]   = useState('');
  const [notes, setNotes]             = useState('');

  // ── Reset when wizard opens ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(1);
      setDeviceSearch('');
      setDstDeviceId(null);
      setDstBlockId(null);
      setDstBlockType(null);
      setDstBlockLabel('');
      setUseExternal(false);
      setExternalLabel('');
      setCableTypeId('');
      setCableLabel('');
      setNotes('');
    }
  }, [open]);

  // ── Derive connected port IDs ───────────────────────────────────────────────
  const connectedBlockIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of allConnections) {
      if (c.srcBlockId) ids.add(`${c.srcDeviceId}::${c.srcBlockId}`);
      if (c.dstBlockId && c.dstDeviceId) ids.add(`${c.dstDeviceId}::${c.dstBlockId}`);
    }
    return ids;
  }, [allConnections]);

  // ── Filtered device list for step 2 ────────────────────────────────────────
  const filteredDevices = useMemo(() => {
    const q = deviceSearch.toLowerCase();
    return devices.filter(d =>
      d.id !== srcDevice.id &&
      (q === '' || d.name.toLowerCase().includes(q))
    );
  }, [devices, srcDevice.id, deviceSearch]);

  // ── Ports for the selected destination device ───────────────────────────────
  const dstPorts = useMemo(() => {
    if (!dstDeviceId) return [];
    const dev = devices.find(d => d.id === dstDeviceId);
    if (!dev?.templateId) return [];
    const tpl = templates.find(t => t.id === dev.templateId);
    if (!tpl) return [];

    const face = dev.face ?? 'front';
    const devModules = modules.filter(m => m.deviceId === dstDeviceId);
    const { blocks } = buildVirtualFaceplateWithMeta(tpl, face, devModules, pcieTemplates);

    return blocks.filter(b => {
      const def = BLOCK_DEF_MAP.get(b.type);
      if (!def?.isPort && !def?.isNet) return false;
      if (connectedBlockIds.has(`${dstDeviceId}::${b.id}`)) return false;
      return arePortsCompatible(srcBlock.type, b.type);
    });
  }, [dstDeviceId, devices, templates, modules, pcieTemplates, connectedBlockIds, srcBlock.type]);

  // ── Auto-suggest cable type when advancing to step 3 ───────────────────────
  function handleAdvanceToStep3() {
    const suggested = dstBlockType
      ? suggestCableType(srcBlock.type, dstBlockType, cableTypes)
      : (cableTypes[0]?.id ?? '');
    setCableTypeId(suggested);
    setStep(3);
  }

  // ── Destination selection helpers ───────────────────────────────────────────
  function selectDstDevice(id: string) {
    setDstDeviceId(id);
    setDstBlockId(null);
    setDstBlockType(null);
    setDstBlockLabel('');
    setUseExternal(false);
  }

  function selectExternal() {
    setDstDeviceId(null);
    setDstBlockId(null);
    setDstBlockType(null);
    setDstBlockLabel('');
    setUseExternal(true);
  }

  function selectDstPort(block: PlacedBlock) {
    setDstBlockId(block.id);
    setDstBlockType(block.type);
    setDstBlockLabel(block.label || block.type);
  }

  // ── Step 2 advance validation ───────────────────────────────────────────────
  const canAdvanceStep2 = useExternal
    ? externalLabel.trim().length > 0
    : dstBlockId !== null;

  // ── Submit ──────────────────────────────────────────────────────────────────
  function handleSubmit() {
    const payload: Omit<Connection, 'id' | 'orgId' | 'siteId' | 'createdAt'> = {
      srcDeviceId:  srcDevice.id,
      srcBlockId:   srcBlock.id,
      srcBlockType: srcBlock.type,
      srcPort:      srcBlock.label || srcBlock.type,
      dstDeviceId:  useExternal ? null : dstDeviceId,
      dstBlockId:   useExternal ? undefined : (dstBlockId ?? undefined),
      dstBlockType: useExternal ? undefined : (dstBlockType ?? undefined),
      dstPort:      useExternal ? undefined : (dstBlockLabel || undefined),
      externalLabel: useExternal ? externalLabel : null,
      cableTypeId:  cableTypeId || undefined,
      label:        cableLabel || undefined,
      notes:        notes || undefined,
    };
    onSubmit(payload);
  }

  // ── Derived labels for summary ──────────────────────────────────────────────
  const dstDeviceName = useMemo(() => {
    if (useExternal) return externalLabel || '—';
    if (!dstDeviceId) return '—';
    return devices.find(d => d.id === dstDeviceId)?.name ?? '—';
  }, [useExternal, externalLabel, dstDeviceId, devices]);

  const dstPortLabel = useExternal ? '(external)' : (dstBlockLabel || '—');
  const cableTypeName = cableTypes.find(c => c.id === cableTypeId)?.name ?? '—';

  if (!open) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1a1e22',
          border: '1px solid #2a3038',
          borderRadius: 8,
          padding: '28px 32px',
          width: 520,
          maxHeight: '80vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 16, fontWeight: 600,
            color: '#d4d9dd', margin: 0,
          }}>
            New Connection
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a6068', fontSize: 18, lineHeight: 1, padding: '0 4px',
              fontFamily: 'Inter,system-ui,sans-serif',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          <StepDot
            num={1} label="Source"
            state={step === 1 ? 'active' : 'done'}
          />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12, alignSelf: 'flex-start' }} />
          <StepDot
            num={2} label="Destination"
            state={step === 1 ? 'pending' : step === 2 ? 'active' : 'done'}
          />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12, alignSelf: 'flex-start' }} />
          <StepDot
            num={3} label="Cable Info"
            state={step < 3 ? 'pending' : 'active'}
          />
        </div>

        {/* ── Step 1: Source ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionStyle}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Source Device</span>
              <div style={readonlyRowStyle}>{srcDevice.name}</div>
            </div>

            <div style={sectionStyle}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Port</span>
              <div style={readonlyRowStyle}>
                {srcBlock.label
                  ? `${srcBlock.label} (${srcBlock.type})`
                  : srcBlock.type}
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 11, color: '#5a6068', fontFamily: 'Inter,system-ui,sans-serif' }}>
              Source is fixed — click a different port in the Ports tab to change it.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                style={{
                  padding: '6px 16px', fontSize: 12, background: 'none',
                  border: '1px solid #3a4248', borderRadius: 4,
                  color: '#8a9299', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
                }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '6px 16px', fontSize: 12, background: '#c47c5a',
                  border: 'none', borderRadius: 4, color: '#fff',
                  cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
                }}
                onClick={() => setStep(2)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Destination ───────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Device search */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Search Devices</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="Filter by device name…"
                value={deviceSearch}
                onChange={e => setDeviceSearch(e.target.value)}
                autoFocus
              />
            </div>

            {/* Device list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {/* External option */}
              <button
                style={{
                  padding: '6px 10px', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                  background: useExternal ? '#c47c5a22' : 'none',
                  border: useExternal ? '1px solid #c47c5a44' : '1px solid transparent',
                  color: '#c47c5a', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif',
                  fontStyle: 'italic',
                }}
                onClick={selectExternal}
              >
                ↗ External / Patch Panel
              </button>

              {filteredDevices.length === 0 && (
                <span style={{ fontSize: 11, color: '#5a6068', fontFamily: 'Inter,system-ui,sans-serif', padding: '4px 10px' }}>
                  No devices match.
                </span>
              )}
              {filteredDevices.map(dev => (
                <button
                  key={dev.id}
                  style={{
                    padding: '6px 10px', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                    background: (!useExternal && dstDeviceId === dev.id) ? '#c47c5a22' : 'none',
                    border: (!useExternal && dstDeviceId === dev.id) ? '1px solid #c47c5a44' : '1px solid transparent',
                    color: '#d4d9dd', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif',
                  }}
                  onClick={() => selectDstDevice(dev.id)}
                >
                  {dev.name}
                  <span style={{ color: '#5a6068', marginLeft: 6 }}>
                    {dev.ip ? `· ${dev.ip}` : ''}
                  </span>
                </button>
              ))}
            </div>

            {/* External label input */}
            {useExternal && (
              <div style={sectionStyle}>
                <label style={labelStyle}>External Label</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. Patch Panel A Port 12"
                  value={externalLabel}
                  onChange={e => setExternalLabel(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* Port list for selected device */}
            {!useExternal && dstDeviceId && (
              <div style={sectionStyle}>
                <label style={labelStyle}>
                  Available Ports
                  {dstPorts.length === 0 && (
                    <span style={{ color: '#c47c5a', marginLeft: 6 }}>(none compatible or all in use)</span>
                  )}
                </label>
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 3,
                  maxHeight: 150, overflowY: 'auto',
                  border: '1px solid #2a3038', borderRadius: 4,
                  padding: 4,
                }}>
                  {dstPorts.map(port => (
                    <button
                      key={port.id}
                      style={{
                        padding: '4px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                        background: dstBlockId === port.id ? '#c47c5a22' : 'none',
                        border: dstBlockId === port.id ? '1px solid #c47c5a44' : '1px solid transparent',
                        color: '#d4d9dd', fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onClick={() => selectDstPort(port)}
                    >
                      <span style={{
                        display: 'inline-block', padding: '1px 5px', borderRadius: 3,
                        background: '#2a3038', fontSize: 10, color: '#8a9299',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {port.type}
                      </span>
                      {port.label || port.type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                style={{
                  padding: '6px 16px', fontSize: 12, background: 'none',
                  border: '1px solid #3a4248', borderRadius: 4,
                  color: '#8a9299', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
                }}
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
              <button
                style={{
                  padding: '6px 16px', fontSize: 12,
                  background: canAdvanceStep2 ? '#c47c5a' : '#3a4248',
                  border: 'none', borderRadius: 4, color: '#fff',
                  cursor: canAdvanceStep2 ? 'pointer' : 'not-allowed',
                  fontFamily: 'Inter,system-ui,sans-serif',
                  opacity: canAdvanceStep2 ? 1 : 0.5,
                }}
                disabled={!canAdvanceStep2}
                onClick={handleAdvanceToStep3}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Cable Info ────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Summary */}
            <div style={{
              padding: '10px 12px', borderRadius: 4,
              background: '#0e1012', border: '1px solid #2a3038',
              fontSize: 12, color: '#8a9299', fontFamily: 'Inter,system-ui,sans-serif',
              lineHeight: 1.6,
            }}>
              <span style={{ color: '#d4d9dd' }}>{srcDevice.name}</span>
              <span style={{ color: '#5a6068' }}>:</span>
              <span style={{ color: '#c47c5a' }}> {srcBlock.label || srcBlock.type}</span>
              <span style={{ color: '#5a6068', margin: '0 6px' }}>→</span>
              <span style={{ color: '#d4d9dd' }}>{dstDeviceName}</span>
              {!useExternal && dstBlockLabel && (
                <>
                  <span style={{ color: '#5a6068' }}>:</span>
                  <span style={{ color: '#c47c5a' }}> {dstPortLabel}</span>
                </>
              )}
              {cableTypeId && (
                <>
                  <span style={{ color: '#5a6068', marginLeft: 6 }}>via </span>
                  <span style={{ color: '#8a9299' }}>{cableTypeName}</span>
                </>
              )}
            </div>

            {/* Cable type */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Cable Type</label>
              <select
                style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }}
                value={cableTypeId}
                onChange={e => setCableTypeId(e.target.value)}
              >
                <option value="">— none —</option>
                {cableTypes.map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
            </div>

            {/* Cable label */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Cable Label <span style={{ color: '#3a4248' }}>(optional)</span></label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. uplink-01"
                value={cableLabel}
                onChange={e => setCableLabel(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Notes <span style={{ color: '#3a4248' }}>(optional)</span></label>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: 60,
                  resize: 'vertical',
                  fontFamily: 'Inter,system-ui,sans-serif',
                }}
                placeholder="Any notes about this connection…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                style={{
                  padding: '6px 16px', fontSize: 12, background: 'none',
                  border: '1px solid #3a4248', borderRadius: 4,
                  color: '#8a9299', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
                }}
                onClick={() => setStep(2)}
              >
                ← Back
              </button>
              <button
                style={{
                  padding: '6px 16px', fontSize: 12, background: '#c47c5a',
                  border: 'none', borderRadius: 4, color: '#fff',
                  cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
                  fontWeight: 600,
                }}
                onClick={handleSubmit}
              >
                Create Connection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
