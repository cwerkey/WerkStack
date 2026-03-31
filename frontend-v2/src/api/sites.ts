import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { Site } from '@werkstack/shared';

export function useGetSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Site[]>('/api/sites'),
  });
}
