import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { useGetZones, useCreateZone } from '@/api/zones';
import { useGetRacks, useCreateRack, useUpdateRack, useDeleteRack } from '@/api/racks';
import type { Zone, Rack } from '@werkstack/shared';
import styles from './ZonesRacksSettings.module.css';
import settingsStyles from './SettingsPage.module.css';

// ── Extra zone mutations ──────────────────────────────────────────────────────

function useUpdateZone(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; description?: string }) =>
      api.patch<Zone>(`/api/sites/${siteId}/zones/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones', siteId] }),
  });
}

function useDeleteZone(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/sites/${siteId}/zones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones', siteId] }),
  });
}

// ── Zones Panel ───────────────────────────────────────────────────────────────

interface ZonesAddForm {
  name: string;
  description: string;
}

interface ZoneEditForm {
  name: string;
  description: string;
}

function ZonesPanel({
  siteId,
  selectedId,
  onSelect,
  racks,
}: {
  siteId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  racks: Rack[];
}) {
  const { data: zones, isLoading } = useGetZones(siteId);
  const createZone = useCreateZone(siteId);
  const updateZone = useUpdateZone(siteId);
  const deleteZone = useDeleteZone(siteId);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<ZonesAddForm>({ name: '', description: '' });
  const [addError, setAddError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ZoneEditForm>({ name: '', description: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!addForm.name.trim()) {
      setAddError('Name is required');
      return;
    }
    createZone.mutate(
      { name: addForm.name.trim(), description: addForm.description.trim() || undefined },
      {
        onSuccess: () => {
          setShowAdd(false);
          setAddForm({ name: '', description: '' });
          setAddError('');
        },
        onError: (err) => setAddError(err instanceof Error ? err.message : 'Failed to create zone'),
      }
    );
  };

  const handleStartEdit = (z: Zone, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(z.id);
    setEditForm({ name: z.name, description: z.description ?? '' });
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = (id: string) => {
    updateZone.mutate(
      { id, name: editForm.name.trim(), description: editForm.description.trim() || undefined },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const handleDeleteZone = (id: string) => {
    deleteZone.mutate(id, {
      onSuccess: () => setConfirmDeleteId(null),
    });
  };

  const getRackCount = (zoneId: string) => racks.filter((r) => r.zoneId === zoneId).length;

  return (
    <div className={styles.zonesPanel}>
      <div className={styles.zonesPanelInner}>
        <div className={styles.panelHeader}>
          <p className={styles.panelTitle}>Zones</p>
          <button
            className={settingsStyles.primaryBtn}
            style={{ padding: '3px 10px', fontSize: '10px' }}
            onClick={() => {
              setShowAdd(!showAdd);
              setAddError('');
            }}
          >
            {showAdd ? 'Cancel' : '+ Add Zone'}
          </button>
        </div>

        {showAdd && (
          <div className={styles.inlineForm}>
            {addError && <div className={styles.errorMsg}>{addError}</div>}
            <div className={styles.formField} style={{ marginBottom: '8px' }}>
              <label className={styles.label}>Name *</label>
              <input
                className={styles.input}
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Server Room A"
                autoFocus
              />
            </div>
            <div className={styles.formField} style={{ marginBottom: '8px' }}>
              <label className={styles.label}>Description</label>
              <input
                className={styles.input}
                type="text"
                value={addForm.description}
                onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                className={settingsStyles.ghostBtn}
                style={{ padding: '3px 10px', fontSize: '10px' }}
                onClick={() => { setShowAdd(false); setAddError(''); }}
              >
                Cancel
              </button>
              <button
                className={settingsStyles.primaryBtn}
                style={{ padding: '3px 10px', fontSize: '10px' }}
                onClick={handleAdd}
                disabled={createZone.isPending}
              >
                {createZone.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className={styles.emptyState} style={{ padding: '20px 0' }}>Loading zones...</div>
        ) : !zones?.length ? (
          <div className={styles.emptyState} style={{ padding: '20px 0' }}>
            <div>No zones yet.</div>
            {!showAdd && (
              <button
                className={settingsStyles.primaryBtn}
                style={{ marginTop: '10px' }}
                onClick={() => setShowAdd(true)}
              >
                + Add Zone
              </button>
            )}
          </div>
        ) : (
          zones.map((z) =>
            editingId === z.id ? (
              <div key={z.id} className={styles.inlineForm} style={{ marginBottom: '6px' }}>
                <div className={styles.formField} style={{ marginBottom: '8px' }}>
                  <label className={styles.label}>Name</label>
                  <input
                    className={styles.input}
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className={styles.formField} style={{ marginBottom: '8px' }}>
                  <label className={styles.label}>Description</label>
                  <input
                    className={styles.input}
                    type="text"
                    value={editForm.description}
                    onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button
                    className={settingsStyles.ghostBtn}
                    style={{ padding: '3px 10px', fontSize: '10px' }}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className={settingsStyles.primaryBtn}
                    style={{ padding: '3px 10px', fontSize: '10px' }}
                    onClick={() => handleSaveEdit(z.id)}
                    disabled={updateZone.isPending}
                  >
                    {updateZone.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : confirmDeleteId === z.id ? (
              <div
                key={z.id}
                className={styles.zoneCard}
                style={{ borderColor: '#ef4444', background: '#1e1416' }}
              >
                <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '8px' }}>
                  Delete &quot;{z.name}&quot;?
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className={settingsStyles.dangerBtn}
                    style={{ padding: '3px 10px', fontSize: '10px' }}
                    onClick={() => handleDeleteZone(z.id)}
                    disabled={deleteZone.isPending}
                  >
                    Delete
                  </button>
                  <button
                    className={settingsStyles.ghostBtn}
                    style={{ padding: '3px 10px', fontSize: '10px' }}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={z.id}
                className={`${styles.zoneCard} ${selectedId === z.id ? styles.zoneCardActive : ''}`}
                onClick={() => onSelect(z.id)}
              >
                <div className={styles.zoneName}>{z.name}</div>
                {z.description && <div className={styles.zoneDesc}>{z.description}</div>}
                <div className={styles.zoneMeta}>
                  <span className={styles.pill}>
                    {getRackCount(z.id)} rack{getRackCount(z.id) !== 1 ? 's' : ''}
                  </span>
                  <div className={styles.zoneActions}>
                    <button
                      className={settingsStyles.ghostBtn}
                      style={{ padding: '2px 8px', fontSize: '10px' }}
                      onClick={(e) => handleStartEdit(z, e)}
                    >
                      Edit
                    </button>
                    {getRackCount(z.id) === 0 && (
                      <button
                        className={settingsStyles.dangerBtn}
                        style={{ padding: '2px 8px', fontSize: '10px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(z.id);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ── Racks Panel ───────────────────────────────────────────────────────────────

interface RackFormState {
  name: string;
  uHeight: string;
  powerBudget: string;
}

const blankRackForm = (): RackFormState => ({ name: '', uHeight: '42', powerBudget: '' });

function RacksPanel({
  siteId,
  selectedZoneId,
  racks,
  isLoadingRacks,
}: {
  siteId: string;
  selectedZoneId: string | null;
  racks: Rack[];
  isLoadingRacks: boolean;
}) {
  const createRack = useCreateRack(siteId);
  const updateRack = useUpdateRack(siteId);
  const deleteRack = useDeleteRack(siteId);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<RackFormState>(blankRackForm());
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RackFormState>(blankRackForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const zoneRacks = selectedZoneId
    ? racks.filter((r) => r.zoneId === selectedZoneId)
    : [];

  const handleAdd = () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!selectedZoneId) return;
    createRack.mutate(
      {
        name: form.name.trim(),
        zoneId: selectedZoneId,
        uHeight: parseInt(form.uHeight, 10) || 42,
        powerBudgetWatts: form.powerBudget ? parseInt(form.powerBudget, 10) : undefined,
      } as Partial<Rack>,
      {
        onSuccess: () => {
          setShowAdd(false);
          setForm(blankRackForm());
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create rack'),
      }
    );
  };

  const handleStartEdit = (r: Rack) => {
    setEditingId(r.id);
    setEditForm({
      name: r.name,
      uHeight: String(r.uHeight),
      powerBudget: r.powerBudgetWatts != null ? String(r.powerBudgetWatts) : '',
    });
  };

  const handleSaveEdit = (id: string) => {
    updateRack.mutate(
      {
        id,
        name: editForm.name.trim(),
        uHeight: parseInt(editForm.uHeight, 10) || 42,
        powerBudgetWatts: editForm.powerBudget ? parseInt(editForm.powerBudget, 10) : undefined,
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update rack'),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteRack.mutate(id, {
      onSuccess: () => setConfirmDeleteId(null),
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete rack'),
    });
  };

  if (!selectedZoneId) {
    return (
      <div className={styles.racksPanel}>
        <div className={styles.emptyState}>Select a zone to see its racks</div>
      </div>
    );
  }

  return (
    <div className={styles.racksPanel}>
      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>
          Racks {selectedZoneId ? `(${zoneRacks.length})` : ''}
        </p>
        <button
          className={settingsStyles.primaryBtn}
          style={{ padding: '3px 10px', fontSize: '10px' }}
          onClick={() => {
            setShowAdd(!showAdd);
            setForm(blankRackForm());
            setError('');
          }}
        >
          {showAdd ? 'Cancel' : '+ Add Rack'}
        </button>
      </div>

      {showAdd && (
        <div className={styles.inlineForm} style={{ marginBottom: '10px' }}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Name *</label>
              <input
                className={styles.input}
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Rack A1"
                autoFocus
              />
            </div>
            <div className={styles.formField} style={{ maxWidth: '90px' }}>
              <label className={styles.label}>U Height</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                max="52"
                value={form.uHeight}
                onChange={(e) => setForm((p) => ({ ...p, uHeight: e.target.value }))}
              />
            </div>
            <div className={styles.formField} style={{ maxWidth: '110px' }}>
              <label className={styles.label}>Power Budget (W)</label>
              <input
                className={styles.input}
                type="number"
                min="0"
                value={form.powerBudget}
                onChange={(e) => setForm((p) => ({ ...p, powerBudget: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
              <button
                className={settingsStyles.primaryBtn}
                style={{ padding: '5px 12px', fontSize: '11px' }}
                onClick={handleAdd}
                disabled={createRack.isPending}
              >
                {createRack.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                className={settingsStyles.ghostBtn}
                style={{ padding: '5px 12px', fontSize: '11px' }}
                onClick={() => { setShowAdd(false); setError(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoadingRacks ? (
        <div className={styles.emptyState}>Loading racks...</div>
      ) : !zoneRacks.length ? (
        <div className={styles.emptyState}>
          <div>No racks in this zone.</div>
          {!showAdd && (
            <button
              className={settingsStyles.primaryBtn}
              style={{ marginTop: '10px' }}
              onClick={() => setShowAdd(true)}
            >
              + Add Rack
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>U Height</th>
                <th className={styles.th}>Power Budget (W)</th>
                <th className={styles.th} style={{ width: '130px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {zoneRacks.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id} style={{ background: '#1e2428' }}>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="number"
                        min="1"
                        max="52"
                        value={editForm.uHeight}
                        onChange={(e) => setEditForm((p) => ({ ...p, uHeight: e.target.value }))}
                        style={{ width: '60px' }}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        value={editForm.powerBudget}
                        onChange={(e) => setEditForm((p) => ({ ...p, powerBudget: e.target.value }))}
                        placeholder="—"
                        style={{ width: '80px' }}
                      />
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className={settingsStyles.primaryBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => handleSaveEdit(r.id)}
                          disabled={updateRack.isPending}
                        >
                          Save
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : confirmDeleteId === r.id ? (
                  <tr key={r.id} style={{ background: '#1e1416' }}>
                    <td className={styles.td} colSpan={3} style={{ color: '#ef4444', fontSize: '12px' }}>
                      Delete &quot;{r.name}&quot;? This cannot be undone.
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className={settingsStyles.dangerBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => handleDelete(r.id)}
                          disabled={deleteRack.isPending}
                        >
                          Delete
                        </button>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className={styles.tableRow}>
                    <td className={styles.td}>{r.name}</td>
                    <td className={styles.tdMuted}>{r.uHeight}U</td>
                    <td className={styles.tdMuted}>
                      {r.powerBudgetWatts != null ? `${r.powerBudgetWatts} W` : '—'}
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className={settingsStyles.ghostBtn}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => handleStartEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          className={settingsStyles.dangerBtn}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => setConfirmDeleteId(r.id)}
                        >
                          Delete
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
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ZonesRacksSettings({ siteId }: { siteId: string }) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const { data: racks, isLoading: isLoadingRacks } = useGetRacks(siteId);

  return (
    <div className={styles.container}>
      <ZonesPanel
        siteId={siteId}
        selectedId={selectedZoneId}
        onSelect={setSelectedZoneId}
        racks={racks ?? []}
      />
      <RacksPanel
        siteId={siteId}
        selectedZoneId={selectedZoneId}
        racks={racks ?? []}
        isLoadingRacks={isLoadingRacks}
      />
    </div>
  );
}
