import type { PlacedBlock, DeviceTemplate, PcieTemplate, ModuleInstance } from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';

export function buildVirtualFaceplate(
  template: DeviceTemplate,
  face: 'front' | 'rear',
  modules: ModuleInstance[],
  pcieTemplates: PcieTemplate[],
): PlacedBlock[] {
  const baseBlocks = face === 'front' ? template.layout.front : template.layout.rear;
  if (face === 'front') return baseBlocks;

  const result: PlacedBlock[] = [];
  for (const block of baseBlocks) {
    const def = BLOCK_DEF_MAP.get(block.type);
    const isSlot = def?.isSlot && (block.type === 'pcie-fh' || block.type === 'pcie-lp' || block.type === 'pcie-dw');
    if (!isSlot) { result.push(block); continue; }
    const mod = modules.find(m => m.slotBlockId === block.id);
    if (!mod) { result.push(block); continue; }
    const cardTpl = pcieTemplates.find(t => t.id === mod.cardTemplateId);
    if (!cardTpl) { result.push(block); continue; }
    for (const cardBlock of cardTpl.layout.rear) {
      result.push({
        ...cardBlock,
        id: `${block.id}__${cardBlock.id}`,
        col: block.col + cardBlock.col,
        row: block.row + cardBlock.row,
      });
    }
  }
  return result;
}
