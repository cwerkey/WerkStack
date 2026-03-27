import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useParams }               from 'react-router-dom';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon }       from '../../../components/ui/Icon';
import { useCan }     from '../../../utils/can';
import { api }        from '../../../utils/api';
import type { SiteCtx } from '../../SiteShell';
import type { Guide }   from '@werkstack/shared';

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Lightweight line-by-line parser for guides. No external library needed.

function renderMarkdown(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string): string => {
    // Inline code (escape first, then wrap)
    s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${esc(c)}</code>`);
    // Bold+italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return s;
  };

  const lines = md.split('\n');
  const out: string[] = [];
  let inCode  = false;
  let codeLns: string[] = [];
  let inList  = false;

  for (const rawLine of lines) {
    // Code block fence
    if (rawLine.startsWith('```')) {
      if (inCode) {
        inCode = false;
        out.push(`<pre><code>${esc(codeLns.join('\n'))}</code></pre>`);
        codeLns = [];
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLns.push(rawLine); continue; }

    const line = rawLine;

    if (line.startsWith('#### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h4>${inline(esc(line.slice(5)))}</h4>`);
    } else if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${inline(esc(line.slice(4)))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${inline(esc(line.slice(3)))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${inline(esc(line.slice(2)))}</h1>`);
    } else if (/^---+$/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<hr>');
    } else if (/^[-*] /.test(line)) {
      const content = line.slice(2);
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(esc(content))}</li>`);
    } else if (/^\d+\. /.test(line)) {
      const content = line.replace(/^\d+\. /, '');
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(esc(content))}</li>`);
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inline(esc(line))}</p>`);
    }
  }

  if (inList)  out.push('</ul>');
  if (inCode)  out.push(`<pre><code>${esc(codeLns.join('\n'))}</code></pre>`);

  return out.join('\n');
}

// ── GuidesScreen ──────────────────────────────────────────────────────────────

export function GuidesScreen() {
  const { accent, css }  = useOutletContext<SiteCtx>();
  const { siteId }       = useParams<{ siteId: string }>();
  const av = { '--accent': accent } as React.CSSProperties;
  const { can } = useCan();

  const [guides,   setGuides]   = useState<Guide[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');

  // Active guide editor state
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [editTitle,  setEditTitle]  = useState('');
  const [editContent, setEditContent] = useState('');
  const [dirty,      setDirty]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState('');
  const [deleting,   setDeleting]   = useState(false);

  const canWrite  = can('guide', 'write');
  const canDelete = can('guide', 'delete');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const result = await api.get<Guide[]>(`/api/sites/${siteId}/guides`);
      setGuides(result ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load guides');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  // Open a guide in the editor
  function openGuide(g: Guide) {
    setActiveId(g.id);
    setEditTitle(g.title);
    setEditContent(g.content);
    setDirty(false);
    setSaveErr('');
  }

  // Create a new empty guide
  async function createGuide() {
    if (!siteId) return;
    setSaving(true);
    setSaveErr('');
    try {
      const created = await api.post<Guide>(`/api/sites/${siteId}/guides`, {
        title:   'new guide',
        content: '',
      });
      setGuides(prev => [created!, ...prev]);
      openGuide(created!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to create guide');
    } finally {
      setSaving(false);
    }
  }

  // Save edits
  async function saveGuide() {
    if (!activeId || !siteId) return;
    if (!editTitle.trim()) { setSaveErr('title is required'); return; }
    setSaving(true);
    setSaveErr('');
    try {
      const updated = await api.patch<Guide>(
        `/api/sites/${siteId}/guides/${activeId}`,
        { title: editTitle.trim(), content: editContent }
      );
      setGuides(prev => prev.map(g => g.id === activeId ? updated! : g));
      setDirty(false);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Delete active guide
  async function deleteGuide() {
    if (!activeId || !siteId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/sites/${siteId}/guides/${activeId}`);
      setGuides(prev => prev.filter(g => g.id !== activeId));
      setActiveId(null);
      setEditTitle('');
      setEditContent('');
      setDirty(false);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  const preview = renderMarkdown(editContent);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .guide-item:hover { background: var(--inputBg, #1a1d20) !important; }
        .guide-item.active { background: var(--inputBg, #1a1d20) !important; color: var(--accent, #c47c5a) !important; box-shadow: inset 2px 0 0 var(--accent, #c47c5a); }
        .del-btn:hover { color: var(--red, #c07070) !important; }
        /* Markdown preview styles */
        .md-preview h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; color: var(--text, #d4d9dd); }
        .md-preview h2 { font-size: 16px; font-weight: 700; margin: 16px 0 8px; color: var(--text, #d4d9dd); }
        .md-preview h3 { font-size: 14px; font-weight: 700; margin: 14px 0 6px; color: var(--text, #d4d9dd); }
        .md-preview h4 { font-size: 12px; font-weight: 700; margin: 12px 0 4px; color: var(--text2, #8a9299); }
        .md-preview p  { margin: 0 0 10px; line-height: 1.65; }
        .md-preview ul { padding-left: 20px; margin: 0 0 10px; }
        .md-preview li { margin-bottom: 3px; list-style: disc; line-height: 1.55; }
        .md-preview strong { color: var(--text, #d4d9dd); font-weight: 700; }
        .md-preview em { font-style: italic; color: var(--text2, #8a9299); }
        .md-preview code { font-family: 'JetBrains Mono', monospace; font-size: 11px; background: var(--cardBg2, #0c0d0e); border: 1px solid var(--border2, #262c30); border-radius: 3px; padding: 1px 5px; color: var(--accent, #c47c5a); }
        .md-preview pre { background: var(--cardBg2, #0c0d0e); border: 1px solid var(--border2, #262c30); border-radius: 6px; padding: 12px 14px; margin: 0 0 14px; overflow-x: auto; }
        .md-preview pre code { background: none; border: none; padding: 0; color: var(--text2, #8a9299); font-size: 11px; }
        .md-preview hr { border: none; border-top: 1px solid var(--border, #1d2022); margin: 16px 0; }
      `}</style>

      {/* ── Left sidebar — guides list ─────────────────────────────────────── */}
      <div style={{
        width:        240,
        flexShrink:   0,
        borderRight:  '1px solid var(--border, #1d2022)',
        display:      'flex',
        flexDirection:'column',
        overflowY:    'auto',
      }}>
        {/* Sidebar header */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '10px 12px',
          borderBottom: '1px solid var(--border, #1d2022)',
          flexShrink:   0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize:   11,
            fontWeight: 700,
            color:      'var(--text2, #8a9299)',
          }}>
            guides
          </span>
          {canWrite && (
            <button
              className="btn-ghost"
              onClick={createGuide}
              disabled={saving}
              title="new guide"
              style={{ padding: '2px 6px', borderRadius: 4 }}
            >
              <Icon name="plus" size={12} />
            </button>
          )}
        </div>

        {/* List */}
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
        ) : guides.length === 0 ? (
          <div style={{ padding: '16px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
            no guides yet
            {canWrite && (
              <button
                className="btn-ghost"
                onClick={createGuide}
                style={{ display: 'block', marginTop: 8, fontSize: 10, padding: '3px 8px' }}
              >
                + new guide
              </button>
            )}
          </div>
        ) : (
          guides.map(g => (
            <button
              key={g.id}
              className={`guide-item${activeId === g.id ? ' active' : ''}`}
              onClick={() => openGuide(g)}
              style={{
                display:    'block',
                width:      '100%',
                textAlign:  'left',
                padding:    '8px 14px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize:   11,
                color:      activeId === g.id ? 'var(--accent)' : 'var(--text2, #8a9299)',
                background: 'transparent',
                borderBottom: '1px solid var(--border, #1d2022)',
                overflow:   'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'background 0.1s',
              }}
            >
              {g.title}
            </button>
          ))
        )}
      </div>

      {/* ── Right panel — editor ───────────────────────────────────────────── */}
      {activeId === null ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            icon="book"
            title="select a guide to edit"
            action={canWrite ? (
              <button className="btn-ghost" onClick={createGuide} style={{ fontSize: 11, padding: '5px 14px' }}>
                new guide
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Editor toolbar */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            gap:            8,
            padding:        '8px 16px',
            borderBottom:   '1px solid var(--border, #1d2022)',
            flexShrink:     0,
          }}>
            <input
              value={editTitle}
              onChange={e => { setEditTitle(e.target.value); setDirty(true); }}
              style={{
                flex:       1,
                background: 'transparent',
                border:     'none',
                borderBottom: dirty ? '1px solid var(--accent, #c47c5a)' : '1px solid transparent',
                color:      'var(--text, #d4d9dd)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize:   13,
                fontWeight: 700,
                outline:    'none',
                padding:    '2px 0',
              }}
              placeholder="guide title"
            />
            {saveErr && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red)', flexShrink: 0 }}>
                {saveErr}
              </span>
            )}
            {canWrite && (
              <button
                className="act-primary"
                onClick={saveGuide}
                disabled={saving || !dirty}
                style={{ ...av, fontSize: 11, padding: '4px 14px', flexShrink: 0 }}
              >
                {saving ? 'saving…' : dirty ? 'save' : 'saved'}
              </button>
            )}
            {canDelete && (
              <button
                className="del-btn btn-ghost"
                onClick={deleteGuide}
                disabled={deleting}
                title="delete guide"
                style={{ color: 'var(--text3)', padding: '4px 8px', flexShrink: 0 }}
              >
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>

          {/* Split pane: editor | preview */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* Markdown editor */}
            <div style={{
              flex:        1,
              display:     'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--border, #1d2022)',
            }}>
              <div style={{
                padding:      '5px 16px',
                background:   'var(--cardBg2, #0c0d0e)',
                borderBottom: '1px solid var(--border, #1d2022)',
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     9,
                color:        'var(--text3)',
                letterSpacing: '0.08em',
              }}>
                EDITOR
              </div>
              <textarea
                value={editContent}
                onChange={e => { setEditContent(e.target.value); setDirty(true); }}
                spellCheck={false}
                style={{
                  flex:       1,
                  width:      '100%',
                  background: 'var(--pageBg, #0f1011)',
                  border:     'none',
                  outline:    'none',
                  resize:     'none',
                  color:      'var(--text, #d4d9dd)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize:   12,
                  lineHeight: 1.7,
                  padding:    '16px 18px',
                  tabSize:    2,
                }}
                placeholder={`# Guide title\n\nStart writing markdown here…\n\n## Section\n\nRegular paragraph text with **bold** and *italic*.\n\n- list item one\n- list item two\n\n\`\`\`\ncode block\n\`\`\``}
              />
            </div>

            {/* Preview */}
            <div style={{
              flex:     1,
              display:  'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{
                padding:      '5px 16px',
                background:   'var(--cardBg2, #0c0d0e)',
                borderBottom: '1px solid var(--border, #1d2022)',
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     9,
                color:        'var(--text3)',
                letterSpacing: '0.08em',
              }}>
                PREVIEW
              </div>
              <div
                className="md-preview"
                dangerouslySetInnerHTML={{ __html: preview }}
                style={{
                  flex:      1,
                  overflowY: 'auto',
                  padding:   '16px 18px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize:  13,
                  color:     'var(--text2, #8a9299)',
                  lineHeight: 1.6,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
