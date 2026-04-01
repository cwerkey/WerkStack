import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

export interface TopologyNode {
  id: string;
  label: string;
  type: string;
  switchRole: string;
  isGateway: boolean;
  rackId?: string;
  subnetCidr?: string;
  ip?: string;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  cableType?: string;
  label?: string;
  vlanId?: string | null;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  positions: Record<string, { x: number; y: number }>;
}

export function useGetTopologyGraph(siteId: string) {
  return useQuery({
    queryKey: ['topology', siteId],
    queryFn: () => api.get<TopologyGraph>(`/api/sites/${siteId}/topology/graph`),
    enabled: !!siteId,
  });
}

export function useSaveTopologyPositions(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (positions: Record<string, { x: number; y: number }>) =>
      api.patch<void>(`/api/sites/${siteId}/topology/positions`, { positions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topology', siteId] }),
  });
}
