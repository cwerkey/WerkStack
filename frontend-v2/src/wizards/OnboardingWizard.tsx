import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Site, Zone, Rack, DeviceInstance, DeviceTemplate } from '@werkstack/shared';
import { api } from '@/utils/api';
import { uid } from '@/utils/uid';
import { useGetDeviceTemplates } from '@/api/templates';
import { useTypesStore } from '@/stores/typesStore';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { TemplateWizard } from './TemplateWizard';

interface OnboardingWizardProps {
  open: boolean;
  onComplete: (site: Site) => void;
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

const BTN_GHOST: React.CSSProperties = {
  background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer',
  fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', padding: '7px 0',
  textDecoration: 'underline',
};


const CARD_W = 220;

function TemplateCard({
  template,
  selected,
  onClick,
}: {
  template: DeviceTemplate;
  selected: boolean;
  onClick: () => void;
}) {
  const blocks = template.layout?.front ?? [];
  const gridCols = template.gridCols ?? 96;
  const gridRows = template.uHeight * 12;
  const previewH = Math.min(template.uHeight * 40, 120);

  return (
    <div
      onClick={onClick}
      style={{
        width: CARD_W,
        border: `1px solid ${selected ? '#c47c5a' : '#2a3038'}`,
        borderRadius: 6,
        background: selected ? '#c47c5a12' : '#0e1012',
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        outline: selected ? '1px solid #c47c5a' : 'none',
        outlineOffset: -1,
      }}
    >
      {/* Front-face preview */}
      <div style={{
        width: CARD_W,
        height: previewH,
        background: '#080a0c',
        borderBottom: '1px solid #1a1e22',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {blocks.length > 0 ? (
          <TemplateOverlay
            blocks={blocks}
            gridCols={gridCols}
            gridRows={gridRows}
            width={CARD_W}
            height={previewH}
            showLabels={false}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#3a4248', fontSize: 10,
            fontFamily: 'Inter,system-ui,sans-serif',
          }}>
            no layout
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, fontWeight: 600,
          color: '#d4d9dd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {template.make} {template.model}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            background: '#1a1e22', border: '1px solid #2a3038', borderRadius: 3,
            padding: '1px 6px', fontSize: 9, color: '#8a9299',
            fontFamily: 'Inter,system-ui,sans-serif', textTransform: 'lowercase',
          }}>
            {template.category}
          </span>
          <span style={{
            background: '#2a3038', borderRadius: 3,
            padding: '1px 6px', fontSize: 9, color: '#8a9299',
            fontFamily: 'Inter,system-ui,sans-serif',
          }}>
            {template.uHeight}U
          </span>
        </div>
      </div>
    </div>
  );
}


export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const qc = useQueryClient();
  const deviceTypes = useTypesStore(s => s.deviceTypes);
  const { data: templates = [] } = useGetDeviceTemplates();

  // Step 1
  const [siteName, setSiteName] = useState('My Lab');
  const [siteDesc, setSiteDesc] = useState('');

  // Step 2
  const [zoneNames, setZoneNames] = useState<string[]>(['Main Zone']);

  // Step 3
  const [racks, setRacks] = useState<{ id: string; name: string; uHeight: number; powerBudget?: number }[]>([
    { id: uid(), name: 'Main Rack', uHeight: 42 },
  ]);

  // Step 4: Templates
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false);

  // Step 5
  const [step5Choice, setStep5Choice] = useState<'skip' | 'template' | 'quick'>('skip');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [step5TemplateSearch, setStep5TemplateSearch] = useState('');
  const [quickDeviceName, setQuickDeviceName] = useState('');
  const [quickUHeight, setQuickUHeight] = useState(1);
  const [quickTypeId, setQuickTypeId] = useState('');
  const [deviceRackU, setDeviceRackU] = useState(1);
  const [deviceFace, setDeviceFace] = useState<'front' | 'rear'>('front');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSiteName('My Lab');
    setSiteDesc('');
    setZoneNames(['Main Zone']);
    setRacks([{ id: uid(), name: 'Main Rack', uHeight: 42 }]);
    setTemplateSearch('');
    setTemplateWizardOpen(false);
    setStep5Choice('skip');
    setSelectedTemplateId(null);
    setStep5TemplateSearch('');
    setQuickDeviceName('');
    setQuickUHeight(1);
    setQuickTypeId(deviceTypes[0]?.id ?? '');
    setDeviceRackU(1);
    setDeviceFace('front');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const filteredTemplates = templates.filter(t => {
    const q = templateSearch.toLowerCase();
    return (
      t.make.toLowerCase().includes(q) ||
      t.model.toLowerCase().includes(q) ||
      (t.manufacturer ?? '').toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  const step5Templates = templates.filter(t => {
    const q = step5TemplateSearch.toLowerCase();
    return (
      t.make.toLowerCase().includes(q) ||
      t.model.toLowerCase().includes(q) ||
      (t.manufacturer ?? '').toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  async function handleFinish() {
    setSubmitting(true);
    setError(null);
    try {
      const site = await api.post<Site>('/api/sites', {
        name: siteName.trim() || 'My Lab',
        description: siteDesc.trim() || undefined,
        location: siteName.trim() || 'My Lab',
        color: '#c47c5a',
      });

      const createdZones: Array<{ id: string }> = [];
      for (const zName of zoneNames.filter(n => n.trim())) {
        const z = await api.post<Zone>(`/api/sites/${site.id}/zones`, { name: zName.trim() });
        createdZones.push(z);
      }
      if (createdZones.length === 0) {
        const z = await api.post<Zone>(`/api/sites/${site.id}/zones`, { name: 'Main Zone' });
        createdZones.push(z);
      }

      const createdRacks: Array<{ id: string }> = [];
      for (const rack of racks.filter(r => r.name.trim())) {
        const r = await api.post<Rack>(`/api/sites/${site.id}/racks`, {
          name: rack.name.trim(),
          zoneId: createdZones[0]?.id,
          uHeight: rack.uHeight || 42,
          powerBudgetWatts: rack.powerBudget || undefined,
        });
        createdRacks.push(r);
      }

      if (step5Choice === 'template' && selectedTemplateId) {
        const tmpl = templates.find(t => t.id === selectedTemplateId);
        await api.post<DeviceInstance>(`/api/sites/${site.id}/devices`, {
          templateId: selectedTemplateId,
          typeId: quickTypeId || deviceTypes[0]?.id || '',
          name: tmpl ? `${tmpl.make} ${tmpl.model}` : 'New Device',
          rackId: createdRacks[0]?.id,
          zoneId: createdZones[0]?.id,
          rackU: deviceRackU,
          uHeight: tmpl?.uHeight ?? 1,
          face: deviceFace,
          isDraft: false,
        });
      } else if (step5Choice === 'quick' && quickDeviceName.trim()) {
        await api.post<DeviceInstance>(`/api/sites/${site.id}/devices`, {
          typeId: quickTypeId || deviceTypes[0]?.id || '',
          name: quickDeviceName.trim(),
          rackId: createdRacks[0]?.id,
          zoneId: createdZones[0]?.id,
          rackU: deviceRackU,
          uHeight: quickUHeight || 1,
          face: deviceFace,
          isDraft: false,
        });
      }

      localStorage.setItem('onboarding_complete', 'true');
      onComplete(site);
    } catch (e) {
      setError((e as Error).message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkipToCanvas() {
    setSubmitting(true);
    setError(null);
    try {
      const site = await api.post<Site>('/api/sites', {
        name: siteName.trim() || 'My Lab',
        location: siteName.trim() || 'My Lab',
        color: '#c47c5a',
      });
      localStorage.setItem('onboarding_complete', 'true');
      onComplete(site);
    } catch (e) {
      setError((e as Error).message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const stepState = (n: number): 'active' | 'done' | 'pending' =>
    n < step ? 'done' : n === step ? 'active' : 'pending';

  return (
    <>
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1a1e22', border: '1px solid #2a3038', borderRadius: 8,
          minWidth: 580, maxWidth: step === 4 ? 860 : 640,
          maxHeight: '88vh', overflowY: 'auto',
          padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 22,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <StepDot num={1} label="Site"      state={stepState(1)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <StepDot num={2} label="Zones"     state={stepState(2)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <StepDot num={3} label="Racks"     state={stepState(3)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <StepDot num={4} label="Templates" state={stepState(4)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <StepDot num={5} label="Device"    state={stepState(5)} />
        </div>

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
                Welcome to WerkStack. Let's set up your lab.
              </h2>
              <p style={{ margin: 0, fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#8a9299' }}>
                This takes about 2 minutes and can be changed anytime in Settings.
              </p>
            </div>

            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>
                Site name <span style={{ color: '#c47c5a' }}>*</span>
              </div>
              <input
                style={INPUT_STYLE}
                placeholder="e.g. My Lab"
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Description (optional)</div>
              <input
                style={INPUT_STYLE}
                placeholder="Brief description of this site"
                value={siteDesc}
                onChange={e => setSiteDesc(e.target.value)}
              />
            </div>

            {error && (
              <div style={{
                background: '#2a0e0e', border: '1px solid #8a2020', borderRadius: 4,
                padding: '8px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#e84040',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={BTN_GHOST} onClick={handleSkipToCanvas} disabled={submitting}>
                Skip to empty canvas →
              </button>
              <button
                style={{
                  ...BTN_PRIMARY,
                  opacity: !siteName.trim() ? 0.5 : 1,
                  cursor: !siteName.trim() ? 'not-allowed' : 'pointer',
                }}
                disabled={!siteName.trim() || submitting}
                onClick={() => setStep(2)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Zones ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
                Create your zones
              </h2>
              <p style={{ margin: 0, fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#8a9299' }}>
                Zones organize your racks and devices. Most homelabs need just one.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {zoneNames.map((zn, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...INPUT_STYLE }}
                    placeholder="Zone name"
                    value={zn}
                    onChange={e => {
                      const updated = [...zoneNames];
                      updated[i] = e.target.value;
                      setZoneNames(updated);
                    }}
                  />
                  {zoneNames.length > 1 && (
                    <button
                      onClick={() => setZoneNames(zoneNames.filter((_, j) => j !== i))}
                      style={{
                        background: 'none', border: '1px solid #2a3038', borderRadius: 4,
                        color: '#8a9299', cursor: 'pointer', fontSize: 14,
                        padding: '3px 8px', lineHeight: 1, flexShrink: 0,
                        fontFamily: 'Inter,system-ui,sans-serif',
                      }}
                      title="Remove zone"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setZoneNames([...zoneNames, ''])}
                style={{ ...BTN_SECONDARY, alignSelf: 'flex-start', marginTop: 4 }}
              >
                + Add another zone
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={BTN_GHOST} onClick={() => setStep(3)}>Skip →</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={BTN_SECONDARY} onClick={() => setStep(1)}>← Back</button>
                <button style={BTN_PRIMARY} onClick={() => setStep(3)}>Next →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Racks ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
                Add your racks
              </h2>
              <p style={{ margin: 0, fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#8a9299' }}>
                Add racks to your zone. You can also have devices without racks.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {racks.map((rack, i) => (
                <div
                  key={rack.id}
                  style={{
                    background: '#0e1012', border: '1px solid #2a3038', borderRadius: 6,
                    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...LABEL_STYLE, fontSize: 11, fontWeight: 500 }}>Rack {i + 1}</span>
                    {racks.length > 1 && (
                      <button
                        onClick={() => setRacks(racks.filter((_, j) => j !== i))}
                        style={{
                          background: 'none', border: 'none', color: '#8a9299',
                          cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                        }}
                        title="Remove rack"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div>
                    <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Rack name</div>
                    <input
                      style={INPUT_STYLE}
                      placeholder="e.g. Main Rack"
                      value={rack.name}
                      onChange={e => {
                        const updated = [...racks];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setRacks(updated);
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>U height</div>
                      <input
                        type="number" min={1} max={100}
                        style={INPUT_STYLE}
                        value={rack.uHeight}
                        onChange={e => {
                          const updated = [...racks];
                          updated[i] = { ...updated[i], uHeight: Math.max(1, Math.min(100, Number(e.target.value))) };
                          setRacks(updated);
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Power budget (W, optional)</div>
                      <input
                        type="number" min={0}
                        style={INPUT_STYLE}
                        placeholder="e.g. 1500"
                        value={rack.powerBudget ?? ''}
                        onChange={e => {
                          const updated = [...racks];
                          const val = e.target.value === '' ? undefined : Number(e.target.value);
                          updated[i] = { ...updated[i], powerBudget: val };
                          setRacks(updated);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setRacks([...racks, { id: uid(), name: '', uHeight: 42 }])}
                style={{ ...BTN_SECONDARY, alignSelf: 'flex-start' }}
              >
                + Add another rack
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={BTN_GHOST} onClick={() => setStep(4)}>Skip →</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={BTN_SECONDARY} onClick={() => setStep(2)}>← Back</button>
                <button style={BTN_PRIMARY} onClick={() => setStep(4)}>Next →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Template Library ── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
                Device templates
              </h2>
              <p style={{ margin: 0, fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#8a9299' }}>
                Templates define the physical faceplate of your devices. Browse what's available or create your own.
              </p>
            </div>

            {/* Search */}
            <input
              style={INPUT_STYLE}
              placeholder="Search by make, model, category…"
              value={templateSearch}
              onChange={e => setTemplateSearch(e.target.value)}
            />

            {/* Template card grid */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12,
              maxHeight: 320, overflowY: 'auto',
              padding: '4px 2px',
            }}>
              {filteredTemplates.length === 0 && (
                <div style={{
                  color: '#5a6068', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif',
                  padding: '24px 0', width: '100%', textAlign: 'center',
                }}>
                  {templates.length === 0 ? 'No templates yet — create one below.' : 'No templates match your search.'}
                </div>
              )}
              {filteredTemplates.map(t => (
                <TemplateCard key={t.id} template={t} selected={false} onClick={() => {}} />
              ))}
            </div>

            {/* Create new template — opens TemplateWizard */}
            <button
              style={{
                ...BTN_SECONDARY,
                alignSelf: 'flex-start',
                display: 'flex', alignItems: 'center', gap: 6,
                borderStyle: 'dashed',
              }}
              onClick={() => setTemplateWizardOpen(true)}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Create new template
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={BTN_GHOST} onClick={() => setStep(5)}>Skip →</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={BTN_SECONDARY} onClick={() => setStep(3)}>← Back</button>
                <button style={BTN_PRIMARY} onClick={() => setStep(5)}>Next →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: First Device ── */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
                Add your first device
              </h2>
            </div>

            {/* Option cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { id: 'template', label: 'From template library', desc: 'Choose from predefined device templates' },
                { id: 'quick', label: 'Quick device', desc: 'Add a device without a template' },
                { id: 'skip', label: "I'll do this later", desc: 'Skip for now, add devices from the rack view' },
              ] as const).map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setStep5Choice(opt.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${step5Choice === opt.id ? '#c47c5a' : '#2a3038'}`,
                    background: step5Choice === opt.id ? '#c47c5a15' : '#0e1012',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    border: `2px solid ${step5Choice === opt.id ? '#c47c5a' : '#3a4248'}`,
                    background: step5Choice === opt.id ? '#c47c5a' : 'transparent',
                  }} />
                  <div>
                    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, fontWeight: 600, color: '#d4d9dd' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299', marginTop: 2 }}>
                      {opt.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Template search + list */}
            {step5Choice === 'template' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  style={INPUT_STYLE}
                  placeholder="Search templates…"
                  value={step5TemplateSearch}
                  onChange={e => setStep5TemplateSearch(e.target.value)}
                />
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {step5Templates.length === 0 && (
                    <div style={{ color: '#5a6068', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', padding: '12px 0', textAlign: 'center' }}>
                      No templates found
                    </div>
                  )}
                  {step5Templates.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      style={{
                        padding: '8px 10px', borderRadius: 4, cursor: 'pointer',
                        border: `1px solid ${selectedTemplateId === t.id ? '#c47c5a' : '#2a3038'}`,
                        background: selectedTemplateId === t.id ? '#c47c5a15' : '#0e1012',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, fontWeight: 600, color: '#d4d9dd' }}>
                          {t.make} {t.model}
                        </div>
                        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299' }}>{t.category}</div>
                      </div>
                      <div style={{
                        background: '#2a3038', borderRadius: 3, padding: '2px 7px',
                        fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299',
                      }}>
                        {t.uHeight}U
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick device form */}
            {step5Choice === 'quick' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Device name</div>
                  <input
                    style={INPUT_STYLE}
                    placeholder="e.g. My Server"
                    value={quickDeviceName}
                    onChange={e => setQuickDeviceName(e.target.value)}
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

            {/* Rack U + face */}
            {(step5Choice === 'template' || step5Choice === 'quick') && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Rack U position</div>
                  <input
                    type="number" min={1} max={42}
                    style={INPUT_STYLE}
                    value={deviceRackU}
                    onChange={e => setDeviceRackU(Math.max(1, Number(e.target.value)))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Face</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['front', 'rear'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setDeviceFace(f)}
                        style={{
                          ...BTN_SECONDARY,
                          background: deviceFace === f ? '#c47c5a' : '#1a1e22',
                          color: deviceFace === f ? '#fff' : '#d4d9dd',
                          borderColor: deviceFace === f ? '#c47c5a' : '#2a3038',
                          flex: 1,
                        }}
                      >
                        {f === 'front' ? 'Front' : 'Rear'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: '#2a0e0e', border: '1px solid #8a2020', borderRadius: 4,
                padding: '8px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#e84040',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={BTN_SECONDARY} onClick={() => setStep(4)} disabled={submitting}>
                ← Back
              </button>
              <button
                style={{
                  ...BTN_PRIMARY,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
                disabled={submitting}
                onClick={handleFinish}
              >
                {submitting ? 'Setting up…' : 'Finish'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Template Wizard — opens on top, returns here on complete */}
    <TemplateWizard
      open={templateWizardOpen}
      onComplete={() => {
        qc.invalidateQueries({ queryKey: ['templates', 'devices'] });
        setTemplateWizardOpen(false);
      }}
      onClose={() => setTemplateWizardOpen(false)}
    />
    </>
  );
}
