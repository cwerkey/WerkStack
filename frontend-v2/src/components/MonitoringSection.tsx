import { useState, useEffect } from 'react';
import type { DeviceInstance } from '@werkstack/shared';

interface MonitoringSectionProps {
  device: DeviceInstance;
  onMonitorUpdate: (deviceId: string, enabled: boolean, ip: string | null, intervalS?: number) => void;
}

export function MonitoringSection({ device, onMonitorUpdate }: MonitoringSectionProps) {
  const enabled = device.monitorEnabled ?? false;
  const [monitorIp, setMonitorIp] = useState(device.monitorIp ?? device.ip ?? '');
  const [intervalS, setIntervalS] = useState(device.monitorIntervalS ?? 60);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    setMonitorIp(device.monitorIp ?? device.ip ?? '');
    setIntervalS(device.monitorIntervalS ?? 60);
    setShowConfig(false);
  }, [device.id]);

  const toggleStyle: React.CSSProperties = {
    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
    background: enabled ? '#22c55e' : '#3a4248',
    position: 'relative', transition: 'background 0.2s',
  };

  const dotStyle: React.CSSProperties = {
    width: 14, height: 14, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 3,
    left: enabled ? 19 : 3, transition: 'left 0.2s',
  };

  const inputStyle: React.CSSProperties = {
    background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
    padding: '4px 8px', fontSize: 12, color: '#d4d9dd', outline: 'none',
    width: '100%', fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box',
  };

  return (
    <div style={{ borderTop: '1px solid #2a3038', padding: '12px 16px' }}>
      <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        Monitoring
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          style={toggleStyle}
          onClick={() => onMonitorUpdate(device.id, !enabled, monitorIp || null, intervalS)}
        >
          <span style={dotStyle} />
        </button>
        <span style={{ fontSize: 12, color: enabled ? '#22c55e' : '#8a9299' }}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
        {enabled && (
          <button
            onClick={() => setShowConfig(c => !c)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8a9299', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {showConfig ? 'Hide' : 'Configure'}
          </button>
        )}
      </div>

      {enabled && showConfig && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
              Ping IP
            </div>
            <input
              style={inputStyle}
              value={monitorIp}
              onChange={e => setMonitorIp(e.target.value)}
              placeholder={device.ip ?? 'e.g. 192.168.1.1'}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
              Interval (seconds)
            </div>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={10}
              max={3600}
              value={intervalS}
              onChange={e => setIntervalS(Math.max(10, parseInt(e.target.value) || 10))}
            />
          </div>
          <button
            onClick={() => onMonitorUpdate(device.id, true, monitorIp || null, intervalS)}
            style={{ background: '#c47c5a', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 11, color: '#fff', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            Save
          </button>
        </div>
      )}

      {enabled && !showConfig && device.currentStatus && (
        <div style={{ fontSize: 11, color: '#8a9299' }}>
          Status: <span style={{
            color: device.currentStatus === 'up' ? '#22c55e'
              : device.currentStatus === 'down' ? '#ef4444'
              : device.currentStatus === 'degraded' ? '#f59e0b' : '#6b7280',
            fontWeight: 500,
          }}>{device.currentStatus}</span>
          {device.monitorIp && <span> · {device.monitorIp}</span>}
        </div>
      )}
    </div>
  );
}
