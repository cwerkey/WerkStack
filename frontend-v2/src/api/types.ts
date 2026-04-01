import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { TypesData } from '@werkstack/shared';

export function useGetTypes() {
  return useQuery({
    queryKey: ['types'],
    queryFn: () => api.get<TypesData>('/api/types'),
  });
}
