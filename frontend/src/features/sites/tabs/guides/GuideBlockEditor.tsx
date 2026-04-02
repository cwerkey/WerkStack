import { useState, useRef, useEffect, useCallback, memo, forwardRef } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { uid }  from '../../../../utils/uid';
import type { GuideBlock, GuideBlockType } from '@werkstack/shared';

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_TYPES: { value: GuideBlockType; label: string }[] = [
  { value: 'paragraph', label: 'text' },
  { value: 'h1',        label: 'h1' },
  { value: 'h2',        label: 'h2' },
  { value: 'h3',        label: 'h3' },
  { value: 'code',      label: 'code' },
  { value: 'list',      label: 'list' },
  { value: 'ordered',   label: 'num' },
  { value: 'divider',   label: '---' },
  { value: 'callout',   label: 'note' },
  { value: 'table',     label: 'table' },
];

const TYPE_LABEL: Record<GuideBlockType, string> = {
  paragraph: 'text',
  h1:        'h1',
  h2:        'h2',
  h3:        'h3',
  code:      'code',
  list:      'list',
  ordered:   'num',
  divider:   '---',
  callout:   'note',
  table:     'table',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBlock(type: GuideBlockType = 'paragraph', content = ''): GuideBlock {
  return { id: uid(), type, content };
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  blocks:              GuideBlock[];
  onChange:            (blocks: GuideBlock[]) => void;
  readOnly?:           boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

// ── Uncontrolled contentEditable block ───────────────────────────────────────
// React must NOT re-render the text content on every keystroke. We only sync
// the DOM text on mount or when the block identity (id) changes externally.

interface EditableBlockProps {
  block:       GuideBlock;
  className:   string;
  placeholder: string;
  readOnly?:   boolean;
  extraAttrs?: Record<string, string>;
  onContentChange: (text: string) => void;
  onKeyDown:   (e: React.KeyboardEvent) => void;
  onFocus:     () => void;
  onRef:       (el: HTMLDivElement | null) => void;
}

const EditableBlock = memo(function EditableBlock({
  block, className, placeholder, readOnly, extraAttrs,
  onContentChange, onKeyDown, onFocus, onRef,
}: EditableBlockProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const blockIdRef = useRef(block.id);

  // Set initial text, and reset when block identity changes
  useEffect(() => {
    if (elRef.current && blockIdRef.current !== block.id) {
      elRef.current.textContent = block.content;
      blockIdRef.current = block.id;
    }
  }, [block.id, block.content]);

  function handleRef(el: HTMLDivElement | null) {
    elRef.current = el;
    if (el && el.textContent !== block.content) {
      el.textContent = block.content;
    }
    onRef(el);
  }

  return (
    <div
      className={className}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      {...extraAttrs}
      ref={handleRef}
      onInput={() => {
        onContentChange(elRef.current?.textContent ?? '');
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    />
  );
  // NOTE: no {block.content} children — the DOM owns its own text
}, (prev, next) => {
  // Only re-render when identity, type, or control props change — NOT on content changes
  return prev.block.id === next.block.id
    && prev.block.type === next.block.type
    && prev.className === next.className
    && prev.readOnly === next.readOnly
    && prev.placeholder === next.placeholder
    && prev.extraAttrs?.['data-num'] === next.extraAttrs?.['data-num'];
});

// ── Component ────────────────────────────────────────────────────────────────

export function GuideBlockEditor({ blocks, onChange, readOnly, scrollContainerRef }: Props) {
  const [focusIdx, setFocusIdx]         = useState<number | null>(null);
  const [openMenu, setOpenMenu]         = useState<number | null>(null);
  const [menuActiveIdx, setMenuActiveIdx] = useState(-1);
  const [slashIdx, setSlashIdx]         = useState<number | null>(null);
  const [slashFilter, setSlashFilter]   = useState('');
  const [slashActiveIdx, setSlashActiveIdx] = useState(0);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const menuRef   = useRef<HTMLDivElement | null>(null);
  // Mutable content mirror — always up-to-date, no re-renders
  const contentRef = useRef<Map<string, string>>(new Map());

  // Sync content mirror when blocks change externally (load, type change, etc.)
  useEffect(() => {
    const m = contentRef.current;
    for (const b of blocks) {
      if (!m.has(b.id)) m.set(b.id, b.content);
    }
  }, [blocks]);

  // Close menus on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setSlashIdx(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus the target block after state update
  useEffect(() => {
    if (focusIdx === null) return;
    const block = blocks[focusIdx];
    if (!block) return;
    const el = blockRefs.current.get(block.id);
    if (el) {
      el.focus();
      // place cursor at end
      if (el instanceof HTMLElement && el.isContentEditable) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    setFocusIdx(null);
  }, [focusIdx, blocks]);

  // ── Block mutations ──────────────────────────────────────────────────────

  const flushContent = useCallback(() => {
    // Merge mutable content mirror into blocks before structural changes
    const m = contentRef.current;
    let changed = false;
    const next = blocks.map(b => {
      const cur = m.get(b.id);
      if (cur !== undefined && cur !== b.content) {
        changed = true;
        return { ...b, content: cur };
      }
      return b;
    });
    return changed ? next : blocks;
  }, [blocks]);

  const updateBlockContent = useCallback((blockId: string, text: string) => {
    contentRef.current.set(blockId, text);
    // Debounced — we'll flush on structural changes or save.
    // But we also need onChange for dirty tracking, so fire a lightweight update.
    const next = blocks.map(b => b.id === blockId ? { ...b, content: text } : b);
    onChange(next);
  }, [blocks, onChange]);

  const updateBlockMeta = useCallback((idx: number, patch: Partial<GuideBlock>) => {
    const next = blocks.map((b, i) => i === idx ? { ...b, ...patch } : b);
    onChange(next);
  }, [blocks, onChange]);

  const insertAfter = useCallback((idx: number, type: GuideBlockType = 'paragraph') => {
    const flushed = flushContent();
    const next = [...flushed];
    next.splice(idx + 1, 0, makeBlock(type));
    onChange(next);
    setFocusIdx(idx + 1);
  }, [flushContent, onChange]);

  const removeBlock = useCallback((idx: number) => {
    const flushed = flushContent();
    if (flushed.length <= 1) {
      const nb = makeBlock('paragraph', '');
      contentRef.current.set(nb.id, '');
      onChange([nb]);
      setFocusIdx(0);
      return;
    }
    const next = flushed.filter((_, i) => i !== idx);
    onChange(next);
    setFocusIdx(Math.max(0, idx - 1));
  }, [flushContent, onChange]);

  const changeType = useCallback((idx: number, type: GuideBlockType) => {
    const flushed = flushContent();
    const next = flushed.map((b, i) => {
      if (i !== idx) return b;
      if (type === 'divider') return { ...b, type, content: '' };
      if (type === 'callout' && !b.meta?.variant) return { ...b, type, meta: { variant: 'info' } };
      return { ...b, type };
    });
    onChange(next);
    setOpenMenu(null);
    setMenuActiveIdx(-1);
    setSlashIdx(null);
    setSlashFilter('');
    setSlashActiveIdx(0);
    setFocusIdx(idx);
  }, [flushContent, onChange]);

  // ── Keyboard handling ────────────────────────────────────────────────────

  function getBlockContent(block: GuideBlock): string {
    return contentRef.current.get(block.id) ?? block.content;
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    const block = blocks[idx];
    const content = getBlockContent(block);

    // Enter → insert new paragraph below
    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      insertAfter(idx);
      return;
    }

    // Backspace on empty block → delete it
    if (e.key === 'Backspace' && content === '' && block.type !== 'code') {
      e.preventDefault();
      removeBlock(idx);
      return;
    }

    // Arrow up/down for block navigation
    if (e.key === 'ArrowUp' && idx > 0 && block.type !== 'code') {
      const el = blockRefs.current.get(block.id);
      if (el) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const atStart = range.startOffset === 0 && range.endOffset === 0;
          if (atStart) {
            e.preventDefault();
            setFocusIdx(idx - 1);
          }
        }
      }
    }

    if (e.key === 'ArrowDown' && idx < blocks.length - 1 && block.type !== 'code') {
      const el = blockRefs.current.get(block.id);
      if (el) {
        const textLen = el.textContent?.length ?? 0;
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          if (range.startOffset >= textLen) {
            e.preventDefault();
            setFocusIdx(idx + 1);
          }
        }
      }
    }

    // Slash command: "/" at start of empty block
    if (e.key === '/' && content === '' && block.type === 'paragraph') {
      e.preventDefault();
      setSlashIdx(idx);
      setSlashFilter('');
      return;
    }

    // Escape closes slash menu
    if (e.key === 'Escape' && slashIdx !== null) {
      e.preventDefault();
      setSlashIdx(null);
      setSlashFilter('');
      return;
    }
  }

  // ── Slash command filtering ──────────────────────────────────────────────

  function handleSlashInput(e: React.KeyboardEvent, idx: number) {
    if (slashIdx !== idx) return;

    const filtered = BLOCK_TYPES.filter(t =>
      !slashFilter || t.label.includes(slashFilter.toLowerCase()) || t.value.includes(slashFilter.toLowerCase())
    );

    if (e.key === 'Escape') {
      setSlashIdx(null);
      setSlashFilter('');
      setSlashActiveIdx(0);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashActiveIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filtered.length > 0) {
        changeType(idx, filtered[Math.min(slashActiveIdx, filtered.length - 1)].value);
      }
      return;
    }

    if (e.key === 'Backspace') {
      if (slashFilter.length === 0) {
        setSlashIdx(null);
        setSlashActiveIdx(0);
      } else {
        setSlashFilter(prev => prev.slice(0, -1));
        setSlashActiveIdx(0);
      }
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setSlashFilter(prev => prev + e.key);
      setSlashActiveIdx(0);
    }
  }

  // ── Copy code to clipboard ──────────────────────────────────────────────

  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyCode(block: GuideBlock) {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopiedId(block.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="gbe-wrap" ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
      <style>{`
        .gbe-wrap { font-family: Inter, system-ui, sans-serif; }
        .gbe-row { display: flex; align-items: flex-start; min-height: 28px; position: relative; }
        .gbe-row[data-type="h1"],
        .gbe-row[data-type="h2"],
        .gbe-row[data-type="h3"] { align-items: center; }
        .gbe-row:hover .gbe-gutter { opacity: 1; }
        .gbe-gutter {
          display: flex; align-items: center; gap: 2px;
          width: 80px; flex-shrink: 0;
          padding: 3px 4px 3px 8px;
          opacity: 0.5; transition: opacity 0.15s;
          user-select: none;
        }
        .gbe-linenum {
          font-family: 'JetBrains Mono', monospace; font-size: 9px;
          color: var(--text3, #555a5e); width: 20px; text-align: right;
          padding-right: 4px; line-height: 28px;
        }
        .gbe-type-btn {
          font-family: 'JetBrains Mono', monospace; font-size: 9px;
          color: var(--text3, #555a5e); background: transparent;
          border: 1px solid transparent; border-radius: 3px;
          padding: 2px 6px; cursor: pointer; white-space: nowrap;
          line-height: 16px;
        }
        .gbe-type-btn:hover { border-color: var(--border2, #262c30); color: var(--text2, #8a9299); }
        .gbe-content { flex: 1; min-width: 0; padding: 3px 16px 3px 0; }

        /* Editable block base */
        .gbe-editable {
          outline: none; min-height: 22px; line-height: 1.65;
          color: var(--text2, #8a9299); font-size: 13px;
          border-radius: 3px; padding: 0 4px;
          word-break: break-word;
        }
        .gbe-editable:focus { background: var(--inputBg, #1a1d20); }
        .gbe-editable[data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--text3, #555a5e); pointer-events: none;
        }

        /* Heading styles */
        .gbe-h1 { font-size: 20px; font-weight: 700; color: var(--text, #d4d9dd); line-height: 1.4; }
        .gbe-h2 { font-size: 16px; font-weight: 700; color: var(--text, #d4d9dd); line-height: 1.45; }
        .gbe-h3 { font-size: 14px; font-weight: 600; color: var(--text, #d4d9dd); line-height: 1.5; }

        /* List styles */
        .gbe-list { padding-left: 8px; }
        .gbe-list::before { content: '\\2022'; color: var(--text3, #555a5e); margin-right: 8px; }
        .gbe-ordered { padding-left: 8px; }
        .gbe-ordered::before {
          content: attr(data-num) '.';
          color: var(--text3, #555a5e); margin-right: 8px;
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
        }

        /* Divider */
        .gbe-divider {
          border: none; border-top: 1px solid var(--border, #1d2022);
          margin: 8px 4px; width: 100%;
        }

        /* Callout */
        .gbe-callout-wrap {
          border-left: 3px solid var(--accent, #c47c5a);
          background: var(--inputBg, #1a1d20);
          border-radius: 0 4px 4px 0; padding: 8px 12px;
          margin: 2px 4px 2px 0;
        }
        .gbe-callout-wrap.warning { border-left-color: var(--gold, #c4a35a); }
        .gbe-callout-wrap.tip     { border-left-color: var(--green, #70c080); }
        .gbe-callout-wrap.info    { border-left-color: var(--blue, #5a8fc4); }

        /* Code block */
        .gbe-code-wrap {
          position: relative;
          background: var(--cardBg2, #0c0d0e);
          border: 1px solid var(--border2, #262c30);
          border-radius: 6px; margin: 2px 4px 2px 0;
          overflow: hidden;
        }
        .gbe-code-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 4px 8px;
          border-bottom: 1px solid var(--border2, #262c30);
          font-family: 'JetBrains Mono', monospace; font-size: 9px;
          color: var(--text3, #555a5e);
        }
        .gbe-code-copy {
          display: flex; align-items: center; gap: 4px;
          background: transparent; border: none; color: var(--text3, #555a5e);
          cursor: pointer; padding: 2px 6px; border-radius: 3px;
          font-family: 'JetBrains Mono', monospace; font-size: 9px;
        }
        .gbe-code-copy:hover { color: var(--text2, #8a9299); background: var(--border, #1d2022); }
        .gbe-code-body {
          display: flex; overflow-x: auto;
        }
        .gbe-code-lines {
          padding: 10px 0; user-select: none; flex-shrink: 0; min-width: 32px;
          text-align: right; border-right: 1px solid var(--border2, #262c30);
        }
        .gbe-code-linenum {
          display: block; padding: 0 8px;
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
          line-height: 1.6; color: var(--text3, #555a5e);
        }
        .gbe-code-textarea {
          flex: 1; min-width: 0; padding: 10px 12px;
          background: transparent; border: none; outline: none; resize: none;
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
          line-height: 1.6; color: var(--text2, #8a9299);
          white-space: pre; tab-size: 2; overflow: hidden;
        }

        /* Type picker menu */
        .gbe-menu {
          position: absolute; left: 8px; top: 100%; z-index: 100;
          background: var(--cardBg, #141618); border: 1px solid var(--border2, #262c30);
          border-radius: 6px; padding: 4px 0; min-width: 100px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .gbe-menu-item {
          display: block; width: 100%; text-align: left;
          padding: 5px 12px; background: transparent; border: none;
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          color: var(--text2, #8a9299); cursor: pointer;
        }
        .gbe-menu-item:hover { background: var(--inputBg, #1a1d20); color: var(--text, #d4d9dd); }
        .gbe-menu-item.active { color: var(--accent, #c47c5a); }
        .gbe-menu-item.highlight { background: var(--inputBg, #1a1d20) !important; color: var(--text, #d4d9dd) !important; }

        /* Slash command popup */
        .gbe-slash {
          position: absolute; left: 84px; top: 100%; z-index: 100;
          background: var(--cardBg, #141618); border: 1px solid var(--border2, #262c30);
          border-radius: 6px; padding: 4px 0; min-width: 120px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .gbe-slash-label {
          padding: 4px 12px; font-family: 'JetBrains Mono', monospace;
          font-size: 9px; color: var(--text3, #555a5e);
        }
      `}</style>

      {blocks.map((block, idx) => (
        <div key={block.id} id={block.id} className="gbe-row" data-type={block.type}>
          {/* Gutter: line number + type selector */}
          <div className="gbe-gutter">
            <span className="gbe-linenum">{idx + 1}</span>
            {!readOnly && (
              <button
                className="gbe-type-btn"
                onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
                title="change block type"
              >
                {TYPE_LABEL[block.type]}
                {' '}
                <Icon name="chevronDown" size={8} />
              </button>
            )}
          </div>

          {/* Type picker dropdown */}
          {openMenu === idx && (
            <div
              className="gbe-menu"
              ref={menuRef}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMenuActiveIdx(i => Math.min(i + 1, BLOCK_TYPES.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuActiveIdx(i => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (menuActiveIdx >= 0) changeType(idx, BLOCK_TYPES[menuActiveIdx].value); }
                else if (e.key === 'Escape') { setOpenMenu(null); setMenuActiveIdx(-1); }
              }}
            >
              {BLOCK_TYPES.map((t, ti) => (
                <button
                  key={t.value}
                  className={`gbe-menu-item${block.type === t.value ? ' active' : ''}${menuActiveIdx === ti ? ' highlight' : ''}`}
                  onClick={() => changeType(idx, t.value)}
                  onMouseEnter={() => setMenuActiveIdx(ti)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Slash command popup */}
          {slashIdx === idx && (
            <div className="gbe-slash" ref={menuRef}>
              <div className="gbe-slash-label">/{slashFilter || <span style={{ opacity: 0.5 }}>type or ↑↓ to pick</span>}</div>
              {BLOCK_TYPES
                .filter(t => !slashFilter || t.label.includes(slashFilter) || t.value.includes(slashFilter))
                .map((t, ti) => (
                  <button
                    key={t.value}
                    className={`gbe-menu-item${slashActiveIdx === ti ? ' highlight' : ''}`}
                    onClick={() => changeType(idx, t.value)}
                    onMouseEnter={() => setSlashActiveIdx(ti)}
                  >
                    {t.label}
                  </button>
                ))
              }
            </div>
          )}

          {/* Block content */}
          <div className="gbe-content">
            {block.type === 'divider' ? (
              <hr className="gbe-divider" />
            ) : block.type === 'code' ? (
              <CodeBlock
                block={block}
                readOnly={readOnly}
                copiedId={copiedId}
                onCopy={() => copyCode(block)}
                onChange={(content) => updateBlockMeta(idx, { content })}
                onLangChange={(language) => updateBlockMeta(idx, { meta: { ...block.meta, language } })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    if (idx < blocks.length - 1) setFocusIdx(idx + 1);
                    else insertAfter(idx);
                  } else if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    insertAfter(idx);
                  }
                }}
                ref={(el: HTMLTextAreaElement | null) => {
                  if (el) blockRefs.current.set(block.id, el);
                  else blockRefs.current.delete(block.id);
                }}
              />
            ) : block.type === 'callout' ? (
              <div className={`gbe-callout-wrap ${block.meta?.variant ?? 'info'}`}>
                <EditableBlock
                  block={block}
                  className="gbe-editable"
                  placeholder="write a note…"
                  readOnly={readOnly}
                  onContentChange={(text) => updateBlockContent(block.id, text)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  onFocus={() => { setOpenMenu(null); setSlashIdx(null); }}
                  onRef={(el) => {
                    if (el) blockRefs.current.set(block.id, el);
                    else blockRefs.current.delete(block.id);
                  }}
                />
              </div>
            ) : (
              <EditableBlock
                block={block}
                className={`gbe-editable ${
                  block.type === 'h1' ? 'gbe-h1' :
                  block.type === 'h2' ? 'gbe-h2' :
                  block.type === 'h3' ? 'gbe-h3' :
                  block.type === 'list' ? 'gbe-list' :
                  block.type === 'ordered' ? 'gbe-ordered' : ''
                }`}
                placeholder={
                  block.type === 'h1' ? 'heading 1' :
                  block.type === 'h2' ? 'heading 2' :
                  block.type === 'h3' ? 'heading 3' :
                  block.type === 'list' ? 'list item' :
                  block.type === 'ordered' ? 'list item' :
                  "type '/' for commands"
                }
                readOnly={readOnly}
                extraAttrs={block.type === 'ordered' ? { 'data-num': String(ordinalNumber(blocks, idx)) } : undefined}
                onContentChange={(text) => updateBlockContent(block.id, text)}
                onKeyDown={(e) => {
                  if (slashIdx === idx) {
                    handleSlashInput(e, idx);
                  } else {
                    handleKeyDown(e, idx);
                  }
                }}
                onFocus={() => { if (slashIdx !== idx) { setOpenMenu(null); setSlashIdx(null); } }}
                onRef={(el) => {
                  if (el) blockRefs.current.set(block.id, el);
                  else blockRefs.current.delete(block.id);
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Ordered list numbering helper ────────────────────────────────────────────

function ordinalNumber(blocks: GuideBlock[], idx: number): number {
  let num = 1;
  let j = idx - 1;
  while (j >= 0 && blocks[j].type === 'ordered') { num++; j--; }
  return num;
}

// ── Code Block sub-component ─────────────────────────────────────────────────

interface CodeBlockProps {
  block:        GuideBlock;
  readOnly?:    boolean;
  copiedId:     string | null;
  onCopy:       () => void;
  onChange:      (content: string) => void;
  onLangChange: (lang: string) => void;
  onKeyDown:    (e: React.KeyboardEvent) => void;
}

const CodeBlock = forwardRef<HTMLTextAreaElement, CodeBlockProps>(
  function CodeBlock({ block, readOnly, copiedId, onCopy, onChange, onLangChange, onKeyDown }, ref) {
    const lines = block.content.split('\n');
    const lineCount = Math.max(lines.length, 1);

    // Auto-resize textarea
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    function setRefs(el: HTMLTextAreaElement | null) {
      textareaRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }

    useEffect(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = '0';
        ta.style.height = ta.scrollHeight + 'px';
      }
    }, [block.content]);

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      // Tab inserts 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;
        onChange(val.substring(0, start) + '  ' + val.substring(end));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
        return;
      }
      onKeyDown(e);
    }

    return (
      <div className="gbe-code-wrap">
        <div className="gbe-code-header">
          <input
            value={block.meta?.language ?? ''}
            onChange={(e) => onLangChange(e.target.value)}
            placeholder="language"
            readOnly={readOnly}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text3, #555a5e)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              width: 80, padding: 0,
            }}
          />
          <button className="gbe-code-copy" onClick={onCopy} title="copy code">
            <Icon name="copy" size={10} />
            {copiedId === block.id ? 'copied' : 'copy'}
          </button>
        </div>
        <div className="gbe-code-body">
          <div className="gbe-code-lines">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i} className="gbe-code-linenum">{i + 1}</span>
            ))}
          </div>
          <textarea
            ref={setRefs}
            className="gbe-code-textarea"
            value={block.content}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            rows={lineCount}
            spellCheck={false}
          />
        </div>
      </div>
    );
  }
);
