import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

export interface GuideManual {
  id: string;
  orgId: string;
  siteId: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
  isShared: boolean;
  createdAt: string;
}

export interface Guide {
  id: string;
  orgId: string;
  siteId: string;
  title: string;
  content: string;
  manualId: string | null;
  sortOrder: number;
  isLocked: boolean;
  isShared: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  manualName: string | null;
  links: GuideLink[];
}

export interface GuideLink {
  id: string;
  guideId: string;
  entityType: string;
  entityId: string;
}

// ── Manuals ───────────────────────────────────────────────────────────────────

export function useGetManuals(siteId: string) {
  return useQuery({
    queryKey: ['guide-manuals', siteId],
    queryFn:  () => api.get<GuideManual[]>(`/api/sites/${siteId}/guide-manuals`),
    enabled:  !!siteId,
  });
}

export function useCreateManual(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; sort_order?: number; parent_id?: string | null }) =>
      api.post<GuideManual>(`/api/sites/${siteId}/guide-manuals`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guide-manuals', siteId] }),
  });
}

export function useUpdateManual(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; sort_order?: number }) =>
      api.patch<GuideManual>(`/api/sites/${siteId}/guide-manuals/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guide-manuals', siteId] }),
  });
}

export function useDeleteManual(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/sites/${siteId}/guide-manuals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guide-manuals', siteId] }),
  });
}

// ── Guides ────────────────────────────────────────────────────────────────────

export function useGetGuides(siteId: string) {
  return useQuery({
    queryKey: ['guides', siteId],
    queryFn:  () => api.get<Guide[]>(`/api/sites/${siteId}/guides`),
    enabled:  !!siteId,
  });
}

export function useCreateGuide(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; content?: string; manual_id?: string | null; sort_order?: number }) =>
      api.post<Guide>(`/api/sites/${siteId}/guides`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guides', siteId] }),
  });
}

export function useUpdateGuide(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; content?: string; manual_id?: string | null; is_shared?: boolean }) =>
      api.patch<Guide>(`/api/sites/${siteId}/guides/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guides', siteId] }),
  });
}

export function useDeleteGuide(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/sites/${siteId}/guides/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guides', siteId] }),
  });
}

// ── Links (entity tags) ───────────────────────────────────────────────────────

export function useAddGuideLink(siteId: string, guideId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entityType: string; entityId: string }) =>
      api.post<GuideLink>(`/api/sites/${siteId}/guides/${guideId}/links`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guides', siteId] }),
  });
}

export function useDeleteGuideLink(siteId: string, guideId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      api.delete<void>(`/api/sites/${siteId}/guides/${guideId}/links/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guides', siteId] }),
  });
}

export interface GuideByEntity {
  id: string;
  title: string;
  manualId: string | null;
  manualName: string | null;
  updatedAt: string;
}

export function useGetGuidesByEntity(siteId: string, entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['guides-by-entity', siteId, entityType, entityId],
    queryFn:  () =>
      api.get<GuideByEntity[]>(
        `/api/sites/${siteId}/guides/by-entity/${entityType}/${entityId}`
      ),
    enabled: !!siteId && !!entityType && !!entityId,
  });
}
