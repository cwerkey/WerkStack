import type { PlacedBlock, DeviceTemplate, PcieTemplate, ModuleInstance } from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';

// buildVirtualFaceplate — merges PCIe card ports onto a device's rear panel.
// For each pcie-fh / pcie-lp slot that has a ModuleInstance installed,
// replace the slot block with the card template's rear ports, offset to the slot's position.

export function buildVirtualFaceplate(
  template: DeviceTemplate,
  face: 'front' | 'rear',
  modules: ModuleInstance[],
  pcieTemplates: PcieTemplate[],
): PlacedBlock[] {
  const baseBlocks = face === 'front' ? template.layout.front : template.layout.rear;

  if (face === 'front') return baseBlocks;

  // For rear face, expand PCIe slots that have cards installed
  const result: PlacedBlock[] = [];

  for (const block of baseBlocks) {
    const def = BLOCK_DEF_MAP.get(block.type);
    const isSlot = def?.isSlot && (block.type === 'pcie-fh' || block.type === 'pcie-lp');

    if (!isSlot) {
      result.push(block);
      continue;
    }

    // Check if a module is installed in this slot
    const mod = modules.find(m => m.slotBlockId === block.id);
    if (!mod) {
      // No card installed — keep the empty slot block
      result.push(block);
      continue;
    }

    // Find the PCIe card template
    const cardTpl = pcieTemplates.find(t => t.id === mod.cardTemplateId);
    if (!cardTpl) {
      result.push(block);
      continue;
    }

    // Replace slot with card's rear ports, offset to the slot position
    for (const cardBlock of cardTpl.layout.rear) {
      result.push({
        ...cardBlock,
        id: `${block.id}__${cardBlock.id}`, // unique composite ID
        col: block.col + cardBlock.col,
        row: block.row + cardBlock.row,
      });
    }
  }

  return result;
}
