import { useState, useMemo, useRef } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { api } from '../../../../utils/api';
import { useRackStore } from '../../../../store/useRackStore';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import { useTypesStore } from '../../../../store/useTypesStore';
import type { DeviceInstance } from '@werkstack/shared';

interface ShelfDetailModalProps {
  shelf:   DeviceInstance;
  siteId:  string;
  accent:  string;
  onClose: () => void;
  onEditDevice: (device: DeviceInstance) => void;
}

const GRID_COLS = 96;
const CELL_SIZE = 8; // px per grid cell

export function ShelfDetailModal({ shelf, siteId, accent, onClose, onEditDevice }: ShelfDetailModalProps) {
  const devices         = useRackStore(s => s.devices);
  const deviceTemplates = useTemplateStore(s => s.deviceTemplates);
  const deviceTypes     = useTypesStore(s => s.deviceTypes);

  const gridRows = (shelf.uHeight ?? 1) * 12;
  const gridW = GRID_COLS * CELL_SIZE;
  const gridH = gridRows * CELL_SIZE;

  // Children on this shelf
  const children = useMemo(() =>
    devices.filter(d => d.shelfDeviceId === shelf.id),
  [devices, shelf.id]);

  // Unracked non-shelf desktop/wall-mount devices that could be placed on shelf
  const placeableDevices = useMemo(() =>
    devices.filter(d =>
      !d.rackId && !d.shelfDeviceId &&
      d.typeId !== 'dt-shelf' &&
      d.typeId !== 'dt-router'
    ),
  [devices]);

  // Drag state
  const [dragDevice, setDragDevice] = useState<DeviceInstance | null>(null);
  const [dragPos, setDragPos]       = useState<{ col: number; row: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Resolve grid dimensions for a device (from its template or fallback)
  function deviceGridSize(d: DeviceInstance): { cols: number; rows: number } {
    const tpl = d.templateId ? deviceTemplates.find(t => t.id === d.templateId) : undefined;
    return { cols: tpl?.gridCols ?? 10, rows: tpl?.gridRows ?? 10 };
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!dragDevice || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const row = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    setDragPos({ col: Math.max(0, Math.min(col, GRID_COLS - 1)), row: Math.max(0, Math.min(row, gridRows - 1)) });
  }

  function handleGridDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!dragDevice || !gridRef.current) return;

    // Compute final position from drop coordinates (dragPos may lag behind)
    const rect = gridRef.current.getBoundingClientRect();
    const col = Math.max(0, Math.min(Math.floor((e.clientX - rect.left) / CELL_SIZE), GRID_COLS - 1));
    const row = Math.max(0, Math.min(Math.floor((e.clientY - rect.top) / CELL_SIZE), gridRows - 1));

    const isAlreadyOnShelf = dragDevice.shelfDeviceId === shelf.id;

    // Build payload — strip null/undefined values so Zod .optional() doesn't reject them
    const raw: Record<string, unknown> = {
      typeId:        dragDevice.typeId,
      name:          dragDevice.name,
      templateId:    dragDevice.templateId,
      zoneId:        dragDevice.zoneId,
      rackU:         dragDevice.rackU,
      uHeight:       dragDevice.uHeight,
      face:          dragDevice.face ?? 'front',
      ip:            dragDevice.ip,
      serial:        dragDevice.serial,
      assetTag:      dragDevice.assetTag,
      notes:         dragDevice.notes,
      isDraft:       dragDevice.isDraft ?? false,
      rackId:        isAlreadyOnShelf ? dragDevice.rackId : shelf.rackId,
      shelfDeviceId: isAlreadyOnShelf ? dragDevice.shelfDeviceId : shelf.id,
      shelfCol:      col,
      shelfRow:      row,
    };
    const body = Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null));

    const label = isAlreadyOnShelf ? 'shelf move' : 'shelf place';
    api.patch<DeviceInstance>(
      `/api/sites/${siteId}/devices/${dragDevice.id}`,
      body,
    ).then(updated => {
      if (updated) useRackStore.getState().upsertDevice(updated);
    }).catch(err => console.error(`[${label}]`, err));

    setDragDevice(null);
    setDragPos(null);
  }

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-panel" style={{ width: 'calc(100vw - 80px)', maxWidth: 'none' }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--border, #1d2022)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
            fontWeight: 700, color: accent,
          }}>
            {shelf.name} — Detail View
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            <Icon name="x" size={12} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>

          {/* Available devices sidebar */}
          <div style={{
            width: 180, flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 700,
              color: 'var(--text3, #4e5560)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Available Devices ({placeableDevices.length})
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {placeableDevices.length === 0 ? (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, color: 'var(--text3, #4e5560)',
                  padding: '8px 0',
                }}>
                  no devices available
                </div>
              ) : placeableDevices.map(d => {
                const dt = deviceTypes.find(t => t.id === d.typeId);
                return (
                  <div
                    key={d.id}
                    style={{
                      background: 'var(--cardBg, #141618)',
                      border: '1px solid var(--border2, #262c30)',
                      borderRadius: 4, padding: '4px 8px',
                      cursor: 'grab',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: 'var(--text, #d4d9dd)',
                    }}
                    draggable
                    onDragStart={() => setDragDevice(d)}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 1 }}>{d.name}</div>
                    <span className="badge" style={{
                      background: (dt?.color ?? '#666') + '22',
                      color: dt?.color ?? '#666',
                      fontSize: 8, padding: '0px 4px',
                    }}>
                      {dt?.name ?? d.typeId}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shelf grid */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--text3, #4e5560)',
            }}>
              Shelf Grid ({GRID_COLS}×{gridRows}) — drag devices to position, right-click to edit
            </div>

            <div
              ref={gridRef}
              style={{
                width: gridW, height: gridH,
                position: 'relative',
                background: 'var(--cardBg, #141618)',
                border: '1px solid var(--border2, #262c30)',
                borderRadius: 6,
                overflow: 'hidden',
                backgroundImage: `
                  linear-gradient(var(--border, #1d2022) 1px, transparent 1px),
                  linear-gradient(90deg, var(--border, #1d2022) 1px, transparent 1px)
                `,
                backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
              }}
              onDragOver={handleDragOver}
              onDrop={handleGridDrop}
            >
              {/* Placed children */}
              {children.map(child => {
                if (child.shelfCol == null || child.shelfRow == null) return null;
                const childTemplate = child.templateId
                  ? deviceTemplates.find(t => t.id === child.templateId)
                  : undefined;
                const childCols = childTemplate?.gridCols ?? 10;
                const childRows = childTemplate?.gridRows ?? 10;
                const childDt = deviceTypes.find(t => t.id === child.typeId);
                const color = childDt?.color ?? '#666';

                return (
                  <div
                    key={child.id}
                    style={{
                      position: 'absolute',
                      left: child.shelfCol * CELL_SIZE,
                      top: child.shelfRow * CELL_SIZE,
                      width: childCols * CELL_SIZE,
                      height: childRows * CELL_SIZE,
                      background: color + '22',
                      border: `1px solid ${color}55`,
                      borderRadius: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'grab',
                      zIndex: 2,
                    }}
                    draggable
                    onDragStart={() => setDragDevice(child)}
                    onContextMenu={e => {
                      e.preventDefault();
                      onEditDevice(child);
                    }}
                  >
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, fontWeight: 600,
                      color, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      padding: '0 4px',
                    }}>
                      {child.name}
                    </span>
                  </div>
                );
              })}

              {/* Drag ghost */}
              {dragPos && dragDevice && (() => {
                const sz = deviceGridSize(dragDevice);
                return (
                  <div style={{
                    position: 'absolute',
                    left: dragPos.col * CELL_SIZE,
                    top: dragPos.row * CELL_SIZE,
                    width: sz.cols * CELL_SIZE,
                    height: sz.rows * CELL_SIZE,
                    background: accent + '22',
                    border: `2px dashed ${accent}`,
                    borderRadius: 3,
                    pointerEvents: 'none',
                    zIndex: 10,
                  }} />
                );
              })()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 18px',
          borderTop: '1px solid var(--border2, #262c30)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: 'var(--text3, #4e5560)',
            flex: 1, display: 'flex', alignItems: 'center',
          }}>
            {children.length} device{children.length !== 1 ? 's' : ''} on shelf
          </span>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
