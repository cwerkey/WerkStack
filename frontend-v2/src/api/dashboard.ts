import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

export interface DashboardSummary {
  totalDevices:  number;
  openTickets:   number;
  stagedDevices: number;
  powerWatts:    number;
  rackCount:     number;
  driveCount:    number;
  subnetCount:   number;
  alertCount:    number;
}

export interface WidgetDevice {
  id:            string;
  name:          string;
  typeName:      string;
  ip?:           string;
  currentStatus?: string;
  rackId?:       string;
  zoneId?:       string;
}

export interface WidgetSubnet {
  id:        string;
  name:      string;
  cidr:      string;
  vlan?:     number;
  usedCount: number;
}

export interface WidgetPool {
  id:         string;
  name:       string;
  health:     string;
  driveCount: number;
  deviceName: string;
}

export interface WidgetActivity {
  id:         string;
  deviceId:   string;
  deviceName: string;
  eventType:  string;
  fromState?: string;
  toState?:   string;
  createdAt:  string;
}

export interface DashboardWidgetData {
  devices:    WidgetDevice[];
  subnets:    WidgetSubnet[];
  vlanCount:  number;
  pools:      WidgetPool[];
  driveCount: number;
  activity:   WidgetActivity[];
}

export interface LayoutItem {
  widgetKey: string;
  x:         number;
  y:         number;
  w:         number;
  h:         number;
  visible:   boolean;
}

export function useGetDashboardSummary(siteId: string) {
  return useQuery({
    queryKey: ['dashboard-summary', siteId],
    queryFn:  () => api.get<DashboardSummary>(`/api/sites/${siteId}/overview`),
    enabled:  !!siteId,
  });
}

export function useGetDashboardWidgetData(siteId: string) {
  return useQuery({
    queryKey: ['dashboard-widgets', siteId],
    queryFn:  () => api.get<DashboardWidgetData>(`/api/sites/${siteId}/overview/widgets`),
    enabled:  !!siteId,
  });
}

export function useGetDashboardLayout(siteId: string) {
  return useQuery({
    queryKey: ['dashboard-layout', siteId],
    queryFn:  () => api.get<LayoutItem[]>(`/api/sites/${siteId}/overview/layout`),
    enabled:  !!siteId,
  });
}

export function useSaveDashboardLayout(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layout: LayoutItem[]) =>
      api.patch<{ ok: boolean }>(`/api/sites/${siteId}/overview/layout`, { layout }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-layout', siteId] }),
  });
}
