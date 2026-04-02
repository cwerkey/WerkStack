import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeviceStatus = 'up' | 'down' | 'degraded' | 'unknown';
export type EventType = 'status_change' | 'missed_ping' | 'recovery' | 'manual';

export interface DeviceStatusEntry {
  deviceId: string;
  deviceName: string;
  typeId: string;
  currentStatus: DeviceStatus;
  monitorEnabled: boolean;
  monitorIp: string | null;
  monitorIntervalS: number;
  maintenanceMode: boolean;
  lastHeartbeat?: string;
  lastLatency?: number;
}

export interface StackStatusEntry {
  kind: 'container' | 'app';
  id: string;
  name: string;
  image?: string;   // container only
  typeId?: string;  // app only
  currentStatus: string;
  monitorEnabled: boolean;
  monitorIp: string | null;
  monitorIntervalS: number;
  hostId: string | null;
  vmId?: string | null;    // app only
  deviceId: string | null;
}

export interface MonitorConfig {
  intervalS: number;
  timeoutMs: number;
  missedThreshold: number;
}

export interface DeviceMonitorUpdate {
  monitorEnabled: boolean;
  monitorIp?: string | null;
  monitorIntervalS?: number;
  maintenanceMode?: boolean;
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

export function useGetStackStatus(siteId: string) {
  return useQuery({
    queryKey: ['monitor-stack-status', siteId],
    queryFn: () => api.get<StackStatusEntry[]>(`/api/sites/${siteId}/monitor/stack-status`),
    enabled: !!siteId,
    refetchInterval: 120_000,
  });
}

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

// ── Monitor Config Hooks ─────────────────────────────────────────────────────

export function useGetMonitorConfig(siteId: string) {
  return useQuery({
    queryKey: ['monitor-config', siteId],
    queryFn: () => api.get<MonitorConfig>(`/api/sites/${siteId}/monitor/config`),
    enabled: !!siteId,
  });
}

export function useUpdateMonitorConfig(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MonitorConfig) =>
      api.put<MonitorConfig>(`/api/sites/${siteId}/monitor/config`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitor-config', siteId] }),
  });
}

export function useUpdateDeviceMonitor(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, ...body }: DeviceMonitorUpdate & { deviceId: string }) =>
      api.put(`/api/sites/${siteId}/monitor/devices/${deviceId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor-status', siteId] });
      qc.invalidateQueries({ queryKey: ['devices', siteId] });
    },
  });
}
