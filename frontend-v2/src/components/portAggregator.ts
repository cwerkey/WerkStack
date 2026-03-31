import type { PlacedBlock, DeviceTemplate, PcieTemplate, ModuleInstance, DeviceInstance } from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';

export interface ShelvedItem {
  device: DeviceInstance;
  template: DeviceTemplate;
}

export function buildVirtualFaceplate(
  template: DeviceTemplate,
  face: 'front' | 'rear',
  modules: ModuleInstance[],
  pcieTemplates: PcieTemplate[],
  shelvedItems?: ShelvedItem[],
): PlacedBlock[] {
  return buildVirtualFaceplateWithMeta(template, face, modules, pcieTemplates, shelvedItems).blocks;
}

export interface FaceplateWithMeta {
  blocks: PlacedBlock[];
  /** Maps composite blockId → badge label (PCIe card or shelved device name) */
  pcieBlockLabels: Record<string, string>;
}

export function buildVirtualFaceplateWithMeta(
  template: DeviceTemplate,
  face: 'front' | 'rear',
  modules: ModuleInstance[],
  pcieTemplates: PcieTemplate[],
  shelvedItems: ShelvedItem[] = [],
): FaceplateWithMeta {
  const baseBlocks = face === 'front' ? template.layout.front : template.layout.rear;
  const pcieBlockLabels: Record<string, string> = {};

  if (face === 'front') {
    // Shelved devices can still project ports on the front face
    const result = [...baseBlocks];
    for (const { device, template: shelfTpl } of shelvedItems) {
      const col = device.shelfCol ?? 0;
      const row = device.shelfRow ?? 0;
      const shelfBlocks = shelfTpl.layout.front;
      const label = `${shelfTpl.make} ${shelfTpl.model}`;
      for (const block of shelfBlocks) {
        const def = BLOCK_DEF_MAP.get(block.type);
        if (!def?.isPort && !def?.isNet) continue;
        const compositeId = `shelf__${device.id}__${block.id}`;
        result.push({ ...block, id: compositeId, col: col + block.col, row: row + block.row });
        pcieBlockLabels[compositeId] = label;
      }
    }
    return { blocks: result, pcieBlockLabels };
  }

  // Rear face: PCIe slot substitution + shelved device projection
  const result: PlacedBlock[] = [];

  for (const block of baseBlocks) {
    const def = BLOCK_DEF_MAP.get(block.type);
    const isSlot =
      def?.isSlot &&
      (block.type === 'pcie-fh' || block.type === 'pcie-lp' || block.type === 'pcie-dw');

    if (!isSlot) {
      result.push(block);
      continue;
    }

    const mod = modules.find(m => m.slotBlockId === block.id);
    if (!mod) {
      result.push(block);
      continue;
    }

    const cardTpl = pcieTemplates.find(t => t.id === mod.cardTemplateId);
    if (!cardTpl) {
      result.push(block);
      continue;
    }

    const cardLabel = `${cardTpl.make} ${cardTpl.model}`;
    for (const cardBlock of cardTpl.layout.rear) {
      const compositeId = `${block.id}__${cardBlock.id}`;
      result.push({
        ...cardBlock,
        id: compositeId,
        col: block.col + cardBlock.col,
        row: block.row + cardBlock.row,
      });
      pcieBlockLabels[compositeId] = cardLabel;
    }
  }

  // Append shelved device ports at their shelf offset
  for (const { device, template: shelfTpl } of shelvedItems) {
    const col = device.shelfCol ?? 0;
    const row = device.shelfRow ?? 0;
    const shelfBlocks = shelfTpl.layout.rear;
    const label = `${shelfTpl.make} ${shelfTpl.model}`;
    for (const block of shelfBlocks) {
      const def = BLOCK_DEF_MAP.get(block.type);
      if (!def?.isPort && !def?.isNet) continue;
      const compositeId = `shelf__${device.id}__${block.id}`;
      result.push({ ...block, id: compositeId, col: col + block.col, row: row + block.row });
      pcieBlockLabels[compositeId] = label;
    }
  }

  return { blocks: result, pcieBlockLabels };
}
