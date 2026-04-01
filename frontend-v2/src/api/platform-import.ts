import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

// ── TrueNAS Types ──────────────────────────────────────────────────────────

export interface TrueNASConnectInput {
  apiUrl:   string;
  apiKey:   string;
  deviceId: string;
}

export interface TrueNASPool {
  name:      string;
  topology?: Record<string, unknown[]>;
  status?:   string;
}

export interface TrueNASShare {
  name:     string;
  protocol: 'smb' | 'nfs';
  path?:    string;
  enabled?: boolean;
}

export interface TrueNASApp {
  name:   string;
  state?: string;
}

export interface TrueNASInterface {
  name:    string;
  aliases: { address: string; netmask: number }[];
  state:   string;
}

export interface TrueNASPreview {
  pools:      TrueNASPool[];
  shares:     TrueNASShare[];
  apps:       TrueNASApp[];
  interfaces: TrueNASInterface[];
}

export interface TrueNASCommitInput {
  deviceId: string;
  pools:    TrueNASPool[];
  shares:   TrueNASShare[];
  apps:     TrueNASApp[];
}

export interface ImportCommitResult {
  created: Record<string, number>;
}

// ── Proxmox Types ──────────────────────────────────────────────────────────

export interface ProxmoxConnectInput {
  apiUrl:   string;
  apiToken: string;
  tokenId:  string;
  deviceId: string;
}

export interface ProxmoxVm {
  vmid?:    number;
  name:     string;
  status?:  string;
  cores?:   number;
  memory?:  number;
  maxdisk?: number;
}

export interface ProxmoxContainer {
  vmid?:   number;
  name:    string;
  status?: string;
  cores?:  number;
  memory?: number;
}

export interface ProxmoxPool {
  storage: string;
  type?:   string;
  total?:  number;
  used?:   number;
}

export interface ProxmoxBridge {
  iface:    string;
  type:     string;
  address?: string;
}

export interface ProxmoxPreview {
  vms:        ProxmoxVm[];
  containers: ProxmoxContainer[];
  pools:      ProxmoxPool[];
  bridges:    ProxmoxBridge[];
}

export interface ProxmoxCommitInput {
  deviceId:   string;
  vms:        ProxmoxVm[];
  containers: ProxmoxContainer[];
  pools:      ProxmoxPool[];
}

// ── TrueNAS Mutations ──────────────────────────────────────────────────────

export function useTrueNASConnect(siteId: string) {
  return useMutation({
    mutationFn: (body: TrueNASConnectInput) =>
      api.post<TrueNASPreview>(`/api/sites/${siteId}/import/platform/truenas/connect`, body),
  });
}

export function useTrueNASCommit(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TrueNASCommitInput) =>
      api.post<ImportCommitResult>(`/api/sites/${siteId}/import/platform/truenas/commit`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage', siteId] });
      qc.invalidateQueries({ queryKey: ['containers', siteId] });
      qc.invalidateQueries({ queryKey: ['os-hosts', siteId] });
    },
  });
}

// ── Proxmox Mutations ──────────────────────────────────────────────────────

export function useProxmoxConnect(siteId: string) {
  return useMutation({
    mutationFn: (body: ProxmoxConnectInput) =>
      api.post<ProxmoxPreview>(`/api/sites/${siteId}/import/platform/proxmox/connect`, body),
  });
}

export function useProxmoxCommit(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProxmoxCommitInput) =>
      api.post<ImportCommitResult>(`/api/sites/${siteId}/import/platform/proxmox/commit`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-vms', siteId] });
      qc.invalidateQueries({ queryKey: ['os-hosts', siteId] });
      qc.invalidateQueries({ queryKey: ['storage', siteId] });
    },
  });
}
