import { useAuthStore } from '@/stores/authStore';

const BASE = '';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !url.includes('/api/auth/')) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  get:    <T>(url: string) => request<T>('GET', url),
  post:   <T>(url: string, body: unknown) => request<T>('POST', url, body),
  put:    <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch:  <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};
