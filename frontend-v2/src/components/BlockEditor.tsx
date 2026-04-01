/**
 * BlockEditor — reusable block-based content editor
 *
 * Block types: heading | paragraph | code | callout | list | url
 * Enter = newline within block; Shift+Enter = new paragraph block below
 * Up/down arrow buttons reorder blocks.
 * Code blocks have click-to-copy.
 * Callout blocks have info | warning | tip variants.
 * URL blocks store { text, href } serialised as JSON internally.
 */

import React, { useRef, useCallback } from 'react';
import { uid } from '@/utils/uid';
import { sanitizeUrl } from '@/utils/sanitize';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockType = 'heading' | 'paragraph' | 'code' | 'callout' | 'list' | 'url';
export type CalloutVariant = 'info' | 'warning' | 'tip';
export type HeadingLevel = 1 | 2 | 3;

export interface GuideBlock {
  id: string;
  type: BlockType;
  content: string;
  level?: HeadingLevel;
  variant?: CalloutVariant;
  language?: string;
}

interface BlockEditorProps {
  blocks: GuideBlock[];
  onChange: (blocks: GuideBlock[]) => void;
  readOnly?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function newBlock(type: BlockType = 'paragraph'): GuideBlock {
  return { id: uid(), type, content: '' };
}

function countLines(text: string): number {
  return Math.max(1, (text.match(/\n/g) ?? []).length + 1);
}

// ── URL block internals ───────────────────────────────────────────────────────

interface UrlPayload { text: string; href: string }

function parseUrl(content: string): UrlPayload {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      return {
        text: typeof p.text === 'string' ? p.text : '',
        href: typeof p.href === 'string' ? p.href : '',
      };
    }
  } catch {
    // fall through
  }
  return { text: '', href: '' };
}

function serializeUrl(payload: UrlPayload): string {
  return JSON.stringify(payload);
}

// ── Style constants ───────────────────────────────────────────────────────────

const S = {
  blockWrap: (focused: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md, 6px)',
    border: `1px solid ${focused ? 'var(--color-accent, #c47c5a)' : 'transparent'}`,
    background: 'var(--color-surface, #1a1f24)',
    position: 'relative',
  }),
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap' as const,
  },
  typeBtn: (active: boolean): React.CSSProperties => ({
    padding: '2px 7px',
    fontSize: '10px',
    fontWeight: 600,
    borderRadius: 'var(--radius-sm, 4px)',
    border: `1px solid ${active ? 'var(--color-accent, #c47c5a)' : 'var(--color-border, #2e3740)'}`,
    background: active ? 'var(--color-accent-tint, rgba(196,124,90,0.15))' : 'transparent',
    color: active ? 'var(--color-accent, #c47c5a)' : 'var(--color-text-muted, #8a9ba8)',
    cursor: 'pointer',
  }),
  smallBtn: (danger?: boolean): React.CSSProperties => ({
    padding: '2px 6px',
    fontSize: '11px',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--color-border, #2e3740)',
    background: 'transparent',
    color: danger ? 'var(--color-error, #e05c5c)' : 'var(--color-text-muted, #8a9ba8)',
    cursor: 'pointer',
  }),
  textarea: (rows: number): React.CSSProperties => ({
    width: '100%',
    minHeight: `${rows * 22}px`,
    padding: '6px 8px',
    fontSize: '13px',
    fontFamily: 'inherit',
    lineHeight: '1.6',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--color-border, #2e3740)',
    background: 'var(--color-surface-2, #232a30)',
    color: 'var(--color-text, #d4d9dd)',
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
  }),
  codeTextarea: (rows: number): React.CSSProperties => ({
    width: '100%',
    minHeight: `${rows * 20}px`,
    padding: '8px 10px',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: '1.5',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--color-border, #2e3740)',
    background: '#0d1117',
    color: '#c9d1d9',
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
    tabSize: 2,
  }),
  calloutWrap: (variant: CalloutVariant): React.CSSProperties => ({
    borderLeft: `3px solid ${variant === 'info' ? '#4a9eff' : variant === 'warning' ? '#f0a030' : '#4caf50'}`,
    background: variant === 'info'
      ? 'rgba(74,158,255,0.07)'
      : variant === 'warning'
        ? 'rgba(240,160,48,0.07)'
        : 'rgba(76,175,80,0.07)',
    borderRadius: '0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0',
    padding: '4px 0',
  }),
  input: {
    padding: '4px 8px',
    fontSize: '12px',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--color-border, #2e3740)',
    background: 'var(--color-surface-2, #232a30)',
    color: 'var(--color-text, #d4d9dd)',
    outline: 'none',
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #8a9ba8)',
    marginBottom: '2px',
    display: 'block',
  } as React.CSSProperties,
};

// ── Block types toolbar ───────────────────────────────────────────────────────

const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: 'paragraph', label: '¶' },
  { type: 'heading',   label: 'H' },
  { type: 'code',      label: '</>' },
  { type: 'callout',   label: '!' },
  { type: 'list',      label: '•' },
  { type: 'url',       label: '🔗' },
];

// ── Individual block renderer ─────────────────────────────────────────────────

interface BlockProps {
  block: GuideBlock;
  index: number;
  total: number;
  focused: boolean;
  readOnly: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (updated: GuideBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAfter: (type?: BlockType) => void;
}

function BlockItem({
  block,
  index,
  total,
  focused,
  readOnly,
  onFocus,
  onBlur,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddAfter,
}: BlockProps) {
  const [copied, setCopied] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const set = useCallback(<K extends keyof GuideBlock>(k: K, v: GuideBlock[K]) => {
    onChange({ ...block, [k]: v });
  }, [block, onChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onAddAfter('paragraph');
    }
    // plain Enter: allow default (newline within textarea)
  }

  function handleCopy() {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const rows = countLines(block.content);

  // ── URL block ──────────────────────────────────────────────────────────────
  if (block.type === 'url') {
    const url = parseUrl(block.content);
    return (
      <div style={S.blockWrap(focused)} onFocus={onFocus} onBlur={onBlur}>
        {!readOnly && (
          <BlockToolbar
            block={block}
            index={index}
            total={total}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <span style={S.label}>Link text</span>
            {readOnly ? (
              <a
                href={sanitizeUrl(url.href)}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--color-accent, #c47c5a)', fontSize: '13px' }}
              >
                {url.text || url.href}
              </a>
            ) : (
              <input
                style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
                value={url.text}
                placeholder="Link text"
                onChange={e => set('content', serializeUrl({ ...url, text: e.target.value }))}
              />
            )}
          </div>
          {!readOnly && (
            <div style={{ flex: 2, minWidth: '200px' }}>
              <span style={S.label}>URL</span>
              <input
                style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
                value={url.href}
                placeholder="https://…"
                onChange={e => set('content', serializeUrl({ ...url, href: e.target.value }))}
              />
            </div>
          )}
        </div>
        {readOnly && url.href && (
          <div style={{ fontSize: '11px', color: 'var(--color-text-dim, #5a6570)', marginTop: '2px' }}>
            {sanitizeUrl(url.href)}
          </div>
        )}
      </div>
    );
  }

  // ── Code block ─────────────────────────────────────────────────────────────
  if (block.type === 'code') {
    return (
      <div style={S.blockWrap(focused)} onFocus={onFocus} onBlur={onBlur}>
        {!readOnly && (
          <BlockToolbar
            block={block}
            index={index}
            total={total}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          {!readOnly && (
            <input
              style={{ ...S.input, width: '120px' }}
              value={block.language ?? ''}
              placeholder="Language (bash, js…)"
              onChange={e => set('language', e.target.value)}
            />
          )}
          {block.language && (
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #8a9ba8)' }}>
              {block.language}
            </span>
          )}
          <button style={{ ...S.smallBtn(), marginLeft: 'auto' }} onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        {readOnly ? (
          <pre style={{
            ...S.codeTextarea(rows),
            overflow: 'auto',
            whiteSpace: 'pre',
            margin: 0,
          }}>
            {block.content}
          </pre>
        ) : (
          <textarea
            ref={textareaRef}
            style={S.codeTextarea(rows)}
            value={block.content}
            rows={Math.max(3, rows)}
            onChange={e => set('content', e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        )}
      </div>
    );
  }

  // ── Callout block ──────────────────────────────────────────────────────────
  if (block.type === 'callout') {
    const variant: CalloutVariant = block.variant ?? 'info';
    const variantLabel = { info: 'ℹ Info', warning: '⚠ Warning', tip: '✓ Tip' };
    return (
      <div style={S.blockWrap(focused)} onFocus={onFocus} onBlur={onBlur}>
        {!readOnly && (
          <BlockToolbar
            block={block}
            index={index}
            total={total}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            {(['info', 'warning', 'tip'] as CalloutVariant[]).map(v => (
              <button
                key={v}
                style={S.typeBtn(variant === v)}
                onClick={() => set('variant', v)}
              >
                {variantLabel[v]}
              </button>
            ))}
          </div>
        )}
        <div style={S.calloutWrap(variant)}>
          {readOnly ? (
            <p style={{
              margin: '0',
              padding: '4px 10px',
              fontSize: '13px',
              color: 'var(--color-text, #d4d9dd)',
              whiteSpace: 'pre-wrap',
            }}>
              {block.content}
            </p>
          ) : (
            <textarea
              ref={textareaRef}
              style={{ ...S.textarea(rows), background: 'transparent', border: 'none' }}
              value={block.content}
              rows={Math.max(2, rows)}
              placeholder="Callout text…"
              onChange={e => set('content', e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Heading block ──────────────────────────────────────────────────────────
  if (block.type === 'heading') {
    const level: HeadingLevel = block.level ?? 2;
    const headingStyles: Record<HeadingLevel, React.CSSProperties> = {
      1: { fontSize: '22px', fontWeight: 700, color: 'var(--color-text, #d4d9dd)', margin: 0 },
      2: { fontSize: '17px', fontWeight: 600, color: 'var(--color-text, #d4d9dd)', margin: 0 },
      3: { fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted, #8a9ba8)', margin: 0 },
    };
    return (
      <div style={S.blockWrap(focused)} onFocus={onFocus} onBlur={onBlur}>
        {!readOnly && (
          <BlockToolbar
            block={block}
            index={index}
            total={total}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            {([1, 2, 3] as HeadingLevel[]).map(l => (
              <button
                key={l}
                style={S.typeBtn(level === l)}
                onClick={() => set('level', l)}
              >
                H{l}
              </button>
            ))}
          </div>
        )}
        {readOnly ? (
          React.createElement(
            `h${level}` as 'h1' | 'h2' | 'h3',
            { style: headingStyles[level] },
            block.content
          )
        ) : (
          <input
            style={{
              ...headingStyles[level],
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--color-border, #2e3740)',
              outline: 'none',
              width: '100%',
              padding: '2px 0',
            }}
            value={block.content}
            placeholder={`Heading ${level}`}
            onChange={e => set('content', e.target.value)}
          />
        )}
      </div>
    );
  }

  // ── List block ─────────────────────────────────────────────────────────────
  if (block.type === 'list') {
    return (
      <div style={S.blockWrap(focused)} onFocus={onFocus} onBlur={onBlur}>
        {!readOnly && (
          <BlockToolbar
            block={block}
            index={index}
            total={total}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
        {readOnly ? (
          <ul style={{ margin: '0', paddingLeft: '20px', color: 'var(--color-text, #d4d9dd)', fontSize: '13px' }}>
            {block.content.split('\n').filter(Boolean).map((line, i) => (
              <li key={i} style={{ lineHeight: '1.7' }}>{line}</li>
            ))}
          </ul>
        ) : (
          <textarea
            ref={textareaRef}
            style={S.textarea(rows)}
            value={block.content}
            rows={Math.max(3, rows)}
            placeholder="One bullet per line…"
            onChange={e => set('content', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>
    );
  }

  // ── Paragraph block (default) ──────────────────────────────────────────────
  return (
    <div style={S.blockWrap(focused)} onFocus={onFocus} onBlur={onBlur}>
      {!readOnly && (
        <BlockToolbar
          block={block}
          index={index}
          total={total}
          onChange={onChange}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}
      {readOnly ? (
        <p style={{
          margin: 0,
          fontSize: '13px',
          lineHeight: '1.7',
          color: 'var(--color-text, #d4d9dd)',
          whiteSpace: 'pre-wrap',
        }}>
          {block.content}
        </p>
      ) : (
        <textarea
          ref={textareaRef}
          style={S.textarea(rows)}
          value={block.content}
          rows={Math.max(2, rows)}
          placeholder="Write something…"
          onChange={e => set('content', e.target.value)}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
}

// ── Block toolbar (type selector + move/delete buttons) ───────────────────────

interface BlockToolbarProps {
  block: GuideBlock;
  index: number;
  total: number;
  onChange: (updated: GuideBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BlockToolbar({ block, index, total, onChange, onDelete, onMoveUp, onMoveDown }: BlockToolbarProps) {
  return (
    <div style={{ ...S.toolbar, marginBottom: '4px' }}>
      {BLOCK_TYPES.map(({ type, label }) => (
        <button
          key={type}
          style={S.typeBtn(block.type === type)}
          title={type}
          onClick={() => onChange({ ...block, type, level: type === 'heading' ? (block.level ?? 2) : undefined, variant: type === 'callout' ? (block.variant ?? 'info') : undefined })}
        >
          {label}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      <button
        style={{ ...S.smallBtn(), opacity: index === 0 ? 0.3 : 1 }}
        disabled={index === 0}
        title="Move up"
        onClick={onMoveUp}
      >
        ↑
      </button>
      <button
        style={{ ...S.smallBtn(), opacity: index === total - 1 ? 0.3 : 1 }}
        disabled={index === total - 1}
        title="Move down"
        onClick={onMoveDown}
      >
        ↓
      </button>
      <button style={S.smallBtn(true)} title="Delete block" onClick={onDelete}>
        ×
      </button>
    </div>
  );
}

// ── Add Block dropdown ────────────────────────────────────────────────────────

const ADD_BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'heading',   label: 'Heading' },
  { type: 'code',      label: 'Code block' },
  { type: 'callout',   label: 'Callout' },
  { type: 'list',      label: 'Bullet list' },
  { type: 'url',       label: 'URL / Link' },
];

interface AddBlockButtonProps {
  onAdd: (type: BlockType) => void;
}

function AddBlockButton({ onAdd }: AddBlockButtonProps) {
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 14px',
          fontSize: '12px',
          fontWeight: 500,
          borderRadius: 'var(--radius-sm, 4px)',
          border: '1px dashed var(--color-border, #2e3740)',
          background: 'transparent',
          color: 'var(--color-text-muted, #8a9ba8)',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        + Add Block
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          zIndex: 200,
          background: 'var(--color-surface, #1a1f24)',
          border: '1px solid var(--color-border, #2e3740)',
          borderRadius: 'var(--radius-md, 6px)',
          minWidth: '160px',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {ADD_BLOCK_TYPES.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => { onAdd(type); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: '13px',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text, #d4d9dd)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-hover, #232a30)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main BlockEditor ──────────────────────────────────────────────────────────

export function BlockEditor({ blocks, onChange, readOnly = false }: BlockEditorProps) {
  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  function update(index: number, updated: GuideBlock) {
    const next = [...blocks];
    next[index] = updated;
    onChange(next);
  }

  function deleteBlock(index: number) {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [newBlock('paragraph')]);
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...blocks];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index === blocks.length - 1) return;
    const next = [...blocks];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function addAfter(index: number, type: BlockType = 'paragraph') {
    const nb = newBlock(type);
    const next = [...blocks];
    next.splice(index + 1, 0, nb);
    onChange(next);
    // schedule focus on new block
    setTimeout(() => setFocusedId(nb.id), 0);
  }

  function addBlock(type: BlockType) {
    const nb = newBlock(type);
    onChange([...blocks, nb]);
    setTimeout(() => setFocusedId(nb.id), 0);
  }

  const displayBlocks = blocks.length > 0 ? blocks : [newBlock('paragraph')];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {displayBlocks.map((block, i) => (
        <BlockItem
          key={block.id}
          block={block}
          index={i}
          total={displayBlocks.length}
          focused={focusedId === block.id}
          readOnly={readOnly}
          onFocus={() => setFocusedId(block.id)}
          onBlur={() => setFocusedId(null)}
          onChange={updated => update(i, updated)}
          onDelete={() => deleteBlock(i)}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
          onAddAfter={type => addAfter(i, type)}
        />
      ))}
      {!readOnly && (
        <div style={{ marginTop: '4px' }}>
          <AddBlockButton onAdd={addBlock} />
        </div>
      )}
    </div>
  );
}

export default BlockEditor;
