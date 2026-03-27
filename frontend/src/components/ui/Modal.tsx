import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open:      boolean;
  onClose:   () => void;
  title?:    string;
  children:  ReactNode;
  minWidth?: number | string;
  maxWidth?: number | string;
  footer?:   ReactNode;
}

// Simple single-step modal — closes on Escape and backdrop click.
// Do NOT use this for multi-step wizards. See CLAUDE.md invariant #8.
export function Modal({ open, onClose, title, children, minWidth = 460, maxWidth, footer }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--cardBg2, #0c0d0e)',
          border: '1px solid var(--border2, #262c30)',
          borderRadius: 14,
          minWidth, maxWidth,
          width: maxWidth ? undefined : minWidth,
          maxHeight: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        {title && (
          <div style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border, #1d2022)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              fontWeight: 700, color: 'var(--text, #d4d9dd)',
            }}>
              {title}
            </span>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" size={12} />
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '11px 18px',
            borderTop: '1px solid var(--border2, #262c30)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
