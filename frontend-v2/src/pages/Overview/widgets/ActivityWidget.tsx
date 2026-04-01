import { useNavigate } from 'react-router-dom';
import type { WidgetActivity } from '@/api/dashboard';

const EVENT_ICON: Record<string, string> = {
  status_change:        '⬤',
  heartbeat_missed:     '✕',
  heartbeat_restored:   '✓',
  draft_created:        '+',
  draft_promoted:       '↑',
  draft_abandoned:      '×',
  install:              '↓',
  uninstall:            '↑',
  maintenance_start:    '⚙',
  maintenance_end:      '✓',
};

const EVENT_COLOR: Record<string, string> = {
  status_change:        'var(--color-warning)',
  heartbeat_missed:     'var(--color-error)',
  heartbeat_restored:   'var(--color-success)',
  draft_created:        'var(--color-info)',
  draft_promoted:       'var(--color-success)',
  draft_abandoned:      'var(--color-text-dim)',
  install:              'var(--color-info)',
  uninstall:            'var(--color-text-dim)',
  maintenance_start:    'var(--color-warning)',
  maintenance_end:      'var(--color-success)',
};

interface Props {
  activity: WidgetActivity[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ');
}

export function ActivityWidget({ activity }: Props) {
  const navigate = useNavigate();

  if (activity.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>
        No activity in the last 24h
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: '100%' }}>
      {activity.map(a => (
        <div
          key={a.id}
          onClick={() => navigate('/activity')}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '8px',
            borderBottom: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
          className="activity-row"
        >
          <span style={{
            flexShrink: 0,
            width: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px',
            color: EVENT_COLOR[a.eventType] ?? 'var(--color-text-dim)',
            fontWeight: 700,
          }}>
            {EVENT_ICON[a.eventType] ?? '·'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.deviceName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 1 }}>
              {formatEventType(a.eventType)}
              {a.fromState && a.toState ? ` · ${a.fromState} → ${a.toState}` : ''}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: '10px', color: 'var(--color-text-dim)', paddingTop: 2 }}>
            {timeAgo(a.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
