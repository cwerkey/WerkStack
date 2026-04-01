import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Vlan } from '@werkstack/shared';

export function useGetVlans(siteId: string) {
  return useQuery({
    queryKey: ['vlans', siteId],
    queryFn: () => api.get<Vlan[]>(`/api/sites/${siteId}/vlans`),
    enabled: !!siteId,
  });
}

export function useCreateVlan(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Vlan, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<Vlan>(`/api/sites/${siteId}/vlans`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vlans', siteId] }),
  });
}

export function useUpdateVlan(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<Vlan, 'id' | 'orgId' | 'siteId' | 'createdAt'>>) =>
      api.patch<Vlan>(`/api/sites/${siteId}/vlans/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vlans', siteId] }),
  });
}

export function useDeleteVlan(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/api/sites/${siteId}/vlans/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vlans', siteId] }),
  });
}
