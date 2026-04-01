/**
 * ExportDropdown.tsx
 * Reusable dropdown export button. Renders a single button that opens a small
 * menu of export options. Closes on outside click or Escape.
 */

import { useState, useRef, useEffect } from 'react';

export interface ExportOption {
  label: string;
  /** Called when this option is selected */
  onSelect: () => void;
}

interface ExportDropdownProps {
  /** Options shown in the dropdown */
  options: ExportOption[];
  /** Button label (default: "Export") */
  label?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function ExportDropdown({
  options,
  label = 'Export',
  disabled = false,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <style>{`
        .exp-btn:hover:not(:disabled) {
          background: var(--color-surface-2) !important;
          border-color: var(--color-border-2, #3a4248) !important;
          color: var(--color-text) !important;
        }
        .exp-item:hover {
          background: var(--color-hover, #1e2428) !important;
          color: var(--color-text) !important;
        }
      `}</style>

      <button
        className="exp-btn"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '6px 12px',
          fontSize: 12,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <span style={{ fontSize: 9, lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 140,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm, 4px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          {options.map((opt, i) => (
            <button
              key={i}
              className="exp-item"
              onClick={() => {
                setOpen(false);
                opt.onSelect();
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 14px',
                fontSize: 12,
                textAlign: 'left',
                border: 'none',
                borderBottom:
                  i < options.length - 1
                    ? '1px solid var(--color-border)'
                    : 'none',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
