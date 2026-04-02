import { useState, useEffect } from 'react';
import type { DeviceInstance, DeviceTemplate, Zone, Rack } from '@werkstack/shared';
import { useCreateDevice } from '@/api/devices';
import { useTypesStore } from '@/stores/typesStore';

interface DeployWizardProps {
  open: boolean;
  siteId: string;
  rackId?: string;
  rackU?: number;
  devices: DeviceInstance[];
  zones: Zone[];
  racks: Rack[];
  templates: DeviceTemplate[];
  onClose: () => void;
  onDeployed?: (deviceId: string, rackId?: string, zoneId?: string) => void;
}

function StepDot({ num, label, state }: { num: number; label: string; state: 'active' | 'done' | 'pending' }) {
  const color = state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#3a4248';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, fontWeight: 600,
        color: state === 'pending' ? '#8a9299' : '#fff',
      }}>
        {state === 'done' ? '✓' : num}
      </div>
      <span style={{
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 10,
        color: state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#5a6068',
      }}>{label}</span>
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, color: '#d4d9dd',
  background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
  width: '100%', boxSizing: 'border-box', fontFamily: 'Inter,system-ui,sans-serif',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, color: '#8a9299', fontFamily: 'Inter,system-ui,sans-serif',
};

const BTN_PRIMARY: React.CSSProperties = {
  background: '#c47c5a', color: '#fff', border: 'none', borderRadius: 4,
  padding: '7px 18px', cursor: 'pointer', fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
};

const BTN_SECONDARY: React.CSSProperties = {
  background: '#1a1e22', border: '1px solid #2a3038', color: '#d4d9dd',
  borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
};

export function DeployWizard({
  open, siteId, rackId, rackU, devices, zones, racks, templates, onClose, onDeployed,
}: DeployWizardProps) {
  const deviceTypes = useTypesStore(s => s.deviceTypes);
  const createDevice = useCreateDevice(siteId);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [quickDevice, setQuickDevice] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickUHeight, setQuickUHeight] = useState(1);
  const [quickTypeId, setQuickTypeId] = useState('');

  // Step 2
  const [placementMode, setPlacementMode] = useState<'rack' | 'shelf' | 'unassigned'>('rack');
  const [selectedRackId, setSelectedRackId] = useState<string>('');
  const [selectedRackU, setSelectedRackU] = useState<number>(1);
  const [face, setFace] = useState<'front' | 'rear'>('front');
  const [selectedShelfId, setSelectedShelfId] = useState<string>('');
  const [shelfCol, setShelfCol] = useState(0);
  const [shelfRow, setShelfRow] = useState(0);

  // Step 3
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [serial, setSerial] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [notes, setNotes] = useState('');
  const [typeId, setTypeId] = useState('');

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setQuickDevice(false);
    setTemplateSearch('');
    setSelectedTemplateId(null);
    setQuickName('');
    setQuickUHeight(1);
    setQuickTypeId(deviceTypes[0]?.id ?? '');
    setPlacementMode('rack');
    setSelectedRackId(rackId ?? racks[0]?.id ?? '');
    setSelectedRackU(rackU ?? 1);
    setFace('front');
    setSelectedShelfId('');
    setShelfCol(0);
    setShelfRow(0);
    setName('');
    setIp('');
    setSerial('');
    setAssetTag('');
    setNotes('');
    setTypeId(deviceTypes[0]?.id ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const selectedRack = racks.find(r => r.id === selectedRackId);

  const sortedTemplates = [...templates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const filteredTemplates = sortedTemplates.filter(t => {
    const q = templateSearch.toLowerCase();
    return (
      t.make.toLowerCase().includes(q) ||
      t.model.toLowerCase().includes(q) ||
      (t.manufacturer ?? '').toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  const currentUHeight = quickDevice ? quickUHeight : (selectedTemplate?.uHeight ?? 1);
  const collisions = placementMode === 'rack' && selectedRackId
    ? devices.filter(d => {
        if (d.rackId !== selectedRackId) return false;
        if (d.face && d.face !== face) return false;
        if (d.rackU == null) return false;
        const dEnd = d.rackU + (d.uHeight ?? 1) - 1;
        const newEnd = selectedRackU + currentUHeight - 1;
        return selectedRackU <= dEnd && newEnd >= d.rackU;
      })
    : [];

  // Shelf devices available for placement
  const shelfDevices = devices.filter(d => {
    const tmpl = templates.find(t => t.id === d.templateId);
    return tmpl?.isShelf === true && d.rackId;
  });
  const selectedShelf = shelfDevices.find(d => d.id === selectedShelfId);

  function goToStep2() {
    const prefill = quickDevice
      ? quickName
      : selectedTemplate ? `${selectedTemplate.make} ${selectedTemplate.model}` : '';
    setName(prefill);
    setStep(2);
  }

  function handleDeploy() {
    setError(null);
    const resolvedTypeId = typeId || quickTypeId || deviceTypes[0]?.id || '';
    const body: Partial<DeviceInstance> = {
      templateId: (!quickDevice && selectedTemplateId) ? selectedTemplateId : undefined,
      typeId: resolvedTypeId,
      name: name.trim(),
      uHeight: quickDevice ? quickUHeight : (selectedTemplate?.uHeight ?? 1),
      ip: ip.trim() || undefined,
      serial: serial.trim() || undefined,
      assetTag: assetTag.trim() || undefined,
      notes: notes.trim() || undefined,
      isDraft: false,
    };

    if (placementMode === 'rack') {
      body.rackId = selectedRackId || undefined;
      body.zoneId = selectedRack?.zoneId || undefined;
      body.rackU = selectedRackU || undefined;
      body.face = face;
    } else if (placementMode === 'shelf' && selectedShelf) {
      body.shelfDeviceId = selectedShelf.id;
      body.shelfCol = shelfCol;
      body.shelfRow = shelfRow;
      body.rackId = selectedShelf.rackId;
    }
    createDevice.mutate(body, {
      onSuccess: (created) => {
        onDeployed?.(created.id, selectedRackId || undefined, selectedRack?.zoneId);
      },
      onError: (e) => {
        setError((e as Error).message ?? 'Deploy failed');
      },
    });
  }

  const stepState = (n: number): 'active' | 'done' | 'pending' =>
    n < step ? 'done' : n === step ? 'active' : 'pending';

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
          background: '#1a1e22', border: '1px solid #2a3038', borderRadius: 8,
          minWidth: 540, maxWidth: 640, maxHeight: '80vh', overflowY: 'auto',
          padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'Inter,system-ui,sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
            Deploy Device
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8a9299', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <StepDot num={1} label="Template" state={stepState(1)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <StepDot num={2} label="Placement" state={stepState(2)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <StepDot num={3} label="Info" state={stepState(3)} />
        </div>

        {/* ── Step 1: Select Template ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', ...LABEL_STYLE }}>
              <input
                type="checkbox"
                checked={quickDevice}
                onChange={e => setQuickDevice(e.target.checked)}
                style={{ accentColor: '#c47c5a' }}
              />
              Quick device (skip template)
            </label>

            {!quickDevice && (
              <>
                <input
                  style={INPUT_STYLE}
                  placeholder="Search templates by make, model, manufacturer, category…"
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                />
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredTemplates.length === 0 && (
                    <div style={{ color: '#5a6068', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', padding: '16px 0', textAlign: 'center' }}>
                      No templates found
                    </div>
                  )}
                  {filteredTemplates.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 4, cursor: 'pointer',
                        border: `1px solid ${selectedTemplateId === t.id ? '#c47c5a' : '#2a3038'}`,
                        background: selectedTemplateId === t.id ? '#c47c5a15' : '#0e1012',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, fontWeight: 600, color: '#d4d9dd' }}>
                          {t.make} {t.model}
                        </div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299', marginTop: 2 }}>
                          {t.category}
                        </div>
                      </div>
                      <div style={{
                        background: '#2a3038', borderRadius: 3,
                        padding: '2px 7px', fontSize: 10,
                        fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299',
                      }}>
                        {t.uHeight}U
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {quickDevice && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Device name</div>
                  <input
                    style={INPUT_STYLE}
                    placeholder="e.g. My Server"
                    value={quickName}
                    onChange={e => setQuickName(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>U height</div>
                    <input
                      type="number" min={1} max={100}
                      style={INPUT_STYLE}
                      value={quickUHeight}
                      onChange={e => setQuickUHeight(Math.max(1, Math.min(100, Number(e.target.value))))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Device type</div>
                    <select
                      style={INPUT_STYLE}
                      value={quickTypeId}
                      onChange={e => setQuickTypeId(e.target.value)}
                    >
                      {deviceTypes.map(dt => (
                        <option key={dt.id} value={dt.id}>{dt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                style={{
                  ...BTN_PRIMARY,
                  opacity: (!quickDevice && !selectedTemplateId) ? 0.5 : 1,
                  cursor: (!quickDevice && !selectedTemplateId) ? 'not-allowed' : 'pointer',
                }}
                disabled={!quickDevice && !selectedTemplateId}
                onClick={goToStep2}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Placement ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Placement mode selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                { id: 'rack', label: 'Place in rack', desc: 'Assign to a rack U position' },
                ...(shelfDevices.length > 0
                  ? [{ id: 'shelf', label: 'Place on shelf', desc: 'Assign to a shelf device' }]
                  : []),
                { id: 'unassigned', label: 'Leave unassigned', desc: 'Not in any rack — assign later' },
              ] as const).map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setPlacementMode(opt.id as typeof placementMode)}
                  style={{
                    padding: '8px 12px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${placementMode === opt.id ? '#c47c5a' : '#2a3038'}`,
                    background: placementMode === opt.id ? '#c47c5a15' : '#0e1012',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${placementMode === opt.id ? '#c47c5a' : '#3a4248'}`,
                    background: placementMode === opt.id ? '#c47c5a' : 'transparent',
                  }} />
                  <div>
                    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, fontWeight: 600, color: '#d4d9dd' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299' }}>
                      {opt.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Rack placement fields */}
            {placementMode === 'rack' && (
              <>
                <div>
                  <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Rack</div>
                  <select
                    style={INPUT_STYLE}
                    value={selectedRackId}
                    onChange={e => setSelectedRackId(e.target.value)}
                  >
                    {racks.map(r => {
                      const zone = zones.find(z => z.id === r.zoneId);
                      return (
                        <option key={r.id} value={r.id}>
                          {r.name}{zone ? ` (Zone: ${zone.name})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>U position</div>
                  <input
                    type="number"
                    min={1}
                    max={selectedRack?.uHeight ?? 42}
                    style={INPUT_STYLE}
                    value={selectedRackU}
                    onChange={e => setSelectedRackU(Number(e.target.value))}
                  />
                </div>

                <div>
                  <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Face</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['front', 'rear'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setFace(f)}
                        style={{
                          ...BTN_SECONDARY,
                          background: face === f ? '#c47c5a' : '#1a1e22',
                          color: face === f ? '#fff' : '#d4d9dd',
                          borderColor: face === f ? '#c47c5a' : '#2a3038',
                        }}
                      >
                        {f === 'front' ? 'Front' : 'Rear'}
                      </button>
                    ))}
                  </div>
                </div>

                {collisions.length > 0 && (
                  <div style={{
                    background: '#2a2200', border: '1px solid #8a6500', borderRadius: 4,
                    padding: '10px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif',
                    color: '#e8c840', display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    {collisions.map(d => (
                      <div key={d.id}>
                        ⚠ Overlaps with {d.name} at U{d.rackU}–U{(d.rackU ?? 1) + (d.uHeight ?? 1) - 1}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Shelf placement fields */}
            {placementMode === 'shelf' && (
              <>
                <div>
                  <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Shelf</div>
                  <select
                    style={INPUT_STYLE}
                    value={selectedShelfId}
                    onChange={e => setSelectedShelfId(e.target.value)}
                  >
                    <option value="">Select a shelf…</option>
                    {shelfDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {selectedShelf && (() => {
                  const shelfTpl = templates.find(t => t.id === selectedShelf.templateId);
                  const shelfGridCols = shelfTpl?.gridCols ?? 96;
                  const shelfGridRows = (selectedShelf.uHeight ?? 1) * 12;
                  const CELL = 6;
                  const gridW = shelfGridCols * CELL;
                  const gridH = shelfGridRows * CELL;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ ...LABEL_STYLE }}>Click to set position (col: {shelfCol}, row: {shelfRow})</div>
                      <div
                        style={{
                          width: gridW, height: gridH, position: 'relative',
                          background: '#141618', border: '1px solid #262c30', borderRadius: 4,
                          overflow: 'hidden', cursor: 'crosshair',
                          backgroundImage: `
                            linear-gradient(#1d2022 1px, transparent 1px),
                            linear-gradient(90deg, #1d2022 1px, transparent 1px)
                          `,
                          backgroundSize: `${CELL}px ${CELL}px`,
                        }}
                        onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setShelfCol(Math.max(0, Math.min(Math.floor((e.clientX - rect.left) / CELL), shelfGridCols - 1)));
                          setShelfRow(Math.max(0, Math.min(Math.floor((e.clientY - rect.top) / CELL), shelfGridRows - 1)));
                        }}
                      >
                        {/* Position indicator */}
                        <div style={{
                          position: 'absolute',
                          left: shelfCol * CELL,
                          top: shelfRow * CELL,
                          width: Math.min(currentUHeight * 12, shelfGridCols - shelfCol) * CELL,
                          height: Math.min(currentUHeight * 12, shelfGridRows - shelfRow) * CELL,
                          background: 'rgba(196, 124, 90, 0.2)',
                          border: '2px solid #c47c5a',
                          borderRadius: 2,
                          pointerEvents: 'none',
                        }} />
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={BTN_SECONDARY} onClick={() => setStep(1)}>← Back</button>
              <button style={BTN_PRIMARY} onClick={() => setStep(3)}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Basic Info ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>
                Device name <span style={{ color: '#c47c5a' }}>*</span>
              </div>
              <input
                style={INPUT_STYLE}
                placeholder="e.g. Proxmox Node 1"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Device type</div>
              <select
                style={INPUT_STYLE}
                value={typeId}
                onChange={e => setTypeId(e.target.value)}
              >
                {deviceTypes.map(dt => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>IP address</div>
              <input
                style={INPUT_STYLE}
                placeholder="e.g. 192.168.1.10"
                value={ip}
                onChange={e => setIp(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Serial</div>
                <input style={INPUT_STYLE} value={serial} onChange={e => setSerial(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Asset tag</div>
                <input style={INPUT_STYLE} value={assetTag} onChange={e => setAssetTag(e.target.value)} />
              </div>
            </div>

            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Notes</div>
              <textarea
                style={{ ...INPUT_STYLE, minHeight: 72, resize: 'vertical' }}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {error && (
              <div style={{
                background: '#2a0e0e', border: '1px solid #8a2020', borderRadius: 4,
                padding: '8px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif',
                color: '#e84040',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                style={BTN_SECONDARY}
                onClick={() => setStep(2)}
                disabled={createDevice.isPending}
              >
                ← Back
              </button>
              <button
                style={{
                  ...BTN_PRIMARY,
                  opacity: (!name.trim() || createDevice.isPending) ? 0.6 : 1,
                  cursor: (!name.trim() || createDevice.isPending) ? 'not-allowed' : 'pointer',
                }}
                disabled={!name.trim() || createDevice.isPending}
                onClick={handleDeploy}
              >
                {createDevice.isPending ? 'Deploying…' : 'Deploy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
