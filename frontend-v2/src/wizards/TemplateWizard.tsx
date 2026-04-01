import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlacedBlock, DeviceTemplate, BlockDef } from '@werkstack/shared';
import { BLOCK_DEFS, BLOCK_DEF_MAP } from '@werkstack/shared';
import { api } from '@/utils/api';
import { uid } from '@/utils/uid';

interface TemplateWizardProps {
  open: boolean;
  onComplete: (template: DeviceTemplate) => void;
  onClose: () => void;
}

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
  { label: 'Power & PCIe', types: ['power', 'pcie-fh', 'pcie-lp', 'pcie-dw'] },
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
      title={`${def.label} (${def.w}×${def.h})`}
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
      <span style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#d4d9dd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {def.label}
      </span>
    </button>
  );
}

// ── Grid editor ───────────────────────────────────────────────────────────────

interface GridEditorProps {
  blocks: PlacedBlock[];
  gridCols: number;
  gridRows: number;
  pendingType: string | null;
  selectedId: string | null;
  onPlace: (col: number, row: number) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}

function GridEditor({ blocks, gridCols, gridRows, pendingType, selectedId, onPlace, onSelect, onDelete }: GridEditorProps) {
  const cellW = EDITOR_W / gridCols;
  const cellH = cellW; // square cells
  const gridH = Math.min(gridRows * cellH, MAX_EDITOR_H);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);

  const pendingDef = pendingType ? BLOCK_DEF_MAP.get(pendingType) : null;

  const toCell = useCallback((e: React.MouseEvent): { col: number; row: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTop;
    const col = Math.max(0, Math.min(gridCols - (pendingDef?.w ?? 1), Math.floor(x / cellW)));
    const row = Math.max(0, Math.min(gridRows - (pendingDef?.h ?? 1), Math.floor(y / cellH)));
    return { col, row };
  }, [cellW, cellH, gridCols, gridRows, pendingDef]);

  function handleMouseMove(e: React.MouseEvent) {
    if (!pendingDef) { setHover(null); return; }
    setHover(toCell(e));
  }

  function handleMouseLeave() { setHover(null); }

  function handleClick(e: React.MouseEvent) {
    if (!pendingDef) return;
    const { col, row } = toCell(e);
    onPlace(col, row);
  }

  // 1U boundary markers (every 12 rows)
  const uBoundaries: number[] = [];
  for (let u = 1; u * 12 < gridRows; u++) uBoundaries.push(u * 12 * cellH);

  return (
    <div
      ref={scrollRef}
      style={{
        width: EDITOR_W, height: gridH, overflowY: 'auto',
        background: '#080a0c', border: '1px solid #2a3038', borderRadius: 4,
        position: 'relative', cursor: pendingDef ? 'crosshair' : 'default',
        flexShrink: 0,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Full-height inner container */}
      <div style={{ width: EDITOR_W, height: gridRows * cellH, position: 'relative' }}>

        {/* U-boundary lines */}
        {uBoundaries.map((y, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, top: y, width: '100%',
            height: 1, background: '#1a2028', pointerEvents: 'none',
          }} />
        ))}

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
              onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : b.id); }}
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
              }}
            >
              <span style={{ opacity: 0.7, fontSize: Math.max(6, cellW * 0.9), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 2px' }}>
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
            width: pendingDef.w * cellW, height: pendingDef.h * cellH,
            background: pendingDef.color,
            border: `1px solid ${pendingDef.borderColor}`,
            boxSizing: 'border-box',
            opacity: 0.55,
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        )}
      </div>
    </div>
  );
}

// ── TemplateWizard ─────────────────────────────────────────────────────────────

export function TemplateWizard({ open, onComplete, onClose }: TemplateWizardProps) {
  const qc = useQueryClient();

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Wizard
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setMake(''); setModel(''); setManufacturer('');
    setCategory('switch'); setUHeight(1); setFormFactor('rack');
    setFrontBlocks([]); setRearBlocks([]);
    setPendingType(null); setSelectedId(null);
    setStep(1); setError(null);
  }, [open]);

  // Cancel pending placement on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && pendingType) { setPendingType(null); return; }
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
    setPendingType(prev => prev === type ? null : type);
    setSelectedId(null);
  }

  function hasCollision(blocks: PlacedBlock[], col: number, row: number, def: BlockDef): boolean {
    return blocks.some(b => {
      const bd = BLOCK_DEF_MAP.get(b.type);
      if (!bd) return false;
      const bw = b.rotated ? bd.h : bd.w;
      const bh = b.rotated ? bd.w : bd.h;
      return !(col + def.w <= b.col || col >= b.col + bw || row + def.h <= b.row || row >= b.row + bh);
    });
  }

  function handlePlace(col: number, row: number) {
    if (!pendingType) return;
    const def = BLOCK_DEF_MAP.get(pendingType);
    if (!def) return;
    const setter = step === 2 ? setFrontBlocks : setRearBlocks;
    const current = step === 2 ? frontBlocks : rearBlocks;
    if (hasCollision(current, col, row, def)) return;
    const block: PlacedBlock = { id: uid(), type: pendingType as PlacedBlock['type'], col, row, w: def.w, h: def.h };
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
    try {
      const template = await api.post<DeviceTemplate>('/api/templates/devices', {
        make: make.trim(),
        model: model.trim(),
        manufacturer: manufacturer.trim() || undefined,
        category: category.trim(),
        formFactor,
        uHeight,
        gridCols: GRID_COLS,
        layout: { front: frontBlocks, rear: rearBlocks },
      });
      await qc.invalidateQueries({ queryKey: ['templates', 'devices'] });
      onComplete(template);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  }

  const dotState = (n: number): 'active' | 'done' | 'pending' =>
    n < step ? 'done' : n === step ? 'active' : 'pending';

  const isEditor = step === 2 || step === 3;

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
            New Device Template
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
        </div>

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
                Click a block type in the palette, then click the grid to place it. Click a placed block to select → × to delete. <kbd style={{ fontSize: 10, background: '#2a3038', padding: '1px 5px', borderRadius: 3, color: '#d4d9dd' }}>Esc</kbd> cancels placement.
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

              {/* Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <GridEditor
                  blocks={step === 2 ? frontBlocks : rearBlocks}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  pendingType={pendingType}
                  selectedId={selectedId}
                  onPlace={handlePlace}
                  onSelect={setSelectedId}
                  onDelete={handleDelete}
                />
                <div style={{ fontSize: 10, fontFamily: 'Inter,system-ui,sans-serif', color: '#3a4248', textAlign: 'right' }}>
                  {gridCols}×{gridRows} grid · {uHeight}U · {(step === 2 ? frontBlocks : rearBlocks).length} block{(step === 2 ? frontBlocks : rearBlocks).length !== 1 ? 's' : ''} placed
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={{ fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', background: 'none', border: 'none', color: '#5a6068', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setStep(step === 2 ? 3 : 4); setPendingType(null); setSelectedId(null); }}>
                Skip →
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={BTN_SEC} onClick={() => { setStep(step === 2 ? 1 : 2); setPendingType(null); setSelectedId(null); }}>← Back</button>
                <button style={BTN_PRI} onClick={() => { setStep(step === 2 ? 3 : 4); setPendingType(null); setSelectedId(null); }}>Next →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Review ── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 16, fontWeight: 600, color: '#d4d9dd' }}>
                Review & create
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
                    <div style={{ width: previewW, height: previewH, background: '#080a0c', border: '1px solid #2a3038', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
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
                            boxSizing: 'border-box',
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
                {submitting ? 'Creating…' : 'Create Template'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
