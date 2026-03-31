import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Connection } from '@werkstack/shared';

export function useGetSiteConnections(siteId: string) {
  return useQuery({
    queryKey: ['connections', siteId],
    queryFn: () => api.get<Connection[]>(`/api/sites/${siteId}/connections`),
    enabled: !!siteId,
  });
}

export function useGetDeviceConnections(siteId: string, deviceId: string) {
  return useQuery({
    queryKey: ['connections', siteId, deviceId],
    queryFn: () => api.get<Connection[]>(`/api/sites/${siteId}/devices/${deviceId}/connections`),
    enabled: !!siteId && !!deviceId,
  });
}

export function useCreateConnection(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Connection, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<Connection>(`/api/sites/${siteId}/connections`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['connections', siteId] });
      if (vars.srcDeviceId) {
        qc.invalidateQueries({ queryKey: ['connections', siteId, vars.srcDeviceId] });
      }
      if (vars.dstDeviceId) {
        qc.invalidateQueries({ queryKey: ['connections', siteId, vars.dstDeviceId] });
      }
    },
  });
}

export function useUpdateConnection(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Omit<Connection, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.patch<Connection>(`/api/sites/${siteId}/connections/${id}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['connections', siteId] });
      if (vars.srcDeviceId) {
        qc.invalidateQueries({ queryKey: ['connections', siteId, vars.srcDeviceId] });
      }
      if (vars.dstDeviceId) {
        qc.invalidateQueries({ queryKey: ['connections', siteId, vars.dstDeviceId] });
      }
    },
  });
}

export function useDeleteConnection(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connId }: { connId: string; srcDeviceId?: string; dstDeviceId?: string }) =>
      api.delete<void>(`/api/sites/${siteId}/connections/${connId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['connections', siteId] });
      if (vars.srcDeviceId) {
        qc.invalidateQueries({ queryKey: ['connections', siteId, vars.srcDeviceId] });
      }
      if (vars.dstDeviceId) {
        qc.invalidateQueries({ queryKey: ['connections', siteId, vars.dstDeviceId] });
      }
    },
  });
}

export function useDeleteConnectionsByDevice(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.delete<void>(`/api/sites/${siteId}/devices/${deviceId}/connections`),
    onSuccess: (_data, deviceId) => {
      qc.invalidateQueries({ queryKey: ['connections', siteId, deviceId] });
      qc.invalidateQueries({ queryKey: ['connections', siteId] });
    },
  });
}
