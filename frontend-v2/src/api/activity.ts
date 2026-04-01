import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeviceStatus = 'up' | 'down' | 'degraded' | 'unknown';
export type EventType = 'status_change' | 'missed_ping' | 'recovery' | 'manual';

export interface DeviceStatusEntry {
  deviceId: string;
  deviceName: string;
  typeId: string;
  currentStatus: DeviceStatus;
  lastHeartbeat?: string;
  lastLatency?: number;
}

export interface DeviceEvent {
  id: string;
  orgId: string;
  siteId: string;
  deviceId: string;
  eventType: EventType;
  fromState?: string;
  toState?: string;
  details?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
}

export interface Heartbeat {
  id: string;
  orgId: string;
  siteId: string;
  deviceId: string;
  status: DeviceStatus;
  latencyMs?: number;
  payload?: Record<string, unknown>;
  receivedAt: string;
}

export interface HeartbeatPayload {
  deviceId: string;
  status: DeviceStatus;
  latencyMs?: number;
  payload?: Record<string, unknown>;
}

// ── Query Hooks ───────────────────────────────────────────────────────────────

export function useGetActivityStatus(siteId: string) {
  return useQuery({
    queryKey: ['monitor-status', siteId],
    queryFn: () => api.get<DeviceStatusEntry[]>(`/api/sites/${siteId}/monitor/status`),
    enabled: !!siteId,
    refetchInterval: 120_000,
  });
}

export function useGetActivityEvents(
  siteId: string,
  filters?: { deviceId?: string; limit?: number },
) {
  const params = new URLSearchParams();
  if (filters?.deviceId) params.set('deviceId', filters.deviceId);
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: ['monitor-events', siteId, filters?.deviceId ?? '', filters?.limit ?? ''],
    queryFn: () =>
      api.get<DeviceEvent[]>(`/api/sites/${siteId}/monitor/events${qs ? `?${qs}` : ''}`),
    enabled: !!siteId,
  });
}

export function useGetDeviceHeartbeats(siteId: string, deviceId: string) {
  return useQuery({
    queryKey: ['monitor-heartbeats', siteId, deviceId],
    queryFn: () =>
      api.get<Heartbeat[]>(`/api/sites/${siteId}/monitor/heartbeats/${deviceId}`),
    enabled: !!siteId && !!deviceId,
  });
}

export function usePostHeartbeat(siteId: string) {
  return useMutation({
    mutationFn: (body: HeartbeatPayload) =>
      api.post<Heartbeat>(`/api/sites/${siteId}/monitor/heartbeat`, body),
  });
}
