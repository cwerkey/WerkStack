import { useMemo, useState, useCallback, useRef } from 'react';
import type { Rack, DeviceInstance, DeviceTemplate, PcieTemplate, DeviceType, ModuleInstance, Connection, PlacedBlock } from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { buildVirtualFaceplateWithMeta, type ShelvedItem } from '@/components/portAggregator';
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
  templateFace?: 'front' | 'rear';
  selectedDeviceId?: string | null;
  onDeviceClick: (deviceId: string) => void;
  onDevicePositionChange?: (deviceId: string, newRackU: number) => void;
  onDeviceDrop?: (deviceId: string, rackU: number) => void;
  onEmptySlotDblClick?: (rackU: number) => void;
  onShelfOpen?: (shelfDeviceId: string) => void;
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
  templateFace: templateFaceProp,
  selectedDeviceId,
  onDeviceClick,
  onDevicePositionChange,
  onDeviceDrop,
  onEmptySlotDblClick,
  onShelfOpen,
}: RackViewProps) {
  const resolvedTemplateFace = templateFaceProp ?? 'front';
  const totalHeight = rack.uHeight * RACK_UNIT_HEIGHT;
  const rackBodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragMoved = useRef(false);
  const [dropTargetU, setDropTargetU] = useState<{ u: number; height: number; valid: boolean } | null>(null);

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

  // Build set of occupied U slots
  const occupiedUs = useMemo(() => {
    const occupied = new Set<number>();
    for (const { device, template } of positioned) {
      const uH = device.uHeight ?? template?.uHeight ?? 1;
      const startU = device.rackU!;
      for (let u = startU; u < startU + uH; u++) {
        occupied.add(u);
      }
    }
    return occupied;
  }, [positioned]);

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
      <div
        ref={rackBodyRef}
        className={styles.rackBody}
        style={{ width: RACK_WIDTH, height: totalHeight }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!rackBodyRef.current) return;
          const rect = rackBodyRef.current.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          const uHeight = Number(e.dataTransfer.types.includes('werkstack/device-uheight') ? 1 : 1);
          // We can't read data during dragover, so use a default of 1; actual check happens on drop
          const rawU = (totalHeight - offsetY) / RACK_UNIT_HEIGHT - uHeight + 1;
          const snappedU = Math.max(1, Math.min(rack.uHeight - uHeight + 1, Math.round(rawU)));
          const hasCollision = rackDevices.some(d => {
            if (!d.rackU || !d.uHeight) return false;
            const dTop = d.rackU;
            const dBottom = d.rackU + (d.uHeight ?? 1) - 1;
            return snappedU <= dBottom && snappedU + uHeight - 1 >= dTop;
          });
          setDropTargetU({ u: snappedU, height: uHeight, valid: !hasCollision });
        }}
        onDragLeave={(e) => {
          // Only clear if we're leaving the rackBody itself
          if (rackBodyRef.current && !rackBodyRef.current.contains(e.relatedTarget as Node)) {
            setDropTargetU(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropTargetU(null);
          const deviceId = e.dataTransfer.getData('werkstack/device-id');
          if (!deviceId || !onDeviceDrop || !rackBodyRef.current) return;
          const uHeight = Number(e.dataTransfer.getData('werkstack/device-uheight')) || 1;
          const rect = rackBodyRef.current.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          const rawU = (totalHeight - offsetY) / RACK_UNIT_HEIGHT - uHeight + 1;
          const snappedU = Math.max(1, Math.min(rack.uHeight - uHeight + 1, Math.round(rawU)));
          const hasCollision = rackDevices.some(d => {
            if (!d.rackU || !d.uHeight) return false;
            const dTop = d.rackU;
            const dBottom = d.rackU + (d.uHeight ?? 1) - 1;
            return snappedU <= dBottom && snappedU + uHeight - 1 >= dTop;
          });
          if (!hasCollision) onDeviceDrop(deviceId, snappedU);
        }}
      >
        {/* Drop indicator */}
        {dropTargetU && (
          <div
            className={styles.dropIndicator}
            style={{
              bottom: (dropTargetU.u - 1) * RACK_UNIT_HEIGHT,
              height: dropTargetU.height * RACK_UNIT_HEIGHT,
              borderColor: dropTargetU.valid ? '#3a8c4a' : '#8a2020',
              background: dropTargetU.valid ? 'rgba(58, 140, 74, 0.15)' : 'rgba(138, 32, 32, 0.15)',
            }}
          />
        )}

        {/* U-slot grid lines */}
        {uLabels.map(u => (
          <div
            key={`slot-${u}`}
            className={styles.uSlot}
            style={{ bottom: (u - 1) * RACK_UNIT_HEIGHT }}
            onDoubleClick={
              onEmptySlotDblClick && !occupiedUs.has(u)
                ? () => onEmptySlotDblClick(u)
                : undefined
            }
          />
        ))}

        {/* Devices */}
        {positioned.map(({ device, template, info, topPx, heightPx }) => {
          const isSelected = selectedDeviceId === device.id;
          const isDragging = drag?.deviceId === device.id;
          const displayTop = isDragging ? topPx + dragOffsetY : topPx;
          const deviceConnections = connections.filter(
            c => c.srcDeviceId === device.id || c.dstDeviceId === device.id,
          );
          const shelvedItems: ShelvedItem[] = devices
            .filter(d => d.shelfDeviceId === device.id)
            .flatMap(d => {
              const t = templates.find(t => t.id === d.templateId);
              return t ? [{ device: d, template: t }] : [];
            });

          const isShelf = template?.isShelf === true;

          return (
            <div
              key={device.id}
              className={`${styles.deviceSlot}${isSelected ? ` ${styles.deviceSlotSelected}` : ''}${isDragging ? ` ${styles.deviceDragging}` : ''}`}
              style={{ top: displayTop, height: heightPx }}
              onClick={() => { if (!dragMoved.current) onDeviceClick(device.id); }}
              onMouseDown={(e) => handleMouseDown(e, device.id, topPx, device.uHeight ?? template?.uHeight ?? 1)}
              onDoubleClick={isShelf && onShelfOpen ? (e) => { e.stopPropagation(); onShelfOpen(device.id); } : undefined}
              onContextMenu={isShelf && onShelfOpen ? (e) => { e.preventDefault(); onShelfOpen(device.id); } : undefined}
            >
              {isShelf ? (
                <ShelfBracket
                  device={device}
                  template={template!}
                  face={resolvedTemplateFace}
                  heightPx={heightPx}
                  childDevices={devices.filter(d => d.shelfDeviceId === device.id)}
                  templates={templates}
                  modules={modules}
                  pcieTemplates={pcieTemplates}
                  deviceConnections={deviceConnections}
                  shelvedItems={shelvedItems}
                  onDeviceClick={onDeviceClick}
                  onShelfOpen={onShelfOpen}
                />
              ) : template ? (
                <TemplatedDevice
                  template={template}
                  face={resolvedTemplateFace}
                  heightPx={heightPx}
                  modules={modules.filter(m => m.deviceId === device.id)}
                  pcieTemplates={pcieTemplates}
                  deviceConnections={deviceConnections}
                  shelvedItems={shelvedItems}
                />
              ) : (
                <SimpleDevice name={info.name} color={info.color} />
              )}
            </div>
          );
        })}

        {rackDevices.length === 0 && (
          <div className={styles.emptyRack}>empty rack — double-click a slot to deploy</div>
        )}
      </div>
    </div>
  );
}

interface PortVisuals {
  opacity: Record<string, number>;
  borderStyle: Record<string, string>;
}

function buildPortVisuals(
  blocks: PlacedBlock[],
  deviceConnections: Connection[],
): PortVisuals | undefined {
  if (deviceConnections.length === 0) return undefined;

  const connectedBlockIds = new Set<string>();
  for (const c of deviceConnections) {
    if (c.srcBlockId) connectedBlockIds.add(c.srcBlockId);
    if (c.dstBlockId) connectedBlockIds.add(c.dstBlockId);
  }

  const opacity: Record<string, number> = {};
  const borderStyle: Record<string, string> = {};

  for (const block of blocks) {
    const def = BLOCK_DEF_MAP.get(block.type);
    const isPortOrNet = def?.isPort || def?.isNet;
    if (isPortOrNet) {
      const connected = connectedBlockIds.has(block.id);
      opacity[block.id] = connected ? 1 : 0.2;
      if (!connected) borderStyle[block.id] = 'dashed';
    }
  }

  const hasEntries = Object.keys(opacity).length > 0;
  return hasEntries ? { opacity, borderStyle } : undefined;
}

function TemplatedDevice({
  template,
  face,
  heightPx,
  modules,
  pcieTemplates,
  deviceConnections,
  shelvedItems,
}: {
  template: DeviceTemplate;
  face: 'front' | 'rear';
  heightPx: number;
  modules: ModuleInstance[];
  pcieTemplates: PcieTemplate[];
  deviceConnections: Connection[];
  shelvedItems: ShelvedItem[];
}) {
  const { blocks, pcieBlockLabels } = useMemo(
    () => buildVirtualFaceplateWithMeta(template, face, modules, pcieTemplates, shelvedItems),
    [template, face, modules, pcieTemplates, shelvedItems],
  );

  const portVisuals = useMemo(
    () => buildPortVisuals(blocks, deviceConnections),
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
      blockOpacity={portVisuals?.opacity}
      blockBorderStyle={portVisuals?.borderStyle}
      blockBadge={Object.keys(pcieBlockLabels).length > 0 ? pcieBlockLabels : undefined}
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

function ShelfBracket({
  device,
  template,
  face,
  heightPx,
  childDevices,
  templates: allTemplates,
  modules,
  pcieTemplates,
  deviceConnections,
  shelvedItems,
  onDeviceClick,
  onShelfOpen,
}: {
  device: DeviceInstance;
  template: DeviceTemplate;
  face: 'front' | 'rear';
  heightPx: number;
  childDevices: DeviceInstance[];
  templates: DeviceTemplate[];
  modules: ModuleInstance[];
  pcieTemplates: PcieTemplate[];
  deviceConnections: Connection[];
  shelvedItems: ShelvedItem[];
  onDeviceClick: (deviceId: string) => void;
  onShelfOpen?: (shelfDeviceId: string) => void;
}) {
  // Shelf grid: 1:1 mapping between shelf grid cells and device grid cells
  const gridCols = template.gridCols ?? 96;
  const gridRows = template.uHeight * 12;
  const cellW = RACK_WIDTH / gridCols;
  const cellH = heightPx / gridRows;

  // Also render the shelf's own ports via TemplatedDevice (projected through)
  const { blocks, pcieBlockLabels } = useMemo(
    () => buildVirtualFaceplateWithMeta(template, face, modules.filter(m => m.deviceId === device.id), pcieTemplates, shelvedItems),
    [template, face, modules, device.id, pcieTemplates, shelvedItems],
  );

  const portVisuals = useMemo(
    () => buildPortVisuals(blocks, deviceConnections),
    [blocks, deviceConnections],
  );

  return (
    <div className={styles.shelfBracket} style={{ height: heightPx }}>
      {/* Shelf template overlay (background — shows shelf's own ports) */}
      <TemplateOverlay
        blocks={blocks}
        gridCols={gridCols}
        gridRows={gridRows}
        width={RACK_WIDTH}
        height={heightPx}
        blockOpacity={portVisuals?.opacity}
        blockBorderStyle={portVisuals?.borderStyle}
        blockBadge={Object.keys(pcieBlockLabels).length > 0 ? pcieBlockLabels : undefined}
        interactive
      />

      {/* Child devices positioned at shelfCol/shelfRow */}
      {childDevices.map(child => {
        if (child.shelfCol == null || child.shelfRow == null) return null;
        const childTpl = child.templateId
          ? allTemplates.find(t => t.id === child.templateId)
          : undefined;
        if (!childTpl) return null;

        const childCols = childTpl.gridCols ?? 96;
        const childRows = childTpl.uHeight * 12;
        const childBlocks = face === 'rear' ? childTpl.layout.rear : childTpl.layout.front;

        return (
          <div
            key={child.id}
            className={styles.shelfChild}
            style={{
              left: child.shelfCol * cellW,
              top: child.shelfRow * cellH,
              width: childCols * cellW,
              height: childRows * cellH,
            }}
            onClick={(e) => { e.stopPropagation(); onDeviceClick(child.id); }}
            onContextMenu={onShelfOpen ? (e) => { e.preventDefault(); e.stopPropagation(); onShelfOpen(device.id); } : undefined}
          >
            <TemplateOverlay
              blocks={childBlocks}
              gridCols={childCols}
              gridRows={childRows}
              width={childCols * cellW}
              height={childRows * cellH}
              interactive
            />
          </div>
        );
      })}
    </div>
  );
}
