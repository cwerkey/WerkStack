import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { ModuleInstance } from '@werkstack/shared';

export function useGetModules(siteId: string, deviceId: string) {
  return useQuery({
    queryKey: ['modules', siteId, deviceId],
    queryFn: () => api.get<ModuleInstance[]>(`/api/sites/${siteId}/devices/${deviceId}/modules`),
    enabled: !!siteId && !!deviceId,
  });
}

export function useInstallModule(siteId: string, deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      slotBlockId: string;
      cardTemplateId: string;
      serialNumber?: string;
      assetTag?: string;
    }) =>
      api.post<ModuleInstance>(`/api/sites/${siteId}/devices/${deviceId}/modules`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', siteId, deviceId] }),
  });
}

export function useRemoveModule(siteId: string, deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) =>
      api.delete<void>(`/api/sites/${siteId}/devices/${deviceId}/modules/${moduleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', siteId, deviceId] }),
  });
}
