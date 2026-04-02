import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { User } from '@werkstack/shared';

export function useGetUsers() {
  return useQuery({
    queryKey: ['org-users'],
    queryFn: () => api.get<User[]>('/api/org/users'),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch<User>(`/api/org/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/org/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-users'] }),
  });
}
