import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TodoFolder {
  id: string;
  orgId: string;
  siteId: string;
  name: string;
  parentFolderId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  todoId: string;
  label: string;
  checked: boolean;
  sortOrder: number;
}

export interface TodoEntityTag {
  id: string;
  todoId: string;
  entityType: string;
  entityId: string;
}

export interface TodoItem {
  id: string;
  orgId: string;
  siteId: string;
  folderId: string | null;
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done';
  dueDate: string | null;
  assignedUserId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  checklist: ChecklistItem[];
  tags: TodoEntityTag[];
}

// ── Folder Hooks ──────────────────────────────────────────────────────────────

export function useGetFolders(siteId: string) {
  return useQuery({
    queryKey: ['todo-folders', siteId],
    queryFn: () => api.get<TodoFolder[]>(`/api/sites/${siteId}/todo-folders`),
    enabled: !!siteId,
  });
}

export function useCreateFolder(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; parent_folder_id?: string | null; sort_order?: number }) =>
      api.post<TodoFolder>(`/api/sites/${siteId}/todo-folders`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo-folders', siteId] }),
  });
}

export function useUpdateFolder(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; parent_folder_id?: string | null; sort_order?: number }) =>
      api.patch<TodoFolder>(`/api/sites/${siteId}/todo-folders/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo-folders', siteId] }),
  });
}

export function useDeleteFolder(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/api/sites/${siteId}/todo-folders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo-folders', siteId] }),
  });
}

// ── Todo Hooks ────────────────────────────────────────────────────────────────

export function useGetTodos(siteId: string, folderId?: string | null) {
  return useQuery({
    queryKey: ['todos', siteId, folderId ?? null],
    queryFn: () =>
      api.get<TodoItem[]>(
        `/api/sites/${siteId}/todos${folderId ? `?folder_id=${folderId}` : ''}`
      ),
    enabled: !!siteId,
  });
}

export function useCreateTodo(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      status?: 'open' | 'in_progress' | 'done';
      due_date?: string | null;
      assigned_user_id?: string | null;
      folder_id?: string | null;
    }) => api.post<TodoItem>(`/api/sites/${siteId}/todos`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

export function useUpdateTodo(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      description?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      status?: 'open' | 'in_progress' | 'done';
      due_date?: string | null;
      assigned_user_id?: string | null;
      folder_id?: string | null;
    }) => api.patch<TodoItem>(`/api/sites/${siteId}/todos/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

export function useDeleteTodo(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/api/sites/${siteId}/todos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

// ── Checklist Hooks ───────────────────────────────────────────────────────────

export function useAddChecklistItem(siteId: string, todoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string; sort_order?: number }) =>
      api.post<ChecklistItem>(`/api/sites/${siteId}/todos/${todoId}/checklist`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

export function useUpdateChecklistItem(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      label?: string;
      checked?: boolean;
      sort_order?: number;
    }) => api.patch<ChecklistItem>(`/api/sites/${siteId}/todos/checklist/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

export function useDeleteChecklistItem(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string }>(`/api/sites/${siteId}/todos/checklist/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

// ── Entity Tag Hooks ──────────────────────────────────────────────────────────

export function useAddTodoTag(siteId: string, todoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entity_type: string; entity_id: string }) =>
      api.post<TodoEntityTag>(`/api/sites/${siteId}/todos/${todoId}/tags`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}

export function useDeleteTodoTag(siteId: string, todoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      api.delete<{ id: string }>(`/api/sites/${siteId}/todos/${todoId}/tags/${tagId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos', siteId] });
    },
  });
}
