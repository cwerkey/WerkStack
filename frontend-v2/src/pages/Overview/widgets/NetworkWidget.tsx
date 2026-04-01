import { useNavigate } from 'react-router-dom';
import type { WidgetSubnet } from '@/api/dashboard';

interface Props {
  subnets:   WidgetSubnet[];
  vlanCount: number;
}

function cidrTotal(cidr: string): number {
  const bits = parseInt(cidr.split('/')[1] ?? '24', 10);
  return Math.max(0, Math.pow(2, 32 - bits) - 2);
}

export function NetworkWidget({ subnets, vlanCount }: Props) {
  const navigate = useNavigate();

  if (subnets.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>
        No subnets defined
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: '100%', padding: '4px 0' }}>
      {vlanCount > 0 && (
        <div style={{ padding: '4px 8px 10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {vlanCount} VLAN{vlanCount !== 1 ? 's' : ''} configured
        </div>
      )}
      {subnets.map(s => {
        const total   = cidrTotal(s.cidr);
        const pct     = total > 0 ? Math.min(100, Math.round((s.usedCount / total) * 100)) : 0;
        const barColor = pct > 90 ? 'var(--color-error)' : pct > 70 ? 'var(--color-warning)' : 'var(--color-accent)';

        return (
          <div
            key={s.id}
            onClick={() => navigate('/network/subnets')}
            style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
            className="network-row"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text)' }}>
                {s.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                {s.cidr}
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--color-border-2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>
                {s.usedCount} / {total} IPs
              </span>
              {s.vlan && (
                <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>VLAN {s.vlan}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
