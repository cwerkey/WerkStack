import { useMutation } from '@tanstack/react-query';
import { api } from '@/utils/api';
import type { User } from '@werkstack/shared';

interface ProfileUpdate {
  username?:        string;
  currentPassword?: string;
  newPassword?:     string;
  accentColor?:     string | null;
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: ProfileUpdate) =>
      api.patch<{ user: User }>('/api/auth/profile', body),
  });
}
