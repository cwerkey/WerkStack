import { useState, useEffect, useMemo } from 'react';
import type {
  DeviceInstance,
  DeviceTemplate,
  ModuleInstance,
  PcieTemplate,
  PlacedBlock,
  CableType,
  Connection,
} from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { buildVirtualFaceplateWithMeta } from '@/components/portAggregator';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExternalStorageWizardProps {
  open:             boolean;
  device:           DeviceInstance;
  template?:        DeviceTemplate;
  modules:          ModuleInstance[];
  pcieTemplates:    PcieTemplate[];
  cableTypes:       CableType[];
  allDevices:       DeviceInstance[];
  allTemplates:     DeviceTemplate[];
  allConnections:   Connection[];
  onInstallModule:  (body: { slotBlockId: string; cardTemplateId: string }) => void;
  onCreateConnection: (payload: Omit<Connection, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onClose:          () => void;
}

type WizardPhase =
  | 'check-hba'        // Does the device have an HBA?
  | 'install-card'     // Pick and install PCIe card
  | 'select-device'    // Pick destination JBOD/DAS
  | 'select-ports'     // Pick source port, destination port, cable type
  | 'done';

// ─── Shared styles ───────────────────────────────────────────────────────────

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

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 500,
  background: '#c47c5a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnGhost: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  background: 'none',
  color: '#8a9299',
  border: '1px solid #2a3038',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const cardStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #2a3038',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'Inter,system-ui,sans-serif',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

// ─── SAS/external port families ──────────────────────────────────────────────

const EXTERNAL_PORT_TYPES = new Set(['sas', 'sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28', 'misc-port']);
const HBA_CARD_KEYWORDS = ['hba', 'sas', 'raid', 'storage'];

function pcieCardName(tpl: PcieTemplate): string {
  return `${tpl.make} ${tpl.model}`.trim() || tpl.id;
}

function isHbaCard(tpl: PcieTemplate): boolean {
  const name = pcieCardName(tpl).toLowerCase();
  return HBA_CARD_KEYWORDS.some(kw => name.includes(kw));
}

function getExternalPorts(
  template: DeviceTemplate | undefined,
  modules: ModuleInstance[],
  pcieTemplates: PcieTemplate[],
): PlacedBlock[] {
  if (!template) return [];
  const rear = buildVirtualFaceplateWithMeta(template, 'rear', modules, pcieTemplates);
  return rear.blocks.filter(b => {
    const def = BLOCK_DEF_MAP.get(b.type);
    return (def?.isPort || def?.isNet) && EXTERNAL_PORT_TYPES.has(b.type);
  });
}

function getAvailablePcieSlots(template?: DeviceTemplate, modules: ModuleInstance[] = []): PlacedBlock[] {
  if (!template) return [];
  const occupied = new Set(modules.map(m => m.slotBlockId));
  const allBlocks: PlacedBlock[] = [
    ...(template.layout?.front ?? []),
    ...(template.layout?.rear ?? []),
  ];
  return allBlocks.filter(b => b.type.startsWith('pcie-') && !occupied.has(b.id));
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ExternalStorageWizard({
  open,
  device,
  template,
  modules,
  pcieTemplates,
  cableTypes,
  allDevices,
  allTemplates,
  allConnections,
  onInstallModule,
  onCreateConnection,
  onClose,
}: ExternalStorageWizardProps) {
  const [phase, setPhase] = useState<WizardPhase>('check-hba');

  // Install card state
  const [selectedCardTemplateId, setSelectedCardTemplateId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId]                 = useState<string | null>(null);

  // Cable state
  const [dstDeviceId, setDstDeviceId]       = useState<string | null>(null);
  const [srcPortBlockId, setSrcPortBlockId] = useState<string | null>(null);
  const [dstPortBlockId, setDstPortBlockId] = useState<string | null>(null);
  const [cableTypeId, setCableTypeId]       = useState('');
  const [deviceSearch, setDeviceSearch]     = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      // Check if device already has external-capable ports
      const externalPorts = getExternalPorts(template, modules, pcieTemplates);
      if (externalPorts.length > 0) {
        setPhase('select-device');
      } else {
        setPhase('check-hba');
      }
      setSelectedCardTemplateId(null);
      setSelectedSlotId(null);
      setDstDeviceId(null);
      setSrcPortBlockId(null);
      setDstPortBlockId(null);
      setCableTypeId('');
      setDeviceSearch('');
    }
  }, [open, template, modules, pcieTemplates]);

  // ── Derived data ────────────────────────────────────────────────────────

  const hbaCards = useMemo(
    () => pcieTemplates.filter(isHbaCard),
    [pcieTemplates],
  );

  const availableSlots = useMemo(
    () => getAvailablePcieSlots(template, modules),
    [template, modules],
  );

  const externalPorts = useMemo(
    () => getExternalPorts(template, modules, pcieTemplates),
    [template, modules, pcieTemplates],
  );

  // Connectable devices (JBODs/DAS in same zone, or any device with bays)
  const connectableDevices = useMemo(() => {
    const q = deviceSearch.toLowerCase();
    return allDevices.filter(d => {
      if (d.id === device.id) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allDevices, device.id, deviceSearch]);

  // Destination device ports
  const dstPorts = useMemo(() => {
    if (!dstDeviceId) return [];
    const dst = allDevices.find(d => d.id === dstDeviceId);
    if (!dst?.templateId) return [];
    const tpl = allTemplates.find(t => t.id === dst.templateId);
    if (!tpl) return [];
    const dstModules = modules.filter(m => m.deviceId === dstDeviceId);
    const rear = buildVirtualFaceplateWithMeta(tpl, 'rear', dstModules, pcieTemplates);
    const connectedBlockIds = new Set<string>();
    for (const c of allConnections) {
      if (c.srcBlockId) connectedBlockIds.add(`${c.srcDeviceId}::${c.srcBlockId}`);
      if (c.dstBlockId && c.dstDeviceId) connectedBlockIds.add(`${c.dstDeviceId}::${c.dstBlockId}`);
    }
    return rear.blocks.filter(b => {
      const def = BLOCK_DEF_MAP.get(b.type);
      if (!def?.isPort && !def?.isNet) return false;
      if (connectedBlockIds.has(`${dstDeviceId}::${b.id}`)) return false;
      return true;
    });
  }, [dstDeviceId, allDevices, allTemplates, modules, pcieTemplates, allConnections]);

  // Source ports not already connected
  const availableSrcPorts = useMemo(() => {
    const connectedBlockIds = new Set<string>();
    for (const c of allConnections) {
      if (c.srcBlockId) connectedBlockIds.add(`${c.srcDeviceId}::${c.srcBlockId}`);
      if (c.dstBlockId && c.dstDeviceId) connectedBlockIds.add(`${c.dstDeviceId}::${c.dstBlockId}`);
    }
    return externalPorts.filter(p => !connectedBlockIds.has(`${device.id}::${p.id}`));
  }, [externalPorts, allConnections, device.id]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleInstallCard() {
    if (!selectedCardTemplateId || !selectedSlotId) return;
    onInstallModule({ slotBlockId: selectedSlotId, cardTemplateId: selectedCardTemplateId });
    // After installing, ports should appear — move to cable step
    setPhase('select-device');
  }

  function handleCreateConnection() {
    if (!srcPortBlockId || !dstDeviceId || !dstPortBlockId) return;
    const srcBlock = externalPorts.find(p => p.id === srcPortBlockId);
    const dstDev = allDevices.find(d => d.id === dstDeviceId);
    const dstTpl = dstDev?.templateId ? allTemplates.find(t => t.id === dstDev.templateId) : undefined;
    const dstBlock = dstPorts.find(p => p.id === dstPortBlockId);

    onCreateConnection({
      srcDeviceId:  device.id,
      srcBlockId:   srcPortBlockId,
      srcBlockType: srcBlock?.type,
      srcPort:      srcBlock?.label || srcBlock?.type,
      dstDeviceId,
      dstBlockId:   dstPortBlockId,
      dstBlockType: dstBlock?.type,
      dstPort:      dstBlock?.label || dstBlock?.type,
      externalLabel: null,
      cableTypeId:  cableTypeId || undefined,
    });
    setPhase('done');
  }

  if (!open) return null;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
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
        {/* Title */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 15, fontWeight: 600, color: '#d4d9dd',
          }}>
            Connect External Storage
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a6068', fontSize: 18, lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* ── Phase: check-hba ──────────────────────────────────────────── */}
        {phase === 'check-hba' && (
          <div style={sectionStyle}>
            <div style={{
              padding: '12px 14px',
              background: '#111417',
              border: '1px solid #1e2428',
              borderRadius: 4,
              fontSize: 12,
              color: '#8a9299',
              lineHeight: 1.5,
            }}>
              This device needs an HBA or SAS controller to connect external storage.
              {availableSlots.length === 0 && (
                <span style={{ display: 'block', marginTop: 6, color: '#e8615a' }}>
                  No PCIe slots available on this device.
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {availableSlots.length > 0 && (
                <button style={btnPrimary} onClick={() => setPhase('install-card')}>
                  Install a PCIe Card
                </button>
              )}
              <button style={btnGhost} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: install-card ───────────────────────────────────────── */}
        {phase === 'install-card' && (
          <div style={sectionStyle}>
            <div>
              <label style={labelStyle}>Select HBA/SAS Card</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {hbaCards.length === 0 && (
                  <div style={{ fontSize: 11, color: '#5a6068', padding: '8px 0' }}>
                    No HBA/SAS card templates found. Create one in Settings → Templates.
                  </div>
                )}
                {hbaCards.map(card => (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCardTemplateId(card.id)}
                    style={{
                      ...cardStyle,
                      borderColor: selectedCardTemplateId === card.id ? '#c47c5a' : '#2a3038',
                      background: selectedCardTemplateId === card.id ? '#c47c5a11' : 'transparent',
                    }}
                  >
                    <span style={{ color: '#d4d9dd', flex: 1 }}>{pcieCardName(card)}</span>
                    <span style={{ fontSize: 10, color: '#5a6068' }}>{card.formFactor}</span>
                  </div>
                ))}
                {/* Also show all PCIe cards as fallback */}
                {pcieTemplates.filter(t => !isHbaCard(t)).length > 0 && hbaCards.length > 0 && (
                  <span style={{ fontSize: 10, color: '#5a6068', padding: '4px 0' }}>Other cards:</span>
                )}
                {pcieTemplates.filter(t => !isHbaCard(t)).map(card => (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCardTemplateId(card.id)}
                    style={{
                      ...cardStyle,
                      borderColor: selectedCardTemplateId === card.id ? '#c47c5a' : '#2a3038',
                      background: selectedCardTemplateId === card.id ? '#c47c5a11' : 'transparent',
                    }}
                  >
                    <span style={{ color: '#d4d9dd', flex: 1 }}>{pcieCardName(card)}</span>
                    <span style={{ fontSize: 10, color: '#5a6068' }}>{card.formFactor}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Select PCIe Slot</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {availableSlots.map(slot => {
                  const def = BLOCK_DEF_MAP.get(slot.type);
                  return (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedSlotId(slot.id)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: `1px solid ${selectedSlotId === slot.id ? '#c47c5a' : '#2a3038'}`,
                        background: selectedSlotId === slot.id ? '#c47c5a22' : 'transparent',
                        color: selectedSlotId === slot.id ? '#c47c5a' : '#8a9299',
                        cursor: 'pointer',
                        fontFamily: 'Inter,system-ui,sans-serif',
                      }}
                    >
                      {slot.label || def?.label || slot.type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setPhase('check-hba')}>
                Back
              </button>
              <button
                style={{ ...btnPrimary, opacity: selectedCardTemplateId && selectedSlotId ? 1 : 0.4 }}
                disabled={!selectedCardTemplateId || !selectedSlotId}
                onClick={handleInstallCard}
              >
                Install Card
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: select-device ──────────────────────────────────────── */}
        {phase === 'select-device' && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Which device is this connected to?</label>
            <input
              style={inputStyle}
              value={deviceSearch}
              onChange={e => setDeviceSearch(e.target.value)}
              placeholder="Search devices..."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
              {connectableDevices.map(d => (
                <div
                  key={d.id}
                  onClick={() => {
                    setDstDeviceId(d.id);
                    setDstPortBlockId(null);
                  }}
                  style={{
                    ...cardStyle,
                    borderColor: dstDeviceId === d.id ? '#c47c5a' : '#2a3038',
                    background: dstDeviceId === d.id ? '#c47c5a11' : 'transparent',
                  }}
                >
                  <span style={{ color: '#d4d9dd', flex: 1 }}>{d.name}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {externalPorts.length === 0 && (
                <button style={btnGhost} onClick={() => setPhase('check-hba')}>
                  Back
                </button>
              )}
              <button
                style={{ ...btnPrimary, opacity: dstDeviceId ? 1 : 0.4 }}
                disabled={!dstDeviceId}
                onClick={() => setPhase('select-ports')}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: select-ports ───────────────────────────────────────── */}
        {phase === 'select-ports' && (
          <div style={sectionStyle}>
            {/* Source port */}
            <div>
              <label style={labelStyle}>
                Source port (on {device.name})
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {availableSrcPorts.map(port => {
                  const def = BLOCK_DEF_MAP.get(port.type);
                  return (
                    <button
                      key={port.id}
                      onClick={() => setSrcPortBlockId(port.id)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: `1px solid ${srcPortBlockId === port.id ? '#c47c5a' : '#2a3038'}`,
                        background: srcPortBlockId === port.id ? '#c47c5a22' : 'transparent',
                        color: srcPortBlockId === port.id ? '#c47c5a' : '#8a9299',
                        cursor: 'pointer',
                        fontFamily: 'Inter,system-ui,sans-serif',
                      }}
                    >
                      {port.label || def?.label || port.type}
                    </button>
                  );
                })}
                {availableSrcPorts.length === 0 && (
                  <span style={{ fontSize: 11, color: '#5a6068' }}>No available ports</span>
                )}
              </div>
            </div>

            {/* Destination port */}
            <div>
              <label style={labelStyle}>
                Destination port (on {allDevices.find(d => d.id === dstDeviceId)?.name ?? '—'})
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dstPorts.map(port => {
                  const def = BLOCK_DEF_MAP.get(port.type);
                  return (
                    <button
                      key={port.id}
                      onClick={() => setDstPortBlockId(port.id)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: `1px solid ${dstPortBlockId === port.id ? '#c47c5a' : '#2a3038'}`,
                        background: dstPortBlockId === port.id ? '#c47c5a22' : 'transparent',
                        color: dstPortBlockId === port.id ? '#c47c5a' : '#8a9299',
                        cursor: 'pointer',
                        fontFamily: 'Inter,system-ui,sans-serif',
                      }}
                    >
                      {port.label || def?.label || port.type}
                    </button>
                  );
                })}
                {dstPorts.length === 0 && (
                  <span style={{ fontSize: 11, color: '#5a6068' }}>No available ports on destination</span>
                )}
              </div>
            </div>

            {/* Cable type */}
            <div>
              <label style={labelStyle}>Cable Type</label>
              <select
                style={{ ...inputStyle, appearance: 'auto' }}
                value={cableTypeId}
                onChange={e => setCableTypeId(e.target.value)}
              >
                <option value="">— select —</option>
                {cableTypes.map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setPhase('select-device')}>
                Back
              </button>
              <button
                style={{
                  ...btnPrimary,
                  opacity: srcPortBlockId && dstPortBlockId ? 1 : 0.4,
                }}
                disabled={!srcPortBlockId || !dstPortBlockId}
                onClick={handleCreateConnection}
              >
                Create Connection
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: done ───────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div style={sectionStyle}>
            <div style={{
              padding: '12px 14px',
              background: '#111417',
              border: '1px solid #1e2428',
              borderRadius: 4,
              fontSize: 12,
              color: '#3a8c4a',
              textAlign: 'center',
            }}>
              Connection established. External drives will now appear in the Storage tab.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={btnPrimary} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
