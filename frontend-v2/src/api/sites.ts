import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Site } from '@werkstack/shared';

export function useGetSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Site[]>('/api/sites'),
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; location: string; color: string; description?: string }) =>
      api.post<Site>('/api/sites', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}
