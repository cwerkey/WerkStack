import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Subnet, IpAssignment } from '@werkstack/shared';

// ── Subnets ─────────────────────────────────────────────────────────────────

export function useGetSubnets(siteId: string) {
  return useQuery({
    queryKey: ['subnets', siteId],
    queryFn: () => api.get<Subnet[]>(`/api/sites/${siteId}/subnets`),
    enabled: !!siteId,
  });
}

export function useCreateSubnet(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Subnet, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<Subnet>(`/api/sites/${siteId}/subnets`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnets', siteId] });
    },
  });
}

export function useUpdateSubnet(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<Subnet, 'id' | 'orgId' | 'siteId' | 'createdAt'>>) =>
      api.patch<Subnet>(`/api/sites/${siteId}/subnets/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnets', siteId] });
    },
  });
}

export function useDeleteSubnet(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subnetId: string) =>
      api.delete<void>(`/api/sites/${siteId}/subnets/${subnetId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnets', siteId] });
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId] });
      qc.invalidateQueries({ queryKey: ['site-ips', siteId] });
    },
  });
}

// ── All Site IPs ────────────────────────────────────────────────────────────

export function useGetSiteIps(siteId: string) {
  return useQuery({
    queryKey: ['site-ips', siteId],
    queryFn: () => api.get<IpAssignment[]>(`/api/sites/${siteId}/ips`),
    enabled: !!siteId,
  });
}

// ── IP Assignments ──────────────────────────────────────────────────────────

export function useGetSubnetIps(siteId: string, subnetId: string) {
  return useQuery({
    queryKey: ['subnet-ips', siteId, subnetId],
    queryFn: () => api.get<IpAssignment[]>(`/api/sites/${siteId}/subnets/${subnetId}/ips`),
    enabled: !!siteId && !!subnetId,
  });
}

export function useCreateIpAssignment(siteId: string, subnetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<IpAssignment, 'id' | 'orgId' | 'siteId' | 'createdAt'>) =>
      api.post<IpAssignment>(`/api/sites/${siteId}/subnets/${subnetId}/ips`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId, subnetId] });
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId] });
      qc.invalidateQueries({ queryKey: ['site-ips', siteId] });
    },
  });
}

export function useUpdateIpAssignment(siteId: string, subnetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Omit<IpAssignment, 'id' | 'orgId' | 'siteId' | 'createdAt'>>) =>
      api.patch<IpAssignment>(`/api/sites/${siteId}/subnets/${subnetId}/ips/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId, subnetId] });
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId] });
      qc.invalidateQueries({ queryKey: ['site-ips', siteId] });
    },
  });
}

export function useDeleteIpAssignment(siteId: string, subnetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ipId: string) =>
      api.delete<void>(`/api/sites/${siteId}/subnets/${subnetId}/ips/${ipId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId, subnetId] });
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId] });
      qc.invalidateQueries({ queryKey: ['site-ips', siteId] });
    },
  });
}

// ── Next Available IP ───────────────────────────────────────────────────────

export function useGetNextAvailableIp(siteId: string, subnetId: string) {
  return useQuery({
    queryKey: ['next-ip', siteId, subnetId],
    queryFn: () => api.get<{ ip: string | null }>(`/api/sites/${siteId}/subnets/${subnetId}/ips/next`),
    enabled: !!siteId && !!subnetId,
  });
}
