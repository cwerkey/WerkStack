import { useState, useMemo, useEffect, useRef } from 'react';
import type {
  DeviceInstance,
  DeviceTemplate,
  ModuleInstance,
  PcieTemplate,
  Connection,
  PlacedBlock,
  CableType,
} from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { buildVirtualFaceplateWithMeta } from '@/components/portAggregator';
import styles from './PortsTab.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PortsTabProps {
  device:            DeviceInstance;
  template?:         DeviceTemplate;
  modules:           ModuleInstance[];
  pcieTemplates:     PcieTemplate[];
  connections:       Connection[];       // connections involving this device
  allDevices:        DeviceInstance[];   // to look up connected device names
  cableTypes:        CableType[];
  onAddConnection:   (block: PlacedBlock) => void;
  onEditConnection:  (conn: Connection) => void;
  onDeleteConnection:(connId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConnectionForBlock(
  block: PlacedBlock,
  deviceId: string,
  connections: Connection[],
): Connection | undefined {
  return connections.find(
    c =>
      (c.srcDeviceId === deviceId && c.srcBlockId === block.id) ||
      (c.dstDeviceId === deviceId && c.dstBlockId === block.id),
  );
}

function getPeerName(
  conn: Connection,
  deviceId: string,
  allDevices: DeviceInstance[],
): string {
  if (conn.externalLabel) return conn.externalLabel;
  const peerId =
    conn.srcDeviceId === deviceId ? conn.dstDeviceId : conn.srcDeviceId;
  return allDevices.find(d => d.id === peerId)?.name ?? 'Unknown';
}

function isPortBlock(block: PlacedBlock): boolean {
  const def = BLOCK_DEF_MAP.get(block.type);
  return !!(def?.isPort || def?.isNet);
}

function shortLabel(block: PlacedBlock): string {
  const def = BLOCK_DEF_MAP.get(block.type);
  return def?.label ?? block.type;
}

// ─── Port row ─────────────────────────────────────────────────────────────────

interface PortRowProps {
  block:              PlacedBlock;
  deviceId:           string;
  connections:        Connection[];
  allDevices:         DeviceInstance[];
  selected:           boolean;
  onMouseEnter:       (id: string) => void;
  onMouseLeave:       () => void;
  onAddConnection:    (block: PlacedBlock) => void;
  onEditConnection:   (conn: Connection) => void;
  onDeleteConnection: (connId: string) => void;
}

function PortRow({
  block,
  deviceId,
  connections,
  allDevices,
  onMouseEnter,
  onMouseLeave,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
}: PortRowProps) {
  const conn = getConnectionForBlock(block, deviceId, connections);
  const connected = !!conn;
  const peerName = conn ? getPeerName(conn, deviceId, allDevices) : null;
  const portDisplayLabel = block.label || block.id;

  function handleRowClick() {
    if (conn) {
      onEditConnection(conn);
    } else {
      onAddConnection(block);
    }
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (conn) onDeleteConnection(conn.id);
  }

  function handleAddClick(e: React.MouseEvent) {
    e.stopPropagation();
    onAddConnection(block);
  }

  return (
    <div
      className={connected ? styles.portRowConnected : styles.portRow}
      onClick={handleRowClick}
      onMouseEnter={() => onMouseEnter(block.id)}
      onMouseLeave={onMouseLeave}
      title={connected ? `Edit connection to ${peerName}` : 'Add connection'}
    >
      <span
        className={`${styles.statusDot} ${
          connected ? styles.statusDotConnected : styles.statusDotOpen
        }`}
      />
      <span className={styles.portType}>{shortLabel(block)}</span>
      <span className={styles.portLabel}>{portDisplayLabel}</span>
      {peerName && <span className={styles.portPeer}>{peerName}</span>}
      {connected ? (
        <button
          className={styles.portActionDelete}
          onClick={handleDeleteClick}
          title="Remove connection"
        >
          ×
        </button>
      ) : (
        <button
          className={styles.portAction}
          onClick={handleAddClick}
          title="Add connection"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Collapsible PCIe group ───────────────────────────────────────────────────

interface PcieGroupProps {
  cardName:           string;
  blocks:             PlacedBlock[];
  deviceId:           string;
  connections:        Connection[];
  allDevices:         DeviceInstance[];
  selectedPortId:     string | null;
  onMouseEnter:       (id: string) => void;
  onMouseLeave:       () => void;
  onAddConnection:    (block: PlacedBlock) => void;
  onEditConnection:   (conn: Connection) => void;
  onDeleteConnection: (connId: string) => void;
}

function PcieGroup({
  cardName,
  blocks,
  deviceId,
  connections,
  allDevices,
  selectedPortId,
  onMouseEnter,
  onMouseLeave,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
}: PcieGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.portSection}>
      <div
        className={styles.sectionHeaderCollapsible}
        onClick={() => setCollapsed(c => !c)}
      >
        <span className={styles.collapseIcon}>{collapsed ? '▸' : '▾'}</span>
        {cardName}
      </div>
      {!collapsed &&
        blocks.map(block => (
          <PortRow
            key={block.id}
            block={block}
            deviceId={deviceId}
            connections={connections}
            allDevices={allDevices}
            selected={selectedPortId === block.id}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onAddConnection={onAddConnection}
            onEditConnection={onEditConnection}
            onDeleteConnection={onDeleteConnection}
          />
        ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PortsTab({
  device,
  template,
  modules,
  pcieTemplates,
  connections,
  allDevices,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
}: PortsTabProps) {
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);

  // ── Measure container width for responsive faceplate ───────────────────────

  const faceContainerRef = useRef<HTMLDivElement>(null);
  const [faceWidth, setFaceWidth] = useState(0);

  useEffect(() => {
    const el = faceContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setFaceWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Build faceplate data ────────────────────────────────────────────────────

  const frontMeta = useMemo(() => {
    if (!template) return null;
    return buildVirtualFaceplateWithMeta(template, 'front', modules, pcieTemplates);
  }, [template, modules, pcieTemplates]);

  const rearMeta = useMemo(() => {
    if (!template) return null;
    return buildVirtualFaceplateWithMeta(template, 'rear', modules, pcieTemplates);
  }, [template, modules, pcieTemplates]);

  // ── Compute face dimensions ─────────────────────────────────────────────────

  const gridCols = template?.gridCols ?? 96;
  const gridRows = (template?.uHeight ?? 1) * 12;
  const faceHeight = faceWidth > 0 ? (faceWidth / gridCols) * gridRows : 0;

  // ── blockColors for TemplateOverlay highlights ──────────────────────────────

  const { blockColors, blockOpacity } = useMemo(() => {
    const colors: Record<string, string> = {};
    const opacity: Record<string, number> = {};

    const allFaceBlocks = [
      ...(frontMeta?.blocks ?? []),
      ...(rearMeta?.blocks ?? []),
    ];

    for (const block of allFaceBlocks) {
      const def = BLOCK_DEF_MAP.get(block.type);
      const isPort = !!(def?.isPort || def?.isNet);
      if (isPort) {
        const conn = getConnectionForBlock(block, device.id, connections);
        colors[block.id] = conn ? '#c47c5a' : '#3a4a54';
        opacity[block.id] = 1;
      } else {
        colors[block.id] = '#1e2428';
        opacity[block.id] = 0.4;
      }
    }

    if (selectedPortId) {
      colors[selectedPortId] = '#e09070';
      opacity[selectedPortId] = 1;
    }

    return { blockColors: colors, blockOpacity: opacity };
  }, [frontMeta, rearMeta, device.id, connections, selectedPortId]);

  // ── Derive port lists ───────────────────────────────────────────────────────

  const frontPortBlocks = useMemo(
    () => (frontMeta?.blocks ?? []).filter(isPortBlock),
    [frontMeta],
  );

  const rearPortBlocks = useMemo(
    () => (rearMeta?.blocks ?? []).filter(isPortBlock),
    [rearMeta],
  );

  const pcieBlockLabels = rearMeta?.pcieBlockLabels ?? {};

  // Rear blocks that belong to a PCIe card
  const rearBaseBlocks = useMemo(
    () => rearPortBlocks.filter(b => !pcieBlockLabels[b.id]),
    [rearPortBlocks, pcieBlockLabels],
  );

  // Group rear PCIe port blocks by card name
  const pcieGroups = useMemo(() => {
    const groups: Record<string, PlacedBlock[]> = {};
    for (const block of rearPortBlocks) {
      const cardName = pcieBlockLabels[block.id];
      if (!cardName) continue;
      if (!groups[cardName]) groups[cardName] = [];
      groups[cardName].push(block);
    }
    return groups;
  }, [rearPortBlocks, pcieBlockLabels]);

  const totalPorts =
    frontPortBlocks.length + rearPortBlocks.length;

  // ── Row callbacks ───────────────────────────────────────────────────────────

  function handleMouseEnter(id: string) {
    setSelectedPortId(id);
  }

  function handleMouseLeave() {
    setSelectedPortId(null);
  }

  const rowProps = {
    deviceId:           device.id,
    connections,
    allDevices,
    selectedPortId,
    onMouseEnter:       handleMouseEnter,
    onMouseLeave:       handleMouseLeave,
    onAddConnection,
    onEditConnection,
    onDeleteConnection,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>

      {/* Device Face */}
      <div ref={faceContainerRef} className={styles.faceRow}>
        {template && frontMeta && rearMeta && faceWidth > 0 && (
          <>
            <div className={styles.facePanel}>
              <span className={styles.faceLabel}>Front</span>
              <div className={styles.faceCanvas} style={{ width: faceWidth, height: faceHeight }}>
                <TemplateOverlay
                  blocks={frontMeta.blocks}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  width={faceWidth}
                  height={faceHeight}
                  selectedId={selectedPortId}
                  blockColors={blockColors}
                  blockOpacity={blockOpacity}
                  showLabels={false}
                  interactive={false}
                />
              </div>
            </div>

            <div className={styles.facePanel}>
              <span className={styles.faceLabel}>Rear</span>
              <div className={styles.faceCanvas} style={{ width: faceWidth, height: faceHeight }}>
                <TemplateOverlay
                  blocks={rearMeta.blocks}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  width={faceWidth}
                  height={faceHeight}
                  selectedId={selectedPortId}
                  blockColors={blockColors}
                  blockOpacity={blockOpacity}
                  showLabels={false}
                  interactive={false}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Port List */}
      <div className={styles.portListHeader}>
        <span className={styles.portListTitle}>
          {totalPorts} port{totalPorts !== 1 ? 's' : ''}
        </span>
        <button
          className={styles.addBtn}
          onClick={() => {
            const firstFree =
              frontPortBlocks.find(
                b => !getConnectionForBlock(b, device.id, connections),
              ) ??
              rearPortBlocks.find(
                b => !getConnectionForBlock(b, device.id, connections),
              );
            if (firstFree) onAddConnection(firstFree);
          }}
        >
          + Add Connection
        </button>
      </div>

      {totalPorts === 0 && (
        <p className={styles.emptyPorts}>No ports defined on this template.</p>
      )}

      {/* Front face ports */}
      {frontPortBlocks.length > 0 && (
        <div className={styles.portSection}>
          <div className={styles.sectionHeader}>Front</div>
          {frontPortBlocks.map(block => (
            <PortRow
              key={block.id}
              block={block}
              selected={selectedPortId === block.id}
              {...rowProps}
            />
          ))}
        </div>
      )}

      {/* Rear base ports (not part of any PCIe card) */}
      {rearBaseBlocks.length > 0 && (
        <div className={styles.portSection}>
          <div className={styles.sectionHeader}>Rear</div>
          {rearBaseBlocks.map(block => (
            <PortRow
              key={block.id}
              block={block}
              selected={selectedPortId === block.id}
              {...rowProps}
            />
          ))}
        </div>
      )}

      {/* PCIe card groups */}
      {Object.entries(pcieGroups).map(([cardName, cardBlocks]) => (
        <PcieGroup
          key={cardName}
          cardName={cardName}
          blocks={cardBlocks}
          {...rowProps}
        />
      ))}
    </div>
  );
}
