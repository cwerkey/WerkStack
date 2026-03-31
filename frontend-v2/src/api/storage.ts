import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Drive, ExternalDrive, StoragePool, Share } from '@werkstack/shared';

// ── Drives ───────────────────────────────────────────────────────────────────

export function useGetSiteDrives(siteId: string) {
  return useQuery({
    queryKey: ['drives', siteId],
    queryFn: () => api.get<Drive[]>(`/api/sites/${siteId}/drives`),
    enabled: !!siteId,
  });
}

export function useGetDeviceExternalDrives(siteId: string, deviceId: string) {
  return useQuery({
    queryKey: ['external-drives', siteId, deviceId],
    queryFn: () => api.get<ExternalDrive[]>(`/api/sites/${siteId}/devices/${deviceId}/external-drives`),
    enabled: !!siteId && !!deviceId,
  });
}

export function useCreateDrive(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Drive, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<Drive>(`/api/sites/${siteId}/drives`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drives', siteId] });
    },
  });
}

export function useUpdateDrive(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Omit<Drive, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.patch<Drive>(`/api/sites/${siteId}/drives/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drives', siteId] });
    },
  });
}

export function useDeleteDrive(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (driveId: string) =>
      api.delete<void>(`/api/sites/${siteId}/drives/${driveId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drives', siteId] });
    },
  });
}

// ── Pools ────────────────────────────────────────────────────────────────────

export function useGetSitePools(siteId: string) {
  return useQuery({
    queryKey: ['pools', siteId],
    queryFn: () => api.get<StoragePool[]>(`/api/sites/${siteId}/pools`),
    enabled: !!siteId,
  });
}

export function useCreatePool(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<StoragePool, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<StoragePool>(`/api/sites/${siteId}/pools`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pools', siteId] });
    },
  });
}

export function useUpdatePool(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Omit<StoragePool, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.patch<StoragePool>(`/api/sites/${siteId}/pools/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pools', siteId] });
    },
  });
}

export function useDeletePool(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poolId: string) =>
      api.delete<void>(`/api/sites/${siteId}/pools/${poolId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pools', siteId] });
    },
  });
}

// ── Shares ───────────────────────────────────────────────────────────────────

export function useGetSiteShares(siteId: string) {
  return useQuery({
    queryKey: ['shares', siteId],
    queryFn: () => api.get<Share[]>(`/api/sites/${siteId}/shares`),
    enabled: !!siteId,
  });
}

export function useCreateShare(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Share, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<Share>(`/api/sites/${siteId}/shares`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shares', siteId] });
    },
  });
}

export function useUpdateShare(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Omit<Share, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.patch<Share>(`/api/sites/${siteId}/shares/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shares', siteId] });
    },
  });
}

export function useDeleteShare(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) =>
      api.delete<void>(`/api/sites/${siteId}/shares/${shareId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shares', siteId] });
    },
  });
}
