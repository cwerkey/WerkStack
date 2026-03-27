import { TemplateOverlay } from '../../../../components/ui/TemplateOverlay';
import { EmptyState }       from '../../../../components/ui/EmptyState';
import type { DeviceInstance, DeviceTemplate, Drive, StoragePool, BlockType } from '@werkstack/shared';

const BAY_TYPES = new Set<BlockType>([
  'bay-3.5', 'bay-2.5', 'bay-2.5v', 'bay-m2', 'bay-u2', 'bay-flash', 'bay-sd',
]);

const DRIVE_BG: Record<string, string> = {
  hdd:   '#1e3a5f',
  ssd:   '#1e4a36',
  nvme:  '#4a2a10',
  flash: '#3a3410',
  tape:  '#2a1a4a',
};

const DRIVE_LABEL_COLOR: Record<string, string> = {
  hdd:   '#4a8fc4',
  ssd:   '#4ac48a',
  nvme:  '#c47c5a',
  flash: '#c4b44a',
  tape:  '#8a5ac4',
};

interface Props {
  devices:   DeviceInstance[];
  drives:    Drive[];
  pools:     StoragePool[];
  templates: DeviceTemplate[];
}

export function StorageDevicesTab({ devices, drives, templates }: Props) {
  const templateById = new Map(templates.map(t => [t.id, t]));

  // Only show devices whose template has at least one bay block
  const storageDevices = devices.filter(d => {
    if (!d.templateId) return false;
    const t = templateById.get(d.templateId);
    if (!t) return false;
    return [...t.layout.front, ...t.layout.rear].some(b => BAY_TYPES.has(b.type));
  });

  if (storageDevices.length === 0) {
    return (
      <div style={{ padding: '40px 0' }}>
        <EmptyState
          icon="storage"
          title="no storage devices"
          subtitle="Device instances with bay blocks in their templates will appear here."
        />
      </div>
    );
  }

  // Group drives by device
  const drivesByDevice = new Map<string, Drive[]>();
  for (const d of drives) {
    if (!drivesByDevice.has(d.deviceId)) drivesByDevice.set(d.deviceId, []);
    drivesByDevice.get(d.deviceId)!.push(d);
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {storageDevices.map(device => {
        const template      = templateById.get(device.templateId!)!;
        const deviceDrives  = drivesByDevice.get(device.id) ?? [];
        const driveBySlot   = new Map(deviceDrives.filter(d => d.slotBlockId).map(d => [d.slotBlockId!, d]));
        const internalDrives = deviceDrives.filter(d => !d.slotBlockId);

        const allBays = [...template.layout.front, ...template.layout.rear].filter(b => BAY_TYPES.has(b.type));
        const usedBays = deviceDrives.filter(d => d.slotBlockId).length;

        // blockColors: bay blocks get drive-type color when occupied
        const blockColors: Record<string, string> = {};
        for (const b of allBays) {
          const drive = driveBySlot.get(b.id);
          if (drive) blockColors[b.id] = DRIVE_BG[drive.driveType] ?? '#1e2a3a';
        }

        // Which drive types are present on this device
        const presentTypes = [...new Set(deviceDrives.map(d => d.driveType))];

        const gridCols = template.gridCols ?? 96;
        const gridRows = template.gridRows ?? template.uHeight * 12;

        return (
          <div key={device.id} style={{
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13, fontWeight: 600, color: 'var(--text, #d4d9dd)',
                }}>
                  {device.name}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: 'var(--text3, #4e5560)', marginTop: 2,
                }}>
                  {template.make} {template.model} · {usedBays}/{allBays.length} bays · {deviceDrives.length} drive{deviceDrives.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Drive type legend */}
              {presentTypes.length > 0 && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {presentTypes.map(t => (
                    <span key={t} style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      color: DRIVE_LABEL_COLOR[t] ?? '#8a9299',
                      background: DRIVE_BG[t] ?? '#1e2022',
                      border: `1px solid ${DRIVE_LABEL_COLOR[t] ?? '#3a4248'}44`,
                      borderRadius: 3,
                      padding: '2px 6px',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Front panel bay grid */}
            {template.layout.front.length > 0 && (
              <div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, color: 'var(--text3, #4e5560)', marginBottom: 4,
                }}>
                  front panel
                </div>
                <TemplateOverlay
                  blocks={template.layout.front}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  width={640}
                  showLabels
                  blockColors={blockColors}
                />
              </div>
            )}

            {/* Rear panel bay grid (only if rear has bay blocks) */}
            {template.layout.rear.filter(b => BAY_TYPES.has(b.type)).length > 0 && (
              <div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, color: 'var(--text3, #4e5560)', marginBottom: 4,
                }}>
                  rear panel
                </div>
                <TemplateOverlay
                  blocks={template.layout.rear}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  width={640}
                  showLabels
                  blockColors={blockColors}
                />
              </div>
            )}

            {/* Internal / unslotted drives (M.2, U.2, etc. not mapped to a template block) */}
            {internalDrives.length > 0 && (
              <div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, color: 'var(--text3, #4e5560)', marginBottom: 6,
                }}>
                  internal / unslotted drives
                </div>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>label</th>
                      <th>capacity</th>
                      <th>type</th>
                      <th>serial</th>
                      <th>boot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internalDrives.map(d => (
                      <tr key={d.id} className="st-row">
                        <td className="pri">{d.label || '—'}</td>
                        <td>{d.capacity}</td>
                        <td>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9,
                            color: DRIVE_LABEL_COLOR[d.driveType] ?? '#8a9299',
                            background: DRIVE_BG[d.driveType] ?? '#1e2022',
                            borderRadius: 3, padding: '1px 5px',
                          }}>
                            {d.driveType}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text3, #4e5560)' }}>{d.serial || '—'}</td>
                        <td style={{ color: d.isBoot ? '#f0c040' : 'var(--text3, #4e5560)' }}>
                          {d.isBoot ? '★' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
