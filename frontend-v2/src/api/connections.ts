import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Connection } from '@werkstack/shared';

export function useGetDeviceConnections(siteId: string, deviceId: string) {
  return useQuery({
    queryKey: ['connections', siteId, deviceId],
    queryFn: () => api.get<Connection[]>(`/api/sites/${siteId}/devices/${deviceId}/connections`),
    enabled: !!siteId && !!deviceId,
  });
}

export function useDeleteConnectionsByDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.delete<void>(`/api/sites/${siteId}/devices/${deviceId}/connections`),
    onSuccess: (_data, deviceId) => {
      qc.invalidateQueries({ queryKey: ['connections', siteId, deviceId] });
    },
  });
}
