import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import {
  useGetActivityStatus,
  useGetActivityEvents,
  type DeviceStatus,
  type EventType,
  type DeviceEvent,
  type DeviceStatusEntry,
} from '@/api/activity';
import styles from './ActivityPage.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const content = [headers, ...rows]
    .map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgoLabel(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const STATUS_DOT_COLOR: Record<DeviceStatus, string> = {
  up:       '#22c55e',
  degraded: '#f59e0b',
  down:     '#ef4444',
  unknown:  '#6b7280',
};

const STATUS_TEXT_COLOR: Record<DeviceStatus, string> = {
  up:       '#22c55e',
  degraded: '#f59e0b',
  down:     '#ef4444',
  unknown:  '#6b7280',
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  status_change: 'Status Change',
  missed_ping:   'Missed Ping',
  recovery:      'Recovery',
  manual:        'Manual',
};

const EVENT_BADGE_CLASS: Record<EventType, string> = {
  status_change: styles.badgeStatusChange,
  missed_ping:   styles.badgeMissedPing,
  recovery:      styles.badgeRecovery,
  manual:        styles.badgeManual,
};

const ALL_EVENT_TYPES: EventType[] = ['status_change', 'missed_ping', 'recovery', 'manual'];

// ── Sub-components ────────────────────────────────────────────────────────────

function DeviceCard({ entry, onClick }: { entry: DeviceStatusEntry; onClick: () => void }) {
  const dotColor = STATUS_DOT_COLOR[entry.currentStatus];
  const textColor = STATUS_TEXT_COLOR[entry.currentStatus];

  return (
    <div className={styles.deviceCard} onClick={onClick}>
      <div className={styles.cardTop}>
        <span
          className={styles.statusDot}
          style={{ background: dotColor }}
        />
        <span className={styles.cardName}>{entry.deviceName}</span>
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.statusText} style={{ color: textColor }}>
          {entry.currentStatus}
        </span>
        <span className={styles.cardDetail}>
          {entry.lastHeartbeat
            ? timeAgoLabel(Date.now() - new Date(entry.lastHeartbeat).getTime())
            : 'no heartbeat'}
          {entry.lastLatency != null && ` · ${entry.lastLatency}ms`}
        </span>
      </div>
    </div>
  );
}

function EventBadge({ type }: { type: EventType }) {
  return (
    <span className={`${styles.badge} ${EVENT_BADGE_CLASS[type] ?? styles.badgeManual}`}>
      {EVENT_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const navigate = useNavigate();
  const siteId = useSiteStore(s => s.currentSite?.id ?? '');

  const {
    data: statusData = [],
    isLoading: statusLoading,
    dataUpdatedAt,
    isFetching,
  } = useGetActivityStatus(siteId);

  const { data: allEvents = [], isLoading: eventsLoading } = useGetActivityEvents(siteId);

  // Filter state
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<string>('');

  // "Last updated" timer
  const [timeAgo, setTimeAgo] = useState<string>('just now');

  useEffect(() => {
    function update() {
      if (!dataUpdatedAt) return;
      setTimeAgo(timeAgoLabel(Date.now() - dataUpdatedAt));
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  // Device name lookup from status data
  const deviceNameMap = useMemo<Map<string, string>>(
    () => new Map(statusData.map(d => [d.deviceId, d.deviceName])),
    [statusData],
  );

  // Unique devices from events for the device dropdown
  const devicesInEvents = useMemo<Array<{ id: string; name: string }>>(() => {
    const seen = new Map<string, string>();
    for (const e of allEvents) {
      if (!seen.has(e.deviceId)) {
        seen.set(e.deviceId, deviceNameMap.get(e.deviceId) ?? e.deviceId);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allEvents, deviceNameMap]);

  // Filtered events
  const filteredEvents = useMemo<DeviceEvent[]>(() => {
    return allEvents.filter(ev => {
      if (eventTypeFilter && ev.eventType !== eventTypeFilter) return false;
      if (deviceFilter && ev.deviceId !== deviceFilter) return false;
      return true;
    });
  }, [allEvents, eventTypeFilter, deviceFilter]);

  function handleExport() {
    const headers = ['Timestamp', 'Device', 'Event Type', 'From State', 'To State'];
    const rows = filteredEvents.map(ev => [
      ev.createdAt,
      deviceNameMap.get(ev.deviceId) ?? ev.deviceId,
      ev.eventType,
      ev.fromState ?? '',
      ev.toState ?? '',
    ]);
    exportCsv('activity-log.csv', headers, rows);
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1>Activity</h1>
        <div className={styles.refreshInfo}>
          {isFetching && <span className={styles.spinner} />}
          Last updated: {timeAgo}
        </div>
        <button className={styles.exportBtn} onClick={handleExport}>
          Export CSV
        </button>
      </div>

      {/* Scrollable body */}
      <div className={styles.content}>
        {/* Device Status Cards */}
        <div className={styles.cardsSection}>
          <div className={styles.sectionLabel}>Device Status</div>
          {statusLoading ? (
            <div className={styles.loadingText}>Loading device status...</div>
          ) : statusData.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No monitored devices</div>
              <div className={styles.emptySubtext}>
                Devices will appear here once they send a heartbeat
              </div>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {statusData.map(entry => (
                <DeviceCard
                  key={entry.deviceId}
                  entry={entry}
                  onClick={() => navigate('/infrastructure/rack')}
                />
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className={styles.logSection}>
          <div className={styles.logHeader}>
            <span className={styles.logTitle}>Activity Log</span>
            <div className={styles.filterBar}>
              {/* All pill */}
              <button
                className={`${styles.filterPill} ${eventTypeFilter === null ? styles.filterPillActive : ''}`}
                onClick={() => setEventTypeFilter(null)}
              >
                All
              </button>
              {ALL_EVENT_TYPES.map(t => (
                <button
                  key={t}
                  className={`${styles.filterPill} ${eventTypeFilter === t ? styles.filterPillActive : ''}`}
                  onClick={() => setEventTypeFilter(eventTypeFilter === t ? null : t)}
                >
                  {EVENT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            {/* Device filter */}
            <select
              className={styles.deviceSelect}
              value={deviceFilter}
              onChange={e => setDeviceFilter(e.target.value)}
            >
              <option value="">All devices</option>
              {devicesInEvents.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {eventsLoading ? (
            <div className={styles.loadingText}>Loading activity log...</div>
          ) : filteredEvents.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No activity recorded yet</div>
            </div>
          ) : (
            <table className={styles.eventTable}>
              <thead>
                <tr>
                  <th className={styles.eventTh}>Time</th>
                  <th className={styles.eventTh}>Device</th>
                  <th className={styles.eventTh}>Event</th>
                  <th className={styles.eventTh}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map(ev => (
                  <tr key={ev.id} className={styles.eventRow}>
                    <td className={styles.eventTd}>
                      <span className={styles.eventTime}>
                        {formatTimestamp(ev.createdAt)}
                      </span>
                    </td>
                    <td className={styles.eventTd}>
                      <span className={styles.eventDevice}>
                        {deviceNameMap.get(ev.deviceId) ?? ev.deviceId}
                      </span>
                    </td>
                    <td className={styles.eventTd}>
                      <EventBadge type={ev.eventType} />
                    </td>
                    <td className={styles.eventTd}>
                      {ev.fromState && ev.toState ? (
                        <span className={styles.stateArrow}>
                          <span style={{ color: STATUS_TEXT_COLOR[ev.fromState as DeviceStatus] ?? '#8a9299' }}>
                            {ev.fromState}
                          </span>
                          <span>→</span>
                          <span style={{ color: STATUS_TEXT_COLOR[ev.toState as DeviceStatus] ?? '#8a9299' }}>
                            {ev.toState}
                          </span>
                        </span>
                      ) : ev.fromState ? (
                        <span className={styles.eventTime}>{ev.fromState}</span>
                      ) : ev.toState ? (
                        <span className={styles.eventTime}>{ev.toState}</span>
                      ) : (
                        <span className={styles.eventTime}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
