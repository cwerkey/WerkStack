import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useParams }        from 'react-router-dom';
import { Icon }  from '../../../components/ui/Icon';
import { api }   from '../../../utils/api';
import type { SiteCtx } from '../../SiteShell';

interface SiteOverview {
  totalDevices:  number;
  openTickets:   number;
  stagedDevices: number;
  powerWatts:    number;
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:   string;
  value:   string | number;
  icon:    string;
  color?:  string;
  loading: boolean;
}

function KpiCard({ label, value, icon, color, loading }: KpiCardProps) {
  return (
    <div style={{
      background:    'var(--cardBg, #141618)',
      border:        '1px solid var(--border, #1d2022)',
      borderRadius:  8,
      padding:       '22px 24px',
      display:       'flex',
      flexDirection: 'column',
      gap:           12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily:    "'JetBrains Mono', monospace",
          fontSize:      10,
          color:         'var(--text3, #4e5560)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {label}
        </span>
        <Icon name={icon} size={14} color={color ?? 'var(--text3, #4e5560)'} />
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize:   32,
        fontWeight: 700,
        lineHeight: 1,
        color:      loading ? 'var(--text3, #4e5560)' : (color ?? 'var(--text, #d4d9dd)'),
      }}>
        {loading ? '—' : value}
      </span>
    </div>
  );
}

// ── OverviewScreen ─────────────────────────────────────────────────────────────

export function OverviewScreen() {
  const { accent, css }    = useOutletContext<SiteCtx>();
  const { siteId }         = useParams<{ siteId: string }>();
  const av = { '--accent': accent } as React.CSSProperties;

  const [data,    setData]    = useState<SiteOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const result = await api.get<SiteOverview>(`/api/sites/${siteId}/overview`);
      setData(result!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
      `}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px' }}>

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   28,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize:   13,
            fontWeight: 700,
            color:      'var(--text, #d4d9dd)',
          }}>
            overview
          </span>
          <button
            className="btn-ghost"
            onClick={load}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4 }}
          >
            refresh
          </button>
        </div>

        {err && (
          <div style={{
            fontFamily:   "'JetBrains Mono', monospace",
            fontSize:     11,
            color:        'var(--red, #c07070)',
            marginBottom: 20,
          }}>
            {err}
          </div>
        )}

        {/* KPI grid */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap:                 16,
          marginBottom:        40,
        }}>
          <KpiCard
            label="total devices"
            value={data?.totalDevices ?? 0}
            icon="layers"
            loading={loading}
          />
          <KpiCard
            label="power load"
            value={data ? `${(data.powerWatts).toLocaleString()} W` : '0 W'}
            icon="zap"
            color="var(--gold, #b89870)"
            loading={loading}
          />
          <KpiCard
            label="open tickets"
            value={data?.openTickets ?? 0}
            icon="ticket"
            color="var(--red, #c07070)"
            loading={loading}
          />
          <KpiCard
            label="staged devices"
            value={data?.stagedDevices ?? 0}
            icon="edit"
            color="var(--blue, #7090b8)"
            loading={loading}
          />
        </div>

        {/* Summary section */}
        {!loading && data && (
          <div style={{
            display:   'flex',
            flexWrap:  'wrap',
            gap:       12,
          }}>
            {data.totalDevices === 0 && (
              <div style={{
                background:   'var(--cardBg, #141618)',
                border:       '1px solid var(--border, #1d2022)',
                borderRadius: 8,
                padding:      '14px 18px',
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     11,
                color:        'var(--text2, #8a9299)',
              }}>
                no devices deployed yet — head to rack view to get started
              </div>
            )}
            {data.openTickets > 0 && (
              <div style={{
                background:   'var(--cardBg, #141618)',
                border:       '1px solid var(--border, #1d2022)',
                borderRadius: 8,
                padding:      '14px 18px',
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     11,
                color:        'var(--red, #c07070)',
              }}>
                {data.openTickets} open {data.openTickets === 1 ? 'ticket' : 'tickets'} need attention
              </div>
            )}
            {data.stagedDevices > 0 && (
              <div style={{
                background:   'var(--cardBg, #141618)',
                border:       '1px solid var(--border, #1d2022)',
                borderRadius: 8,
                padding:      '14px 18px',
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     11,
                color:        'var(--blue, #7090b8)',
              }}>
                {data.stagedDevices} staged {data.stagedDevices === 1 ? 'device' : 'devices'} in draft
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
