import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import { useNavStore } from '@/stores/navStore';
import {
  useGetActivityStatus,
  useGetActivityEvents,
  useGetStackStatus,
  useUpdateDeviceMonitor,
  type DeviceStatus,
  type EventType,
  type DeviceEvent,
  type DeviceStatusEntry,
  type StackStatusEntry,
} from '@/api/activity';
import { useToggleContainerMonitor } from '@/api/containers';
import { useToggleAppMonitor } from '@/api/os-stack';
import QueryErrorState from '@/components/QueryErrorState';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV } from '@/utils/exportUtils';
import styles from './ActivityPage.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

interface DeviceCardProps {
  entry: DeviceStatusEntry;
  siteId: string;
  onClick: () => void;
  onNavigate: () => void;
}

function DeviceCard({ entry, siteId, onClick, onNavigate }: DeviceCardProps) {
  const dotColor = entry.maintenanceMode ? '#f59e0b' : STATUS_DOT_COLOR[entry.currentStatus];
  const textColor = entry.maintenanceMode ? '#f59e0b' : STATUS_TEXT_COLOR[entry.currentStatus];
  const [editorOpen, setEditorOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configIp, setConfigIp] = useState(entry.monitorIp ?? '');
  const [configInterval, setConfigInterval] = useState(String(entry.monitorIntervalS ?? 60));
  const editorRef = useRef<HTMLDivElement>(null);
  const updateMonitor = useUpdateDeviceMonitor(siteId);

  // Close editor on outside click
  useEffect(() => {
    if (!editorOpen) return;
    function handleClick(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setEditorOpen(false);
        setConfigOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editorOpen]);

  function handleToggleMonitor() {
    updateMonitor.mutate({ deviceId: entry.deviceId, monitorEnabled: !entry.monitorEnabled });
    setEditorOpen(false);
  }

  function handleToggleMaintenance() {
    updateMonitor.mutate({ deviceId: entry.deviceId, monitorEnabled: entry.monitorEnabled, maintenanceMode: !entry.maintenanceMode });
    setEditorOpen(false);
  }

  function handleSaveConfig() {
    updateMonitor.mutate({
      deviceId: entry.deviceId,
      monitorEnabled: entry.monitorEnabled,
      monitorIp: configIp || null,
      monitorIntervalS: parseInt(configInterval, 10) || 60,
    });
    setConfigOpen(false);
    setEditorOpen(false);
  }

  return (
    <div className={styles.deviceCard} onClick={onClick}>
      {/* Hover overlay controls */}
      <div className={styles.cardOverlay} onClick={e => e.stopPropagation()}>
        <button
          className={styles.cardNavBtn}
          title="Open in rack view"
          onClick={e => { e.stopPropagation(); onNavigate(); }}
        >
          ↗
        </button>
        <div className={styles.cardEditorWrap} ref={editorRef}>
          <button
            className={styles.cardEditorBtn}
            title="Quick settings"
            onClick={e => { e.stopPropagation(); setEditorOpen(v => !v); setConfigOpen(false); }}
          >
            ⋯
          </button>
          {editorOpen && (
            <div className={styles.editorDropdown}>
              <button className={styles.editorItem} onClick={handleToggleMonitor}>
                {entry.monitorEnabled ? 'Disable monitoring' : 'Enable monitoring'}
              </button>
              {entry.monitorEnabled && (
                <button className={styles.editorItem} onClick={handleToggleMaintenance}>
                  {entry.maintenanceMode ? 'Exit maintenance' : 'Enter maintenance'}
                </button>
              )}
              <button className={styles.editorItem} onClick={() => { setConfigOpen(v => !v); }}>
                Configure...
              </button>
              {configOpen && (
                <div className={styles.configPopup}>
                  <label className={styles.configLabel}>
                    Ping IP
                    <input
                      className={styles.configInput}
                      value={configIp}
                      onChange={e => setConfigIp(e.target.value)}
                      placeholder={entry.monitorIp ?? 'device IP'}
                    />
                  </label>
                  <label className={styles.configLabel}>
                    Interval (s)
                    <input
                      className={styles.configInput}
                      type="number"
                      min={10}
                      value={configInterval}
                      onChange={e => setConfigInterval(e.target.value)}
                    />
                  </label>
                  <button className={styles.configSaveBtn} onClick={handleSaveConfig}>
                    Save
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.cardTop}>
        <span
          className={styles.statusDot}
          style={{ background: dotColor }}
        />
        <span className={styles.cardName}>{entry.deviceName}</span>
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.statusText} style={{ color: textColor }}>
          {entry.maintenanceMode ? 'maintenance' : entry.currentStatus}
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

// ── Stack Card (containers + apps) ────────────────────────────────────────────

const CONTAINER_STATUS_COLOR: Record<string, string> = {
  running: '#22c55e',
  stopped: '#ef4444',
  paused:  '#f59e0b',
  unknown: '#6b7280',
};

interface StackCardProps {
  entry: StackStatusEntry;
  siteId: string;
  onClick: () => void;
}

function StackCard({ entry, siteId, onClick }: StackCardProps) {
  const dotColor = entry.kind === 'container'
    ? (CONTAINER_STATUS_COLOR[entry.currentStatus] ?? '#6b7280')
    : '#6b7280';
  const textColor = dotColor;

  const [editorOpen, setEditorOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configIp, setConfigIp] = useState(entry.monitorIp ?? '');
  const [configInterval, setConfigInterval] = useState(String(entry.monitorIntervalS ?? 60));
  const editorRef = useRef<HTMLDivElement>(null);
  const toggleContainerMonitor = useToggleContainerMonitor(siteId);
  const toggleAppMonitor = useToggleAppMonitor(siteId);

  useEffect(() => {
    if (!editorOpen) return;
    function handleClick(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setEditorOpen(false);
        setConfigOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editorOpen]);

  function handleToggleMonitor() {
    if (entry.kind === 'container') {
      toggleContainerMonitor.mutate({ containerId: entry.id, monitorEnabled: !entry.monitorEnabled });
    } else {
      toggleAppMonitor.mutate({ appId: entry.id, monitorEnabled: !entry.monitorEnabled });
    }
    setEditorOpen(false);
  }

  function handleSaveConfig() {
    if (entry.kind === 'container') {
      toggleContainerMonitor.mutate({
        containerId: entry.id,
        monitorEnabled: entry.monitorEnabled,
        monitorIp: configIp || null,
        monitorIntervalS: parseInt(configInterval, 10) || 60,
      });
    } else {
      toggleAppMonitor.mutate({
        appId: entry.id,
        monitorEnabled: entry.monitorEnabled,
        monitorIp: configIp || null,
        monitorIntervalS: parseInt(configInterval, 10) || 60,
      });
    }
    setConfigOpen(false);
    setEditorOpen(false);
  }

  const subtitle = entry.kind === 'container' ? (entry.image ?? '') : (entry.typeId ?? 'app');

  return (
    <div className={styles.deviceCard} onClick={onClick}>
      <div className={styles.cardOverlay} onClick={e => e.stopPropagation()}>
        <div className={styles.cardEditorWrap} ref={editorRef}>
          <button
            className={styles.cardEditorBtn}
            title="Quick settings"
            onClick={e => { e.stopPropagation(); setEditorOpen(v => !v); setConfigOpen(false); }}
          >
            ⋯
          </button>
          {editorOpen && (
            <div className={styles.editorDropdown}>
              <button className={styles.editorItem} onClick={handleToggleMonitor}>
                {entry.monitorEnabled ? 'Disable monitoring' : 'Enable monitoring'}
              </button>
              <button className={styles.editorItem} onClick={() => setConfigOpen(v => !v)}>
                Configure...
              </button>
              {configOpen && (
                <div className={styles.configPopup}>
                  <label className={styles.configLabel}>
                    Ping IP
                    <input
                      className={styles.configInput}
                      value={configIp}
                      onChange={e => setConfigIp(e.target.value)}
                      placeholder={entry.monitorIp ?? 'IP address'}
                    />
                  </label>
                  <label className={styles.configLabel}>
                    Interval (s)
                    <input
                      className={styles.configInput}
                      type="number"
                      min={10}
                      value={configInterval}
                      onChange={e => setConfigInterval(e.target.value)}
                    />
                  </label>
                  <button className={styles.configSaveBtn} onClick={handleSaveConfig}>
                    Save
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.cardTop}>
        <span className={styles.statusDot} style={{ background: dotColor }} />
        <span className={styles.cardName}>{entry.name}</span>
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.statusText} style={{ color: textColor }}>
          {entry.currentStatus}
        </span>
        <span className={styles.cardDetail}>{subtitle}</span>
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
  const navSelectDevice = useNavStore(s => s.selectDevice);

  const statusQ = useGetActivityStatus(siteId);
  const {
    data: statusData = [],
    isLoading: statusLoading,
    dataUpdatedAt,
    isFetching,
  } = statusQ;

  const { data: stackStatus = [], isLoading: stackLoading } = useGetStackStatus(siteId);

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

  // Only show devices with monitoring enabled in the status cards
  const monitoredDevices = useMemo(
    () => statusData.filter(d => d.monitorEnabled),
    [statusData],
  );

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

  function handleExportCsv() {
    const data = filteredEvents.map(ev => ({
      Timestamp: ev.createdAt,
      Device: deviceNameMap.get(ev.deviceId) ?? ev.deviceId,
      'Event Type': ev.eventType,
      'From State': ev.fromState ?? '',
      'To State': ev.toState ?? '',
    }));
    exportToCSV(data, 'werkstack-activity.csv');
  }

  return (
    <div className={styles.page}>
      {statusQ.error && <QueryErrorState error={statusQ.error} onRetry={() => statusQ.refetch()} />}
      {/* Header */}
      <div className={styles.header}>
        <h1>Activity</h1>
        <div className={styles.refreshInfo}>
          {isFetching && <span className={styles.spinner} />}
          Last updated: {timeAgo}
        </div>
        <ExportDropdown
          options={[
            { label: 'Export CSV', onSelect: handleExportCsv },
          ]}
          disabled={filteredEvents.length === 0}
        />
      </div>

      {/* Scrollable body */}
      <div className={styles.content}>
        {/* Device Status Cards */}
        <div className={styles.cardsSection}>
          <div className={styles.sectionLabel}>Device Status</div>
          {statusLoading ? (
            <div className={styles.loadingText}>Loading device status...</div>
          ) : monitoredDevices.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No monitored devices</div>
              <div className={styles.emptySubtext}>
                Enable monitoring on devices in the Device Library to see their status here
              </div>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {monitoredDevices.map(entry => (
                <DeviceCard
                  key={entry.deviceId}
                  entry={entry}
                  siteId={siteId}
                  onClick={() => setDeviceFilter(prev => prev === entry.deviceId ? '' : entry.deviceId)}
                  onNavigate={() => {
                    navSelectDevice(entry.deviceId);
                    navigate('/infrastructure/rack');
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Apps & Containers Status Cards */}
        {(stackLoading || stackStatus.length > 0) && (
          <div className={styles.cardsSection}>
            <div className={styles.sectionLabel}>Apps &amp; Containers</div>
            {stackLoading ? (
              <div className={styles.loadingText}>Loading...</div>
            ) : (
              <div className={styles.cardsGrid}>
                {stackStatus.map(entry => (
                  <StackCard
                    key={`${entry.kind}-${entry.id}`}
                    entry={entry}
                    siteId={siteId}
                    onClick={() => {
                      if (entry.deviceId) {
                        setDeviceFilter(prev => prev === entry.deviceId! ? '' : entry.deviceId!);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

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
