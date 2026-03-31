import { useMemo, useState, useCallback, useRef } from 'react';
import type { Rack, DeviceInstance, DeviceTemplate, PcieTemplate, DeviceType, ModuleInstance, Connection, PlacedBlock } from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { buildVirtualFaceplate } from '@/components/portAggregator';
import { getDeviceDisplayInfo } from '@/components/DeviceOverlay';
import styles from './RackView.module.css';

const RACK_UNIT_HEIGHT = 40;
const RACK_WIDTH = 480;

interface RackViewProps {
  rack: Rack;
  devices: DeviceInstance[];
  templates: DeviceTemplate[];
  pcieTemplates: PcieTemplate[];
  deviceTypes: DeviceType[];
  modules?: ModuleInstance[];
  connections?: Connection[];
  face: 'front' | 'rear';
  selectedDeviceId?: string | null;
  onDeviceClick: (deviceId: string) => void;
  onDevicePositionChange?: (deviceId: string, newRackU: number) => void;
}

interface PositionedDevice {
  device: DeviceInstance;
  template: DeviceTemplate | undefined;
  info: { name: string; color: string; uHeight: number };
  topPx: number;
  heightPx: number;
}

interface DragState {
  deviceId: string;
  startY: number;
  startTopPx: number;
  uHeight: number;
}

export function RackView({
  rack,
  devices,
  templates,
  pcieTemplates,
  deviceTypes,
  modules = [],
  connections = [],
  face,
  selectedDeviceId,
  onDeviceClick,
  onDevicePositionChange,
}: RackViewProps) {
  const totalHeight = rack.uHeight * RACK_UNIT_HEIGHT;
  const rackBodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragMoved = useRef(false);

  const rackDevices = useMemo(() => {
    return devices
      .filter(d => d.rackId === rack.id && d.rackU != null)
      .filter(d => {
        if (!d.face) return face === 'front';
        return d.face === face;
      });
  }, [devices, rack.id, face]);

  const positioned: PositionedDevice[] = useMemo(() => {
    return rackDevices.map(device => {
      const template = templates.find(t => t.id === device.templateId);
      const info = getDeviceDisplayInfo(device, deviceTypes);
      const uHeight = device.uHeight ?? template?.uHeight ?? 1;
      const heightPx = uHeight * RACK_UNIT_HEIGHT;
      // U1 is at the bottom. rackU is the bottom-most U position.
      const topPx = totalHeight - (device.rackU! + uHeight - 1) * RACK_UNIT_HEIGHT;
      return { device, template, info, topPx, heightPx };
    });
  }, [rackDevices, templates, deviceTypes, totalHeight]);

  const uLabels = useMemo(() => {
    const labels: number[] = [];
    for (let u = 1; u <= rack.uHeight; u++) labels.push(u);
    return labels;
  }, [rack.uHeight]);

  // Drag-to-reposition handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, deviceId: string, topPx: number, uHeight: number) => {
    e.preventDefault();
    setDrag({ deviceId, startY: e.clientY, startTopPx: topPx, uHeight });
    setDragOffsetY(0);
    dragMoved.current = false;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 3) dragMoved.current = true;
    setDragOffsetY(dy);
  }, [drag]);

  const handleMouseUp = useCallback(() => {
    if (!drag || !onDevicePositionChange || !dragMoved.current) {
      setDrag(null);
      setDragOffsetY(0);
      return;
    }
    const newTopPx = drag.startTopPx + dragOffsetY;
    // Snap to nearest U: convert topPx back to rackU
    // topPx = totalHeight - (rackU + uHeight - 1) * RACK_UNIT_HEIGHT
    // rackU = (totalHeight - topPx) / RACK_UNIT_HEIGHT - uHeight + 1
    const rawU = (totalHeight - newTopPx) / RACK_UNIT_HEIGHT - drag.uHeight + 1;
    const snappedU = Math.max(1, Math.min(rack.uHeight - drag.uHeight + 1, Math.round(rawU)));

    // Check collision
    const hasCollision = rackDevices.some(d => {
      if (d.id === drag.deviceId) return false;
      if (!d.rackU || !d.uHeight) return false;
      const dTop = d.rackU;
      const dBottom = d.rackU + (d.uHeight ?? 1) - 1;
      const newTop = snappedU;
      const newBottom = snappedU + drag.uHeight - 1;
      return newTop <= dBottom && newBottom >= dTop;
    });

    if (!hasCollision) {
      onDevicePositionChange(drag.deviceId, snappedU);
    }

    setDrag(null);
    setDragOffsetY(0);
  }, [drag, dragOffsetY, totalHeight, rack.uHeight, rackDevices, onDevicePositionChange]);

  return (
    <div
      className={styles.rackFrame}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className={styles.uLabels}>
        {uLabels.map(u => (
          <div key={u} className={styles.uLabel}>{u}</div>
        ))}
      </div>
      <div ref={rackBodyRef} className={styles.rackBody} style={{ width: RACK_WIDTH, height: totalHeight }}>
        {/* U-slot grid lines */}
        {uLabels.map(u => (
          <div
            key={`slot-${u}`}
            className={styles.uSlot}
            style={{ bottom: (u - 1) * RACK_UNIT_HEIGHT }}
          />
        ))}

        {/* Devices */}
        {positioned.map(({ device, template, info, topPx, heightPx }) => {
          const isSelected = selectedDeviceId === device.id;
          const isDragging = drag?.deviceId === device.id;
          const displayTop = isDragging ? topPx + dragOffsetY : topPx;

          return (
            <div
              key={device.id}
              className={`${styles.deviceSlot}${isSelected ? ` ${styles.deviceSlotSelected}` : ''}${isDragging ? ` ${styles.deviceDragging}` : ''}`}
              style={{ top: displayTop, height: heightPx }}
              onClick={() => { if (!dragMoved.current) onDeviceClick(device.id); }}
              onMouseDown={(e) => handleMouseDown(e, device.id, topPx, device.uHeight ?? template?.uHeight ?? 1)}
            >
              {template ? (
                <TemplatedDevice
                  template={template}
                  face={face}
                  heightPx={heightPx}
                  modules={modules.filter(m => m.deviceId === device.id)}
                  pcieTemplates={pcieTemplates}
                  deviceConnections={connections.filter(c => c.srcDeviceId === device.id || c.dstDeviceId === device.id)}
                />
              ) : (
                <SimpleDevice name={info.name} color={info.color} />
              )}
            </div>
          );
        })}

        {rackDevices.length === 0 && (
          <div className={styles.emptyRack}>empty rack</div>
        )}
      </div>
    </div>
  );
}

function buildPortOpacity(
  blocks: PlacedBlock[],
  deviceConnections: Connection[],
): Record<string, number> | undefined {
  // If no connection data at all, render everything at full opacity
  if (deviceConnections.length === 0) return undefined;

  const connectedBlockIds = new Set<string>();
  for (const c of deviceConnections) {
    if (c.srcBlockId) connectedBlockIds.add(c.srcBlockId);
    if (c.dstBlockId) connectedBlockIds.add(c.dstBlockId);
  }

  const opacity: Record<string, number> = {};
  for (const block of blocks) {
    const def = BLOCK_DEF_MAP.get(block.type);
    const isPortOrNet = def?.isPort || def?.isNet;
    if (isPortOrNet) {
      opacity[block.id] = connectedBlockIds.has(block.id) ? 1 : 0.35;
    }
  }
  return Object.keys(opacity).length > 0 ? opacity : undefined;
}

function TemplatedDevice({
  template,
  face,
  heightPx,
  modules,
  pcieTemplates,
  deviceConnections,
}: {
  template: DeviceTemplate;
  face: 'front' | 'rear';
  heightPx: number;
  modules: ModuleInstance[];
  pcieTemplates: PcieTemplate[];
  deviceConnections: Connection[];
}) {
  const blocks = useMemo(
    () => buildVirtualFaceplate(template, face, modules, pcieTemplates),
    [template, face, modules, pcieTemplates],
  );

  const blockOpacity = useMemo(
    () => buildPortOpacity(blocks, deviceConnections),
    [blocks, deviceConnections],
  );

  const gridCols = template.gridCols ?? 96;
  const gridRows = template.uHeight * 12;

  return (
    <TemplateOverlay
      blocks={blocks}
      gridCols={gridCols}
      gridRows={gridRows}
      width={RACK_WIDTH}
      height={heightPx}
      blockOpacity={blockOpacity}
      interactive
    />
  );
}

function SimpleDevice({ name, color }: { name: string; color: string }) {
  return (
    <div className={styles.simpleDevice} style={{ background: color, border: `1px solid ${color}` }}>
      <span className={styles.simpleDeviceName}>{name}</span>
    </div>
  );
}
