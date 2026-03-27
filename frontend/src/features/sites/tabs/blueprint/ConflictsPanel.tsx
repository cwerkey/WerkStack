import { useState, useCallback, useEffect } from 'react';
import { Icon }          from '../../../../components/ui/Icon';
import { api }           from '../../../../utils/api';
import type { ConflictReport, ConflictItem } from '@werkstack/shared';

// ── Section ───────────────────────────────────────────────────────────────────

function ConflictSection({
  title, items, emptyLabel,
}: {
  title: string;
  items: ConflictItem[];
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <Icon name="check" size={11} color="var(--green, #70b870)" />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color: 'var(--text3, #4e5560)',
      }}>{emptyLabel}</span>
    </div>
  );

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 0', width: '100%', textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={10} color="var(--text3, #4e5560)" />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, fontWeight: 700,
          color: items.some(i => i.level === 'error') ? 'var(--red, #c07070)' : 'var(--gold, #b89870)',
        }}>
          {title}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'var(--text3, #4e5560)',
          marginLeft: 'auto',
        }}>
          {items.length}
        </span>
      </button>
      {open && (
        <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 6,
              padding: '3px 0',
            }}>
              <Icon
                name={item.level === 'error' ? 'alert-circle' : 'alert-triangle'}
                size={11}
                color={item.level === 'error' ? 'var(--red, #c07070)' : 'var(--gold, #b89870)'}
              />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: 'var(--text, #d4d9dd)',
                lineHeight: 1.5,
              }}>
                {item.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Power override banner ─────────────────────────────────────────────────────

function PowerOverloadBanner({
  items, onAdminOverride,
}: {
  items: ConflictItem[];
  onAdminOverride: () => void;
}) {
  const hardBlocks = items.filter(i => i.level === 'error');
  if (hardBlocks.length === 0) return null;
  return (
    <div style={{
      background: 'rgba(192,112,112,0.08)',
      border: '1px solid var(--red, #c07070)',
      borderRadius: 6, padding: '10px 12px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Icon name="zap" size={14} color="var(--red, #c07070)" />
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, fontWeight: 700,
          color: 'var(--red, #c07070)',
        }}>
          {hardBlocks.length} rack{hardBlocks.length > 1 ? 's' : ''} at 100%+ power capacity
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, color: 'var(--text3, #4e5560)',
          marginTop: 2,
        }}>
          promotion blocked — resolve overload or use admin override
        </div>
      </div>
      <button
        className="btn-ghost"
        onClick={onAdminOverride}
        style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4 }}
      >
        admin override
      </button>
    </div>
  );
}

// ── ConflictsPanel ─────────────────────────────────────────────────────────────

interface ConflictsPanelProps {
  siteId:  string;
  accent:  string;
}

export function ConflictsPanel({ siteId, accent: _accent }: ConflictsPanelProps) {
  const [report, setReport]     = useState<ConflictReport | null>(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [overridden, setOverride] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await api.get<ConflictReport>(`/api/sites/${siteId}/conflicts`);
      setReport(r!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load conflicts');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const handleOverride = () => {
    setOverride(true);
  };

  if (loading) return (
    <div style={{
      background: 'var(--cardBg, #141618)',
      border: '1px solid var(--border, #1d2022)',
      borderRadius: 8, padding: 12,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color: 'var(--text3, #4e5560)',
      }}>checking for conflicts…</div>
    </div>
  );

  const total = report ? report.totalErrors + report.totalWarnings : 0;

  return (
    <div style={{
      background: 'var(--cardBg, #141618)',
      border: `1px solid ${total > 0 ? (report!.totalErrors > 0 ? 'var(--red, #c07070)' : 'var(--gold, #b89870)') : 'var(--border, #1d2022)'}`,
      borderRadius: 8,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        borderBottom: total > 0 ? '1px solid var(--border, #1d2022)' : 'none',
      }}>
        <Icon
          name={total === 0 ? 'check-circle' : report!.totalErrors > 0 ? 'alert-circle' : 'alert-triangle'}
          size={13}
          color={total === 0 ? 'var(--green, #70b870)' : report!.totalErrors > 0 ? 'var(--red, #c07070)' : 'var(--gold, #b89870)'}
        />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, fontWeight: 700,
          color: 'var(--text2, #8a9299)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          flex: 1,
        }}>
          conflict scan
        </span>
        {report && (
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: total === 0 ? 'var(--green, #70b870)' : 'var(--text3, #4e5560)',
          }}>
            {total === 0
              ? 'no conflicts'
              : `${report.totalErrors} error${report.totalErrors !== 1 ? 's' : ''}, ${report.totalWarnings} warning${report.totalWarnings !== 1 ? 's' : ''}`
            }
          </span>
        )}
        <button
          className="btn-ghost"
          onClick={load}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4 }}
        >
          rescan
        </button>
      </div>

      {err && (
        <div style={{ padding: 12 }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--red, #c07070)',
          }}>{err}</span>
        </div>
      )}

      {report && total > 0 && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Power overload hard-block banner */}
          {!overridden && (
            <PowerOverloadBanner
              items={report.powerConflicts}
              onAdminOverride={handleOverride}
            />
          )}
          {overridden && report.powerConflicts.some(p => p.level === 'error') && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'var(--gold, #b89870)',
              padding: '4px 0',
            }}>
              admin override active — power hard block bypassed
            </div>
          )}

          <ConflictSection
            title="spatial collisions"
            items={report.spatialConflicts}
            emptyLabel="no spatial collisions"
          />
          <ConflictSection
            title="power overload"
            items={report.powerConflicts}
            emptyLabel="power within limits"
          />
          <ConflictSection
            title="IP conflicts"
            items={report.ipConflicts}
            emptyLabel="no IP conflicts"
          />
          <ConflictSection
            title="medium mismatches"
            items={report.mediumMismatches}
            emptyLabel="no medium mismatches"
          />
          <ConflictSection
            title="inventory shortages"
            items={report.inventoryShortages}
            emptyLabel="inventory sufficient"
          />
          <ConflictSection
            title="loop / duplicate connections"
            items={report.loopConflicts}
            emptyLabel="no loops detected"
          />
        </div>
      )}

      {report && total === 0 && (
        <div style={{ padding: '10px 12px' }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--green, #70b870)',
          }}>
            all 6 checks passed — site is conflict-free
          </span>
        </div>
      )}
    </div>
  );
}
