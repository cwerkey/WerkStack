import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../../components/ui/Icon';
import { api } from '../../../../utils/api';
import type { GuideLink, SearchResult } from '@werkstack/shared';

// ── Entity type config ────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  device:  '#c47c5a',
  pool:    '#5a8fc4',
  subnet:  '#9a78c8',
  vm:      '#c4a35a',
  app:     '#70c080',
  share:   '#7ac8a4',
  host:    '#c88a7a',
};

const ENTITY_ROUTE: Record<string, (siteId: string) => string> = {
  device:  (s) => `/sites/${s}/racks`,
  pool:    (s) => `/sites/${s}/storage`,
  subnet:  (s) => `/sites/${s}/ip-plan`,
  vm:      (s) => `/sites/${s}/os-stack`,
  app:     (s) => `/sites/${s}/os-stack`,
  share:   (s) => `/sites/${s}/storage`,
  host:    (s) => `/sites/${s}/os-stack`,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  links:         GuideLink[];
  siteId:        string;
  guideId:       string;
  readOnly:      boolean;
  onLinksChange: (links: GuideLink[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LinkedToBar({ links, siteId, guideId, readOnly, onLinksChange }: Props) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [linkLabels, setLinkLabels]     = useState<Record<string, string>>({});
  const [removingId, setRemovingId]     = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // Debounced entity search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await api.get<SearchResult[]>(
          `/api/sites/${siteId}/search?q=${encodeURIComponent(query.trim())}&types=device,pool,subnet,vm,app`
        );
        // Filter out already-linked entities
        const linkedSet = new Set(links.map(l => l.entityId));
        setResults((data ?? []).filter(r => !linkedSet.has(r.id)));
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [query, siteId, links]);

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input when picker opens
  useEffect(() => {
    if (pickerOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [pickerOpen]);

  async function addLink(result: SearchResult) {
    try {
      const created = await api.post<GuideLink>(
        `/api/sites/${siteId}/guides/${guideId}/links`,
        { entityType: result.type, entityId: result.id }
      );
      if (created) {
        setLinkLabels(prev => ({ ...prev, [created.entityId]: result.name }));
        onLinksChange([...links, created]);
      }
    } catch { /* ignore */ }
    setPickerOpen(false);
    setQuery('');
  }

  async function removeLink(linkId: string) {
    setRemovingId(linkId);
    try {
      await api.delete(`/api/sites/${siteId}/guides/${guideId}/links/${linkId}`);
      onLinksChange(links.filter(l => l.id !== linkId));
    } catch { /* ignore */ } finally {
      setRemovingId(null);
    }
  }

  function getLinkLabel(link: GuideLink): string {
    return linkLabels[link.entityId] ?? link.entityId.slice(0, 8) + '…';
  }

  function navigateToEntity(link: GuideLink) {
    const routeFn = ENTITY_ROUTE[link.entityType];
    if (routeFn) navigate(routeFn(siteId));
  }

  const color = (et: string) => ENTITY_COLORS[et] ?? '#8a9299';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <style>{`
        .ltb-chip { transition: background 0.1s; }
        .ltb-chip:hover { background: var(--border2, #262c30) !important; }
        .ltb-chip-rm:hover { color: var(--red, #c07070) !important; }
        .ltb-add-btn:hover { background: var(--inputBg, #1a1d20) !important; border-color: #3a4248 !important; }
        .ltb-result:hover { background: var(--inputBg, #1a1d20) !important; }
      `}</style>

      <div style={{
        display:    'flex',
        alignItems: 'center',
        flexWrap:   'wrap',
        gap:        6,
        padding:    '6px 16px',
        borderBottom: '1px solid var(--border, #1d2022)',
        minHeight:  36,
        flexShrink: 0,
      }}>
        {/* Label */}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: 'var(--text3, #555a5e)', textTransform: 'uppercase',
          letterSpacing: '0.04em', marginRight: 4,
        }}>
          linked to
        </span>

        {/* Link chips */}
        {links.map(link => (
          <span
            key={link.id}
            className="ltb-chip"
            style={{
              display:    'inline-flex',
              alignItems: 'center',
              gap:        4,
              padding:    '2px 8px',
              borderRadius: 10,
              background: color(link.entityType) + '18',
              border:     `1px solid ${color(link.entityType)}40`,
              cursor:     'pointer',
            }}
            onClick={() => navigateToEntity(link)}
            title={`${link.entityType}: ${link.entityId}`}
          >
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: color(link.entityType),
              textTransform: 'uppercase',
            }}>
              {link.entityType}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: 'var(--text2, #8a9299)',
            }}>
              {getLinkLabel(link)}
            </span>
            {!readOnly && (
              <button
                className="ltb-chip-rm"
                onClick={e => { e.stopPropagation(); removeLink(link.id); }}
                disabled={removingId === link.id}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text3, #555a5e)', padding: '0 0 0 2px',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  lineHeight: 1,
                }}
              >×</button>
            )}
          </span>
        ))}

        {/* Empty state */}
        {links.length === 0 && (
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--text3, #555a5e)', fontStyle: 'italic',
          }}>
            no linked entities
          </span>
        )}

        {/* Add link button */}
        {!readOnly && (
          <button
            className="ltb-add-btn"
            onClick={() => setPickerOpen(p => !p)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 10,
              background: 'transparent',
              border: '1px dashed var(--border2, #262c30)',
              color: 'var(--text3, #555a5e)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={9} />
            link
          </button>
        )}
      </div>

      {/* Entity picker dropdown */}
      {pickerOpen && (
        <div style={{
          position: 'absolute',
          top:      '100%',
          left:     16,
          zIndex:   200,
          background: 'var(--cardBg, #141618)',
          border:   '1px solid var(--border2, #262c30)',
          borderRadius: 8,
          width:    280,
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px',
            borderBottom: '1px solid var(--border, #1d2022)',
          }}>
            <Icon name="search" size={11} color="var(--text3, #555a5e)" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setPickerOpen(false); }}
              placeholder="search devices, subnets, vms…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                color: 'var(--text, #d4d9dd)',
              }}
            />
          </div>

          {results.length === 0 ? (
            <div style={{
              padding: '10px 12px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--text3, #555a5e)',
            }}>
              {query.trim() ? 'no results' : 'type to search…'}
            </div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {results.map(r => (
                <button
                  key={r.id}
                  className="ltb-result"
                  onClick={() => addLink(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 12px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid var(--border, #1d2022)',
                  }}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: color(r.type), textTransform: 'uppercase',
                    background: color(r.type) + '18', padding: '1px 5px',
                    borderRadius: 3, flexShrink: 0,
                  }}>
                    {r.type}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'var(--text, #d4d9dd)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.name}
                    </div>
                    {r.subtitle && (
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                        color: 'var(--text3, #555a5e)',
                      }}>
                        {r.subtitle}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
