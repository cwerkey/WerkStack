import { useState, useEffect } from 'react';
import type { OsVm } from '@werkstack/shared';
import wz from './VmWizard.module.css';

// -- Types --------------------------------------------------------------------

interface VmWizardProps {
  open:       boolean;
  hostId:     string;
  hostOsName: string;
  siteId:     string;
  onSubmit:   (vm: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onClose:    () => void;
}

interface VmDrive {
  label: string;
  size: string;
  mountpoint: string;
}

interface VmApp {
  name: string;
  port: string;
  url: string;
}

// -- Step dot -----------------------------------------------------------------

interface StepDotProps {
  num:   number;
  label: string;
  state: 'active' | 'done' | 'pending';
}

function StepDot({ num, label, state }: StepDotProps) {
  const color =
    state === 'active' ? '#c47c5a' :
    state === 'done'   ? '#3a8c4a' :
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
        {state === 'done' ? '\u2713' : num}
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

// -- Shared styles ------------------------------------------------------------

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

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 'auto',
  flex: 1,
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
  color: '#5a6068',
  fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const addRowBtnStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: '1px dashed #2a3038',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: '#5a6068',
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
  textAlign: 'left',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  background: 'none',
  border: '1px solid #3a4248',
  borderRadius: 4,
  color: '#8a9299',
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  background: '#c47c5a',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnDisabledStyle: React.CSSProperties = {
  ...btnPrimaryStyle,
  background: '#3a4248',
  cursor: 'not-allowed',
  opacity: 0.5,
};

// -- Main component -----------------------------------------------------------

export function VmWizard({
  open,
  hostId,
  hostOsName,
  onSubmit,
  onClose,
}: VmWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 - Basics
  const [name, setName]   = useState('');
  const [cpus, setCpus]   = useState<number | ''>('');
  const [ramGb, setRamGb] = useState<number | ''>('');
  const [vmOs, setVmOs]   = useState('');
  const [osVersion, setOsVersion] = useState('');

  // Step 2 - Network
  const [ip, setIp]       = useState('');
  const [extraIps, setExtraIps] = useState<{ label: string; ip: string }[]>([]);

  // Step 3 - Storage
  const [drives, setDrives] = useState<VmDrive[]>([]);

  // Step 4 - Apps
  const [vmApps, setVmApps] = useState<VmApp[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setName('');
      setCpus('');
      setRamGb('');
      setVmOs('');
      setOsVersion('');
      setIp('');
      setExtraIps([]);
      setDrives([]);
      setVmApps([]);
    }
  }, [open]);

  // Validation
  const canAdvanceStep1 = name.trim().length > 0;

  // Handlers
  function addDrive() {
    setDrives(prev => [...prev, { label: '', size: '', mountpoint: '' }]);
  }

  function updateDrive(index: number, field: keyof VmDrive, value: string) {
    setDrives(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  }

  function removeDrive(index: number) {
    setDrives(prev => prev.filter((_, i) => i !== index));
  }

  function addExtraIp() {
    setExtraIps(prev => [...prev, { label: '', ip: '' }]);
  }

  function updateExtraIp(index: number, field: 'label' | 'ip', value: string) {
    setExtraIps(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  function removeExtraIp(index: number) {
    setExtraIps(prev => prev.filter((_, i) => i !== index));
  }

  function addApp() {
    setVmApps(prev => [...prev, { name: '', port: '', url: '' }]);
  }

  function updateApp(index: number, field: keyof VmApp, value: string) {
    setVmApps(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  }

  function removeApp(index: number) {
    setVmApps(prev => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    const payload: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'> = {
      hostId,
      name: name.trim(),
      typeId: 'vt-vm',
      vmOs: vmOs || undefined,
      osVersion: osVersion || undefined,
      cpus: cpus !== '' ? cpus : undefined,
      ramGb: ramGb !== '' ? ramGb : undefined,
      ip: ip || undefined,
      extraIps: extraIps.filter(e => e.ip.trim()),
      drives: drives
        .filter(d => d.size.trim())
        .map(d => ({
          label: d.label || undefined,
          size: d.size,
          mountpoint: d.mountpoint || undefined,
        })) as OsVm['drives'],
      notes: undefined,
    };
    onSubmit(payload);
  }

  if (!open) return null;

  const stepState = (n: number): 'active' | 'done' | 'pending' =>
    step === n ? 'active' : step > n ? 'done' : 'pending';

  return (
    <div className={wz.overlay}>
      <div className={wz.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 16, fontWeight: 600,
            color: '#d4d9dd', margin: 0,
          }}>
            New Virtual Machine
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
          <StepDot num={1} label="Basics" state={stepState(1)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12, alignSelf: 'flex-start' }} />
          <StepDot num={2} label="Network" state={stepState(2)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12, alignSelf: 'flex-start' }} />
          <StepDot num={3} label="Storage" state={stepState(3)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12, alignSelf: 'flex-start' }} />
          <StepDot num={4} label="Apps" state={stepState(4)} />
        </div>

        {/* -- Step 1: Basics ------------------------------------------------ */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionStyle}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Host OS</span>
              <div style={readonlyRowStyle}>{hostOsName}</div>
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>VM Name *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. media-server"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ ...sectionStyle, flex: 1 }}>
                <label style={labelStyle}>vCPUs</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  placeholder="4"
                  value={cpus}
                  onChange={e => setCpus(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div style={{ ...sectionStyle, flex: 1 }}>
                <label style={labelStyle}>RAM (GB)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0.25}
                  step={0.25}
                  placeholder="16"
                  value={ramGb}
                  onChange={e => setRamGb(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ ...sectionStyle, flex: 1 }}>
                <label style={labelStyle}>Guest OS</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. Ubuntu Server"
                  value={vmOs}
                  onChange={e => setVmOs(e.target.value)}
                />
              </div>
              <div style={{ ...sectionStyle, flex: 1 }}>
                <label style={labelStyle}>Version</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. 22.04"
                  value={osVersion}
                  onChange={e => setOsVersion(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button style={btnSecondaryStyle} onClick={onClose}>
                Cancel
              </button>
              <button
                style={canAdvanceStep1 ? btnPrimaryStyle : btnDisabledStyle}
                disabled={!canAdvanceStep1}
                onClick={() => setStep(2)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* -- Step 2: Network ----------------------------------------------- */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionStyle}>
              <label style={labelStyle}>Primary IP Address</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. 10.0.0.50"
                value={ip}
                onChange={e => setIp(e.target.value)}
                autoFocus
              />
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>
                Additional IPs
                <span style={{ color: '#3a4248', marginLeft: 4 }}>(optional)</span>
              </label>
              {extraIps.map((entry, i) => (
                <div key={i} className={wz.dynamicRow}>
                  <input
                    style={smallInputStyle}
                    type="text"
                    placeholder="Label"
                    value={entry.label}
                    onChange={e => updateExtraIp(i, 'label', e.target.value)}
                  />
                  <input
                    style={smallInputStyle}
                    type="text"
                    placeholder="IP address"
                    value={entry.ip}
                    onChange={e => updateExtraIp(i, 'ip', e.target.value)}
                  />
                  <button className={wz.removeBtn} onClick={() => removeExtraIp(i)}>
                    ×
                  </button>
                </div>
              ))}
              <button style={addRowBtnStyle} onClick={addExtraIp}>
                + Add IP
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 11, color: '#5a6068', fontFamily: 'Inter,system-ui,sans-serif' }}>
              Network config is optional -- you can add it later.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button style={btnSecondaryStyle} onClick={() => setStep(1)}>
                Back
              </button>
              <button style={btnPrimaryStyle} onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </div>
        )}

        {/* -- Step 3: Storage ----------------------------------------------- */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionStyle}>
              <label style={labelStyle}>
                Virtual Disks
                <span style={{ color: '#3a4248', marginLeft: 4 }}>(optional)</span>
              </label>
              {drives.map((drive, i) => (
                <div key={i} className={wz.dynamicRow}>
                  <input
                    style={{ ...smallInputStyle, maxWidth: 100 }}
                    type="text"
                    placeholder="Label"
                    value={drive.label}
                    onChange={e => updateDrive(i, 'label', e.target.value)}
                  />
                  <input
                    style={{ ...smallInputStyle, maxWidth: 80 }}
                    type="text"
                    placeholder="Size"
                    value={drive.size}
                    onChange={e => updateDrive(i, 'size', e.target.value)}
                  />
                  <input
                    style={smallInputStyle}
                    type="text"
                    placeholder="Mountpoint"
                    value={drive.mountpoint}
                    onChange={e => updateDrive(i, 'mountpoint', e.target.value)}
                  />
                  <button className={wz.removeBtn} onClick={() => removeDrive(i)}>
                    ×
                  </button>
                </div>
              ))}
              <button style={addRowBtnStyle} onClick={addDrive}>
                + Add Disk
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 11, color: '#5a6068', fontFamily: 'Inter,system-ui,sans-serif' }}>
              Storage config is optional -- you can add disks later.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button style={btnSecondaryStyle} onClick={() => setStep(2)}>
                Back
              </button>
              <button style={btnPrimaryStyle} onClick={() => setStep(4)}>
                Next
              </button>
            </div>
          </div>
        )}

        {/* -- Step 4: Apps -------------------------------------------------- */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Summary */}
            <div style={{
              padding: '10px 12px', borderRadius: 4,
              background: '#0e1012', border: '1px solid #2a3038',
              fontSize: 12, color: '#8a9299', fontFamily: 'Inter,system-ui,sans-serif',
              lineHeight: 1.6,
            }}>
              <span style={{ color: '#d4d9dd', fontWeight: 500 }}>{name}</span>
              {cpus !== '' && (
                <span style={{ color: '#4a9a8a', marginLeft: 8 }}>{cpus}C</span>
              )}
              {ramGb !== '' && (
                <span style={{ color: '#9a9a4a', marginLeft: 4 }}>{ramGb}GB</span>
              )}
              {ip && (
                <span style={{ color: '#5a6068', marginLeft: 8 }}>{ip}</span>
              )}
              {drives.length > 0 && (
                <span style={{ color: '#5a6068', marginLeft: 8 }}>
                  {drives.length} disk{drives.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>
                Apps
                <span style={{ color: '#3a4248', marginLeft: 4 }}>(optional)</span>
              </label>
              {vmApps.map((app, i) => (
                <div key={i} className={wz.dynamicRow}>
                  <input
                    style={{ ...smallInputStyle, maxWidth: 120 }}
                    type="text"
                    placeholder="App name"
                    value={app.name}
                    onChange={e => updateApp(i, 'name', e.target.value)}
                  />
                  <input
                    style={{ ...smallInputStyle, maxWidth: 60 }}
                    type="text"
                    placeholder="Port"
                    value={app.port}
                    onChange={e => updateApp(i, 'port', e.target.value)}
                  />
                  <input
                    style={smallInputStyle}
                    type="text"
                    placeholder="URL"
                    value={app.url}
                    onChange={e => updateApp(i, 'url', e.target.value)}
                  />
                  <button className={wz.removeBtn} onClick={() => removeApp(i)}>
                    ×
                  </button>
                </div>
              ))}
              <button style={addRowBtnStyle} onClick={addApp}>
                + Add App
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button style={btnSecondaryStyle} onClick={() => setStep(3)}>
                Back
              </button>
              <button
                style={{ ...btnPrimaryStyle, fontWeight: 600 }}
                onClick={handleSubmit}
              >
                Create VM
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
