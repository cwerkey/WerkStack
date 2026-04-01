import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { OsHost, OsVm, OsApp } from '@werkstack/shared';

// -- OS Hosts -----------------------------------------------------------------

export function useGetOsHosts(siteId: string) {
  return useQuery({
    queryKey: ['os-hosts', siteId],
    queryFn: () => api.get<OsHost[]>(`/api/sites/${siteId}/os-hosts`),
    enabled: !!siteId,
  });
}

export function useCreateOsHost(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<OsHost, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<OsHost>(`/api/sites/${siteId}/os-hosts`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-hosts', siteId] });
    },
  });
}

export function useUpdateOsHost(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<OsHost, 'id' | 'orgId' | 'siteId' | 'createdAt'>>) =>
      api.patch<OsHost>(`/api/sites/${siteId}/os-hosts/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-hosts', siteId] });
    },
  });
}

export function useDeleteOsHost(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostId: string) =>
      api.delete<void>(`/api/sites/${siteId}/os-hosts/${hostId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-hosts', siteId] });
    },
  });
}

// -- OS VMs -------------------------------------------------------------------

export function useGetOsVms(siteId: string) {
  return useQuery({
    queryKey: ['os-vms', siteId],
    queryFn: () => api.get<OsVm[]>(`/api/sites/${siteId}/os-vms`),
    enabled: !!siteId,
  });
}

export function useCreateOsVm(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<OsVm>(`/api/sites/${siteId}/os-vms`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-vms', siteId] });
    },
  });
}

export function useUpdateOsVm(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>>) =>
      api.patch<OsVm>(`/api/sites/${siteId}/os-vms/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-vms', siteId] });
    },
  });
}

export function useDeleteOsVm(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vmId: string) =>
      api.delete<void>(`/api/sites/${siteId}/os-vms/${vmId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-vms', siteId] });
    },
  });
}

// -- OS Apps ------------------------------------------------------------------

export function useGetOsApps(siteId: string) {
  return useQuery({
    queryKey: ['os-apps', siteId],
    queryFn: () => api.get<OsApp[]>(`/api/sites/${siteId}/os-apps`),
    enabled: !!siteId,
  });
}

export function useCreateOsApp(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<OsApp>(`/api/sites/${siteId}/os-apps`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-apps', siteId] });
    },
  });
}

export function useUpdateOsApp(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>>) =>
      api.patch<OsApp>(`/api/sites/${siteId}/os-apps/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-apps', siteId] });
    },
  });
}

export function useDeleteOsApp(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (appId: string) =>
      api.delete<void>(`/api/sites/${siteId}/os-apps/${appId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-apps', siteId] });
    },
  });
}
