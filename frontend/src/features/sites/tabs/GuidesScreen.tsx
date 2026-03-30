import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState }    from '../../../components/ui/EmptyState';
import { Icon }          from '../../../components/ui/Icon';
import { useCan }        from '../../../utils/can';
import { useAuthStore }  from '../../../store/useAuthStore';
import { api }           from '../../../utils/api';
import { GuideBlockEditor } from './guides/GuideBlockEditor';
import { LinkedToBar }      from './guides/LinkedToBar';
import { parseMarkdownToBlocks, serializeBlocksToMarkdown } from '@werkstack/shared';
import type { SiteCtx }  from '../../SiteShell';
import type { Guide, GuideBlock, GuideManual, GuideLink } from '@werkstack/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManualNode { manual: GuideManual; children: ManualNode[] }

// ── GuidesScreen ──────────────────────────────────────────────────────────────

export function GuidesScreen() {
  const { accent, css }    = useOutletContext<SiteCtx>();
  const { siteId }         = useParams<{ siteId: string }>();
  const [searchParams]     = useSearchParams();
  const user               = useAuthStore(s => s.user);
  const av = { '--accent': accent } as React.CSSProperties;
  const { can } = useCan();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [guides,   setGuides]   = useState<Guide[]>([]);
  const [manuals,  setManuals]  = useState<GuideManual[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');

  // ── Editor ──────────────────────────────────────────────────────────────────
  const [activeId,  setActiveId]  = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [blocks,    setBlocks]    = useState<GuideBlock[]>([]);
  const [dirty,     setDirty]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState('');
  const [deleting,  setDeleting]  = useState(false);
  const [links,     setLinks]     = useState<GuideLink[]>([]);

  // ── Manual management ───────────────────────────────────────────────────────
  const [expandedManuals,  setExpandedManuals]  = useState<Set<string>>(new Set());
  const [renamingId,       setRenamingId]       = useState<string | null>(null);
  const [renameValue,      setRenameValue]      = useState('');
  const [newManualBusy,    setNewManualBusy]    = useState(false);

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  const [dupMenuOpen, setDupMenuOpen] = useState(false);
  const [lockBusy,    setLockBusy]    = useState(false);

  // ── TOC ─────────────────────────────────────────────────────────────────────
  const [tocActiveId, setTocActiveId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const canWrite  = can('guide', 'write');
  const canDelete = can('guide', 'delete');
  const isAdmin   = user?.role === 'admin' || user?.role === 'owner';

  const activeGuide = guides.find(g => g.id === activeId) ?? null;
  const tocBlocks   = blocks.filter(b => b.type === 'h1' || b.type === 'h2' || b.type === 'h3');

  // Guides grouped: manualId → guides[]
  const guidesByManual: Record<string, Guide[]> = {};
  const uncategorized: Guide[] = [];
  for (const g of guides) {
    if (g.manualId) {
      if (!guidesByManual[g.manualId]) guidesByManual[g.manualId] = [];
      guidesByManual[g.manualId].push(g);
    } else {
      uncategorized.push(g);
    }
  }

  // Build manual tree (top-level = parentId null, children nested under parent)
  const manualById = new Map(manuals.map(m => [m.id, { manual: m, children: [] as ManualNode[] }]));
  const manualRoots: ManualNode[] = [];
  for (const node of manualById.values()) {
    const pid = node.manual.parentId;
    if (pid && manualById.has(pid)) manualById.get(pid)!.children.push(node);
    else manualRoots.push(node);
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const [gs, ms] = await Promise.all([
        api.get<Guide[]>(`/api/sites/${siteId}/guides`),
        api.get<GuideManual[]>(`/api/sites/${siteId}/guide-manuals`),
      ]);
      setGuides(gs ?? []);
      setManuals(ms ?? []);
      // Expand all manuals by default
      setExpandedManuals(new Set((ms ?? []).map(m => m.id)));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  // Open guide from URL param ?guideId=xxx (e.g. from global search)
  useEffect(() => {
    const paramId = searchParams.get('guideId');
    if (paramId && guides.length > 0 && !activeId) {
      const g = guides.find(g => g.id === paramId);
      if (g) openGuide(g);
    }
  }, [guides.length]);  // eslint-disable-line

  // ── TOC IntersectionObserver ────────────────────────────────────────────────

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || tocBlocks.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setTocActiveId(visible[0].target.id);
      },
      { root: container, rootMargin: '0px 0px -75% 0px', threshold: 0 }
    );

    for (const block of tocBlocks) {
      const el = document.getElementById(block.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [activeId, tocBlocks.length]);

  // ── Guide actions ───────────────────────────────────────────────────────────

  function openGuide(g: Guide) {
    setActiveId(g.id);
    setEditTitle(g.title);
    setBlocks(parseMarkdownToBlocks(g.content));
    setLinks(g.links ?? []);
    setDirty(false);
    setSaveErr('');
    setTocActiveId(null);
    setDupMenuOpen(false);
    // Auto-expand the manual containing this guide
    if (g.manualId) {
      setExpandedManuals(prev => new Set([...prev, g.manualId!]));
    }
  }

  async function createGuide(manualId?: string | null) {
    if (!siteId) return;
    setSaving(true);
    try {
      const created = await api.post<Guide>(`/api/sites/${siteId}/guides`, {
        title:     'new guide',
        content:   '',
        manual_id: manualId ?? null,
      });
      setGuides(prev => [created!, ...prev]);
      openGuide(created!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to create guide');
    } finally {
      setSaving(false);
    }
  }

  async function saveGuide() {
    if (!activeId || !siteId) return;
    if (!editTitle.trim()) { setSaveErr('title is required'); return; }
    setSaving(true);
    setSaveErr('');
    try {
      const content = serializeBlocksToMarkdown(blocks);
      const updated = await api.patch<Guide>(
        `/api/sites/${siteId}/guides/${activeId}`,
        { title: editTitle.trim(), content }
      );
      setGuides(prev => prev.map(g => g.id === activeId ? { ...updated!, links: links } : g));
      setDirty(false);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteGuide() {
    if (!activeId || !siteId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/sites/${siteId}/guides/${activeId}`);
      setGuides(prev => prev.filter(g => g.id !== activeId));
      setActiveId(null);
      setEditTitle('');
      setBlocks([]);
      setLinks([]);
      setDirty(false);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  async function duplicateGuide(mode: 'full' | 'headers_only') {
    if (!activeId || !siteId) return;
    setDupMenuOpen(false);
    try {
      const dup = await api.post<Guide>(
        `/api/sites/${siteId}/guides/${activeId}/duplicate`,
        { mode }
      );
      setGuides(prev => [dup!, ...prev]);
      openGuide(dup!);
    } catch { /* ignore */ }
  }

  async function toggleLock() {
    if (!activeId || !siteId || !activeGuide) return;
    setLockBusy(true);
    try {
      const updated = await api.patch<Guide>(
        `/api/sites/${siteId}/guides/${activeId}/lock`,
        { is_locked: !activeGuide.isLocked }
      );
      setGuides(prev => prev.map(g => g.id === activeId ? { ...updated!, links } : g));
    } catch { /* ignore */ } finally {
      setLockBusy(false);
    }
  }

  function exportMd() {
    if (!activeGuide) return;
    const content = serializeBlocksToMarkdown(blocks);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${activeGuide.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBlocksChange(next: GuideBlock[]) {
    setBlocks(next);
    setDirty(true);
  }

  function scrollToBlock(blockId: string) {
    const el = document.getElementById(blockId);
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── Manual actions ──────────────────────────────────────────────────────────

  function toggleManual(id: string) {
    setExpandedManuals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function startRename(manual: GuideManual) {
    setRenamingId(manual.id);
    setRenameValue(manual.name);
  }

  async function commitRename(id: string) {
    if (!siteId || !renameValue.trim()) { setRenamingId(null); return; }
    try {
      const updated = await api.patch<GuideManual>(
        `/api/sites/${siteId}/guide-manuals/${id}`,
        { name: renameValue.trim() }
      );
      setManuals(prev => prev.map(m => m.id === id ? updated! : m));
    } catch { /* ignore */ }
    setRenamingId(null);
  }

  async function createManual() {
    if (!siteId) return;
    setNewManualBusy(true);
    try {
      const created = await api.post<GuideManual>(
        `/api/sites/${siteId}/guide-manuals`,
        { name: 'new manual', sort_order: manuals.length }
      );
      setManuals(prev => [...prev, created!]);
      setExpandedManuals(prev => new Set([...prev, created!.id]));
      // Start renaming immediately
      setRenamingId(created!.id);
      setRenameValue('new manual');
    } catch { /* ignore */ } finally {
      setNewManualBusy(false);
    }
  }

  async function deleteManual(id: string) {
    if (!siteId) return;
    try {
      await api.delete(`/api/sites/${siteId}/guide-manuals/${id}`);
      setManuals(prev => prev.filter(m => m.id !== id));
      // Guides in this manual become uncategorized (ON DELETE SET NULL on backend)
      setGuides(prev => prev.map(g => g.manualId === id ? { ...g, manualId: null } : g));
    } catch { /* ignore */ }
  }

  async function createSubManual(parentId: string) {
    if (!siteId) return;
    setNewManualBusy(true);
    try {
      const created = await api.post<GuideManual>(
        `/api/sites/${siteId}/guide-manuals`,
        { name: 'new section', sort_order: manuals.length, parent_id: parentId }
      );
      setManuals(prev => [...prev, created!]);
      setExpandedManuals(prev => new Set([...prev, created!.id, parentId]));
      setRenamingId(created!.id);
      setRenameValue('new section');
    } catch { /* ignore */ } finally {
      setNewManualBusy(false);
    }
  }

  // ── Read-only detection ─────────────────────────────────────────────────────
  const isReadOnly = !canWrite || (!!activeGuide?.isLocked && !isAdmin);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .gs-act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .gs-btn-ghost:hover  { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .gs-guide-item:hover { background: var(--border, #1d2022) !important; }
        .gs-guide-item.active { background: var(--inputBg, #1a1d20) !important; color: var(--accent, #c47c5a) !important; box-shadow: inset 2px 0 0 var(--accent, #c47c5a); }
        .gs-manual-hdr:hover .gs-manual-actions { opacity: 1 !important; }
        .gs-del-btn:hover { color: var(--red, #c07070) !important; }
        .gs-toc-item:hover { color: var(--text, #d4d9dd) !important; background: var(--border, #1d2022) !important; }
        .gs-toc-item.active { color: var(--accent, #c47c5a) !important; }
        .gs-dup-item:hover { background: var(--inputBg, #1a1d20) !important; }
      `}</style>

      {/* ═══ LEFT PANE — guide list ═════════════════════════════════════════════ */}
      <div style={{
        width:         220,
        flexShrink:    0,
        borderRight:   '1px solid var(--border, #1d2022)',
        display:       'flex',
        flexDirection: 'column',
        overflowY:     'auto',
      }}>
        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 12px',
          height:         38,
          borderBottom:   '1px solid var(--border, #1d2022)',
          flexShrink:     0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            fontWeight: 700, color: 'var(--text2, #8a9299)',
          }}>guides</span>
          {canWrite && (
            <button
              className="gs-btn-ghost"
              onClick={() => createGuide(null)}
              disabled={saving}
              title="new uncategorized guide"
              style={{ padding: '2px 6px', borderRadius: 4 }}
            >
              <Icon name="plus" size={12} />
            </button>
          )}
        </div>

        {err && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--red)', padding: '8px 12px',
          }}>{err}</div>
        )}

        {loading ? (
          <div style={{ padding: '16px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
            loading…
          </div>
        ) : (
          <>
            {/* Manual sections (recursive tree) */}
            {manualRoots.map(node => (
              <ManualSection
                key={node.manual.id}
                node={node}
                depth={0}
                expandedManuals={expandedManuals}
                renamingId={renamingId}
                renameValue={renameValue}
                activeId={activeId}
                guidesByManual={guidesByManual}
                canWrite={canWrite}
                onToggle={toggleManual}
                onStartRename={startRename}
                onRenameChange={setRenameValue}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingId(null)}
                onCreateGuide={createGuide}
                onCreateSubManual={createSubManual}
                onDeleteManual={deleteManual}
                onOpenGuide={openGuide}
              />
            ))}

            {/* Uncategorized section */}
            {uncategorized.length > 0 && (
              <div>
                <div style={{ padding: '8px 12px 4px', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--text3, #555a5e)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  uncategorized
                </div>
                {uncategorized.map(g => (
                  <GuideListItem key={g.id} guide={g} activeId={activeId} onOpen={openGuide} />
                ))}
              </div>
            )}

            {/* Empty total state */}
            {guides.length === 0 && manuals.length === 0 && (
              <div style={{ padding: '16px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
                no guides yet
                {canWrite && (
                  <button className="gs-btn-ghost" onClick={() => createGuide(null)} style={{ display: 'block', marginTop: 8, fontSize: 10, padding: '3px 8px' }}>
                    + new guide
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer: new manual button */}
        {canWrite && !loading && (
          <button
            className="gs-btn-ghost"
            onClick={createManual}
            disabled={newManualBusy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              margin: '8px 10px', padding: '5px 8px', borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--text3, #555a5e)',
            }}
          >
            <Icon name="plus" size={10} /> new manual
          </button>
        )}
      </div>

      {/* ═══ MIDDLE PANE — TOC ══════════════════════════════════════════════════ */}
      <div style={{
        width:         160,
        flexShrink:    0,
        borderRight:   '1px solid var(--border, #1d2022)',
        display:       'flex',
        flexDirection: 'column',
        overflowY:     'auto',
      }}>
        <div style={{
          display:      'flex',
          alignItems:   'center',
          height:       38,
          padding:      '0 12px',
          borderBottom: '1px solid var(--border, #1d2022)',
          flexShrink:   0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            fontWeight: 700, color: 'var(--text3, #555a5e)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>sections</span>
        </div>

        {activeId === null ? (
          <div style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #555a5e)', fontStyle: 'italic' }}>
            open a guide
          </div>
        ) : tocBlocks.length === 0 ? (
          <div style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #555a5e)', fontStyle: 'italic' }}>
            no headings yet
          </div>
        ) : (
          tocBlocks.map(block => (
            <button
              key={block.id}
              className={`gs-toc-item${tocActiveId === block.id ? ' active' : ''}`}
              onClick={() => scrollToBlock(block.id)}
              style={{
                display:    'block',
                width:      '100%',
                textAlign:  'left',
                background: 'transparent',
                border:     'none',
                cursor:     'pointer',
                padding:    '5px 12px 5px ' + (block.type === 'h3' ? '22px' : block.type === 'h2' ? '16px' : '12px'),
                fontFamily: "'JetBrains Mono', monospace",
                fontSize:   block.type === 'h1' ? 11 : 10,
                fontWeight: block.type === 'h1' ? 700 : block.type === 'h2' ? 600 : 400,
                color:      tocActiveId === block.id ? 'var(--accent, #c47c5a)' : 'var(--text3, #555a5e)',
                overflow:   'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={block.content}
            >
              {block.content || '(untitled)'}
            </button>
          ))
        )}
      </div>

      {/* ═══ RIGHT PANE — editor ════════════════════════════════════════════════ */}
      {activeId === null ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            icon="book"
            title="select a guide to edit"
            action={canWrite ? (
              <button className="gs-btn-ghost" onClick={() => createGuide(null)} style={{ fontSize: 11, padding: '5px 14px' }}>
                new guide
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* ── Toolbar ──────────────────────────────────────────────────── */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '0 16px',
            height:       38,
            borderBottom: '1px solid var(--border, #1d2022)',
            flexShrink:   0,
            position:     'relative',
          }}>
            {/* Lock indicator */}
            {activeGuide?.isLocked && (
              <Icon name="lock" size={12} color="var(--gold, #c4a35a)" style={{ flexShrink: 0 }} />
            )}

            {/* Title */}
            <input
              value={editTitle}
              onChange={e => { setEditTitle(e.target.value); setDirty(true); }}
              readOnly={isReadOnly}
              style={{
                flex:         1,
                background:   'transparent',
                border:       'none',
                borderBottom: dirty ? '1px solid var(--accent, #c47c5a)' : '1px solid transparent',
                color:        'var(--text, #d4d9dd)',
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     13,
                fontWeight:   700,
                outline:      'none',
                padding:      '2px 0',
              }}
              placeholder="guide title"
            />

            {saveErr && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red)', flexShrink: 0 }}>
                {saveErr}
              </span>
            )}

            {/* Save */}
            {canWrite && !isReadOnly && (
              <button
                className="gs-act-primary act-primary"
                onClick={saveGuide}
                disabled={saving || !dirty}
                style={{ ...av, fontSize: 11, padding: '4px 14px', flexShrink: 0 }}
              >
                {saving ? 'saving…' : dirty ? 'save' : 'saved'}
              </button>
            )}

            {/* Duplicate dropdown */}
            {canWrite && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  className="gs-btn-ghost"
                  onClick={() => setDupMenuOpen(p => !p)}
                  title="duplicate guide"
                  style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <Icon name="copy" size={12} />
                  <Icon name="chevronDown" size={9} />
                </button>
                {dupMenuOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 2,
                    background: 'var(--cardBg, #141618)', border: '1px solid var(--border2, #262c30)',
                    borderRadius: 6, padding: '4px 0', minWidth: 160,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}>
                    <button
                      className="gs-dup-item"
                      onClick={() => duplicateGuide('full')}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text2, #8a9299)' }}
                    >
                      duplicate all content
                    </button>
                    <button
                      className="gs-dup-item"
                      onClick={() => duplicateGuide('headers_only')}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text2, #8a9299)' }}
                    >
                      duplicate headers only
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Lock toggle (admin only) */}
            {isAdmin && (
              <button
                className="gs-btn-ghost"
                onClick={toggleLock}
                disabled={lockBusy}
                title={activeGuide?.isLocked ? 'unlock guide' : 'lock guide'}
                style={{
                  padding: '4px 8px', flexShrink: 0,
                  color: activeGuide?.isLocked ? 'var(--gold, #c4a35a)' : 'var(--text3, #555a5e)',
                }}
              >
                <Icon name={activeGuide?.isLocked ? 'lock' : 'lockOpen'} size={12} />
              </button>
            )}

            {/* Export .md */}
            <button
              className="gs-btn-ghost"
              onClick={exportMd}
              title="export as markdown"
              style={{ padding: '4px 8px', flexShrink: 0 }}
            >
              <Icon name="download" size={12} />
            </button>

            {/* Delete */}
            {canDelete && (
              <button
                className="gs-del-btn gs-btn-ghost"
                onClick={deleteGuide}
                disabled={deleting}
                title="delete guide"
                style={{ color: 'var(--text3)', padding: '4px 8px', flexShrink: 0 }}
              >
                <Icon name="trash" size={12} />
              </button>
            )}
          </div>

          {/* ── Linked-to bar ─────────────────────────────────────────────── */}
          <LinkedToBar
            links={links}
            siteId={siteId ?? ''}
            guideId={activeId}
            readOnly={isReadOnly}
            onLinksChange={setLinks}
          />

          {/* ── Block editor ──────────────────────────────────────────────── */}
          <GuideBlockEditor
            blocks={blocks}
            onChange={handleBlocksChange}
            readOnly={isReadOnly}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      )}

      {/* Close duplicate menu on outside click */}
      {dupMenuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          onClick={() => setDupMenuOpen(false)}
        />
      )}
    </div>
  );
}

// ── GuideListItem ─────────────────────────────────────────────────────────────

interface GuideListItemProps {
  guide:    Guide;
  activeId: string | null;
  onOpen:   (g: Guide) => void;
}

function GuideListItem({ guide, activeId, onOpen, indent = 0 }: GuideListItemProps & { indent?: number }) {
  const isActive = activeId === guide.id;
  return (
    <button
      className={`gs-guide-item${isActive ? ' active' : ''}`}
      onClick={() => onOpen(guide)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          5,
        width:        '100%',
        textAlign:    'left',
        padding:      `7px 14px 7px ${22 + indent * 12}px`,
        fontFamily:   "'JetBrains Mono', monospace",
        fontSize:     10,
        color:        isActive ? 'var(--accent)' : 'var(--text2, #8a9299)',
        background:   'transparent',
        borderBottom: '1px solid var(--border, #1d2022)',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        transition:   'background 0.1s',
      }}
      title={guide.title}
    >
      {guide.isLocked && <Icon name="lock" size={9} color="var(--gold, #c4a35a)" style={{ flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {guide.title}
      </span>
    </button>
  );
}

// ── ManualSection ──────────────────────────────────────────────────────────────

interface ManualSectionProps {
  node:            ManualNode;
  depth:           number;
  expandedManuals: Set<string>;
  renamingId:      string | null;
  renameValue:     string;
  activeId:        string | null;
  guidesByManual:  Record<string, Guide[]>;
  canWrite:        boolean;
  onToggle:        (id: string) => void;
  onStartRename:   (m: GuideManual) => void;
  onRenameChange:  (v: string) => void;
  onCommitRename:  (id: string) => void;
  onCancelRename:  () => void;
  onCreateGuide:   (manualId: string) => void;
  onCreateSubManual: (parentId: string) => void;
  onDeleteManual:  (id: string) => void;
  onOpenGuide:     (g: Guide) => void;
}

function ManualSection({
  node, depth, expandedManuals, renamingId, renameValue, activeId,
  guidesByManual, canWrite,
  onToggle, onStartRename, onRenameChange, onCommitRename, onCancelRename,
  onCreateGuide, onCreateSubManual, onDeleteManual, onOpenGuide,
}: ManualSectionProps) {
  const { manual } = node;
  const isExpanded  = expandedManuals.has(manual.id);
  const isRenaming  = renamingId === manual.id;
  const guides      = guidesByManual[manual.id] ?? [];
  const indent      = depth * 10;

  return (
    <div style={{ borderBottom: depth === 0 ? '1px solid var(--border, #1d2022)' : undefined }}>
      {/* Manual header */}
      <div
        className="gs-manual-hdr"
        style={{ display: 'flex', alignItems: 'center', gap: 2, padding: `5px 8px 5px ${10 + indent}px` }}
      >
        <button
          onClick={() => onToggle(manual.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px 0 0', color: 'var(--text3, #555a5e)', flexShrink: 0 }}
        >
          <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={10} />
        </button>

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={() => onCommitRename(manual.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') onCommitRename(manual.id);
              if (e.key === 'Escape') onCancelRename();
            }}
            style={{
              flex: 1, background: 'var(--inputBg, #1a1d20)',
              border: '1px solid var(--accent, #c47c5a)', borderRadius: 3,
              color: 'var(--text, #d4d9dd)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              padding: '2px 4px', outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => canWrite && onStartRename(manual)}
            title="double-click to rename"
            style={{
              flex: 1, fontFamily: "'JetBrains Mono', monospace",
              fontSize: depth === 0 ? 10 : 9,
              fontWeight: depth === 0 ? 700 : 600,
              color: depth === 0 ? 'var(--text2, #8a9299)' : 'var(--text3, #555a5e)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: canWrite ? 'text' : 'default',
            }}
          >
            {manual.name}
          </span>
        )}

        {canWrite && !isRenaming && (
          <span className="gs-manual-actions" style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity 0.15s' }}>
            <button
              onClick={() => onCreateGuide(manual.id)}
              title="new guide"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #555a5e)', padding: '1px 3px' }}
            >
              <Icon name="plus" size={10} />
            </button>
            <button
              onClick={() => onCreateSubManual(manual.id)}
              title="new sub-section"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #555a5e)', padding: '1px 3px', fontFamily: "'JetBrains Mono', monospace", fontSize: 8 }}
            >
              ⌞
            </button>
            <button
              className="gs-del-btn"
              onClick={() => onDeleteManual(manual.id)}
              title="delete section"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #555a5e)', padding: '1px 3px' }}
            >
              <Icon name="trash" size={9} />
            </button>
          </span>
        )}
      </div>

      {/* Expanded contents */}
      {isExpanded && (
        <div style={{ borderLeft: depth === 0 ? undefined : `1px solid var(--border, #1d2022)`, marginLeft: depth === 0 ? 0 : 10 + indent }}>
          {/* Sub-sections first */}
          {node.children.map(child => (
            <ManualSection
              key={child.manual.id}
              node={child}
              depth={depth + 1}
              expandedManuals={expandedManuals}
              renamingId={renamingId}
              renameValue={renameValue}
              activeId={activeId}
              guidesByManual={guidesByManual}
              canWrite={canWrite}
              onToggle={onToggle}
              onStartRename={onStartRename}
              onRenameChange={onRenameChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onCreateGuide={onCreateGuide}
              onCreateSubManual={onCreateSubManual}
              onDeleteManual={onDeleteManual}
              onOpenGuide={onOpenGuide}
            />
          ))}
          {/* Guides in this section */}
          {guides.map(g => (
            <GuideListItem key={g.id} guide={g} activeId={activeId} onOpen={onOpenGuide} indent={depth} />
          ))}
          {guides.length === 0 && node.children.length === 0 && (
            <div style={{ padding: `4px 14px 8px ${22 + depth * 12}px`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #555a5e)', fontStyle: 'italic' }}>
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}
