import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { useGetDeviceTemplates, useGetPcieTemplates } from '@/api/templates';
import { useGetTypes } from '@/api/types';
import { useThemeStore } from '@/stores/themeStore';
import type { DeviceTemplate, PcieTemplate, DeviceType, FormFactor, PcieFormFactor, PcieBusSize, PlacedBlock } from '@werkstack/shared';
import { TemplateWizard, LayoutEditor, PcieLayoutEditor } from '@/wizards/TemplateWizard';
import styles from './TemplatesSettings.module.css';
import settingsStyles from './SettingsPage.module.css';

// ── Mutation hooks ────────────────────────────────────────────────────────────

function useCreateDeviceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<DeviceTemplate, 'id' | 'orgId' | 'layout' | 'isShelf' | 'createdAt'>) =>
      api.post<DeviceTemplate>('/api/templates/devices', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'devices'] }),
  });
}

function useUpdateDeviceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<DeviceTemplate> & { id: string }) =>
      api.patch<DeviceTemplate>(`/api/templates/devices/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'devices'] }),
  });
}

function useDeleteDeviceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/templates/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'devices'] }),
  });
}

function useCreatePcieTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<PcieTemplate, 'id' | 'orgId' | 'layout' | 'createdAt'>) =>
      api.post<PcieTemplate>('/api/templates/pcie', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'pcie'] }),
  });
}

function useUpdatePcieTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<PcieTemplate> & { id: string }) =>
      api.patch<PcieTemplate>(`/api/templates/pcie/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'pcie'] }),
  });
}

function useDeletePcieTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/templates/pcie/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'pcie'] }),
  });
}

function useCreateDeviceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) =>
      api.post<DeviceType>('/api/types/devices', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['types'] }),
  });
}

function useUpdateDeviceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; color?: string }) =>
      api.patch<DeviceType>(`/api/types/devices/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['types'] }),
  });
}

function useDeleteDeviceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/types/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['types'] }),
  });
}

// ── Sort helper ───────────────────────────────────────────────────────────────

function sortByManufacturer<T extends { manufacturer?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aM = (a.manufacturer ?? '').toLowerCase();
    const bM = (b.manufacturer ?? '').toLowerCase();
    const aIsGeneric = !a.manufacturer;
    const bIsGeneric = !b.manufacturer;
    if (aIsGeneric && !bIsGeneric) return -1;
    if (!aIsGeneric && bIsGeneric) return 1;
    return aM.localeCompare(bM);
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonCell} style={{ width: '20%' }} />
          <div className={styles.skeletonCell} style={{ width: '30%' }} />
          <div className={styles.skeletonCell} style={{ width: '15%' }} />
          <div className={styles.skeletonCell} style={{ width: '15%' }} />
          <div className={styles.skeletonCell} style={{ width: '10%' }} />
        </div>
      ))}
    </>
  );
}

// ── Device Templates Tab ──────────────────────────────────────────────────────

interface DeviceTemplateFormState {
  manufacturer: string;
  make: string;
  model: string;
  category: string;
  formFactor: FormFactor;
  uHeight: number;
}

const blankDeviceForm = (): DeviceTemplateFormState => ({
  manufacturer: '',
  make: '',
  model: '',
  category: 'server',
  formFactor: 'rack',
  uHeight: 1,
});

function DeviceTemplatesTab() {
  const { data: templates, isLoading } = useGetDeviceTemplates();
  const createMut = useCreateDeviceTemplate();
  const updateMut = useUpdateDeviceTemplate();
  const deleteMut = useDeleteDeviceTemplate();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<DeviceTemplateFormState>(blankDeviceForm());
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DeviceTemplateFormState>(blankDeviceForm());

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplate, setWizardTemplate] = useState<DeviceTemplate | undefined>(undefined);

  // Layout editor state
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [layoutEditorTemplate, setLayoutEditorTemplate] = useState<DeviceTemplate | null>(null);

  const sorted = sortByManufacturer(templates ?? []);

  const setF = <K extends keyof DeviceTemplateFormState>(k: K, v: DeviceTemplateFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setEF = <K extends keyof DeviceTemplateFormState>(k: K, v: DeviceTemplateFormState[K]) =>
    setEditForm((p) => ({ ...p, [k]: v }));

  const handleCreate = () => {
    if (!form.make.trim() || !form.model.trim()) {
      setError('Make and model are required');
      return;
    }
    createMut.mutate(
      {
        manufacturer: form.manufacturer.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        category: form.category.trim() || 'server',
        formFactor: form.formFactor,
        uHeight: form.uHeight,
      } as Omit<DeviceTemplate, 'id' | 'orgId' | 'layout' | 'isShelf' | 'createdAt'>,
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm(blankDeviceForm());
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create template'),
      }
    );
  };

  const handleStartEdit = (t: DeviceTemplate) => {
    setEditingId(t.id);
    setEditForm({
      manufacturer: t.manufacturer ?? '',
      make: t.make,
      model: t.model,
      category: t.category,
      formFactor: t.formFactor,
      uHeight: t.uHeight,
    });
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = (id: string) => {
    updateMut.mutate(
      {
        id,
        manufacturer: editForm.manufacturer.trim() || undefined,
        make: editForm.make.trim(),
        model: editForm.model.trim(),
        category: editForm.category.trim(),
        formFactor: editForm.formFactor,
        uHeight: editForm.uHeight,
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update'),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate(id, {
      onSuccess: () => { setConfirmDeleteId(null); setEditingId(null); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete'),
    });
  };

  const handleOpenLayoutEditor = (t: DeviceTemplate) => {
    setLayoutEditorTemplate(t);
    setLayoutEditorOpen(true);
  };

  const handleSaveLayout = (layout: { front: PlacedBlock[]; rear: PlacedBlock[] }) => {
    if (!layoutEditorTemplate) return;
    updateMut.mutate(
      {
        id: layoutEditorTemplate.id,
        manufacturer: layoutEditorTemplate.manufacturer || undefined,
        make: layoutEditorTemplate.make,
        model: layoutEditorTemplate.model,
        category: layoutEditorTemplate.category,
        formFactor: layoutEditorTemplate.formFactor,
        uHeight: layoutEditorTemplate.uHeight,
        layout,
      },
      {
        onSuccess: () => { setLayoutEditorOpen(false); setLayoutEditorTemplate(null); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save layout'),
      }
    );
  };

  if (isLoading) {
    return (
      <div>
        <div className={styles.toolbar}>
          <span className={styles.sectionTitle}>Device Templates</span>
        </div>
        <div className={styles.tableWrap}>
          <SkeletonRows />
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.toolbar}>
        <span className={styles.sectionTitle}>
          {sorted.length} template{sorted.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={settingsStyles.primaryBtn}
            onClick={() => {
              setWizardTemplate(undefined);
              setWizardOpen(true);
            }}
          >
            + New Template
          </button>
          <button
            className={settingsStyles.primaryBtn}
            onClick={() => {
              setShowCreate(!showCreate);
              setForm(blankDeviceForm());
              setError('');
            }}
          >
            {showCreate ? 'Cancel' : '+ Quick Create'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className={styles.inlineForm}>
          <p className={styles.inlineFormTitle}>New Device Template (metadata only)</p>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Manufacturer</label>
              <input
                className={styles.input}
                type="text"
                value={form.manufacturer}
                onChange={(e) => setF('manufacturer', e.target.value)}
                placeholder="e.g. Supermicro"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Make *</label>
              <input
                className={styles.input}
                type="text"
                value={form.make}
                onChange={(e) => setF('make', e.target.value)}
                placeholder="e.g. X11DPH-T"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Model *</label>
              <input
                className={styles.input}
                type="text"
                value={form.model}
                onChange={(e) => setF('model', e.target.value)}
                placeholder="e.g. Rev 1.02"
              />
            </div>
          </div>
          <div className={styles.formRow} style={{ marginTop: '8px' }}>
            <div className={styles.formField}>
              <label className={styles.label}>Category</label>
              <input
                className={styles.input}
                type="text"
                value={form.category}
                onChange={(e) => setF('category', e.target.value)}
                placeholder="e.g. server"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Form Factor</label>
              <select
                className={styles.select}
                value={form.formFactor}
                onChange={(e) => setF('formFactor', e.target.value as FormFactor)}
              >
                <option value="rack">Rack</option>
                <option value="desktop">Desktop</option>
                <option value="wall-mount">Wall-Mount</option>
              </select>
            </div>
            <div className={styles.formField} style={{ maxWidth: '100px' }}>
              <label className={styles.label}>U Height</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                max="42"
                value={form.uHeight}
                onChange={(e) => setF('uHeight', parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={settingsStyles.ghostBtn} onClick={() => { setShowCreate(false); setError(''); }}>
              Cancel
            </button>
            <button className={settingsStyles.primaryBtn} onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      {!sorted.length ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>&#9707;</div>
          <div>No device templates yet.</div>
          <button
            className={settingsStyles.primaryBtn}
            style={{ marginTop: '12px' }}
            onClick={() => { setWizardTemplate(undefined); setWizardOpen(true); }}
          >
            + New Template
          </button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Manufacturer</th>
                <th className={styles.th}>Make / Model</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Form Factor</th>
                <th className={styles.th}>U Height</th>
                <th className={styles.th} style={{ width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className={styles.tableRowActive}>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.manufacturer}
                        onChange={(e) => setEF('manufacturer', e.target.value)}
                        placeholder="Manufacturer"
                      />
                    </td>
                    <td className={styles.td} style={{ display: 'flex', gap: '6px' }}>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.make}
                        onChange={(e) => setEF('make', e.target.value)}
                        placeholder="Make"
                      />
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.model}
                        onChange={(e) => setEF('model', e.target.value)}
                        placeholder="Model"
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.category}
                        onChange={(e) => setEF('category', e.target.value)}
                      />
                    </td>
                    <td className={styles.td}>
                      <select
                        className={styles.select}
                        value={editForm.formFactor}
                        onChange={(e) => setEF('formFactor', e.target.value as FormFactor)}
                      >
                        <option value="rack">Rack</option>
                        <option value="desktop">Desktop</option>
                        <option value="wall-mount">Wall-Mount</option>
                      </select>
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="number"
                        min="1"
                        max="42"
                        value={editForm.uHeight}
                        onChange={(e) => setEF('uHeight', parseInt(e.target.value, 10) || 1)}
                        style={{ width: '60px' }}
                      />
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          className={settingsStyles.primaryBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => handleSaveEdit(t.id)}
                          disabled={updateMut.isPending}
                        >
                          Save
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => handleOpenLayoutEditor(t)}
                        >
                          Layout
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                        {confirmDeleteId === t.id ? (
                          <>
                            <span style={{ color: '#ef4444', fontSize: '10px', lineHeight: '22px' }}>Sure?</span>
                            <button
                              className={settingsStyles.dangerBtn}
                              style={{ padding: '3px 8px', fontSize: '10px' }}
                              onClick={() => handleDelete(t.id)}
                              disabled={deleteMut.isPending}
                            >
                              Yes
                            </button>
                            <button
                              className={settingsStyles.ghostBtn}
                              style={{ padding: '3px 8px', fontSize: '10px' }}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            className={settingsStyles.dangerBtn}
                            style={{ padding: '3px 8px', fontSize: '10px' }}
                            onClick={() => setConfirmDeleteId(t.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className={styles.tableRow} onClick={() => handleStartEdit(t)}>
                    <td className={styles.td}>{t.manufacturer ?? <span style={{ color: '#8a9299' }}>Generic</span>}</td>
                    <td className={styles.td}>
                      {t.make} <span style={{ color: '#8a9299' }}>{t.model}</span>
                    </td>
                    <td className={styles.tdMuted}>{t.category}</td>
                    <td className={styles.td}>
                      <span className={styles.pill}>{t.formFactor}</span>
                    </td>
                    <td className={styles.tdMuted}>{t.uHeight}U</td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className={settingsStyles.primaryBtn}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => handleStartEdit(t)}
                        >
                          Edit
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => handleOpenLayoutEditor(t)}
                        >
                          Layout
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Template Wizard overlay */}
      <TemplateWizard
        open={wizardOpen}
        initialTemplate={wizardTemplate}
        onComplete={() => { setWizardOpen(false); setWizardTemplate(undefined); }}
        onClose={() => { setWizardOpen(false); setWizardTemplate(undefined); }}
      />

      {/* Layout Editor overlay */}
      {layoutEditorTemplate && (
        <LayoutEditor
          open={layoutEditorOpen}
          template={layoutEditorTemplate}
          onSave={handleSaveLayout}
          onClose={() => { setLayoutEditorOpen(false); setLayoutEditorTemplate(null); }}
        />
      )}
    </div>
  );
}

// ── PCIe Templates Tab ────────────────────────────────────────────────────────

const PCIE_FF_LABELS: Record<string, string> = {
  fh: 'Full Height', lp: 'Low Profile', 'fh-dw': 'Full Height DW', 'lp-dw': 'Low Profile DW',
};

interface PcieTemplateFormState {
  manufacturer: string;
  make: string;
  model: string;
  busSize: PcieBusSize;
  formFactor: PcieFormFactor;
  laneWidth: number;
}

const blankPcieForm = (): PcieTemplateFormState => ({
  manufacturer: '',
  make: '',
  model: '',
  busSize: 'x8',
  formFactor: 'fh',
  laneWidth: 8,
});

function PcieTemplatesTab() {
  const { data: templates, isLoading } = useGetPcieTemplates();
  const createMut = useCreatePcieTemplate();
  const updateMut = useUpdatePcieTemplate();
  const deleteMut = useDeletePcieTemplate();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<PcieTemplateFormState>(blankPcieForm());
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PcieTemplateFormState>(blankPcieForm());

  // PCIe layout editor state
  const [pcieEditorOpen, setPcieEditorOpen] = useState(false);
  const [pcieEditorTarget, setPcieEditorTarget] = useState<PcieTemplate | null>(null);

  const sorted = sortByManufacturer(templates ?? []);

  const setF = <K extends keyof PcieTemplateFormState>(k: K, v: PcieTemplateFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setEF = <K extends keyof PcieTemplateFormState>(k: K, v: PcieTemplateFormState[K]) =>
    setEditForm((p) => ({ ...p, [k]: v }));

  const handleCreate = () => {
    if (!form.make.trim() || !form.model.trim()) {
      setError('Make and model are required');
      return;
    }
    createMut.mutate(
      {
        manufacturer: form.manufacturer.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        busSize: form.busSize,
        formFactor: form.formFactor,
        laneWidth: form.laneWidth,
      } as Omit<PcieTemplate, 'id' | 'orgId' | 'layout' | 'createdAt'>,
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm(blankPcieForm());
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create template'),
      }
    );
  };

  const handleStartEdit = (t: PcieTemplate) => {
    setEditingId(t.id);
    setEditForm({
      manufacturer: t.manufacturer ?? '',
      make: t.make,
      model: t.model,
      busSize: t.busSize,
      formFactor: t.formFactor,
      laneWidth: t.laneWidth,
    });
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = (id: string) => {
    updateMut.mutate(
      {
        id,
        manufacturer: editForm.manufacturer.trim() || undefined,
        make: editForm.make.trim(),
        model: editForm.model.trim(),
        busSize: editForm.busSize,
        formFactor: editForm.formFactor,
        laneWidth: editForm.laneWidth,
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update'),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate(id, {
      onSuccess: () => { setConfirmDeleteId(null); setEditingId(null); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete'),
    });
  };

  const handleOpenPcieEditor = (t: PcieTemplate) => {
    setPcieEditorTarget(t);
    setPcieEditorOpen(true);
  };

  const handleSavePcieLayout = (blocks: PlacedBlock[]) => {
    if (!pcieEditorTarget) return;
    updateMut.mutate(
      {
        id: pcieEditorTarget.id,
        manufacturer: pcieEditorTarget.manufacturer || undefined,
        make: pcieEditorTarget.make,
        model: pcieEditorTarget.model,
        busSize: pcieEditorTarget.busSize,
        formFactor: pcieEditorTarget.formFactor,
        laneWidth: pcieEditorTarget.laneWidth,
        layout: { rear: blocks },
      },
      {
        onSuccess: () => { setPcieEditorOpen(false); setPcieEditorTarget(null); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save layout'),
      }
    );
  };

  if (isLoading) {
    return (
      <div>
        <div className={styles.toolbar}>
          <span className={styles.sectionTitle}>PCIe Templates</span>
        </div>
        <div className={styles.tableWrap}>
          <SkeletonRows />
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.toolbar}>
        <span className={styles.sectionTitle}>
          {sorted.length} template{sorted.length !== 1 ? 's' : ''}
        </span>
        <button
          className={settingsStyles.primaryBtn}
          onClick={() => {
            setShowCreate(!showCreate);
            setForm(blankPcieForm());
            setError('');
          }}
        >
          {showCreate ? 'Cancel' : '+ Create'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.inlineForm}>
          <p className={styles.inlineFormTitle}>New PCIe Template</p>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Manufacturer</label>
              <input
                className={styles.input}
                type="text"
                value={form.manufacturer}
                onChange={(e) => setF('manufacturer', e.target.value)}
                placeholder="e.g. Intel"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Make *</label>
              <input
                className={styles.input}
                type="text"
                value={form.make}
                onChange={(e) => setF('make', e.target.value)}
                placeholder="e.g. X550-T2"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Model *</label>
              <input
                className={styles.input}
                type="text"
                value={form.model}
                onChange={(e) => setF('model', e.target.value)}
                placeholder="e.g. Rev 1.0"
              />
            </div>
          </div>
          <div className={styles.formRow} style={{ marginTop: '8px' }}>
            <div className={styles.formField}>
              <label className={styles.label}>Bus Size</label>
              <select
                className={styles.select}
                value={form.busSize}
                onChange={(e) => setF('busSize', e.target.value as PcieBusSize)}
              >
                <option value="x1">x1</option>
                <option value="x4">x4</option>
                <option value="x8">x8</option>
                <option value="x16">x16</option>
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Form Factor</label>
              <select
                className={styles.select}
                value={form.formFactor}
                onChange={(e) => setF('formFactor', e.target.value as PcieFormFactor)}
              >
                <option value="fh">Full Height</option>
                <option value="lp">Low Profile</option>
                <option value="fh-dw">Full Height DW</option>
                <option value="lp-dw">Low Profile DW</option>
              </select>
            </div>
            <div className={styles.formField} style={{ maxWidth: '120px' }}>
              <label className={styles.label}>Lane Width</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                value={form.laneWidth}
                onChange={(e) => setF('laneWidth', parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={settingsStyles.ghostBtn} onClick={() => { setShowCreate(false); setError(''); }}>
              Cancel
            </button>
            <button className={settingsStyles.primaryBtn} onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      {!sorted.length ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>&#9707;</div>
          <div>No PCIe templates yet.</div>
          {!showCreate && (
            <button
              className={settingsStyles.primaryBtn}
              style={{ marginTop: '12px' }}
              onClick={() => setShowCreate(true)}
            >
              + Create Template
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Manufacturer</th>
                <th className={styles.th}>Make / Model</th>
                <th className={styles.th}>Bus Size</th>
                <th className={styles.th}>Form Factor</th>
                <th className={styles.th}>Lane Width</th>
                <th className={styles.th} style={{ width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className={styles.tableRowActive}>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.manufacturer}
                        onChange={(e) => setEF('manufacturer', e.target.value)}
                      />
                    </td>
                    <td className={styles.td} style={{ display: 'flex', gap: '6px' }}>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.make}
                        onChange={(e) => setEF('make', e.target.value)}
                      />
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.model}
                        onChange={(e) => setEF('model', e.target.value)}
                      />
                    </td>
                    <td className={styles.td}>
                      <select
                        className={styles.select}
                        value={editForm.busSize}
                        onChange={(e) => setEF('busSize', e.target.value as PcieBusSize)}
                      >
                        <option value="x1">x1</option>
                        <option value="x4">x4</option>
                        <option value="x8">x8</option>
                        <option value="x16">x16</option>
                      </select>
                    </td>
                    <td className={styles.td}>
                      <select
                        className={styles.select}
                        value={editForm.formFactor}
                        onChange={(e) => setEF('formFactor', e.target.value as PcieFormFactor)}
                      >
                        <option value="fh">Full Height</option>
                        <option value="lp">Low Profile</option>
                        <option value="fh-dw">Full Height DW</option>
                        <option value="lp-dw">Low Profile DW</option>
                      </select>
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="number"
                        min="1"
                        value={editForm.laneWidth}
                        onChange={(e) => setEF('laneWidth', parseInt(e.target.value, 10) || 1)}
                        style={{ width: '60px' }}
                      />
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          className={settingsStyles.primaryBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => handleSaveEdit(t.id)}
                          disabled={updateMut.isPending}
                        >
                          Save
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => handleOpenPcieEditor(t)}
                        >
                          Layout
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                        {confirmDeleteId === t.id ? (
                          <>
                            <span style={{ color: '#ef4444', fontSize: '10px', lineHeight: '22px' }}>Sure?</span>
                            <button
                              className={settingsStyles.dangerBtn}
                              style={{ padding: '3px 8px', fontSize: '10px' }}
                              onClick={() => handleDelete(t.id)}
                              disabled={deleteMut.isPending}
                            >
                              Yes
                            </button>
                            <button
                              className={settingsStyles.ghostBtn}
                              style={{ padding: '3px 8px', fontSize: '10px' }}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            className={settingsStyles.dangerBtn}
                            style={{ padding: '3px 8px', fontSize: '10px' }}
                            onClick={() => setConfirmDeleteId(t.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className={styles.tableRow} onClick={() => handleStartEdit(t)}>
                    <td className={styles.td}>{t.manufacturer ?? <span style={{ color: '#8a9299' }}>Generic</span>}</td>
                    <td className={styles.td}>
                      {t.make} <span style={{ color: '#8a9299' }}>{t.model}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.pill}>{t.busSize}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.pill}>{PCIE_FF_LABELS[t.formFactor] ?? t.formFactor}</span>
                    </td>
                    <td className={styles.tdMuted}>{t.laneWidth}</td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className={settingsStyles.primaryBtn}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => handleStartEdit(t)}
                        >
                          Edit
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => handleOpenPcieEditor(t)}
                        >
                          Layout
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PCIe Layout Editor overlay */}
      {pcieEditorTarget && (
        <PcieLayoutEditor
          open={pcieEditorOpen}
          formFactor={pcieEditorTarget.formFactor}
          initialBlocks={pcieEditorTarget.layout?.rear ?? []}
          title={`Edit Layout — ${pcieEditorTarget.make} ${pcieEditorTarget.model}`}
          onSave={handleSavePcieLayout}
          onClose={() => { setPcieEditorOpen(false); setPcieEditorTarget(null); }}
        />
      )}
    </div>
  );
}

// ── Device Types Tab ──────────────────────────────────────────────────────────

function DeviceTypeRow({ dt }: { dt: DeviceType }) {
  const updateMut = useUpdateDeviceType();
  const deleteMut = useDeleteDeviceType();
  const setTypeColor = useThemeStore((s) => s.setTypeColor);

  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(dt.color);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleColorChange = (c: string) => {
    setColor(c);
    setDirty(true);
    useThemeStore.getState().setTypeColor(dt.id, c);
  };

  const handleSave = () => {
    updateMut.mutate(
      { id: dt.id, color },
      { onSuccess: () => { setDirty(false); setEditing(false); } }
    );
  };

  const handleDelete = () => {
    deleteMut.mutate(dt.id, {
      onSuccess: () => setConfirmDelete(false),
    });
  };

  if (!editing) {
    return (
      <tr className={styles.tableRow}>
        <td className={styles.td}>{dt.name}</td>
        <td className={styles.td}>
          <div className={styles.colorRow}>
            <span className={styles.colorSwatch} style={{ background: color }} />
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-muted)' }}>{color}</span>
          </div>
        </td>
        <td className={styles.tdMuted}>
          {dt.isBuiltin ? <span className={styles.pill}>built-in</span> : null}
        </td>
        <td className={styles.td}>
          <button
            className={settingsStyles.primaryBtn}
            style={{ padding: '2px 8px', fontSize: '10px' }}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={styles.tableRowActive}>
      <td className={styles.td}>{dt.name}</td>
      <td className={styles.td}>
        <div className={styles.colorRow}>
          <span
            className={styles.colorSwatch}
            style={{ background: color }}
            onClick={() => document.getElementById(`color-pick-${dt.id}`)?.click()}
          />
          <input
            id={`color-pick-${dt.id}`}
            type="color"
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          />
          <input
            className={styles.colorInput}
            type="text"
            value={color}
            maxLength={7}
            onChange={(e) => {
              const v = e.target.value;
              setColor(v);
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                setDirty(true);
                setTypeColor(dt.id, v);
              }
            }}
          />
        </div>
      </td>
      <td className={styles.tdMuted}>
        {dt.isBuiltin ? <span className={styles.pill}>built-in</span> : null}
      </td>
      <td className={styles.td}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {dirty && (
            <button
              className={settingsStyles.primaryBtn}
              style={{ padding: '2px 8px', fontSize: '10px' }}
              onClick={handleSave}
              disabled={updateMut.isPending}
            >
              {updateMut.isPending ? '...' : 'Save'}
            </button>
          )}
          <button
            className={settingsStyles.ghostBtn}
            style={{ padding: '2px 8px', fontSize: '10px' }}
            onClick={() => { setEditing(false); setColor(dt.color); setDirty(false); setConfirmDelete(false); }}
          >
            Cancel
          </button>
          {confirmDelete ? (
            <>
              <span style={{ color: '#ef4444', fontSize: '10px', lineHeight: '22px' }}>Sure?</span>
              <button
                className={settingsStyles.dangerBtn}
                style={{ padding: '2px 8px', fontSize: '10px' }}
                onClick={handleDelete}
                disabled={deleteMut.isPending}
              >
                Yes
              </button>
              <button
                className={settingsStyles.ghostBtn}
                style={{ padding: '2px 8px', fontSize: '10px' }}
                onClick={() => setConfirmDelete(false)}
              >
                No
              </button>
            </>
          ) : (
            <button
              className={settingsStyles.dangerBtn}
              style={{ padding: '2px 8px', fontSize: '10px' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function DeviceTypesTab() {
  const { data: typesData, isLoading } = useGetTypes();
  const createMut = useCreateDeviceType();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#8a9299');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) {
      setError('Name is required');
      return;
    }
    createMut.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName('');
          setNewColor('#8a9299');
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create type'),
      }
    );
  };

  if (isLoading) {
    return <div style={{ color: '#8a9299', fontSize: '13px', padding: '20px 0' }}>Loading types...</div>;
  }

  const deviceTypes = typesData?.deviceTypes ?? [];

  return (
    <div>
      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.toolbar}>
        <span className={styles.sectionTitle}>{deviceTypes.length} device type{deviceTypes.length !== 1 ? 's' : ''}</span>
        <button
          className={settingsStyles.primaryBtn}
          onClick={() => {
            setShowCreate(!showCreate);
            setError('');
          }}
        >
          {showCreate ? 'Cancel' : '+ Create Type'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.inlineForm}>
          <p className={styles.inlineFormTitle}>New Device Type</p>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Name *</label>
              <input
                className={styles.input}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. NAS"
              />
            </div>
            <div className={styles.formField} style={{ maxWidth: '160px' }}>
              <label className={styles.label}>Color</label>
              <div className={styles.colorRow}>
                <span
                  className={styles.colorSwatch}
                  style={{ background: newColor }}
                  onClick={() => document.getElementById('new-type-color-pick')?.click()}
                />
                <input
                  id="new-type-color-pick"
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                />
                <input
                  className={styles.colorInput}
                  type="text"
                  value={newColor}
                  maxLength={7}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewColor(v);
                  }}
                />
              </div>
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={settingsStyles.ghostBtn} onClick={() => { setShowCreate(false); setError(''); }}>
              Cancel
            </button>
            <button className={settingsStyles.primaryBtn} onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating...' : 'Create Type'}
            </button>
          </div>
        </div>
      )}

      {!deviceTypes.length ? (
        <div className={styles.emptyState}>No device types found.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Color</th>
                <th className={styles.th}>Flags</th>
                <th className={styles.th} style={{ width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deviceTypes.map((dt) => (
                <DeviceTypeRow key={dt.id} dt={dt} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type TemplatesSubTab = 'device-templates' | 'pcie-templates' | 'device-types';

export default function TemplatesSettings({ siteId: _siteId }: { siteId: string }) {
  const [subTab, setSubTab] = useState<TemplatesSubTab>('device-templates');

  return (
    <div className={styles.container}>
      <div className={styles.subTabBar}>
        {(
          [
            ['device-templates', 'Device Templates'],
            ['pcie-templates', 'PCIe Templates'],
            ['device-types', 'Device Types'],
          ] as [TemplatesSubTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={`${settingsStyles.subTab} ${subTab === id ? settingsStyles.subTabActive : ''}`}
            onClick={() => setSubTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'device-templates' && <DeviceTemplatesTab />}
      {subTab === 'pcie-templates' && <PcieTemplatesTab />}
      {subTab === 'device-types' && <DeviceTypesTab />}
    </div>
  );
}
