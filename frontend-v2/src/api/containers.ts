import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Container } from '@werkstack/shared';

// ── Queries ─────────────────────────────────────────────────────────────────

export function useGetDeviceContainers(siteId: string, deviceId: string) {
  return useQuery({
    queryKey: ['containers', siteId, deviceId],
    queryFn: () => api.get<Container[]>(`/api/sites/${siteId}/devices/${deviceId}/containers`),
    enabled: !!siteId && !!deviceId,
  });
}

export function useGetSiteContainers(siteId: string) {
  return useQuery({
    queryKey: ['containers', siteId],
    queryFn: () => api.get<Container[]>(`/api/sites/${siteId}/containers`),
    enabled: !!siteId,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreateContainer(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Container, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<Container>(`/api/sites/${siteId}/containers`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers', siteId] });
    },
  });
}

export function useUpdateContainer(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Omit<Container, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.patch<Container>(`/api/sites/${siteId}/containers/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers', siteId] });
    },
  });
}

export function useDeleteContainer(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (containerId: string) =>
      api.delete<void>(`/api/sites/${siteId}/containers/${containerId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers', siteId] });
    },
  });
}

// ── Docker Compose Import ───────────────────────────────────────────────────

interface ParseDockerComposeInput {
  yaml: string;
  hostId?: string;
  vmId?: string;
}

interface ParseDockerComposeResult {
  containers: Omit<Container, 'id' | 'orgId' | 'siteId' | 'createdAt'>[];
}

export function useParseDockerCompose(siteId: string) {
  return useMutation({
    mutationFn: (body: ParseDockerComposeInput) =>
      api.post<ParseDockerComposeResult>(`/api/sites/${siteId}/import/docker-compose`, body),
  });
}

interface CommitDockerComposeInput {
  containers: Omit<Container, 'id' | 'orgId' | 'siteId' | 'createdAt'>[];
  hostId?: string;
  vmId?: string;
}

export function useCommitDockerCompose(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommitDockerComposeInput) =>
      api.post<Container[]>(`/api/sites/${siteId}/import/docker-compose/commit`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers', siteId] });
    },
  });
}

export function useToggleContainerMonitor(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ containerId, monitorEnabled, monitorIp, monitorIntervalS }: {
      containerId: string;
      monitorEnabled: boolean;
      monitorIp?: string | null;
      monitorIntervalS?: number;
    }) =>
      api.patch<Container>(`/api/sites/${siteId}/containers/${containerId}/monitor`, {
        monitorEnabled,
        ...(monitorIp !== undefined ? { monitorIp } : {}),
        ...(monitorIntervalS !== undefined ? { monitorIntervalS } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers', siteId] });
      qc.invalidateQueries({ queryKey: ['monitor-stack-status', siteId] });
    },
  });
}
