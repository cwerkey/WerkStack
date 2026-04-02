import { useState, useEffect } from 'react';
import { useGetMonitorConfig, useUpdateMonitorConfig, type MonitorConfig } from '@/api/activity';
import styles from './ThemeSettings.module.css';

const DEFAULTS: MonitorConfig = { intervalS: 60, timeoutMs: 5000, missedThreshold: 2 };

export default function MonitoringSettings({ siteId }: { siteId: string }) {
  const { data: config } = useGetMonitorConfig(siteId);
  const updateConfig = useUpdateMonitorConfig(siteId);

  const [intervalS, setIntervalS] = useState(DEFAULTS.intervalS);
  const [timeoutMs, setTimeoutMs] = useState(DEFAULTS.timeoutMs);
  const [missedThreshold, setMissedThreshold] = useState(DEFAULTS.missedThreshold);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setIntervalS(config.intervalS);
      setTimeoutMs(config.timeoutMs);
      setMissedThreshold(config.missedThreshold);
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate(
      { intervalS, timeoutMs, missedThreshold },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } },
    );
  };

  const dirty = config
    ? intervalS !== config.intervalS || timeoutMs !== config.timeoutMs || missedThreshold !== config.missedThreshold
    : false;

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-input-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: '5px 10px',
    color: 'var(--color-text)',
    fontSize: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    outline: 'none',
    width: 120,
  };

  if (!siteId) {
    return <div style={{ color: '#8a9299', fontSize: 13, padding: '20px 0' }}>Select a site to configure monitoring</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Ping Settings</p>
        <div className={styles.card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                Default Ping Interval (seconds)
              </div>
              <input
                style={inputStyle}
                type="number"
                min={10}
                max={3600}
                value={intervalS}
                onChange={e => setIntervalS(Math.max(10, parseInt(e.target.value) || 10))}
              />
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                How often the server pings each monitored device. Per-device overrides take priority.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                Timeout Threshold (ms)
              </div>
              <input
                style={inputStyle}
                type="number"
                min={500}
                max={30000}
                step={500}
                value={timeoutMs}
                onChange={e => setTimeoutMs(Math.max(500, parseInt(e.target.value) || 500))}
              />
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                How long to wait for a ping response before marking the device as down.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                Missed Heartbeat Threshold (multiplier)
              </div>
              <input
                style={inputStyle}
                type="number"
                min={1}
                max={10}
                value={missedThreshold}
                onChange={e => setMissedThreshold(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                If no heartbeat received within interval x this multiplier, generate a missed heartbeat event.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={!dirty || updateConfig.isPending}
              style={{
                background: dirty ? 'var(--color-accent, #c47c5a)' : '#2a3038',
                border: 'none',
                borderRadius: 4,
                padding: '5px 14px',
                fontSize: 12,
                color: dirty ? '#fff' : '#5a6068',
                fontWeight: 500,
                cursor: dirty ? 'pointer' : 'default',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {updateConfig.isPending ? 'Saving...' : 'Save'}
            </button>
            {saved && <span style={{ fontSize: 11, color: '#22c55e' }}>Saved</span>}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>How It Works</p>
        <div className={styles.card}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, fontFamily: 'Inter, system-ui, sans-serif' }}>
            The server pings each monitored device using ICMP (with TCP 443/80 fallback).
            Enable monitoring on individual devices in the Device Library.
            Status changes automatically generate events visible on the Activity page.
          </div>
        </div>
      </div>
    </div>
  );
}
