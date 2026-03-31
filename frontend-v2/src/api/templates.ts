import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { DeviceTemplate, PcieTemplate } from '@werkstack/shared';

export function useGetDeviceTemplates() {
  return useQuery({
    queryKey: ['templates', 'devices'],
    queryFn: () => api.get<DeviceTemplate[]>('/api/templates/devices'),
  });
}

export function useGetPcieTemplates() {
  return useQuery({
    queryKey: ['templates', 'pcie'],
    queryFn: () => api.get<PcieTemplate[]>('/api/templates/pcie'),
  });
}
