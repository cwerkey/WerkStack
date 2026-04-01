import React, { useState, useCallback, useEffect } from 'react';
import { useSiteStore } from '@/stores/siteStore';
import {
  useGetFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useGetTodos,
  useCreateTodo,
  useUpdateTodo,
  useDeleteTodo,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useAddTodoTag,
  useDeleteTodoTag,
  type TodoItem,
  type TodoFolder,
  type ChecklistItem,
} from '@/api/todos';
import { useCreateGuide } from '@/api/guides';
import { uid } from '@/utils/uid';
import QueryErrorState from '@/components/QueryErrorState';

// ── Priority / Status helpers ─────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  normal: '#6b7280',
  low:    '#64748b',
};

const PRIORITY_BG: Record<string, string> = {
  urgent: '#fef2f2',
  high:   '#fff7ed',
  normal: '#f3f4f6',
  low:    '#f8fafc',
};

const STATUS_COLORS: Record<string, string> = {
  open:        '#6b7280',
  in_progress: '#d97706',
  done:        '#16a34a',
};

const STATUS_BG: Record<string, string> = {
  open:        '#f3f4f6',
  in_progress: '#fffbeb',
  done:        '#f0fdf4',
};

const STATUS_LABELS: Record<string, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  done:        'Done',
};

const PRIORITY_LABELS: Record<string, string> = {
  low:    'Low',
  normal: 'Normal',
  high:   'High',
  urgent: 'Urgent',
};

const ENTITY_TYPES = ['device', 'pool', 'share', 'subnet', 'host', 'vm', 'app', 'container'];

// ── Sub-components ────────────────────────────────────────────────────────────

interface NewTaskFormProps {
  folders: TodoFolder[];
  defaultFolderId: string | null;
  onSubmit: (data: { title: string; priority: string; folder_id: string | null }) => void;
  onCancel: () => void;
}

function NewTaskForm({ folders, defaultFolderId, onSubmit, onCancel }: NewTaskFormProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('normal');
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), priority, folder_id: folderId });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'var(--color-surface-2)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '8px',
        border: '1px solid var(--color-border)',
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder="Task title..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{
          flex: 1,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 10px',
          color: 'var(--color-text)',
          fontSize: '13px',
        }}
      />
      <select
        value={priority}
        onChange={e => setPriority(e.target.value)}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 8px',
          color: 'var(--color-text)',
          fontSize: '12px',
        }}
      >
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <select
        value={folderId ?? ''}
        onChange={e => setFolderId(e.target.value || null)}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 8px',
          color: 'var(--color-text)',
          fontSize: '12px',
        }}
      >
        <option value="">No folder</option>
        {folders.map(f => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      <button
        type="submit"
        className="todo-add-btn"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-accent-text, #fff)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 12px',
          fontSize: '12px',
          cursor: 'pointer',
        }}
      >
        Create
      </button>
      <button
        type="button"
        className="todo-cancel-btn"
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 10px',
          fontSize: '12px',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </form>
  );
}

// ── Todo Row (expanded inline detail) ────────────────────────────────────────

interface TodoRowProps {
  todo: TodoItem;
  siteId: string;
  onUpdated: () => void;
}

function TodoRow({ todo, siteId, onUpdated }: TodoRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [desc, setDesc] = useState(todo.description);
  const [descDirty, setDescDirty] = useState(false);
  const [newCheckLabel, setNewCheckLabel] = useState('');
  const [showTagForm, setShowTagForm] = useState(false);
  const [tagEntityType, setTagEntityType] = useState('device');
  const [tagEntityId, setTagEntityId] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const updateTodo   = useUpdateTodo(siteId);
  const deleteTodo   = useDeleteTodo(siteId);
  const addItem      = useAddChecklistItem(siteId, todo.id);
  const updateItem   = useUpdateChecklistItem(siteId);
  const deleteItem   = useDeleteChecklistItem(siteId);
  const addTag       = useAddTodoTag(siteId, todo.id);
  const deleteTag    = useDeleteTodoTag(siteId, todo.id);
  const createGuide  = useCreateGuide(siteId);

  // Keep desc in sync when todo changes
  useEffect(() => {
    setDesc(todo.description);
    setDescDirty(false);
  }, [todo.description]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function handleStatusChange(newStatus: 'open' | 'in_progress' | 'done') {
    updateTodo.mutate({ id: todo.id, status: newStatus }, { onSuccess: onUpdated });
  }

  function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    updateTodo.mutate(
      { id: todo.id, priority: e.target.value as TodoItem['priority'] },
      { onSuccess: onUpdated }
    );
  }

  function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    updateTodo.mutate({ id: todo.id, due_date: e.target.value || null }, { onSuccess: onUpdated });
  }

  function handleAssignedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.trim();
    updateTodo.mutate({ id: todo.id, assigned_user_id: val || null }, { onSuccess: onUpdated });
  }

  function handleDescBlur() {
    if (descDirty) {
      updateTodo.mutate({ id: todo.id, description: desc }, { onSuccess: () => { onUpdated(); setDescDirty(false); } });
    }
  }

  function handleAddChecklistItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newCheckLabel.trim()) return;
    addItem.mutate(
      { label: newCheckLabel.trim(), sort_order: todo.checklist.length },
      { onSuccess: () => { setNewCheckLabel(''); onUpdated(); } }
    );
  }

  function handleToggleCheck(item: ChecklistItem) {
    updateItem.mutate({ id: item.id, checked: !item.checked }, { onSuccess: onUpdated });
  }

  function handleDeleteCheck(id: string) {
    deleteItem.mutate(id, { onSuccess: onUpdated });
  }

  function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const entityId = tagEntityId.trim();
    if (!entityId) return;
    addTag.mutate(
      { entity_type: tagEntityType, entity_id: entityId },
      {
        onSuccess: () => {
          setTagEntityId('');
          setShowTagForm(false);
          onUpdated();
        },
      }
    );
  }

  function handleDeleteTag(tagId: string) {
    deleteTag.mutate(tagId, { onSuccess: onUpdated });
  }

  function handleDelete() {
    if (!confirm(`Delete "${todo.title}"?`)) return;
    deleteTodo.mutate(todo.id, { onSuccess: onUpdated });
  }

  function handleLinkToGuide() {
    createGuide.mutate(
      { title: todo.title, content: '' },
      { onSuccess: () => flash('Guide created — go to Guides to edit') }
    );
  }

  function handleExportToGuide() {
    const checklistMd = todo.checklist
      .map(c => `- [${c.checked ? 'x' : ' '}] ${c.label}`)
      .join('\n');
    const content = [todo.description, checklistMd ? '\n## Checklist\n' + checklistMd : '']
      .filter(Boolean)
      .join('\n\n');
    createGuide.mutate(
      { title: todo.title, content },
      { onSuccess: () => flash('Guide created — go to Guides to edit') }
    );
  }

  const completedCount = todo.checklist.filter(c => c.checked).length;

  return (
    <div
      className={`todo-row${expanded ? ' expanded' : ''}`}
      style={{
        borderBottom: '1px solid var(--color-border)',
        cursor: 'default',
      }}
    >
      {/* Row summary */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Priority badge */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            background: PRIORITY_BG[todo.priority] ?? '#f3f4f6',
            color: PRIORITY_COLORS[todo.priority] ?? '#6b7280',
            minWidth: '48px',
            textAlign: 'center',
          }}
        >
          {PRIORITY_LABELS[todo.priority] ?? todo.priority}
        </span>

        {/* Title */}
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            fontWeight: 600,
            color: todo.status === 'done' ? 'var(--color-text-muted)' : 'var(--color-text)',
            textDecoration: todo.status === 'done' ? 'line-through' : 'none',
          }}
        >
          {todo.title}
        </span>

        {/* Checklist progress */}
        {todo.checklist.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
            {completedCount}/{todo.checklist.length}
          </span>
        )}

        {/* Due date */}
        {todo.dueDate && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {new Date(todo.dueDate).toLocaleDateString()}
          </span>
        )}

        {/* Assigned user initial */}
        {todo.assignedUserId && (
          <span
            style={{
              fontSize: '11px',
              background: 'var(--color-accent-tint)',
              color: 'var(--color-accent)',
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              flexShrink: 0,
            }}
            title={todo.assignedUserId}
          >
            {todo.assignedUserId.slice(0, 1).toUpperCase()}
          </span>
        )}

        {/* Status badge */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 'var(--radius-sm)',
            background: STATUS_BG[todo.status] ?? '#f3f4f6',
            color: STATUS_COLORS[todo.status] ?? '#6b7280',
          }}
        >
          {STATUS_LABELS[todo.status] ?? todo.status}
        </span>

        {/* Expand indicator */}
        <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginLeft: '4px' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: '0 14px 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
          onClick={e => e.stopPropagation()}
        >
          {successMsg && (
            <div
              style={{
                background: '#f0fdf4',
                color: '#16a34a',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                fontSize: '12px',
              }}
            >
              {successMsg}
            </div>
          )}

          {/* Status toggle */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', minWidth: '60px' }}>Status</span>
            {(['open', 'in_progress', 'done'] as const).map(s => (
              <button
                key={s}
                className="todo-status-btn"
                onClick={() => handleStatusChange(s)}
                style={{
                  fontSize: '11px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  background: todo.status === s ? STATUS_BG[s] : 'var(--color-surface)',
                  color: todo.status === s ? STATUS_COLORS[s] : 'var(--color-text-muted)',
                  fontWeight: todo.status === s ? 700 : 400,
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Priority + Due date + Assigned row */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Priority
              <select
                value={todo.priority}
                onChange={handlePriorityChange}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 6px',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>

            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Due date
              <input
                type="date"
                value={todo.dueDate ?? ''}
                onChange={handleDueDateChange}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 6px',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                }}
              />
            </label>

            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Assigned user
              <input
                type="text"
                defaultValue={todo.assignedUserId ?? ''}
                onBlur={handleAssignedChange}
                placeholder="User UUID..."
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 6px',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                  width: '140px',
                }}
              />
            </label>
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Description</div>
            <textarea
              value={desc}
              onChange={e => { setDesc(e.target.value); setDescDirty(true); }}
              onBlur={handleDescBlur}
              placeholder="Add description..."
              rows={3}
              style={{
                width: '100%',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--color-text)',
                fontSize: '13px',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Checklist */}
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Checklist {todo.checklist.length > 0 && `(${completedCount}/${todo.checklist.length})`}
            </div>
            {todo.checklist.map(item => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => handleToggleCheck(item)}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: '13px',
                    color: item.checked ? 'var(--color-text-muted)' : 'var(--color-text)',
                    textDecoration: item.checked ? 'line-through' : 'none',
                  }}
                >
                  {item.label}
                </span>
                <button
                  onClick={() => handleDeleteCheck(item.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-dim)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px 4px',
                  }}
                  title="Remove item"
                >
                  ×
                </button>
              </div>
            ))}
            <form onSubmit={handleAddChecklistItem} style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <input
                type="text"
                value={newCheckLabel}
                onChange={e => setNewCheckLabel(e.target.value)}
                placeholder="Add item..."
                style={{
                  flex: 1,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                }}
              />
              <button
                type="submit"
                className="todo-add-btn"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-accent-text, #fff)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                + Add item
              </button>
            </form>
          </div>

          {/* Entity tags */}
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Entity Tags
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
              {todo.tags.map(tag => (
                <span
                  key={tag.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 8px',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{tag.entityType}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{tag.entityId.slice(0, 8)}</span>
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-dim)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '0 0 0 2px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => setShowTagForm(f => !f)}
                style={{
                  fontSize: '11px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 8px',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                + Tag
              </button>
            </div>
            {showTagForm && (
              <form onSubmit={handleAddTag} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={tagEntityType}
                  onChange={e => setTagEntityType(e.target.value)}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 6px',
                    color: 'var(--color-text)',
                    fontSize: '12px',
                  }}
                >
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  value={tagEntityId}
                  onChange={e => setTagEntityId(e.target.value)}
                  placeholder="Entity UUID..."
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    color: 'var(--color-text)',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="submit"
                  className="todo-add-btn"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-text, #fff)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="todo-cancel-btn"
                  onClick={() => setShowTagForm(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    fontSize: '12px',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px', borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={handleLinkToGuide}
              disabled={createGuide.isPending}
              style={{
                fontSize: '12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Link to Guide
            </button>
            <button
              onClick={handleExportToGuide}
              disabled={createGuide.isPending}
              style={{
                fontSize: '12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Export to Guide
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleDelete}
              className="todo-delete-btn"
              style={{
                fontSize: '12px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TodoPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  const { data: folders = [], refetch: refetchFolders } = useGetFolders(siteId);
  const todosQ = useGetTodos(siteId, selectedFolderId);
  const { data: todos = [], refetch: refetchTodos } = todosQ;

  const createFolder = useCreateFolder(siteId);
  const updateFolder = useUpdateFolder(siteId);
  const deleteFolder = useDeleteFolder(siteId);
  const createTodo   = useCreateTodo(siteId);

  const handleRefresh = useCallback(() => {
    refetchTodos();
  }, [refetchTodos]);

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolder.mutate(
      { name: newFolderName.trim() },
      {
        onSuccess: () => {
          setNewFolderName('');
          setShowNewFolder(false);
          refetchFolders();
        },
      }
    );
  }

  function handleRenameFolder(id: string) {
    if (!editingFolderName.trim()) return;
    updateFolder.mutate(
      { id, name: editingFolderName.trim() },
      {
        onSuccess: () => {
          setEditingFolderId(null);
          refetchFolders();
        },
      }
    );
  }

  function handleDeleteFolder(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this folder? Tasks inside will become unfiled.')) return;
    deleteFolder.mutate(id, {
      onSuccess: () => {
        if (selectedFolderId === id) setSelectedFolderId(null);
        refetchFolders();
      },
    });
  }

  function handleCreateTodo(data: { title: string; priority: string; folder_id: string | null }) {
    createTodo.mutate(
      {
        title: data.title,
        priority: data.priority as TodoItem['priority'],
        folder_id: data.folder_id,
      },
      {
        onSuccess: () => {
          setShowNewTask(false);
          refetchTodos();
        },
      }
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      <style>{`
        .todo-folder-item:hover { background: var(--color-hover) !important; }
        .todo-folder-item.active { background: var(--color-accent-tint) !important; border-left: 2px solid var(--color-accent) !important; }
        .todo-row:hover { background: var(--color-hover) !important; }
        .todo-row.expanded { background: var(--color-surface-2) !important; }
        .todo-status-btn:hover { opacity: 0.8 !important; }
        .todo-delete-btn:hover { color: var(--color-error) !important; background: var(--color-error-tint) !important; }
        .todo-add-btn:hover { background: var(--color-accent-dark) !important; }
        .todo-cancel-btn:hover { background: var(--color-surface-2) !important; }
      `}</style>

      {todosQ.error && <QueryErrorState error={todosQ.error} onRetry={() => todosQ.refetch()} />}

      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
          To-Do List
        </h1>
        <button
          onClick={() => setShowNewTask(t => !t)}
          className="todo-add-btn"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text, #fff)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Task
        </button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left panel — folder tree */}
        <div
          style={{
            width: '220px',
            flexShrink: 0,
            borderRight: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-surface)',
            overflowY: 'auto',
          }}
        >
          {/* "All" item */}
          <div
            className={`todo-folder-item${selectedFolderId === null ? ' active' : ''}`}
            onClick={() => setSelectedFolderId(null)}
            style={{
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: selectedFolderId === null ? 700 : 400,
              cursor: 'pointer',
              borderLeft: selectedFolderId === null ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: 'var(--color-text)',
            }}
          >
            All Tasks
          </div>

          {/* Folders */}
          {folders.map(folder => (
            <div
              key={folder.id}
              className={`todo-folder-item${selectedFolderId === folder.id ? ' active' : ''}`}
              onClick={() => {
                if (editingFolderId !== folder.id) setSelectedFolderId(folder.id);
              }}
              style={{
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                borderLeft: selectedFolderId === folder.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              {editingFolderId === folder.id ? (
                <input
                  autoFocus
                  type="text"
                  value={editingFolderName}
                  onChange={e => setEditingFolderName(e.target.value)}
                  onBlur={() => handleRenameFolder(folder.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameFolder(folder.id);
                    if (e.key === 'Escape') setEditingFolderId(null);
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex: 1,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-accent)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 6px',
                    color: 'var(--color-text)',
                    fontSize: '13px',
                  }}
                />
              ) : (
                <span
                  style={{ flex: 1, fontSize: '13px', color: 'var(--color-text)' }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    setEditingFolderId(folder.id);
                    setEditingFolderName(folder.name);
                  }}
                >
                  {folder.name}
                </span>
              )}
              <button
                onClick={e => handleDeleteFolder(folder.id, e)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-dim)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 2px',
                  opacity: 0,
                  lineHeight: 1,
                }}
                className="folder-delete-btn"
                title="Delete folder"
              >
                ×
              </button>
            </div>
          ))}

          {/* New folder form */}
          <div style={{ padding: '8px 10px', marginTop: 'auto' }}>
            {showNewFolder ? (
              <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: '4px' }}>
                <input
                  autoFocus
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Folder name..."
                  onBlur={() => { if (!newFolderName.trim()) setShowNewFolder(false); }}
                  style={{
                    flex: 1,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 6px',
                    color: 'var(--color-text)',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="submit"
                  className="todo-add-btn"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-text, #fff)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  OK
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowNewFolder(true)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 0',
                  color: 'var(--color-text-dim)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                + New Folder
              </button>
            )}
          </div>
        </div>

        {/* Main area — todo list */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflowY: 'auto',
            background: 'var(--color-bg)',
          }}
        >
          <div style={{ padding: '12px 16px', flexShrink: 0 }}>
            {/* New task form (inline at top) */}
            {showNewTask && (
              <NewTaskForm
                folders={folders}
                defaultFolderId={selectedFolderId}
                onSubmit={handleCreateTodo}
                onCancel={() => setShowNewTask(false)}
              />
            )}

            {/* Folder heading */}
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
              }}
            >
              {selectedFolderId
                ? folders.find(f => f.id === selectedFolderId)?.name ?? 'Folder'
                : 'All Tasks'}
              <span style={{ fontWeight: 400, marginLeft: '6px' }}>({todos.length})</span>
            </div>
          </div>

          {/* Todo list */}
          <div
            style={{
              flex: 1,
              background: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
              borderBottom: '1px solid var(--color-border)',
              marginBottom: '24px',
            }}
          >
            {todos.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 20px',
                  color: 'var(--color-text-dim)',
                  fontSize: '13px',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '28px' }}>✓</span>
                <span>No tasks yet.</span>
                <button
                  onClick={() => setShowNewTask(true)}
                  className="todo-add-btn"
                  style={{
                    marginTop: '8px',
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-text, #fff)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  + New Task
                </button>
              </div>
            ) : (
              todos.map(todo => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  siteId={siteId}
                  onUpdated={handleRefresh}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* CSS for folder hover delete button visibility */}
      <style>{`
        .todo-folder-item:hover .folder-delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
