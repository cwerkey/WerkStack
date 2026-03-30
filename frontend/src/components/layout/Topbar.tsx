import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { api } from '../../utils/api';
import type { SearchResult } from '@werkstack/shared';

// ── Type grouping ────────────────────────────────────────────────────────────

const TYPE_ORDER = ['device', 'guide', 'subnet', 'pool', 'vm', 'app', 'connection'] as const;

const TYPE_LABELS: Record<string, string> = {
  device:     'devices',
  guide:      'guides',
  subnet:     'subnets',
  pool:       'storage',
  vm:         'virtual machines',
  app:        'apps',
  connection: 'connections',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Topbar() {
  const { siteId }  = useParams<{ siteId: string }>();
  const navigate    = useNavigate();
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<SearchResult[]>([]);
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading,   setLoading]   = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!siteId || !query.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.get<SearchResult[]>(
          `/api/sites/${siteId}/search?q=${encodeURIComponent(query.trim())}`
        );
        setResults(data ?? []);
        setOpen(true);
        setActiveIdx(-1);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, siteId]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(result: SearchResult) {
    setQuery('');
    setOpen(false);
    setResults([]);
    setActiveIdx(-1);
    if (result.type === 'guide') {
      navigate(`${result.route}?guideId=${result.id}`);
    } else {
      navigate(result.route);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(results[activeIdx]);
    }
  }

  // Group results by type in display order
  const grouped: { type: string; items: SearchResult[] }[] = [];
  for (const type of TYPE_ORDER) {
    const items = results.filter(r => r.type === type);
    if (items.length > 0) grouped.push({ type, items });
  }

  return (
    <div ref={containerRef} className="topbar" style={{ position: 'relative' }}>
      <style>{`
        .topbar-result:hover { background: var(--inputBg, #1a1d20) !important; }
        .topbar-result.active { background: var(--inputBg, #1a1d20) !important; }
      `}</style>

      <Icon name="search" size={13} color="var(--text3, #4e5560)" />
      <input
        ref={inputRef}
        type="text"
        className="topbar-search-input"
        placeholder={siteId ? 'search everything…' : 'search…'}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        aria-label="Search"
        style={{ flex: 1 }}
      />
      {loading && (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--text3, #4e5560)' }}>…</span>
      )}

      {/* Results dropdown */}
      {open && grouped.length > 0 && (
        <div style={{
          position:  'absolute',
          top:       '100%',
          left:      0,
          right:     0,
          zIndex:    1200,
          background: 'var(--cardBg, #141618)',
          border:    '1px solid var(--border2, #262c30)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          maxHeight: 380,
          overflowY: 'auto',
        }}>
          {grouped.map(group => (
            <div key={group.type}>
              {/* Group header */}
              <div style={{
                padding:    '6px 12px 3px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize:   9,
                fontWeight: 700,
                color:      'var(--text3, #555a5e)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderTop:  '1px solid var(--border, #1d2022)',
              }}>
                {TYPE_LABELS[group.type] ?? group.type}
              </div>

              {/* Results in this group */}
              {group.items.map(result => {
                const globalIdx = results.indexOf(result);
                const isActive  = activeIdx === globalIdx;
                return (
                  <button
                    key={result.id}
                    className={`topbar-result${isActive ? ' active' : ''}`}
                    onClick={() => handleSelect(result)}
                    style={{
                      display:    'flex',
                      alignItems: 'center',
                      gap:        10,
                      width:      '100%',
                      padding:    '7px 14px',
                      background: isActive ? 'var(--inputBg, #1a1d20)' : 'transparent',
                      border:     'none',
                      cursor:     'pointer',
                      textAlign:  'left',
                    }}
                  >
                    <Icon name={result.icon} size={12} color="var(--text3, #555a5e)" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontFamily:   "'JetBrains Mono', monospace",
                        fontSize:     11,
                        color:        'var(--text, #d4d9dd)',
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace:   'nowrap',
                      }}>
                        {result.name}
                      </div>
                      {result.subtitle && (
                        <div style={{
                          fontFamily:   "'JetBrains Mono', monospace",
                          fontSize:     9,
                          color:        'var(--text3, #555a5e)',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace:   'nowrap',
                        }}>
                          {result.subtitle}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}

          {/* Footer hint */}
          <div style={{
            padding:    '5px 12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize:   9,
            color:      'var(--text3, #555a5e)',
            borderTop:  '1px solid var(--border, #1d2022)',
            display:    'flex',
            gap:        12,
          }}>
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
        </div>
      )}

      {/* No results state */}
      {open && query.trim() && !loading && results.length === 0 && (
        <div style={{
          position:  'absolute',
          top:       '100%',
          left:      0,
          right:     0,
          zIndex:    1200,
          background: 'var(--cardBg, #141618)',
          border:    '1px solid var(--border2, #262c30)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          padding:   '12px 14px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize:   10,
          color:      'var(--text3, #555a5e)',
        }}>
          no results for "{query}"
        </div>
      )}
    </div>
  );
}
