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

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; location?: string; color?: string; description?: string }) =>
      api.patch<Site>(`/api/sites/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/sites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useSeedDemo() {
  return useMutation({
    mutationFn: (siteId: string) =>
      api.post<{ success: boolean; zones: number; racks: number; devices: number }>(
        `/api/sites/${siteId}/seed-demo`, {}
      ),
  });
}
