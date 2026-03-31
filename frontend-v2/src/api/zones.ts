import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Zone } from '@werkstack/shared';

export function useGetZones(siteId: string) {
  return useQuery({
    queryKey: ['zones', siteId],
    queryFn: () => api.get<Zone[]>(`/api/sites/${siteId}/zones`),
    enabled: !!siteId,
  });
}
