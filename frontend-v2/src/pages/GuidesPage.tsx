/**
 * GuidesPage — three-pane wiki-style documentation editor
 *
 * Left pane  (240px): Manual tree + "Unfiled" section
 * Middle pane (220px): Guide list for selected manual
 * Right pane  (flex 1): Block editor for selected guide
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useSiteStore } from '@/stores/siteStore';
import {
  useGetManuals,
  useCreateManual,
  useUpdateManual,
  useDeleteManual,
  useGetGuides,
  useCreateGuide,
  useUpdateGuide,
  useDeleteGuide,
  useAddGuideLink,
  useDeleteGuideLink,
  type Guide,
  type GuideManual,
  type GuideLink,
} from '@/api/guides';
import { BlockEditor, type GuideBlock } from '@/components/BlockEditor';
import { uid } from '@/utils/uid';

// ── Markdown ↔ Block conversion ───────────────────────────────────────────────

function parseContentToBlocks(content: string): GuideBlock[] {
  if (!content.trim()) {
    return [{ id: uid(), type: 'paragraph', content: '' }];
  }

  const blocks: GuideBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ id: uid(), type: 'code', content: codeLines.join('\n'), language: language || undefined });
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push({ id: uid(), type: 'heading', content: line.slice(4), level: 3 });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ id: uid(), type: 'heading', content: line.slice(3), level: 2 });
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ id: uid(), type: 'heading', content: line.slice(2), level: 1 });
      i++;
      continue;
    }

    // Callout (> prefix)
    if (line.startsWith('> ')) {
      const calloutLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith('> ')) {
        calloutLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ id: uid(), type: 'callout', content: calloutLines.join('\n'), variant: 'info' });
      continue;
    }

    // Bullet list (- or * prefix)
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const listLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        listLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ id: uid(), type: 'list', content: listLines.join('\n') });
      continue;
    }

    // URL JSON block marker
    if (line.startsWith('[url]:')) {
      const json = line.slice(6).trim();
      blocks.push({ id: uid(), type: 'url', content: json });
      i++;
      continue;
    }

    // Blank line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — collect until blank line
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('>') && !lines[i].startsWith('- ') && !lines[i].startsWith('* ')) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ id: uid(), type: 'paragraph', content: paraLines.join('\n') });
  }

  return blocks.length > 0 ? blocks : [{ id: uid(), type: 'paragraph', content: '' }];
}

function serializeBlocksToContent(blocks: GuideBlock[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'heading': {
        const prefix = '#'.repeat(b.level ?? 2);
        return `${prefix} ${b.content}`;
      }
      case 'code': {
        const lang = b.language ?? '';
        return `\`\`\`${lang}\n${b.content}\n\`\`\``;
      }
      case 'callout':
        return b.content.split('\n').map(l => `> ${l}`).join('\n');
      case 'list':
        return b.content.split('\n').filter(Boolean).map(l => `- ${l}`).join('\n');
      case 'url':
        return `[url]: ${b.content}`;
      case 'paragraph':
      default:
        return b.content;
    }
  }).join('\n\n');
}

// ── Entity types ──────────────────────────────────────────────────────────────

const ENTITY_TYPES = ['device', 'pool', 'share', 'subnet', 'host', 'vm', 'app', 'container'] as const;
type EntityType = typeof ENTITY_TYPES[number];

const ENTITY_LABELS: Record<EntityType, string> = {
  device:    'Device',
  pool:      'Pool',
  share:     'Share',
  subnet:    'Subnet',
  host:      'Host',
  vm:        'VM',
  app:       'App',
  container: 'Container',
};

// ── Save state ────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

// ── Main component ────────────────────────────────────────────────────────────

export default function GuidesPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const { data: manuals = [], isLoading: manualsLoading } = useGetManuals(siteId);
  const { data: guides  = [], isLoading: guidesLoading  } = useGetGuides(siteId);

  const createManual = useCreateManual(siteId);
  const updateManual = useUpdateManual(siteId);
  const deleteManual = useDeleteManual(siteId);
  const createGuide  = useCreateGuide(siteId);
  const updateGuide  = useUpdateGuide(siteId);
  const deleteGuide  = useDeleteGuide(siteId);

  // selection
  const [selectedManualId, setSelectedManualId]   = useState<string | null>(null);
  const [selectedGuideId,  setSelectedGuideId]    = useState<string | null>(null);

  // left-pane entity filter
  const [entityFilter, setEntityFilter] = useState<EntityType | null>(null);

  // manual inline rename
  const [renamingManualId, setRenamingManualId] = useState<string | null>(null);
  const [renameValue,      setRenameValue]      = useState('');

  // guide title inline edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue,   setTitleValue]   = useState('');

  // block editor state
  const [blocks,    setBlocks]    = useState<GuideBlock[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // entity tag form
  const [showTagForm,   setShowTagForm]   = useState(false);
  const [tagEntityType, setTagEntityType] = useState<EntityType>('device');
  const [tagEntityId,   setTagEntityId]   = useState('');

  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef     = useRef(blocks);
  const selectedGuide = guides.find(g => g.id === selectedGuideId) ?? null;

  // keep blocksRef in sync
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // when guide selection changes, parse content into blocks
  useEffect(() => {
    if (!selectedGuide) {
      setBlocks([]);
      setEditingTitle(false);
      setTitleValue('');
      setSaveState('idle');
      return;
    }
    setBlocks(parseContentToBlocks(selectedGuide.content));
    setTitleValue(selectedGuide.title);
    setEditingTitle(false);
    setSaveState('idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, [selectedGuide?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered guides for TOC ─────────────────────────────────────────────────
  const filteredGuides = useMemo(() => {
    if (!entityFilter) return guides;
    return guides.filter(g => g.links.some(l => l.entityType === entityFilter));
  }, [guides, entityFilter]);

  const manualGuides = useMemo(() => {
    return filteredGuides.filter(g => g.manualId === selectedManualId);
  }, [filteredGuides, selectedManualId]);

  const unfiledGuides = useMemo(() => {
    return filteredGuides.filter(g => !g.manualId);
  }, [filteredGuides]);

  // ── Autosave on block changes ───────────────────────────────────────────────
  const scheduleAutoSave = useCallback((newBlocks: GuideBlock[]) => {
    if (!selectedGuideId) return;
    setSaveState('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await updateGuide.mutateAsync({
          id:      selectedGuideId,
          content: serializeBlocksToContent(newBlocks),
        });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
      }
    }, 800);
  }, [selectedGuideId, updateGuide]);

  function handleBlocksChange(newBlocks: GuideBlock[]) {
    setBlocks(newBlocks);
    scheduleAutoSave(newBlocks);
  }

  // ── Manual actions ──────────────────────────────────────────────────────────
  async function handleCreateManual() {
    const result = await createManual.mutateAsync({ name: 'New Manual', sort_order: manuals.length });
    setSelectedManualId(result.id);
    setRenamingManualId(result.id);
    setRenameValue('New Manual');
  }

  function startRenameManual(m: GuideManual) {
    setRenamingManualId(m.id);
    setRenameValue(m.name);
  }

  async function commitRenameManual(id: string) {
    const name = renameValue.trim();
    if (name) await updateManual.mutateAsync({ id, name });
    setRenamingManualId(null);
  }

  async function handleDeleteManual(id: string) {
    if (!confirm('Delete this manual? Guides will become unfiled.')) return;
    await deleteManual.mutateAsync(id);
    if (selectedManualId === id) setSelectedManualId(null);
  }

  // ── Guide actions ───────────────────────────────────────────────────────────
  async function handleCreateGuide() {
    const result = await createGuide.mutateAsync({
      title:     'New Guide',
      content:   '',
      manual_id: selectedManualId,
    });
    setSelectedGuideId(result.id);
  }

  async function handleDeleteGuide(id: string) {
    if (!confirm('Delete this guide?')) return;
    await deleteGuide.mutateAsync(id);
    if (selectedGuideId === id) setSelectedGuideId(null);
  }

  // ── Title save ──────────────────────────────────────────────────────────────
  async function handleTitleBlur() {
    setEditingTitle(false);
    if (!selectedGuideId || !titleValue.trim()) return;
    if (titleValue.trim() === selectedGuide?.title) return;
    try {
      await updateGuide.mutateAsync({ id: selectedGuideId, title: titleValue.trim() });
    } catch {
      if (selectedGuide) setTitleValue(selectedGuide.title);
    }
  }

  // ── Manual save button ──────────────────────────────────────────────────────
  async function handleManualSave() {
    if (!selectedGuideId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    try {
      await updateGuide.mutateAsync({
        id:      selectedGuideId,
        content: serializeBlocksToContent(blocksRef.current),
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  }

  // ── Entity tag actions ──────────────────────────────────────────────────────
  const addLink = useAddGuideLink(siteId, selectedGuideId ?? '');
  const deleteLink = useDeleteGuideLink(siteId, selectedGuideId ?? '');

  async function handleAddTag() {
    if (!tagEntityId.trim() || !selectedGuideId) return;
    await addLink.mutateAsync({ entityType: tagEntityType, entityId: tagEntityId.trim() });
    setTagEntityId('');
    setShowTagForm(false);
  }

  async function handleRemoveTag(link: GuideLink) {
    await deleteLink.mutateAsync(link.id);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isLoading = manualsLoading || guidesLoading;

  if (!siteId) {
    return (
      <div style={{ padding: '32px', color: 'var(--color-text-muted, #8a9ba8)', fontSize: '13px' }}>
        No site selected.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .guide-tree-item:hover  { background: var(--color-hover) !important; }
        .guide-toc-item:hover   { background: var(--color-hover) !important; }
        .guide-toc-item.active  { background: var(--color-accent-tint) !important; border-left: 2px solid var(--color-accent) !important; }
        .guide-save-btn:hover   { background: var(--color-accent-dark) !important; }
        .guide-tag-pill         { cursor: default; }
        .guide-del-btn:hover    { color: var(--color-error) !important; }
        .guide-add-btn:hover    { background: var(--color-surface-2) !important; }
        .guide-rename-input:focus { outline: 1px solid var(--color-accent) !important; }
      `}</style>

      {/* Entity filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border, #2e3740)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #8a9ba8)', marginRight: '4px' }}>
          Filter:
        </span>
        <FilterPill label="All" active={entityFilter === null} onClick={() => setEntityFilter(null)} />
        {ENTITY_TYPES.map(et => (
          <FilterPill
            key={et}
            label={ENTITY_LABELS[et]}
            active={entityFilter === et}
            onClick={() => setEntityFilter(prev => prev === et ? null : et)}
          />
        ))}
      </div>

      {/* Three-pane layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left pane: Manual tree ────────────────────────────────────────── */}
        <div style={{
          width: '240px',
          flexShrink: 0,
          borderRight: '1px solid var(--color-border, #2e3740)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--color-border, #2e3740)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted, #8a9ba8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Manuals
            </span>
            <button
              className="guide-add-btn"
              onClick={handleCreateManual}
              title="New manual"
              style={{
                padding: '2px 7px',
                fontSize: '11px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--color-border, #2e3740)',
                background: 'transparent',
                color: 'var(--color-text-muted, #8a9ba8)',
                cursor: 'pointer',
              }}
            >
              + New
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {isLoading && (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-muted, #8a9ba8)' }}>
                Loading…
              </div>
            )}

            {/* Manuals list */}
            {manuals.map(m => (
              <ManualTreeItem
                key={m.id}
                manual={m}
                selected={selectedManualId === m.id}
                renaming={renamingManualId === m.id}
                renameValue={renameValue}
                onSelect={() => { setSelectedManualId(m.id); setSelectedGuideId(null); }}
                onStartRename={() => startRenameManual(m)}
                onRenameChange={setRenameValue}
                onRenameCommit={() => commitRenameManual(m.id)}
                onDelete={() => handleDeleteManual(m.id)}
              />
            ))}

            {/* Unfiled section */}
            <div
              className="guide-tree-item"
              onClick={() => { setSelectedManualId(null); setSelectedGuideId(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                cursor: 'pointer',
                background: selectedManualId === null ? 'var(--color-accent-tint, rgba(196,124,90,0.12))' : 'transparent',
                borderLeft: selectedManualId === null ? '2px solid var(--color-accent, #c47c5a)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #8a9ba8)', fontStyle: 'italic' }}>
                Unfiled ({unfiledGuides.length})
              </span>
            </div>

            {!isLoading && manuals.length === 0 && (
              <div style={{ padding: '16px 12px', fontSize: '12px', color: 'var(--color-text-dim, #5a6570)', lineHeight: 1.5 }}>
                No manuals yet. Create one to organise your guides.
              </div>
            )}
          </div>
        </div>

        {/* ── Middle pane: Guide TOC ────────────────────────────────────────── */}
        <div style={{
          width: '220px',
          flexShrink: 0,
          borderRight: '1px solid var(--color-border, #2e3740)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--color-border, #2e3740)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted, #8a9ba8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {selectedManualId
                ? (manuals.find(m => m.id === selectedManualId)?.name ?? 'Guides')
                : 'Unfiled'}
            </span>
            <button
              className="guide-add-btn"
              onClick={handleCreateGuide}
              title="New guide"
              style={{
                padding: '2px 7px',
                fontSize: '11px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--color-border, #2e3740)',
                background: 'transparent',
                color: 'var(--color-text-muted, #8a9ba8)',
                cursor: 'pointer',
              }}
            >
              + New
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {isLoading && (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-muted, #8a9ba8)' }}>
                Loading…
              </div>
            )}
            {manualGuides.length === 0 && !isLoading && (
              <div style={{ padding: '16px 12px', fontSize: '12px', color: 'var(--color-text-dim, #5a6570)', lineHeight: 1.5 }}>
                No guides here. Press "+ New" to create one.
              </div>
            )}
            {manualGuides.map(g => (
              <GuideTocItem
                key={g.id}
                guide={g}
                active={selectedGuideId === g.id}
                onSelect={() => setSelectedGuideId(g.id)}
                onDelete={() => handleDeleteGuide(g.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Right pane: Guide editor ──────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {!selectedGuide ? (
            <EmptyEditorPane
              onCreateGuide={handleCreateGuide}
              hasManuals={manuals.length > 0}
            />
          ) : (
            <GuideEditor
              guide={selectedGuide}
              siteId={siteId}
              blocks={blocks}
              titleValue={titleValue}
              editingTitle={editingTitle}
              saveState={saveState}
              showTagForm={showTagForm}
              tagEntityType={tagEntityType}
              tagEntityId={tagEntityId}
              onTitleClick={() => { setEditingTitle(true); }}
              onTitleChange={setTitleValue}
              onTitleBlur={handleTitleBlur}
              onTitleKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              onBlocksChange={handleBlocksChange}
              onManualSave={handleManualSave}
              onShowTagForm={() => setShowTagForm(true)}
              onHideTagForm={() => { setShowTagForm(false); setTagEntityId(''); }}
              onTagEntityTypeChange={setTagEntityType}
              onTagEntityIdChange={setTagEntityId}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: active ? 600 : 400,
        borderRadius: '99px',
        border: `1px solid ${active ? 'var(--color-accent, #c47c5a)' : 'var(--color-border, #2e3740)'}`,
        background: active ? 'var(--color-accent-tint, rgba(196,124,90,0.15))' : 'transparent',
        color: active ? 'var(--color-accent, #c47c5a)' : 'var(--color-text-muted, #8a9ba8)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

interface ManualTreeItemProps {
  manual: GuideManual;
  selected: boolean;
  renaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onDelete: () => void;
}

function ManualTreeItem({
  manual,
  selected,
  renaming,
  renameValue,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onDelete,
}: ManualTreeItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="guide-tree-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        cursor: 'pointer',
        background: selected ? 'var(--color-accent-tint, rgba(196,124,90,0.12))' : 'transparent',
        borderLeft: selected ? '2px solid var(--color-accent, #c47c5a)' : '2px solid transparent',
        gap: '4px',
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #8a9ba8)', marginRight: '2px' }}>📁</span>
      {renaming ? (
        <input
          className="guide-rename-input"
          value={renameValue}
          autoFocus
          onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCommit();
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1,
            fontSize: '13px',
            background: 'var(--color-surface-2, #232a30)',
            border: '1px solid var(--color-border, #2e3740)',
            borderRadius: 'var(--radius-sm, 4px)',
            color: 'var(--color-text, #d4d9dd)',
            padding: '1px 5px',
            outline: 'none',
          }}
        />
      ) : (
        <span
          style={{ flex: 1, fontSize: '13px', color: 'var(--color-text, #d4d9dd)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onDoubleClick={e => { e.stopPropagation(); onStartRename(); }}
        >
          {manual.name}
        </span>
      )}
      {hovered && !renaming && (
        <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
          <button
            className="guide-del-btn"
            title="Rename"
            onClick={onStartRename}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted, #8a9ba8)', cursor: 'pointer', fontSize: '11px', padding: '1px 4px' }}
          >
            ✎
          </button>
          <button
            className="guide-del-btn"
            title="Delete manual"
            onClick={onDelete}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted, #8a9ba8)', cursor: 'pointer', fontSize: '12px', padding: '1px 4px' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

interface GuideTocItemProps {
  guide: Guide;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function GuideTocItem({ guide, active, onSelect, onDelete }: GuideTocItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`guide-toc-item${active ? ' active' : ''}`}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '7px 12px',
        cursor: 'pointer',
        borderLeft: active ? '2px solid var(--color-accent, #c47c5a)' : '2px solid transparent',
        gap: '4px',
      }}
    >
      <span style={{
        flex: 1,
        fontSize: '13px',
        color: active ? 'var(--color-text, #d4d9dd)' : 'var(--color-text-muted, #8a9ba8)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {guide.title}
      </span>
      {hovered && (
        <button
          className="guide-del-btn"
          title="Delete guide"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted, #8a9ba8)', cursor: 'pointer', fontSize: '14px', padding: '1px 3px', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface GuideEditorProps {
  guide: Guide;
  siteId: string;
  blocks: GuideBlock[];
  titleValue: string;
  editingTitle: boolean;
  saveState: SaveState;
  showTagForm: boolean;
  tagEntityType: EntityType;
  tagEntityId: string;
  onTitleClick: () => void;
  onTitleChange: (v: string) => void;
  onTitleBlur: () => void;
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlocksChange: (blocks: GuideBlock[]) => void;
  onManualSave: () => void;
  onShowTagForm: () => void;
  onHideTagForm: () => void;
  onTagEntityTypeChange: (v: EntityType) => void;
  onTagEntityIdChange: (v: string) => void;
  onAddTag: () => void;
  onRemoveTag: (link: GuideLink) => void;
}

function GuideEditor({
  guide,
  blocks,
  titleValue,
  editingTitle,
  saveState,
  showTagForm,
  tagEntityType,
  tagEntityId,
  onTitleClick,
  onTitleChange,
  onTitleBlur,
  onTitleKeyDown,
  onBlocksChange,
  onManualSave,
  onShowTagForm,
  onHideTagForm,
  onTagEntityTypeChange,
  onTagEntityIdChange,
  onAddTag,
  onRemoveTag,
}: GuideEditorProps) {
  const saveLabel: Record<SaveState, string> = {
    idle:    'Save',
    pending: 'Save',
    saving:  'Saving…',
    saved:   'Saved ✓',
    error:   'Error — retry',
  };

  const saveColor: Partial<Record<SaveState, string>> = {
    saved:  'var(--color-text-muted, #8a9ba8)',
    error:  'var(--color-error, #e05c5c)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 20px 8px',
        borderBottom: '1px solid var(--color-border, #2e3740)',
        flexShrink: 0,
        gap: '8px',
      }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={e => onTitleChange(e.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={onTitleKeyDown}
            style={{
              flex: 1,
              fontSize: '20px',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--color-accent, #c47c5a)',
              color: 'var(--color-text, #d4d9dd)',
              outline: 'none',
              padding: '2px 0',
            }}
          />
        ) : (
          <h1
            onClick={onTitleClick}
            title="Click to edit title"
            style={{
              flex: 1,
              fontSize: '20px',
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text, #d4d9dd)',
              cursor: 'text',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {guide.title}
          </h1>
        )}
        <button
          className="guide-save-btn"
          onClick={onManualSave}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: 'var(--radius-sm, 4px)',
            border: 'none',
            background: 'var(--color-accent, #c47c5a)',
            color: 'var(--color-accent-text, #fff)',
            cursor: 'pointer',
            ...(saveColor[saveState] ? { background: 'transparent', color: saveColor[saveState] } : {}),
          }}
        >
          {saveLabel[saveState]}
        </button>
      </div>

      {/* Entity tag bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '8px 20px',
        borderBottom: '1px solid var(--color-border, #2e3740)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #8a9ba8)', marginRight: '2px' }}>
          Linked:
        </span>
        {guide.links.map(link => (
          <EntityTagPill key={link.id} link={link} onRemove={() => onRemoveTag(link)} />
        ))}
        {!showTagForm ? (
          <button
            onClick={onShowTagForm}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '99px',
              border: '1px dashed var(--color-border, #2e3740)',
              background: 'transparent',
              color: 'var(--color-text-muted, #8a9ba8)',
              cursor: 'pointer',
            }}
          >
            + Tag
          </button>
        ) : (
          <TagForm
            entityType={tagEntityType}
            entityId={tagEntityId}
            onEntityTypeChange={onTagEntityTypeChange}
            onEntityIdChange={onTagEntityIdChange}
            onAdd={onAddTag}
            onCancel={onHideTagForm}
          />
        )}
      </div>

      {/* Block editor area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <BlockEditor blocks={blocks} onChange={onBlocksChange} />
      </div>
    </div>
  );
}

function EntityTagPill({ link, onRemove }: { link: GuideLink; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="guide-tag-pill"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '99px',
        border: '1px solid var(--color-border, #2e3740)',
        background: 'var(--color-surface-2, #232a30)',
        fontSize: '11px',
        color: 'var(--color-text-muted, #8a9ba8)',
      }}
    >
      <span style={{ color: 'var(--color-accent, #c47c5a)', fontWeight: 600 }}>{link.entityType}</span>
      <span style={{ fontFamily: 'monospace', fontSize: '10px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {link.entityId.slice(0, 8)}…
      </span>
      {hovered && (
        <button
          className="guide-del-btn"
          onClick={onRemove}
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted, #8a9ba8)', cursor: 'pointer', fontSize: '12px', padding: '0 0 0 2px', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface TagFormProps {
  entityType: EntityType;
  entityId: string;
  onEntityTypeChange: (v: EntityType) => void;
  onEntityIdChange: (v: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}

function TagForm({ entityType, entityId, onEntityTypeChange, onEntityIdChange, onAdd, onCancel }: TagFormProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <select
        value={entityType}
        onChange={e => onEntityTypeChange(e.target.value as EntityType)}
        style={{
          padding: '3px 6px',
          fontSize: '11px',
          borderRadius: 'var(--radius-sm, 4px)',
          border: '1px solid var(--color-border, #2e3740)',
          background: 'var(--color-surface-2, #232a30)',
          color: 'var(--color-text, #d4d9dd)',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {ENTITY_TYPES.map(et => (
          <option key={et} value={et}>{ENTITY_LABELS[et]}</option>
        ))}
      </select>
      <input
        placeholder="Entity UUID…"
        value={entityId}
        onChange={e => onEntityIdChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel(); }}
        autoFocus
        style={{
          padding: '3px 8px',
          fontSize: '11px',
          borderRadius: 'var(--radius-sm, 4px)',
          border: '1px solid var(--color-border, #2e3740)',
          background: 'var(--color-surface-2, #232a30)',
          color: 'var(--color-text, #d4d9dd)',
          outline: 'none',
          width: '200px',
        }}
      />
      <button
        onClick={onAdd}
        style={{
          padding: '3px 8px',
          fontSize: '11px',
          borderRadius: 'var(--radius-sm, 4px)',
          border: 'none',
          background: 'var(--color-accent, #c47c5a)',
          color: 'var(--color-accent-text, #fff)',
          cursor: 'pointer',
        }}
      >
        Add
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '3px 8px',
          fontSize: '11px',
          borderRadius: 'var(--radius-sm, 4px)',
          border: '1px solid var(--color-border, #2e3740)',
          background: 'transparent',
          color: 'var(--color-text-muted, #8a9ba8)',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function EmptyEditorPane({ onCreateGuide, hasManuals }: { onCreateGuide: () => void; hasManuals: boolean }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      color: 'var(--color-text-muted, #8a9ba8)',
    }}>
      <div style={{ fontSize: '36px', opacity: 0.3 }}>📄</div>
      <p style={{ fontSize: '14px', margin: 0 }}>
        {hasManuals ? 'Select a guide to start editing' : 'Create a manual and guide to get started'}
      </p>
      <button
        onClick={onCreateGuide}
        style={{
          padding: '7px 16px',
          fontSize: '13px',
          fontWeight: 500,
          borderRadius: 'var(--radius-md, 6px)',
          border: 'none',
          background: 'var(--color-accent, #c47c5a)',
          color: 'var(--color-accent-text, #fff)',
          cursor: 'pointer',
        }}
      >
        + New Guide
      </button>
    </div>
  );
}
