import { useState, useRef, useEffect } from 'react';
import { BLOCK_DEFS } from '@werkstack/shared';
import type { BlockDef, PlacedBlock } from '@werkstack/shared';
import { getPresetsForType, Preset } from './presets';

interface BlockPaletteProps {
  activeTool:  BlockDef | null;
  onSelect:    (def: BlockDef) => void;
  panelFilter: 'front' | 'rear';
  gridCols:    number;
  gridRows:    number;
  onApplyPreset: (blocks: PlacedBlock[]) => void;
}

const CATEGORIES: { label: string; filter: (d: BlockDef) => boolean }[] = [
  { label: 'Network',    filter: d => d.isNet },
  { label: 'Peripheral', filter: d => d.isPort && !d.type.startsWith('misc-') },
  { label: 'Drive Bays', filter: d => d.isSlot && !d.type.startsWith('pcie-') },
  { label: 'PCIe',       filter: d => d.type.startsWith('pcie-') },
  { label: 'Power',      filter: d => d.type === 'power' },
  { label: 'Misc',       filter: d => d.type.startsWith('misc-') },
];

function panelAllows(def: BlockDef, panel: 'front' | 'rear'): boolean {
  return def.panel === 'all' || def.panel === panel;
}

interface PresetMenuState {
  x: number;
  y: number;
  blockType: string;
  presets: Preset[];
}

export function BlockPalette({ activeTool, onSelect, panelFilter, gridCols, gridRows, onApplyPreset }: BlockPaletteProps) {
  const [expandedCat, setExpandedCat] = useState<string | null>('Network');
  const [presetMenu, setPresetMenu] = useState<PresetMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close preset menu on click outside
  useEffect(() => {
    if (!presetMenu) return;
    const close = () => setPresetMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [presetMenu]);

  const handleBlockContextMenu = (e: React.MouseEvent, def: BlockDef) => {
    e.preventDefault();
    const presets = getPresetsForType(def.type, gridCols, gridRows);
    if (presets.length === 0) return;
    setPresetMenu({ x: e.clientX, y: e.clientY, blockType: def.type, presets });
  };

  const handlePresetSelect = (preset: Preset) => {
    const blocks = preset.generate(gridCols, gridRows);
    onApplyPreset(blocks);
    setPresetMenu(null);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      width: 180, flexShrink: 0,
      background: 'var(--cardBg, #141618)',
      border: '1px solid var(--border2, #262c30)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 10px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text3, #4e5560)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        borderBottom: '1px solid var(--border, #1d2022)',
      }}>
        Block Types
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {CATEGORIES.map(cat => {
          const items = BLOCK_DEFS.filter(d => cat.filter(d) && panelAllows(d, panelFilter));
          if (items.length === 0) return null;
          const isExpanded = expandedCat === cat.label;

          return (
            <div key={cat.label}>
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat.label)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '5px 10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  color: isExpanded ? 'var(--text, #d4d9dd)' : 'var(--text2, #8a9299)',
                  background: isExpanded ? 'var(--inputBg, #1a1d20)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{cat.label}</span>
                <span style={{ fontSize: 8 }}>{isExpanded ? '▼' : '▶'}</span>
              </button>
              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {items.map(def => {
                    const isActive = activeTool?.type === def.type;
                    const hasPresets = getPresetsForType(def.type, gridCols, gridRows).length > 0;
                    return (
                      <button
                        key={def.type}
                        onClick={() => onSelect(def)}
                        onContextMenu={e => handleBlockContextMenu(e, def)}
                        title={hasPresets ? 'Right-click for presets' : undefined}
                        style={{
                          width: '100%', textAlign: 'left',
                          padding: '4px 10px 4px 18px',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          color: isActive ? 'var(--accent, #c47c5a)' : 'var(--text2, #8a9299)',
                          background: isActive ? 'var(--accent-tint, #c47c5a22)' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{
                          width: 10, height: 10,
                          background: def.color,
                          border: `1px solid ${def.borderColor}`,
                          borderRadius: 2,
                          flexShrink: 0,
                        }} />
                        <span>{def.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--text3, #4e5560)' }}>
                          {def.w}×{def.h}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preset context menu */}
      {presetMenu && (
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: presetMenu.x,
            top: presetMenu.y,
            zIndex: 2000,
            minWidth: 200,
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: '6px 0',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--text, #d4d9dd)',
          }}
        >
          <div style={{
            padding: '4px 12px 6px',
            borderBottom: '1px solid var(--border, #1d2022)',
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--accent, #c47c5a)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            Quick Fill Presets
          </div>
          {presetMenu.presets.map((preset, i) => (
            <button
              key={i}
              onClick={() => handlePresetSelect(preset)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '5px 12px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: 'var(--text, #d4d9dd)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
