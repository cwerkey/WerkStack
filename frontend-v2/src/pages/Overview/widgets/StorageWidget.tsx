import { useNavigate } from 'react-router-dom';
import type { WidgetPool } from '@/api/dashboard';

const HEALTH_COLOR: Record<string, string> = {
  online:   'var(--color-success)',
  degraded: 'var(--color-warning)',
  faulted:  'var(--color-error)',
  offline:  'var(--color-error)',
  unknown:  'var(--color-text-dim)',
};

interface Props {
  pools:      WidgetPool[];
  driveCount: number;
}

export function StorageWidget({ pools, driveCount }: Props) {
  const navigate = useNavigate();

  if (pools.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>
        No storage pools configured
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: '100%', padding: '4px 0' }}>
      <div style={{ padding: '4px 8px 10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
        {driveCount} drive{driveCount !== 1 ? 's' : ''} total
      </div>
      {pools.map(p => (
        <div
          key={p.id}
          onClick={() => navigate('/storage/pools')}
          style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
          className="storage-row"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text)' }}>{p.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 2 }}>
                on {p.deviceName} · {p.driveCount} drive{p.driveCount !== 1 ? 's' : ''}
              </div>
            </div>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 'var(--radius-sm)',
              background: HEALTH_COLOR[p.health] ? `${HEALTH_COLOR[p.health]}22` : 'var(--color-surface-2)',
              color: HEALTH_COLOR[p.health] ?? 'var(--color-text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {p.health}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
