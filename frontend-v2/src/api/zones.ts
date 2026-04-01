import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Zone } from '@werkstack/shared';

export function useGetZones(siteId: string) {
  return useQuery({
    queryKey: ['zones', siteId],
    queryFn: () => api.get<Zone[]>(`/api/sites/${siteId}/zones`),
    enabled: !!siteId,
  });
}

export function useCreateZone(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.post<Zone>(`/api/sites/${siteId}/zones`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones', siteId] }),
  });
}
