import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlacedBlock, DeviceTemplate, BlockDef } from '@werkstack/shared';
import { BLOCK_DEFS, BLOCK_DEF_MAP } from '@werkstack/shared';
import { api } from '@/utils/api';
import { uid } from '@/utils/uid';

// ── Constants ──────────────────────────────────────────────────────────────────

const EDITOR_W = 700;
const GRID_COLS = 96;
const MAX_EDITOR_H = 460;
const CATEGORIES = ['switch', 'server', 'nas', 'router', 'firewall', 'kvm-switch',
  'patch-panel', 'pdu', 'ups', 'shelf', 'other'];

type FormFactor = 'rack' | 'desktop' | 'wall-mount';

const PALETTE_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Network', types: ['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28'] },
  { label: 'I/O Ports', types: ['usb-a', 'usb-c', 'serial', 'hdmi', 'displayport', 'vga', 'ipmi', 'misc-port'] },
  { label: 'Storage', types: ['bay-3.5', 'bay-2.5', 'bay-2.5v', 'bay-m2', 'bay-u2', 'bay-flash', 'bay-sd'] },
  { label: 'Power & PCIe', types: ['power', 'pcie-fh', 'pcie-lp'] },
  { label: 'Misc', types: ['misc-small', 'misc-med', 'misc-large'] },
];

// ── Shared Styles ──────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, color: '#d4d9dd',
  background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
  width: '100%', boxSizing: 'border-box', fontFamily: 'Inter,system-ui,sans-serif',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: '#8a9299', fontFamily: 'Inter,system-ui,sans-serif', marginBottom: 4, display: 'block',
};
const BTN_PRI: React.CSSProperties = {
  background: '#c47c5a', color: '#fff', border: 'none', borderRadius: 4,
  padding: '7px 18px', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif',
};
const BTN_SEC: React.CSSProperties = {
  background: '#1a1e22', border: '1px solid #2a3038', color: '#d4d9dd',
  borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
};

// ── Step dot ──────────────────────────────────────────────────────────────────

function Dot({ num, label, state }: { num: number; label: string; state: 'active' | 'done' | 'pending' }) {
  const bg = state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#3a4248';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: state === 'pending' ? '#8a9299' : '#fff', fontFamily: 'Inter,system-ui,sans-serif' }}>
        {state === 'done' ? '✓' : num}
      </div>
      <span style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#5a6068' }}>{label}</span>
    </div>
  );
}

// ── Block palette item ─────────────────────────────────────────────────────────

function PaletteItem({ def, active, onClick }: { def: BlockDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`${def.label} (${def.w}×${def.h})${def.canRotate ? ' — R to rotate' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', padding: '4px 8px', textAlign: 'left',
        background: active ? '#c47c5a20' : 'transparent',
        border: `1px solid ${active ? '#c47c5a' : 'transparent'}`,
        borderRadius: 3, cursor: 'pointer', marginBottom: 2,
      }}
    >
      <div style={{
        width: 12, height: 12, flexShrink: 0, borderRadius: 2,
        background: def.color, border: `1px solid ${def.borderColor}`,
      }} />
      <span style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#d4d9dd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
        {def.label}
      </span>
      {def.canRotate && active && (
        <span style={{ fontSize: 8, color: '#5a6068', fontFamily: 'Inter,system-ui,sans-serif', flexShrink: 0 }}>R</span>
      )}
    </button>
  );
}

// ── Grid editor ───────────────────────────────────────────────────────────────
// NOTE: GridEditor intentionally duplicates some rendering math from
// TemplateOverlay. TemplateOverlay is read-only (presentation); GridEditor adds
// click-to-place, hover preview, collision detection, and block deletion.

export interface GridEditorProps {
  blocks: PlacedBlock[];
  gridCols: number;
  gridRows: number;
  pendingType: string | null;
  pendingRotated: boolean;
  selectedId: string | null;
  onPlace: (col: number, row: number) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export function GridEditor({ blocks, gridCols, gridRows, pendingType, pendingRotated, selectedId, onPlace, onSelect, onDelete }: GridEditorProps) {
  const cellW = EDITOR_W / gridCols;
  const cellH = cellW; // square cells
  const gridH = Math.min(gridRows * cellH, MAX_EDITOR_H);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);

  const pendingDef = pendingType ? BLOCK_DEF_MAP.get(pendingType) : null;
  // Effective dimensions of pending block (account for rotation)
  const pendW = pendingDef ? (pendingRotated && pendingDef.canRotate ? pendingDef.h : pendingDef.w) : 1;
  const pendH = pendingDef ? (pendingRotated && pendingDef.canRotate ? pendingDef.w : pendingDef.h) : 1;

  const toCell = useCallback((e: React.MouseEvent): { col: number; row: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTop;
    const col = Math.max(0, Math.min(gridCols - pendW, Math.floor(x / cellW)));
    const row = Math.max(0, Math.min(gridRows - pendH, Math.floor(y / cellH)));
    return { col, row };
  }, [cellW, cellH, gridCols, gridRows, pendW, pendH]);

  // For Ctrl+Click — find block at pixel position (no pending-size clamping)
  const blockAtPixel = useCallback((e: React.MouseEvent): PlacedBlock | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTop;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    // Find block that contains this cell (check in reverse for z-order)
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const def = BLOCK_DEF_MAP.get(b.type);
      if (!def) continue;
      const bw = b.rotated ? def.h : def.w;
      const bh = b.rotated ? def.w : def.h;
      if (col >= b.col && col < b.col + bw && row >= b.row && row < b.row + bh) {
        return b;
      }
    }
    return null;
  }, [cellW, cellH, blocks]);

  function handleMouseMove(e: React.MouseEvent) {
    if (!pendingDef) { setHover(null); return; }
    setHover(toCell(e));
  }

  function handleMouseLeave() { setHover(null); }

  function handleClick(e: React.MouseEvent) {
    // Ctrl+Click (or Cmd+Click on Mac) = instant delete
    if (e.ctrlKey || e.metaKey) {
      const hit = blockAtPixel(e);
      if (hit) { onDelete(hit.id); }
      return;
    }
    if (!pendingDef) return;
    const { col, row } = toCell(e);
    onPlace(col, row);
  }

  // Grid line arrays
  const minorLines: number[] = [];
  for (let c = 1; c < gridCols; c++) minorLines.push(c * cellW);
  const minorHLines: number[] = [];
  for (let r = 1; r < gridRows; r++) minorHLines.push(r * cellH);

  // Major lines every 12 rows (U boundaries) and every 12 cols
  const majorHLines: number[] = [];
  for (let u = 1; u * 12 < gridRows; u++) majorHLines.push(u * 12 * cellH);
  const majorVLines: number[] = [];
  for (let c = 12; c < gridCols; c += 12) majorVLines.push(c * cellW);

  return (
    <div
      ref={scrollRef}
      style={{
        width: EDITOR_W, height: gridH, overflowY: 'auto',
        background: '#0c0e12', border: '1px solid #2a3038', borderRadius: 4,
        position: 'relative', cursor: pendingDef ? 'crosshair' : 'default',
        flexShrink: 0,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Full-height inner container */}
      <div style={{ width: EDITOR_W, height: gridRows * cellH, position: 'relative' }}>

        {/* SVG gridlines */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Minor vertical gridlines */}
          {minorLines.map((x, i) => (
            <line key={`v${i}`} x1={x} y1={0} x2={x} y2={gridRows * cellH}
              stroke="#1a1e24" strokeWidth={0.5} />
          ))}
          {/* Minor horizontal gridlines */}
          {minorHLines.map((y, i) => (
            <line key={`h${i}`} x1={0} y1={y} x2={EDITOR_W} y2={y}
              stroke="#1a1e24" strokeWidth={0.5} />
          ))}
          {/* Major vertical gridlines (every 12 cols) */}
          {majorVLines.map((x, i) => (
            <line key={`mv${i}`} x1={x} y1={0} x2={x} y2={gridRows * cellH}
              stroke="#2a3038" strokeWidth={1} />
          ))}
          {/* Major horizontal gridlines (U boundaries every 12 rows) */}
          {majorHLines.map((y, i) => (
            <line key={`mh${i}`} x1={0} y1={y} x2={EDITOR_W} y2={y}
              stroke="#2a3038" strokeWidth={1} />
          ))}
        </svg>

        {/* Placed blocks */}
        {blocks.map(b => {
          const def = BLOCK_DEF_MAP.get(b.type);
          if (!def) return null;
          const bw = b.rotated ? def.h : def.w;
          const bh = b.rotated ? def.w : def.h;
          const isSelected = selectedId === b.id;
          return (
            <div
              key={b.id}
              onClick={(e) => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) { onDelete(b.id); return; } onSelect(isSelected ? null : b.id); }}
              style={{
                position: 'absolute',
                left: b.col * cellW, top: b.row * cellH,
                width: bw * cellW, height: bh * cellH,
                background: def.color,
                border: `1px solid ${isSelected ? '#c47c5a' : def.borderColor}`,
                boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: Math.max(7, Math.min(10, cellW * 1.2)),
                fontFamily: 'Inter,system-ui,sans-serif',
                color: '#d4d9dd',
                overflow: 'hidden',
                cursor: 'pointer',
                zIndex: isSelected ? 3 : 1,
                outline: isSelected ? '2px solid #c47c5a' : 'none',
                outlineOffset: -1,
                borderRadius: 1,
              }}
            >
              <span style={{ opacity: 0.8, fontSize: Math.max(6, cellW * 0.9), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 2px' }}>
                {b.label ?? def.label}
              </span>
              {isSelected && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                  style={{
                    position: 'absolute', top: 1, right: 1,
                    width: 14, height: 14, borderRadius: 2,
                    background: '#8a2020', border: 'none', color: '#fff',
                    fontSize: 10, lineHeight: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 4, padding: 0,
                  }}
                  title="Delete block"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Hover preview */}
        {pendingDef && hover && (
          <div style={{
            position: 'absolute',
            left: hover.col * cellW, top: hover.row * cellH,
            width: pendW * cellW, height: pendH * cellH,
            background: pendingDef.color,
            border: `1px dashed ${pendingDef.borderColor}`,
            boxSizing: 'border-box',
            opacity: 0.55,
            pointerEvents: 'none',
            zIndex: 5,
            borderRadius: 1,
          }} />
        )}
      </div>
    </div>
  );
}

// ── TemplateWizard ─────────────────────────────────────────────────────────────

interface TemplateWizardProps {
  open: boolean;
  initialTemplate?: DeviceTemplate;
  onComplete: (template: DeviceTemplate) => void;
  onClose: () => void;
}

export function TemplateWizard({ open, initialTemplate, onComplete, onClose }: TemplateWizardProps) {
  const qc = useQueryClient();
  const isEdit = !!initialTemplate;

  // Step 1 — Info
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [category, setCategory] = useState('switch');
  const [uHeight, setUHeight] = useState(1);
  const [formFactor, setFormFactor] = useState<FormFactor>('rack');

  // Step 2 & 3 — Layout
  const [frontBlocks, setFrontBlocks] = useState<PlacedBlock[]>([]);
  const [rearBlocks, setRearBlocks] = useState<PlacedBlock[]>([]);

  // Editor state
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingRotated, setPendingRotated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Wizard
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Usage warning
  const [usageCount, setUsageCount] = useState<number | null>(null);

  // Reset on open / populate for edit
  useEffect(() => {
    if (!open) return;
    if (initialTemplate) {
      setMake(initialTemplate.make);
      setModel(initialTemplate.model);
      setManufacturer(initialTemplate.manufacturer ?? '');
      setCategory(initialTemplate.category);
      setUHeight(initialTemplate.uHeight);
      setFormFactor(initialTemplate.formFactor);
      setFrontBlocks(initialTemplate.layout?.front ?? []);
      setRearBlocks(initialTemplate.layout?.rear ?? []);
      // Fetch usage count
      api.get<{ count: number }>(`/api/templates/devices/${initialTemplate.id}/usage`)
        .then(r => setUsageCount(r.count))
        .catch(() => setUsageCount(null));
    } else {
      setMake(''); setModel(''); setManufacturer('');
      setCategory('switch'); setUHeight(1); setFormFactor('rack');
      setFrontBlocks([]); setRearBlocks([]);
      setUsageCount(null);
    }
    setPendingType(null); setPendingRotated(false); setSelectedId(null);
    setStep(1); setError(null);
  }, [open, initialTemplate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && pendingType) { setPendingType(null); setPendingRotated(false); return; }
      // R key toggles rotation for pending block
      if (e.key === 'r' || e.key === 'R') {
        if (pendingType) {
          const def = BLOCK_DEF_MAP.get(pendingType);
          if (def?.canRotate) setPendingRotated(prev => !prev);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !pendingType) {
        const face = step === 2 ? 'front' : 'rear';
        if (face === 'front') setFrontBlocks(prev => prev.filter(b => b.id !== selectedId));
        else setRearBlocks(prev => prev.filter(b => b.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, pendingType, selectedId, step]);

  if (!open) return null;

  const gridCols = GRID_COLS;
  const gridRows = uHeight * 12;

  // Filter palette by face
  const paletteGroups = PALETTE_GROUPS.map(group => ({
    ...group,
    defs: group.types
      .map(t => BLOCK_DEF_MAP.get(t))
      .filter((d): d is BlockDef => !!d && (step === 2 ? d.panel !== 'rear' : true)),
  })).filter(g => g.defs.length > 0);

  function handlePaletteClick(type: string) {
    if (pendingType === type) {
      setPendingType(null);
      setPendingRotated(false);
    } else {
      setPendingType(type);
      setPendingRotated(false);
    }
    setSelectedId(null);
  }

  function hasCollision(blocks: PlacedBlock[], col: number, row: number, w: number, h: number): boolean {
    return blocks.some(b => {
      const bd = BLOCK_DEF_MAP.get(b.type);
      if (!bd) return false;
      const bw = b.rotated ? bd.h : bd.w;
      const bh = b.rotated ? bd.w : bd.h;
      return !(col + w <= b.col || col >= b.col + bw || row + h <= b.row || row >= b.row + bh);
    });
  }

  function handlePlace(col: number, row: number) {
    if (!pendingType) return;
    const def = BLOCK_DEF_MAP.get(pendingType);
    if (!def) return;
    const rotated = pendingRotated && def.canRotate;
    const w = rotated ? def.h : def.w;
    const h = rotated ? def.w : def.h;
    const setter = step === 2 ? setFrontBlocks : setRearBlocks;
    const current = step === 2 ? frontBlocks : rearBlocks;
    if (hasCollision(current, col, row, w, h)) return;
    const block: PlacedBlock = { id: uid(), type: pendingType as PlacedBlock['type'], col, row, w: def.w, h: def.h, rotated: rotated || undefined };
    setter(prev => [...prev, block]);
  }

  function handleDelete(id: string) {
    if (step === 2) setFrontBlocks(prev => prev.filter(b => b.id !== id));
    else setRearBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedId(null);
  }

  async function handleFinish() {
    setSubmitting(true);
    setError(null);
    const payload = {
      make: make.trim(),
      model: model.trim(),
      manufacturer: manufacturer.trim() || undefined,
      category: category.trim(),
      formFactor,
      uHeight,
      gridCols: GRID_COLS,
      layout: { front: frontBlocks, rear: rearBlocks },
    };
    try {
      let template: DeviceTemplate;
      if (isEdit) {
        template = await api.patch<DeviceTemplate>(`/api/templates/devices/${initialTemplate!.id}`, payload);
      } else {
        template = await api.post<DeviceTemplate>('/api/templates/devices', payload);
      }
      await qc.invalidateQueries({ queryKey: ['templates', 'devices'] });
      onComplete(template);
    } catch (e) {
      setError((e as Error).message ?? `Failed to ${isEdit ? 'update' : 'create'} template`);
    } finally {
      setSubmitting(false);
    }
  }

  const dotState = (n: number): 'active' | 'done' | 'pending' =>
    n < step ? 'done' : n === step ? 'active' : 'pending';

  const isEditor = step === 2 || step === 3;
  const currentBlocks = step === 2 ? frontBlocks : rearBlocks;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1010,
    }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1e22', border: '1px solid #2a3038', borderRadius: 8,
          width: isEditor ? 960 : 580, maxWidth: '96vw',
          maxHeight: '92vh', overflowY: 'auto',
          padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 13, fontWeight: 600, color: '#d4d9dd' }}>
            {isEdit ? 'Edit' : 'New'} Device Template
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
        </div>

        {/* Usage warning */}
        {isEdit && usageCount !== null && usageCount > 0 && (
          <div style={{
            background: '#2a1e0e', border: '1px solid #8a6a20', borderRadius: 4,
            padding: '8px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#e8b840',
          }}>
            This template is used by {usageCount} device{usageCount !== 1 ? 's' : ''}. Changing the layout may affect existing port mappings and visual layouts.
          </div>
        )}

        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Dot num={1} label="Info"   state={dotState(1)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <Dot num={2} label="Front"  state={dotState(2)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <Dot num={3} label="Rear"   state={dotState(3)} />
          <div style={{ flex: 1, height: 1, background: '#2a3038', marginTop: 12 }} />
          <Dot num={4} label="Review" state={dotState(4)} />
        </div>

        {/* ── Step 1: Info ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 16, fontWeight: 600, color: '#d4d9dd' }}>
                Basic information
              </h3>
              <p style={{ margin: 0, fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299' }}>
                You'll add port and bay layout in the next steps.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Make <span style={{ color: '#c47c5a' }}>*</span></label>
                <input style={INPUT} placeholder="e.g. Cisco" value={make} onChange={e => setMake(e.target.value)} autoFocus />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Model <span style={{ color: '#c47c5a' }}>*</span></label>
                <input style={INPUT} placeholder="e.g. Catalyst 9300" value={model} onChange={e => setModel(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Manufacturer (optional)</label>
                <input style={INPUT} placeholder="e.g. Cisco Systems" value={manufacturer} onChange={e => setManufacturer(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Category <span style={{ color: '#c47c5a' }}>*</span></label>
                <input style={INPUT} list="twiz-cat" placeholder="e.g. switch" value={category} onChange={e => setCategory(e.target.value)} />
                <datalist id="twiz-cat">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>U height <span style={{ color: '#c47c5a' }}>*</span></label>
                <input type="number" min={1} max={100} style={INPUT} value={uHeight}
                  onChange={e => setUHeight(Math.max(1, Math.min(100, Number(e.target.value))))} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Form factor</label>
                <select style={INPUT} value={formFactor} onChange={e => setFormFactor(e.target.value as FormFactor)}>
                  <option value="rack">Rack-mount</option>
                  <option value="desktop">Desktop</option>
                  <option value="wall-mount">Wall-mount</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button style={BTN_SEC} onClick={onClose}>Cancel</button>
              <button
                style={{ ...BTN_PRI, opacity: (!make.trim() || !model.trim() || !category.trim()) ? 0.5 : 1 }}
                disabled={!make.trim() || !model.trim() || !category.trim()}
                onClick={() => setStep(2)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 & 3: Layout editor ── */}
        {isEditor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 16, fontWeight: 600, color: '#d4d9dd' }}>
                {step === 2 ? 'Front' : 'Rear'} faceplate layout
              </h3>
              <p style={{ margin: 0, fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299' }}>
                Click a block type then click the grid to place.{' '}
                <kbd style={{ fontSize: 10, background: '#2a3038', padding: '1px 5px', borderRadius: 3, color: '#d4d9dd' }}>Ctrl+Click</kbd> to delete.{' '}
                <kbd style={{ fontSize: 10, background: '#2a3038', padding: '1px 5px', borderRadius: 3, color: '#d4d9dd' }}>R</kbd> to rotate.{' '}
                <kbd style={{ fontSize: 10, background: '#2a3038', padding: '1px 5px', borderRadius: 3, color: '#d4d9dd' }}>Esc</kbd> cancels.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Palette */}
              <div style={{
                width: 160, flexShrink: 0,
                maxHeight: MAX_EDITOR_H, overflowY: 'auto',
                background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
                padding: '10px 8px',
              }}>
                {paletteGroups.map(group => (
                  <div key={group.label} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontFamily: 'Inter,system-ui,sans-serif', color: '#5a6068', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, paddingLeft: 8 }}>
                      {group.label}
                    </div>
                    {group.defs.map(def => (
                      <PaletteItem
                        key={def.type}
                        def={def}
                        active={pendingType === def.type}
                        onClick={() => handlePaletteClick(def.type)}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Grid + toolbar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Toolbar row */}
                {pendingType && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299' }}>
                    <span>Placing: <strong style={{ color: '#d4d9dd' }}>{BLOCK_DEF_MAP.get(pendingType)?.label}</strong></span>
                    {pendingRotated && <span style={{ color: '#c47c5a' }}>(rotated)</span>}
                    {BLOCK_DEF_MAP.get(pendingType)?.canRotate && (
                      <button
                        onClick={() => setPendingRotated(prev => !prev)}
                        style={{
                          background: pendingRotated ? '#c47c5a20' : '#1a1e22',
                          border: `1px solid ${pendingRotated ? '#c47c5a' : '#2a3038'}`,
                          borderRadius: 3, padding: '2px 8px', cursor: 'pointer',
                          fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif',
                          color: pendingRotated ? '#c47c5a' : '#8a9299',
                        }}
                        title="Toggle rotation (R)"
                      >
                        ↻ Rotate
                      </button>
                    )}
                  </div>
                )}

                <GridEditor
                  blocks={currentBlocks}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  pendingType={pendingType}
                  pendingRotated={pendingRotated}
                  selectedId={selectedId}
                  onPlace={handlePlace}
                  onSelect={setSelectedId}
                  onDelete={handleDelete}
                />
                <div style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#3a4248', textAlign: 'right' }}>
                  {gridCols}×{gridRows} grid · {uHeight}U · {currentBlocks.length} block{currentBlocks.length !== 1 ? 's' : ''} placed
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={{ fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setStep(step === 2 ? 3 : 4); setPendingType(null); setPendingRotated(false); setSelectedId(null); }}>
                Skip →
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={BTN_SEC} onClick={() => { setStep(step === 2 ? 1 : 2); setPendingType(null); setPendingRotated(false); setSelectedId(null); }}>← Back</button>
                <button style={BTN_PRI} onClick={() => { setStep(step === 2 ? 3 : 4); setPendingType(null); setPendingRotated(false); setSelectedId(null); }}>Next →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Review ── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 16, fontWeight: 600, color: '#d4d9dd' }}>
                Review & {isEdit ? 'save' : 'create'}
              </h3>
            </div>

            {/* Info summary */}
            <div style={{
              background: '#0e1012', border: '1px solid #2a3038', borderRadius: 6,
              padding: '12px 16px', display: 'flex', gap: 24, flexWrap: 'wrap',
            }}>
              {[
                { k: 'Make', v: make },
                { k: 'Model', v: model },
                { k: 'Category', v: category },
                { k: 'U Height', v: `${uHeight}U` },
                { k: 'Form Factor', v: formFactor },
                ...(manufacturer ? [{ k: 'Manufacturer', v: manufacturer }] : []),
              ].map(({ k, v }) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: '#5a6068', fontFamily: 'Inter,system-ui,sans-serif' }}>{k}</div>
                  <div style={{ fontSize: 12, color: '#d4d9dd', fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 500, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Face previews */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Front', blocks: frontBlocks },
                { label: 'Rear', blocks: rearBlocks },
              ].map(({ label, blocks }) => {
                const previewW = 360;
                const cellSz = previewW / gridCols;
                const previewH = Math.min(gridRows * cellSz, 200);
                return (
                  <div key={label}>
                    <div style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#5a6068', marginBottom: 6 }}>{label}</div>
                    <div style={{ width: previewW, height: previewH, background: '#0c0e12', border: '1px solid #2a3038', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      {blocks.length === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#3a4248', fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif' }}>
                          empty
                        </div>
                      )}
                      {blocks.map(b => {
                        const def = BLOCK_DEF_MAP.get(b.type);
                        if (!def) return null;
                        const bw = b.rotated ? def.h : def.w;
                        const bh = b.rotated ? def.w : def.h;
                        return (
                          <div key={b.id} style={{
                            position: 'absolute',
                            left: b.col * cellSz, top: b.row * cellSz,
                            width: bw * cellSz, height: bh * cellSz,
                            background: def.color, border: `1px solid ${def.borderColor}`,
                            boxSizing: 'border-box', borderRadius: 1,
                          }} />
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#3a4248', marginTop: 4 }}>
                      {blocks.length} block{blocks.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && (
              <div style={{ background: '#2a0e0e', border: '1px solid #8a2020', borderRadius: 4, padding: '8px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#e84040' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={BTN_SEC} onClick={() => setStep(3)} disabled={submitting}>← Back</button>
              <button
                style={{ ...BTN_PRI, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
                disabled={submitting}
                onClick={handleFinish}
              >
                {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Template' : 'Create Template')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Standalone Layout Editor ──────────────────────────────────────────────────
// A lighter overlay that just opens the grid editor for an existing template
// without going through the full 4-step wizard.

interface LayoutEditorProps {
  open: boolean;
  template: DeviceTemplate;
  onSave: (layout: { front: PlacedBlock[]; rear: PlacedBlock[] }) => void;
  onClose: () => void;
}

export function LayoutEditor({ open, template, onSave, onClose }: LayoutEditorProps) {
  const [face, setFace] = useState<'front' | 'rear'>('front');
  const [frontBlocks, setFrontBlocks] = useState<PlacedBlock[]>([]);
  const [rearBlocks, setRearBlocks] = useState<PlacedBlock[]>([]);
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingRotated, setPendingRotated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrontBlocks(template.layout?.front ?? []);
    setRearBlocks(template.layout?.rear ?? []);
    setFace('front');
    setPendingType(null); setPendingRotated(false); setSelectedId(null);
    api.get<{ count: number }>(`/api/templates/devices/${template.id}/usage`)
      .then(r => setUsageCount(r.count))
      .catch(() => setUsageCount(null));
  }, [open, template]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && pendingType) { setPendingType(null); setPendingRotated(false); return; }
      if (e.key === 'r' || e.key === 'R') {
        if (pendingType) {
          const def = BLOCK_DEF_MAP.get(pendingType);
          if (def?.canRotate) setPendingRotated(prev => !prev);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !pendingType) {
        if (face === 'front') setFrontBlocks(prev => prev.filter(b => b.id !== selectedId));
        else setRearBlocks(prev => prev.filter(b => b.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, pendingType, selectedId, face]);

  if (!open) return null;

  const gridCols = GRID_COLS;
  const gridRows = template.uHeight * 12;
  const currentBlocks = face === 'front' ? frontBlocks : rearBlocks;

  const paletteGroups = PALETTE_GROUPS.map(group => ({
    ...group,
    defs: group.types
      .map(t => BLOCK_DEF_MAP.get(t))
      .filter((d): d is BlockDef => !!d && (face === 'front' ? d.panel !== 'rear' : true)),
  })).filter(g => g.defs.length > 0);

  function handlePaletteClick(type: string) {
    if (pendingType === type) { setPendingType(null); setPendingRotated(false); }
    else { setPendingType(type); setPendingRotated(false); }
    setSelectedId(null);
  }

  function hasCollision(blocks: PlacedBlock[], col: number, row: number, w: number, h: number): boolean {
    return blocks.some(b => {
      const bd = BLOCK_DEF_MAP.get(b.type);
      if (!bd) return false;
      const bw = b.rotated ? bd.h : bd.w;
      const bh = b.rotated ? bd.w : bd.h;
      return !(col + w <= b.col || col >= b.col + bw || row + h <= b.row || row >= b.row + bh);
    });
  }

  function handlePlace(col: number, row: number) {
    if (!pendingType) return;
    const def = BLOCK_DEF_MAP.get(pendingType);
    if (!def) return;
    const rotated = pendingRotated && def.canRotate;
    const w = rotated ? def.h : def.w;
    const h = rotated ? def.w : def.h;
    const setter = face === 'front' ? setFrontBlocks : setRearBlocks;
    const current = face === 'front' ? frontBlocks : rearBlocks;
    if (hasCollision(current, col, row, w, h)) return;
    const block: PlacedBlock = { id: uid(), type: pendingType as PlacedBlock['type'], col, row, w: def.w, h: def.h, rotated: rotated || undefined };
    setter(prev => [...prev, block]);
  }

  function handleDelete(id: string) {
    if (face === 'front') setFrontBlocks(prev => prev.filter(b => b.id !== id));
    else setRearBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedId(null);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1010,
    }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1e22', border: '1px solid #2a3038', borderRadius: 8,
          width: 960, maxWidth: '96vw',
          maxHeight: '92vh', overflowY: 'auto',
          padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 13, fontWeight: 600, color: '#d4d9dd' }}>
            Edit Layout — {template.make} {template.model}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
        </div>

        {/* Usage warning */}
        {usageCount !== null && usageCount > 0 && (
          <div style={{
            background: '#2a1e0e', border: '1px solid #8a6a20', borderRadius: 4,
            padding: '8px 12px', fontSize: 12, fontFamily: 'Inter,system-ui,sans-serif', color: '#e8b840',
          }}>
            This template is used by {usageCount} device{usageCount !== 1 ? 's' : ''}. Changing the layout may affect existing port mappings and visual layouts.
          </div>
        )}

        {/* Face toggle + instructions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['front', 'rear'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFace(f); setPendingType(null); setPendingRotated(false); setSelectedId(null); }}
                style={{
                  background: face === f ? '#c47c5a20' : '#1a1e22',
                  border: `1px solid ${face === f ? '#c47c5a' : '#2a3038'}`,
                  borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif',
                  color: face === f ? '#c47c5a' : '#8a9299',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#5a6068' }}>
            Ctrl+Click delete · R rotate · Esc cancel
          </span>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Palette */}
          <div style={{
            width: 160, flexShrink: 0,
            maxHeight: MAX_EDITOR_H, overflowY: 'auto',
            background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
            padding: '10px 8px',
          }}>
            {paletteGroups.map(group => (
              <div key={group.label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontFamily: 'Inter,system-ui,sans-serif', color: '#5a6068', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, paddingLeft: 8 }}>
                  {group.label}
                </div>
                {group.defs.map(def => (
                  <PaletteItem
                    key={def.type}
                    def={def}
                    active={pendingType === def.type}
                    onClick={() => handlePaletteClick(def.type)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Grid + toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299' }}>
                <span>Placing: <strong style={{ color: '#d4d9dd' }}>{BLOCK_DEF_MAP.get(pendingType)?.label}</strong></span>
                {pendingRotated && <span style={{ color: '#c47c5a' }}>(rotated)</span>}
                {BLOCK_DEF_MAP.get(pendingType)?.canRotate && (
                  <button
                    onClick={() => setPendingRotated(prev => !prev)}
                    style={{
                      background: pendingRotated ? '#c47c5a20' : '#1a1e22',
                      border: `1px solid ${pendingRotated ? '#c47c5a' : '#2a3038'}`,
                      borderRadius: 3, padding: '2px 8px', cursor: 'pointer',
                      fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif',
                      color: pendingRotated ? '#c47c5a' : '#8a9299',
                    }}
                    title="Toggle rotation (R)"
                  >
                    ↻ Rotate
                  </button>
                )}
              </div>
            )}

            <GridEditor
              blocks={currentBlocks}
              gridCols={gridCols}
              gridRows={gridRows}
              pendingType={pendingType}
              pendingRotated={pendingRotated}
              selectedId={selectedId}
              onPlace={handlePlace}
              onSelect={setSelectedId}
              onDelete={handleDelete}
            />
            <div style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#3a4248', textAlign: 'right' }}>
              {gridCols}×{gridRows} grid · {template.uHeight}U · {currentBlocks.length} block{currentBlocks.length !== 1 ? 's' : ''} placed
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={BTN_SEC} onClick={onClose}>Cancel</button>
          <button style={BTN_PRI} onClick={() => onSave({ front: frontBlocks, rear: rearBlocks })}>
            Save Layout
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PCIe Layout Editor ────────────────────────────────────────────────────────
// Simpler editor for PCIe card templates — rear-only, filtered palette.

const PCIE_PALETTE_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Network', types: ['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28'] },
  { label: 'I/O Ports', types: ['usb-a', 'usb-c', 'serial', 'hdmi', 'displayport', 'vga', 'misc-port'] },
  { label: 'Misc', types: ['misc-small', 'misc-med', 'misc-large'] },
];

const PCIE_GRID_DIMS: Record<string, { cols: number; rows: number }> = {
  fh:      { cols: 5,  rows: 33 },
  lp:      { cols: 5,  rows: 17 },
  'fh-dw': { cols: 11, rows: 33 },
  'lp-dw': { cols: 11, rows: 17 },
};

interface PcieLayoutEditorProps {
  open: boolean;
  formFactor: string;
  initialBlocks: PlacedBlock[];
  title: string;
  onSave: (blocks: PlacedBlock[]) => void;
  onClose: () => void;
}

export function PcieLayoutEditor({ open, formFactor, initialBlocks, title, onSave, onClose }: PcieLayoutEditorProps) {
  const [blocks, setBlocks] = useState<PlacedBlock[]>([]);
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingRotated, setPendingRotated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dims = PCIE_GRID_DIMS[formFactor] ?? PCIE_GRID_DIMS.fh;

  useEffect(() => {
    if (!open) return;
    setBlocks(initialBlocks);
    setPendingType(null); setPendingRotated(false); setSelectedId(null);
  }, [open, initialBlocks]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && pendingType) { setPendingType(null); setPendingRotated(false); return; }
      if (e.key === 'r' || e.key === 'R') {
        if (pendingType) {
          const def = BLOCK_DEF_MAP.get(pendingType);
          if (def?.canRotate) setPendingRotated(prev => !prev);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !pendingType) {
        setBlocks(prev => prev.filter(b => b.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, pendingType, selectedId]);

  if (!open) return null;

  const paletteGroups = PCIE_PALETTE_GROUPS.map(group => ({
    ...group,
    defs: group.types
      .map(t => BLOCK_DEF_MAP.get(t))
      .filter((d): d is BlockDef => !!d),
  })).filter(g => g.defs.length > 0);

  function handlePaletteClick(type: string) {
    if (pendingType === type) { setPendingType(null); setPendingRotated(false); }
    else { setPendingType(type); setPendingRotated(false); }
    setSelectedId(null);
  }

  function hasCollision(col: number, row: number, w: number, h: number): boolean {
    return blocks.some(b => {
      const bd = BLOCK_DEF_MAP.get(b.type);
      if (!bd) return false;
      const bw = b.rotated ? bd.h : bd.w;
      const bh = b.rotated ? bd.w : bd.h;
      return !(col + w <= b.col || col >= b.col + bw || row + h <= b.row || row >= b.row + bh);
    });
  }

  function handlePlace(col: number, row: number) {
    if (!pendingType) return;
    const def = BLOCK_DEF_MAP.get(pendingType);
    if (!def) return;
    const rotated = pendingRotated && def.canRotate;
    const w = rotated ? def.h : def.w;
    const h = rotated ? def.w : def.h;
    if (hasCollision(col, row, w, h)) return;
    const block: PlacedBlock = { id: uid(), type: pendingType as PlacedBlock['type'], col, row, w: def.w, h: def.h, rotated: rotated || undefined };
    setBlocks(prev => [...prev, block]);
  }

  function handleDelete(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedId(null);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1010,
    }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1e22', border: '1px solid #2a3038', borderRadius: 8,
          width: 860, maxWidth: '96vw',
          maxHeight: '92vh', overflowY: 'auto',
          padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 13, fontWeight: 600, color: '#d4d9dd' }}>
            {title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#5a6068' }}>
            Ctrl+Click delete · R rotate · Esc cancel
          </span>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Palette */}
          <div style={{
            width: 160, flexShrink: 0,
            maxHeight: MAX_EDITOR_H, overflowY: 'auto',
            background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
            padding: '10px 8px',
          }}>
            {paletteGroups.map(group => (
              <div key={group.label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontFamily: 'Inter,system-ui,sans-serif', color: '#5a6068', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, paddingLeft: 8 }}>
                  {group.label}
                </div>
                {group.defs.map(def => (
                  <PaletteItem
                    key={def.type}
                    def={def}
                    active={pendingType === def.type}
                    onClick={() => handlePaletteClick(def.type)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Grid + toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', color: '#8a9299' }}>
                <span>Placing: <strong style={{ color: '#d4d9dd' }}>{BLOCK_DEF_MAP.get(pendingType)?.label}</strong></span>
                {pendingRotated && <span style={{ color: '#c47c5a' }}>(rotated)</span>}
                {BLOCK_DEF_MAP.get(pendingType)?.canRotate && (
                  <button
                    onClick={() => setPendingRotated(prev => !prev)}
                    style={{
                      background: pendingRotated ? '#c47c5a20' : '#1a1e22',
                      border: `1px solid ${pendingRotated ? '#c47c5a' : '#2a3038'}`,
                      borderRadius: 3, padding: '2px 8px', cursor: 'pointer',
                      fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif',
                      color: pendingRotated ? '#c47c5a' : '#8a9299',
                    }}
                    title="Toggle rotation (R)"
                  >
                    ↻ Rotate
                  </button>
                )}
              </div>
            )}

            <GridEditor
              blocks={blocks}
              gridCols={dims.cols}
              gridRows={dims.rows}
              pendingType={pendingType}
              pendingRotated={pendingRotated}
              selectedId={selectedId}
              onPlace={handlePlace}
              onSelect={setSelectedId}
              onDelete={handleDelete}
            />
            <div style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#3a4248', textAlign: 'right' }}>
              {dims.cols}×{dims.rows} grid · {blocks.length} block{blocks.length !== 1 ? 's' : ''} placed
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={BTN_SEC} onClick={onClose}>Cancel</button>
          <button style={BTN_PRI} onClick={() => onSave(blocks)}>
            Save Layout
          </button>
        </div>
      </div>
    </div>
  );
}
