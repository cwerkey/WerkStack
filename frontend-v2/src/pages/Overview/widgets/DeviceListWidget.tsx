import { useNavigate } from 'react-router-dom';
import type { WidgetDevice } from '@/api/dashboard';

const STATUS_COLOR: Record<string, string> = {
  up:          'var(--color-success)',
  down:        'var(--color-error)',
  degraded:    'var(--color-warning)',
  maintenance: 'var(--color-info)',
  unknown:     'var(--color-text-dim)',
};

interface Props {
  devices: WidgetDevice[];
}

export function DeviceListWidget({ devices }: Props) {
  const navigate = useNavigate();

  function handleDeviceClick(d: WidgetDevice) {
    if (d.zoneId && d.rackId) {
      navigate(`/infrastructure/rack/${d.zoneId}/${d.rackId}/${d.id}`);
    } else if (d.rackId) {
      navigate(`/infrastructure/rack/-/${d.rackId}/${d.id}`);
    } else {
      navigate('/infrastructure/devices');
    }
  }

  if (devices.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>
        No devices found
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>Name</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>Type</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>IP</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(d => (
            <tr
              key={d.id}
              onClick={() => handleDeviceClick(d)}
              style={{ cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
              className="device-row"
            >
              <td style={{ padding: '6px 8px', color: 'var(--color-text)', fontWeight: 500 }}>{d.name}</td>
              <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)' }}>{d.typeName}</td>
              <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                {d.ip ?? '—'}
              </td>
              <td style={{ padding: '6px 8px' }}>
                {d.currentStatus ? (
                  <span style={{
                    display: 'inline-block',
                    width: 7, height: 7,
                    borderRadius: '50%',
                    background: STATUS_COLOR[d.currentStatus] ?? STATUS_COLOR.unknown,
                    marginRight: 5,
                  }} />
                ) : null}
                <span style={{ color: d.currentStatus ? STATUS_COLOR[d.currentStatus] ?? STATUS_COLOR.unknown : 'var(--color-text-dim)', fontSize: '11px' }}>
                  {d.currentStatus ?? 'unknown'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
