import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type {
  DeviceInstance,
  DeviceTemplate,
  ModuleInstance,
  PcieTemplate,
  PlacedBlock,
  SlotOverride,
  PcieBusSize,
  PcieSpeed,
} from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { BlockContextMenu } from '@/components/BlockContextMenu';
import type { ContextMenuItem } from '@/components/BlockContextMenu';
import { useInstallModule, useRemoveModule } from '@/api/modules';
import styles from './PcieTab.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PcieTabProps {
  device:         DeviceInstance;
  template?:      DeviceTemplate;
  modules:        ModuleInstance[];
  pcieTemplates:  PcieTemplate[];
  onUpdateDevice: (patch: Partial<DeviceInstance> & { id: string }) => void;
  siteId:         string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPcieSlot(block: PlacedBlock): boolean {
  return block.type === 'pcie-fh' || block.type === 'pcie-lp';
}

function getPcieSlotBlocks(template?: DeviceTemplate): PlacedBlock[] {
  if (!template) return [];
  return [
    ...(template.layout?.front ?? []),
    ...(template.layout?.rear ?? []),
  ].filter(isPcieSlot);
}

const LANE_ORDER: Record<string, number> = { x1: 1, x4: 4, x8: 8, x16: 16 };

function laneLeq(cardBus: PcieBusSize, slotLane: PcieBusSize): boolean {
  return (LANE_ORDER[cardBus] ?? 0) <= (LANE_ORDER[slotLane] ?? 0);
}

function cardFitsSlot(
  card: PcieTemplate,
  slotBlock: PlacedBlock,
  slotOverride: SlotOverride | undefined,
): boolean {
  // Height must match: fh/fh-dw → pcie-fh slot, lp/lp-dw → pcie-lp slot
  const cardHeight = card.formFactor.startsWith('fh') ? 'fh' : 'lp';
  const slotHeight = slotBlock.type === 'pcie-fh' ? 'fh' : 'lp';
  if (cardHeight !== slotHeight) return false;

  // Lane width: card bus ≤ slot lane width
  const slotLane = slotOverride?.laneWidth ?? 'x16';
  if (!laneLeq(card.busSize, slotLane)) return false;

  // Double-width cards only in double-width compatible slots
  const isDw = card.formFactor === 'fh-dw' || card.formFactor === 'lp-dw';
  if (isDw && !slotOverride?.doubleWidth) return false;

  return true;
}

// ─── Slot Config Form ─────────────────────────────────────────────────────────

interface SlotConfigFormProps {
  block: PlacedBlock;
  override: SlotOverride;
  allSlots: PlacedBlock[];
  onSave: (override: SlotOverride) => void;
  onCancel: () => void;
}

function SlotConfigForm({ block, override, allSlots, onSave, onCancel }: SlotConfigFormProps) {
  const [label, setLabel] = useState(override.label ?? '');
  const [laneWidth, setLaneWidth] = useState<PcieBusSize>(override.laneWidth ?? 'x16');
  const [speed, setSpeed] = useState<PcieSpeed>(override.speed ?? 'Gen4');
  const [doubleWidth, setDoubleWidth] = useState(override.doubleWidth ?? false);
  const [linkedSlotId, setLinkedSlotId] = useState(override.linkedSlotId ?? '');

  const otherSlots = allSlots.filter(s => s.id !== block.id && s.type === block.type);

  function handleSave() {
    const ov: SlotOverride = {};
    if (label.trim()) ov.label = label.trim();
    ov.laneWidth = laneWidth;
    ov.speed = speed;
    if (doubleWidth) {
      ov.doubleWidth = true;
      if (linkedSlotId) ov.linkedSlotId = linkedSlotId;
    }
    onSave(ov);
  }

  return (
    <div className={styles.editOverlay} onClick={onCancel}>
      <div className={styles.editForm} onClick={e => e.stopPropagation()}>
        <div className={styles.editFormTitle}>Configure PCIe Slot</div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Label</label>
          <input
            className={styles.input}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Slot 1"
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Lane Width</label>
            <select className={styles.select} value={laneWidth} onChange={e => setLaneWidth(e.target.value as PcieBusSize)}>
              <option value="x1">x1</option>
              <option value="x4">x4</option>
              <option value="x8">x8</option>
              <option value="x16">x16</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Speed</label>
            <select className={styles.select} value={speed} onChange={e => setSpeed(e.target.value as PcieSpeed)}>
              <option value="Gen3">Gen3</option>
              <option value="Gen4">Gen4</option>
              <option value="Gen5">Gen5</option>
            </select>
          </div>
        </div>

        <label className={styles.checkRow}>
          <input type="checkbox" checked={doubleWidth} onChange={e => setDoubleWidth(e.target.checked)} />
          Double-width compatible
        </label>

        {doubleWidth && otherSlots.length > 0 && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Link to Slot</label>
            <select className={styles.select} value={linkedSlotId} onChange={e => setLinkedSlotId(e.target.value)}>
              <option value="">None</option>
              {otherSlots.map(s => (
                <option key={s.id} value={s.id}>{s.label ?? `Slot (${s.type})`}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Card Modal ────────────────────────────────────────────────────────

interface AssignCardModalProps {
  slotBlock: PlacedBlock;
  slotOverride: SlotOverride | undefined;
  modules: ModuleInstance[];
  pcieTemplates: PcieTemplate[];
  onInstall: (cardTemplateId: string) => void;
  onClose: () => void;
}

function AssignCardModal({ slotBlock, slotOverride, modules, pcieTemplates, onInstall, onClose }: AssignCardModalProps) {
  const assignedTemplateIds = new Set(modules.map(m => m.cardTemplateId));

  const compatible = pcieTemplates.filter(t => cardFitsSlot(t, slotBlock, slotOverride));

  return (
    <div className={styles.assignOverlay} onClick={onClose}>
      <div className={styles.assignModal} onClick={e => e.stopPropagation()}>
        <div className={styles.assignTitle}>Assign PCIe Card</div>
        <div className={styles.assignSubtitle}>
          Slot: {slotBlock.label ?? slotBlock.type} &middot; {slotOverride?.laneWidth ?? 'x16'} &middot; {slotOverride?.speed ?? 'Gen4'}
          {slotOverride?.doubleWidth ? ' · DW' : ''}
        </div>

        {compatible.length === 0 ? (
          <div className={styles.emptyTemplates}>No compatible PCIe card templates available.</div>
        ) : (
          <div className={styles.templateList}>
            {compatible.map(t => (
              <div
                key={t.id}
                className={styles.templateItem}
                onClick={() => onInstall(t.id)}
              >
                <span className={styles.templateItemName}>
                  {t.manufacturer ? `${t.manufacturer} ` : ''}{t.make} {t.model}
                </span>
                <span className={styles.templateItemMeta}>
                  {t.busSize} · {t.formFactor}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.assignActions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── PcieTab ──────────────────────────────────────────────────────────────────

export function PcieTab({
  device,
  template,
  modules,
  pcieTemplates,
  onUpdateDevice,
  siteId,
}: PcieTabProps) {
  const slotBlocks = useMemo(() => getPcieSlotBlocks(template), [template]);
  const slotOverrides = device.slotOverrides ?? {};

  const installModule = useInstallModule(siteId, device.id);
  const removeModule = useRemoveModule(siteId, device.id);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ block: PlacedBlock; x: number; y: number } | null>(null);
  const [editingBlock, setEditingBlock] = useState<PlacedBlock | null>(null);
  const [assigningSlot, setAssigningSlot] = useState<PlacedBlock | null>(null);

  // Measure container width
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

  // Grid dimensions
  const gridCols = template?.gridCols ?? 96;
  const gridRows = (template?.uHeight ?? 1) * 12;
  const faceHeight = faceWidth > 0 ? (faceWidth / gridCols) * gridRows : 0;

  // Rear PCIe blocks only for faceplate
  const rearBlocks = useMemo(
    () => (template?.layout?.rear ?? []),
    [template],
  );

  // Block colors: PCIe slots highlighted, everything else dimmed
  const { blockColors, blockOpacity, blockLabels: overlayLabels } = useMemo(() => {
    const colors: Record<string, string> = {};
    const opacity: Record<string, number> = {};
    const labels: Record<string, string> = {};

    for (const block of rearBlocks) {
      if (isPcieSlot(block)) {
        const mod = modules.find(m => m.slotBlockId === block.id);
        if (mod) {
          const card = pcieTemplates.find(t => t.id === mod.cardTemplateId);
          colors[block.id] = '#4a8ac4';
          labels[block.id] = card ? `${card.make} ${card.model}` : 'Card';
        } else {
          colors[block.id] = '#3a4a54';
        }
        opacity[block.id] = 1;
      } else {
        colors[block.id] = '#1e2428';
        opacity[block.id] = 0.25;
      }
    }

    return { blockColors: colors, blockOpacity: opacity, blockLabels: labels };
  }, [rearBlocks, modules, pcieTemplates]);

  // Slot label overrides
  const slotLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const block of slotBlocks) {
      const ov = slotOverrides[block.id];
      if (ov?.label) labels[block.id] = ov.label;
    }
    return labels;
  }, [slotBlocks, slotOverrides]);

  // Context menu handler
  const handleContextMenu = useCallback((block: PlacedBlock, e: React.MouseEvent) => {
    if (!isPcieSlot(block)) return;
    setCtxMenu({ block, x: e.clientX, y: e.clientY });
  }, []);

  // Double-click handler — assign card
  const handleDoubleClick = useCallback((block: PlacedBlock) => {
    if (!isPcieSlot(block)) return;
    const mod = modules.find(m => m.slotBlockId === block.id);
    if (!mod) setAssigningSlot(block);
  }, [modules]);

  // Build context menu items
  const ctxItems: ContextMenuItem[] = useMemo(() => {
    if (!ctxMenu) return [];
    const mod = modules.find(m => m.slotBlockId === ctxMenu.block.id);
    const items: ContextMenuItem[] = [
      { label: 'Configure Slot', onClick: () => setEditingBlock(ctxMenu.block) },
    ];
    if (mod) {
      items.push({
        label: 'Remove Card',
        onClick: () => removeModule.mutate(mod.id),
        danger: true,
      });
    } else {
      items.push({
        label: 'Assign Card',
        onClick: () => setAssigningSlot(ctxMenu.block),
      });
    }
    return items;
  }, [ctxMenu, modules, removeModule]);

  // Slot config save
  function handleSlotSave(override: SlotOverride) {
    if (!editingBlock) return;
    const updated = { ...slotOverrides };
    if (Object.keys(override).length === 0) {
      delete updated[editingBlock.id];
    } else {
      updated[editingBlock.id] = override;
    }
    onUpdateDevice({ id: device.id, slotOverrides: updated });
    setEditingBlock(null);
  }

  // Install card
  function handleInstall(cardTemplateId: string) {
    if (!assigningSlot) return;
    installModule.mutate(
      { slotBlockId: assigningSlot.id, cardTemplateId },
      { onSuccess: () => setAssigningSlot(null) },
    );
  }

  if (!template || slotBlocks.length === 0) {
    return <div className={styles.emptySlots}>No PCIe slots on this device.</div>;
  }

  return (
    <div className={styles.tab}>
      {/* Visual faceplate — rear only, showing PCIe slots */}
      <div className={styles.facePanel}>
        <div className={styles.faceLabel}>Rear — PCIe Slots</div>
        <div className={styles.faceCanvas} ref={faceContainerRef}>
          {faceWidth > 0 && (
            <TemplateOverlay
              blocks={rearBlocks}
              gridCols={gridCols}
              gridRows={gridRows}
              width={faceWidth}
              height={faceHeight}
              interactive
              showLabels
              blockColors={blockColors}
              blockOpacity={blockOpacity}
              blockLabels={{ ...slotLabels, ...overlayLabels }}
              onBlockContextMenu={handleContextMenu}
              onBlockDoubleClick={handleDoubleClick}
            />
          )}
        </div>
      </div>

      {/* Slot list */}
      <div>
        <div className={styles.slotListHeader}>
          <span className={styles.slotListTitle}>
            {slotBlocks.length} PCIe slot{slotBlocks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {slotBlocks.map((block, idx) => {
          const ov = slotOverrides[block.id];
          const mod = modules.find(m => m.slotBlockId === block.id);
          const card = mod ? pcieTemplates.find(t => t.id === mod.cardTemplateId) : null;
          const label = ov?.label ?? block.label ?? `Slot ${idx + 1}`;
          const isOccupied = !!mod;

          // Check if this slot is occupied by a linked DW card
          const linkedBy = ov?.linkedSlotId
            ? modules.find(m => m.slotBlockId === ov.linkedSlotId)
            : null;
          const linkedCard = linkedBy
            ? pcieTemplates.find(t => t.id === linkedBy.cardTemplateId)
            : null;
          const isDwOccupied = linkedCard && (linkedCard.formFactor === 'fh-dw' || linkedCard.formFactor === 'lp-dw');

          return (
            <div
              key={block.id}
              className={isOccupied || isDwOccupied ? styles.slotRowOccupied : styles.slotRow}
              onContextMenu={e => { e.preventDefault(); handleContextMenu(block, e); }}
              onDoubleClick={() => handleDoubleClick(block)}
            >
              <span className={`${styles.slotIcon} ${isOccupied || isDwOccupied ? styles.slotIconOccupied : styles.slotIconEmpty}`} />
              <span className={styles.slotLabel}>{label}</span>

              {ov?.laneWidth && (
                <span className={`${styles.badge} ${styles.badgeLane}`}>{ov.laneWidth}</span>
              )}
              {ov?.speed && (
                <span className={`${styles.badge} ${styles.badgeSpeed}`}>{ov.speed}</span>
              )}
              {ov?.doubleWidth && (
                <span className={`${styles.badge} ${styles.badgeDw}`}>DW</span>
              )}
              {ov?.linkedSlotId && (
                <span className={styles.linkedIcon} title="Linked to adjacent slot">⟷</span>
              )}

              {isOccupied && card && (
                <span className={styles.slotCardName}>
                  {card.make} {card.model}
                </span>
              )}
              {isDwOccupied && linkedCard && !isOccupied && (
                <span className={styles.slotCardName}>
                  {linkedCard.make} {linkedCard.model} (DW)
                </span>
              )}
              {!isOccupied && !isDwOccupied && (
                <span style={{ fontSize: 10, color: '#5a6068' }}>Empty</span>
              )}

              {isOccupied && mod && (
                <button
                  className={styles.removeBtn}
                  onClick={e => { e.stopPropagation(); removeModule.mutate(mod.id); }}
                  title="Remove card"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <BlockContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Slot config form */}
      {editingBlock && (
        <SlotConfigForm
          block={editingBlock}
          override={slotOverrides[editingBlock.id] ?? {}}
          allSlots={slotBlocks}
          onSave={handleSlotSave}
          onCancel={() => setEditingBlock(null)}
        />
      )}

      {/* Assign card modal */}
      {assigningSlot && (
        <AssignCardModal
          slotBlock={assigningSlot}
          slotOverride={slotOverrides[assigningSlot.id]}
          modules={modules}
          pcieTemplates={pcieTemplates}
          onInstall={handleInstall}
          onClose={() => setAssigningSlot(null)}
        />
      )}
    </div>
  );
}
