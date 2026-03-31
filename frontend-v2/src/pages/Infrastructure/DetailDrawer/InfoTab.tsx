import { useState, useEffect } from 'react';
import type { DeviceInstance, DeviceType, DeviceTemplate, Rack, Zone } from '@werkstack/shared';
import styles from './InfoTab.module.css';

interface InfoTabProps {
  device: DeviceInstance;
  deviceTypes: DeviceType[];
  templates: DeviceTemplate[];
  racks: Rack[];
  zones: Zone[];
  onSave: (updated: Partial<DeviceInstance> & { id: string }) => void;
  onDelete: (id: string) => void;
  onMoveToRack?: () => void;
  onMoveToUnassigned?: () => void;
}

export function InfoTab({ device, deviceTypes, templates, racks, zones, onSave, onDelete, onMoveToRack, onMoveToUnassigned }: InfoTabProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name);
  const [typeId, setTypeId] = useState(device.typeId);
  const [ip, setIp] = useState(device.ip ?? '');
  const [serial, setSerial] = useState(device.serial ?? '');
  const [assetTag, setAssetTag] = useState(device.assetTag ?? '');
  const [notes, setNotes] = useState(device.notes ?? '');

  useEffect(() => {
    setName(device.name);
    setTypeId(device.typeId);
    setIp(device.ip ?? '');
    setSerial(device.serial ?? '');
    setAssetTag(device.assetTag ?? '');
    setNotes(device.notes ?? '');
    setEditing(false);
  }, [device.id, device.name, device.ip, device.serial, device.assetTag, device.notes, device.typeId]);

  const dt = deviceTypes.find(t => t.id === device.typeId);
  const tpl = templates.find(t => t.id === device.templateId);
  const rack = racks.find(r => r.id === device.rackId);
  const zone = zones.find(z => z.id === device.zoneId);
  const isRacked = !!device.rackId;

  function handleSave() {
    onSave({
      id: device.id,
      name,
      typeId,
      ip: ip || undefined,
      serial: serial || undefined,
      assetTag: assetTag || undefined,
      notes: notes || undefined,
    });
    setEditing(false);
  }

  function handleCancel() {
    setName(device.name);
    setTypeId(device.typeId);
    setIp(device.ip ?? '');
    setSerial(device.serial ?? '');
    setAssetTag(device.assetTag ?? '');
    setNotes(device.notes ?? '');
    setEditing(false);
  }

  function handleMoveToUnassigned() {
    if (!window.confirm(`Remove "${device.name}" from its rack? All cable connections will be deleted.`)) return;
    onMoveToUnassigned?.();
  }

  function handleDelete() {
    if (!window.confirm(`Permanently delete "${device.name}"? This cannot be undone.`)) return;
    onDelete(device.id);
  }

  return (
    <div className={styles.info}>
      <div className={styles.titleRow}>
        <h2 className={styles.deviceName}>{device.name}</h2>
        {dt && (
          <span className={styles.typeBadge} style={{ background: dt.color + '22', color: dt.color, borderColor: dt.color + '44' }}>
            {dt.name}
          </span>
        )}
      </div>

      {!editing ? (
        <>
          <dl className={styles.fields}>
            <Field label="Template" value={tpl ? `${tpl.make} ${tpl.model}` : '—'} />
            <Field label="Location" value={rack ? `${rack.name}, U${device.rackU ?? '?'} (${device.face ?? 'front'})` : zone ? `${zone.name} (unracked)` : '—'} />
            <Field label="Primary IP" value={device.ip ?? '—'} />
            <Field label="Serial" value={device.serial ?? '—'} />
            <Field label="Asset Tag" value={device.assetTag ?? '—'} />
            <Field label="Status" value={device.currentStatus ?? 'unknown'} />
            <Field label="Notes" value={device.notes ?? '—'} />
          </dl>
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={() => setEditing(true)}>Edit</button>
            {isRacked && onMoveToUnassigned && (
              <button className={styles.btnGhost} onClick={handleMoveToUnassigned}>Move to Unassigned</button>
            )}
            {onMoveToRack && (
              <button className={styles.btnGhost} onClick={onMoveToRack}>Move to Rack</button>
            )}
          </div>
        </>
      ) : (
        <div className={styles.form}>
          <label className={styles.label}>
            Name
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className={styles.label}>
            Type
            <select className={styles.input} value={typeId} onChange={e => setTypeId(e.target.value)}>
              {deviceTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Primary IP
            <input className={styles.input} value={ip} onChange={e => setIp(e.target.value)} placeholder="e.g. 192.168.1.10" />
          </label>
          <label className={styles.label}>
            Serial
            <input className={styles.input} value={serial} onChange={e => setSerial(e.target.value)} />
          </label>
          <label className={styles.label}>
            Asset Tag
            <input className={styles.input} value={assetTag} onChange={e => setAssetTag(e.target.value)} />
          </label>
          <label className={styles.label}>
            Notes
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
          </label>
          <div className={styles.actions}>
            <button className={styles.btnDanger} onClick={handleDelete}>Delete</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.btnGhost} onClick={handleCancel}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={styles.dt}>{label}</dt>
      <dd className={styles.dd}>{value}</dd>
    </>
  );
}
