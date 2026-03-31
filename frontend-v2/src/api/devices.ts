import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { DeviceInstance } from '@werkstack/shared';

export function useGetDevices(siteId: string) {
  return useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => api.get<DeviceInstance[]>(`/api/sites/${siteId}/devices`),
    enabled: !!siteId,
  });
}

export function useCreateDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<DeviceInstance>) =>
      api.post<DeviceInstance>(`/api/sites/${siteId}/devices`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', siteId] }),
  });
}

export function useUpdateDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<DeviceInstance> & { id: string }) =>
      api.patch<DeviceInstance>(`/api/sites/${siteId}/devices/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', siteId] }),
  });
}

export function useDeleteDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/api/sites/${siteId}/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', siteId] }),
  });
}

export function useUpdateDevicePosition(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; rackId?: string; rackU?: number; face?: 'front' | 'rear' }) =>
      api.patch<DeviceInstance>(`/api/sites/${siteId}/devices/${id}/position`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', siteId] }),
  });
}
