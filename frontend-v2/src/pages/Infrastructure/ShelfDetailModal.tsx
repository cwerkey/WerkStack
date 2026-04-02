import { useState, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DeviceInstance, DeviceTemplate } from '@werkstack/shared';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { useUpdateDevice } from '@/api/devices';
import styles from './ShelfDetailModal.module.css';

interface ShelfDetailModalProps {
  shelf: DeviceInstance;
  siteId: string;
  devices: DeviceInstance[];
  templates: DeviceTemplate[];
  onClose: () => void;
  onDeviceClick: (deviceId: string) => void;
}

const GRID_COLS = 96;
const CELL_SIZE = 8;

export function ShelfDetailModal({
  shelf, siteId, devices, templates, onClose, onDeviceClick,
}: ShelfDetailModalProps) {
  const qc = useQueryClient();
  const updateDevice = useUpdateDevice(siteId);

  const gridRows = (shelf.uHeight ?? 1) * 12;
  const gridW = GRID_COLS * CELL_SIZE;
  const gridH = gridRows * CELL_SIZE;

  const children = useMemo(
    () => devices.filter(d => d.shelfDeviceId === shelf.id),
    [devices, shelf.id],
  );

  const placeableDevices = useMemo(
    () => devices.filter(d => !d.rackId && !d.shelfDeviceId && d.id !== shelf.id),
    [devices, shelf.id],
  );

  const [dragDeviceId, setDragDeviceId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ col: number; row: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  function deviceGridSize(d: DeviceInstance): { cols: number; rows: number } {
    const tpl = d.templateId ? templates.find(t => t.id === d.templateId) : undefined;
    return { cols: tpl?.gridCols ?? 10, rows: (tpl?.uHeight ?? 1) * 12 };
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const row = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    setDragPos({
      col: Math.max(0, Math.min(col, GRID_COLS - 1)),
      row: Math.max(0, Math.min(row, gridRows - 1)),
    });
  }

  function handleGridDrop(e: React.DragEvent) {
    e.preventDefault();
    const deviceId = e.dataTransfer.getData('werkstack/shelf-device-id') || dragDeviceId;
    if (!deviceId || !gridRef.current) {
      setDragDeviceId(null);
      setDragPos(null);
      return;
    }

    const device = devices.find(d => d.id === deviceId);
    if (!device) { setDragDeviceId(null); setDragPos(null); return; }

    const rect = gridRef.current.getBoundingClientRect();
    const col = Math.max(0, Math.min(Math.floor((e.clientX - rect.left) / CELL_SIZE), GRID_COLS - 1));
    const row = Math.max(0, Math.min(Math.floor((e.clientY - rect.top) / CELL_SIZE), gridRows - 1));

    updateDevice.mutate({
      id: device.id,
      shelfDeviceId: shelf.id,
      shelfCol: col,
      shelfRow: row,
      rackId: shelf.rackId,
    }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', siteId] }),
    });

    setDragDeviceId(null);
    setDragPos(null);
  }

  function handleRemoveFromShelf(deviceId: string) {
    updateDevice.mutate({
      id: deviceId,
      shelfDeviceId: undefined,
      shelfCol: undefined,
      shelfRow: undefined,
      rackId: undefined,
    }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', siteId] }),
    });
  }

  const dragDevice = dragDeviceId ? devices.find(d => d.id === dragDeviceId) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>{shelf.name} — Shelf Layout</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Available devices sidebar */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarTitle}>
              Available Devices ({placeableDevices.length})
            </div>
            <div className={styles.sidebarList}>
              {placeableDevices.length === 0 ? (
                <div className={styles.sidebarEmpty}>no devices available</div>
              ) : (
                placeableDevices.map(d => (
                  <div
                    key={d.id}
                    className={styles.sidebarDevice}
                    draggable
                    onDragStart={(e) => {
                      setDragDeviceId(d.id);
                      e.dataTransfer.setData('werkstack/shelf-device-id', d.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div className={styles.sidebarDeviceName}>{d.name}</div>
                    <span className={styles.sidebarDeviceBadge}>
                      {d.uHeight ?? 1}U
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Shelf grid */}
          <div className={styles.gridArea}>
            <div className={styles.gridLabel}>
              Shelf Grid ({GRID_COLS}×{gridRows}) — drag devices to position, right-click to remove
            </div>

            <div
              ref={gridRef}
              className={styles.grid}
              style={{
                width: gridW,
                height: gridH,
                backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
              }}
              onDragOver={handleDragOver}
              onDrop={handleGridDrop}
            >
              {/* Placed children */}
              {children.map(child => {
                if (child.shelfCol == null || child.shelfRow == null) return null;
                const childTemplate = child.templateId
                  ? templates.find(t => t.id === child.templateId)
                  : undefined;
                const childCols = childTemplate?.gridCols ?? 10;
                const childRows = (childTemplate?.uHeight ?? 1) * 12;

                return (
                  <div
                    key={child.id}
                    className={styles.placedChild}
                    style={{
                      left: child.shelfCol * CELL_SIZE,
                      top: child.shelfRow * CELL_SIZE,
                      width: childCols * CELL_SIZE,
                      height: childRows * CELL_SIZE,
                    }}
                    draggable
                    onDragStart={() => setDragDeviceId(child.id)}
                    onClick={(e) => { e.stopPropagation(); onDeviceClick(child.id); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleRemoveFromShelf(child.id);
                    }}
                  >
                    {childTemplate ? (
                      <TemplateOverlay
                        blocks={childTemplate.layout.front}
                        gridCols={childCols}
                        gridRows={childRows}
                        width={childCols * CELL_SIZE}
                        height={childRows * CELL_SIZE}
                      />
                    ) : (
                      <span className={styles.placedChildName}>{child.name}</span>
                    )}
                  </div>
                );
              })}

              {/* Drag ghost */}
              {dragPos && dragDevice && (() => {
                const sz = deviceGridSize(dragDevice);
                return (
                  <div
                    className={styles.dragGhost}
                    style={{
                      left: dragPos.col * CELL_SIZE,
                      top: dragPos.row * CELL_SIZE,
                      width: sz.cols * CELL_SIZE,
                      height: sz.rows * CELL_SIZE,
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerInfo}>
            {children.length} device{children.length !== 1 ? 's' : ''} on shelf
          </span>
          <button className={styles.closeFooterBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
