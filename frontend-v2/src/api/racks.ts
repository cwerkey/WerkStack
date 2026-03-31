import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Rack } from '@werkstack/shared';

export function useGetRacks(siteId: string) {
  return useQuery({
    queryKey: ['racks', siteId],
    queryFn: () => api.get<Rack[]>(`/api/sites/${siteId}/racks`),
    enabled: !!siteId,
  });
}

export function useCreateRack(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Rack>) =>
      api.post<Rack>(`/api/sites/${siteId}/racks`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['racks', siteId] }),
  });
}

export function useUpdateRack(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Rack> & { id: string }) =>
      api.patch<Rack>(`/api/sites/${siteId}/racks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['racks', siteId] }),
  });
}

export function useDeleteRack(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/api/sites/${siteId}/racks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['racks', siteId] }),
  });
}
