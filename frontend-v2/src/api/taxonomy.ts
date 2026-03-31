import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

export interface Taxonomy {
  id:          string;
  orgId:       string;
  siteId:      string;
  category:    'vlan' | 'device-role' | 'app-status';
  referenceId: string;
  colorHex:    string;
  iconSlug?:   string | null;
  createdAt:   string;
}

export function useGetTaxonomies(siteId: string) {
  return useQuery({
    queryKey: ['taxonomies', siteId],
    queryFn: () => api.get<Taxonomy[]>(`/api/sites/${siteId}/taxonomies`),
    enabled: !!siteId,
  });
}

export function useCreateTaxonomy(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<Taxonomy, 'category' | 'referenceId' | 'colorHex'> & { iconSlug?: string | null }) =>
      api.post<Taxonomy>(`/api/sites/${siteId}/taxonomies`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomies', siteId] }),
  });
}

export function useUpdateTaxonomy(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; referenceId?: string; colorHex?: string; iconSlug?: string | null }) =>
      api.patch<Taxonomy>(`/api/sites/${siteId}/taxonomies/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomies', siteId] }),
  });
}

export function useDeleteTaxonomy(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/api/sites/${siteId}/taxonomies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomies', siteId] }),
  });
}
