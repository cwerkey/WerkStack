import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useParams }     from 'react-router-dom';
import { useRackStore }     from '../../../store/useRackStore';
import { Icon }             from '../../../components/ui/Icon';
import { EmptyState }       from '../../../components/ui/EmptyState';
import { ErrorBoundary }    from '../../../components/ui/ErrorBoundary';
import { api }              from '../../../utils/api';
import { ConflictsPanel }   from './blueprint/ConflictsPanel';
import { AssemblyManualModal } from './blueprint/AssemblyManualModal';
import type { SiteCtx }     from '../../SiteShell';
import type { BlueprintSummary, DeviceInstance } from '@werkstack/shared';

// ── BOM Table ─────────────────────────────────────────────────────────────────

function BomTable({ bom }: { bom: BlueprintSummary['bom'] }) {
  if (bom.length === 0) return null;
  return (
    <div style={{
      background: 'var(--cardBg, #141618)',
      border: '1px solid var(--border, #1d2022)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 700,
        color: 'var(--text2, #8a9299)',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border, #1d2022)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        bill of materials
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, color: 'var(--text3, #4e5560)',
            textAlign: 'left',
          }}>
            <th style={{ padding: '6px 12px' }}>template</th>
            <th style={{ padding: '6px 12px' }}>make</th>
            <th style={{ padding: '6px 12px' }}>model</th>
            <th style={{ padding: '6px 12px', textAlign: 'right' }}>qty</th>
            <th style={{ padding: '6px 12px', textAlign: 'right' }}>watts each</th>
            <th style={{ padding: '6px 12px', textAlign: 'right' }}>watts total</th>
          </tr>
        </thead>
        <tbody>
          {bom.map((line, i) => (
            <tr key={i} style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: 'var(--text, #d4d9dd)',
              borderTop: '1px solid var(--border, #1d2022)',
            }}>
              <td style={{ padding: '6px 12px' }}>{line.templateName}</td>
              <td style={{ padding: '6px 12px' }}>{line.make || '—'}</td>
              <td style={{ padding: '6px 12px' }}>{line.model || '—'}</td>
              <td style={{ padding: '6px 12px', textAlign: 'right' }}>{line.count}</td>
              <td style={{ padding: '6px 12px', textAlign: 'right' }}>{line.wattageEach || '—'}</td>
              <td style={{ padding: '6px 12px', textAlign: 'right' }}>{line.wattageTotal || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Promotion Wizard ──────────────────────────────────────────────────────────

interface PromotionWizardProps {
  siteId:  string;
  drafts:  DeviceInstance[];
  accent:  string;
  onDone:  () => void;
}

function PromotionWizard({ siteId, drafts, accent, onDone }: PromotionWizardProps) {
  const [step, setStep]         = useState<'checklist' | 'review' | 'done'>('checklist');
  const [selected, setSelected] = useState<Set<string>>(new Set(drafts.map(d => d.id)));
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState('');

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const promote = async () => {
    setBusy(true);
    setErr('');
    try {
      const result = await api.post<{ devices: DeviceInstance[] }>(`/api/sites/${siteId}/blueprints/promote`, {
        deviceIds: Array.from(selected),
      });
      if (result?.devices) {
        const store = useRackStore.getState();
        result.devices.forEach(d => store.upsertDevice(d));
      }
      setStep('done');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'promotion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wizard-modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="wizard-panel" style={{
        background: 'var(--cardBg, #141618)',
        border: '1px solid var(--border, #1d2022)',
        borderRadius: 8, padding: 20,
        width: 540, maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13, fontWeight: 700,
          color: 'var(--text, #d4d9dd)',
          marginBottom: 16,
        }}>
          promote drafts to active
        </div>

        {step === 'checklist' && (
          <>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'var(--text3, #4e5560)',
              marginBottom: 8, textTransform: 'uppercase',
            }}>
              select devices to promote
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {drafts.map(d => (
                <label key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', borderRadius: 4,
                  background: selected.has(d.id) ? 'var(--inputBg, #1a1d20)' : 'transparent',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text, #d4d9dd)', cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)} />
                  {d.name}
                </label>
              ))}
            </div>
            <button className="act-primary" onClick={() => setStep('review')}
              disabled={selected.size === 0}
              style={{
                background: accent, border: 'none', borderRadius: 4,
                padding: '6px 14px', color: '#fff',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                fontWeight: 700, cursor: 'pointer',
                opacity: selected.size === 0 ? 0.5 : 1,
              }}>
              next: review
            </button>
          </>
        )}

        {step === 'review' && (
          <>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: 'var(--text, #d4d9dd)',
              marginBottom: 12,
            }}>
              promoting {selected.size} {selected.size === 1 ? 'device' : 'devices'} from draft to active
            </div>

            {err && (
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: 'var(--red, #c07070)',
                marginBottom: 8,
              }}>
                {err}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setStep('checklist')}
                style={{ fontSize: 11, padding: '6px 14px', borderRadius: 4 }}>
                back
              </button>
              <button className="act-primary" onClick={promote} disabled={busy}
                style={{
                  background: accent, border: 'none', borderRadius: 4,
                  padding: '6px 14px', color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}>
                {busy ? 'promoting...' : 'commit promotion'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: 'var(--green, #70b870)',
              marginBottom: 12,
            }}>
              devices promoted successfully
            </div>
            <button className="act-primary" onClick={onDone}
              style={{
                background: accent, border: 'none', borderRadius: 4,
                padding: '6px 14px', color: '#fff',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                fontWeight: 700, cursor: 'pointer',
              }}>
              done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── BlueprintScreen ──────────────────────────────────────────────────────────

export function BlueprintScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const { siteId }      = useParams<{ siteId: string }>();
  const av = { '--accent': accent } as React.CSSProperties;

  const [summary, setSummary] = useState<BlueprintSummary | null>(null);
  const [drafts, setDrafts]   = useState<DeviceInstance[]>([]);
  const [resourceCheck, setResourceCheck] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [showPromotion, setShowPromotion] = useState(false);
  const [showManual, setShowManual]       = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const [s, d, rc] = await Promise.all([
        api.get<BlueprintSummary>(`/api/sites/${siteId}/blueprints/summary`),
        api.get<DeviceInstance[]>(`/api/sites/${siteId}/blueprints/drafts`),
        api.get<any>(`/api/sites/${siteId}/blueprints/resource-check`),
      ]);
      setSummary(s!);
      setDrafts(d!);
      setResourceCheck(rc);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load');
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
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
      `}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 28,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
          }}>
            blueprint studio
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {drafts.length > 0 && (
              <>
                <button className="btn-ghost" onClick={() => setShowManual(true)}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4 }}>
                  assembly manual
                </button>
                <button className="act-primary" onClick={() => setShowPromotion(true)}
                  style={{
                    background: accent, border: 'none', borderRadius: 4,
                    padding: '4px 12px', color: '#fff',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    fontWeight: 700, cursor: 'pointer',
                  }}>
                  promote drafts
                </button>
              </>
            )}
            <button className="btn-ghost" onClick={load}
              style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4 }}>
              refresh
            </button>
          </div>
        </div>

        {err && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--red, #c07070)',
            marginBottom: 20,
          }}>
            {err}
          </div>
        )}

        {!loading && (!summary || summary.totalDrafts === 0) && (
          <EmptyState icon="edit" title="no draft devices"
            subtitle="create a draft device in rack view to get started"
          />
        )}

        {/* Conflicts panel — always shown when site has data */}
        {!loading && (
          <div style={{ marginBottom: 20 }}>
            <ErrorBoundary>
              <ConflictsPanel
                siteId={siteId!}
                accent={accent}
              />
            </ErrorBoundary>
          </div>
        )}

        {summary && summary.totalDrafts > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Summary KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <KpiBox label="draft devices" value={summary.totalDrafts} loading={loading} />
              <KpiBox label="projected watts" value={`${summary.totalWatts} W`} loading={loading} color="var(--gold, #b89870)" />
              <KpiBox label="projected U" value={summary.totalU} loading={loading} color="var(--blue, #7090b8)" />
            </div>

            {/* BOM */}
            <ErrorBoundary>
              <BomTable bom={summary.bom} />
            </ErrorBoundary>

            {/* Resource check — rack space */}
            {resourceCheck && (
              <div style={{
                background: 'var(--cardBg, #141618)',
                border: '1px solid var(--border, #1d2022)',
                borderRadius: 8, padding: 12,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--text2, #8a9299)',
                  marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  rack space projection (active + staged)
                </div>
                {resourceCheck.racks?.map((r: any) => {
                  const pct = r.totalU > 0 ? Math.round((r.totalUsedU / r.totalU) * 100) : 0;
                  return (
                    <div key={r.rackId} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '4px 0',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'var(--text, #d4d9dd)',
                    }}>
                      <span style={{ flex: 1 }}>{r.rackName}</span>
                      <span style={{ color: 'var(--text3, #4e5560)' }}>
                        {r.activeU}U active + {r.stagedU}U staged / {r.totalU}U
                      </span>
                      <span style={{
                        fontWeight: 700,
                        color: pct > 90 ? 'var(--red, #c07070)' : pct > 70 ? 'var(--gold, #b89870)' : 'var(--green, #70b870)',
                      }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
                <div style={{
                  marginTop: 8, padding: '4px 0',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text, #d4d9dd)',
                  borderTop: '1px solid var(--border, #1d2022)',
                }}>
                  <span>power: </span>
                  <span style={{ color: 'var(--gold, #b89870)' }}>
                    {resourceCheck.power?.activeWatts}W active + {resourceCheck.power?.stagedWatts}W staged = {resourceCheck.power?.totalWatts}W total
                  </span>
                </div>
              </div>
            )}

            {/* Missing ledger items */}
            {summary.missingLedger.length > 0 && (
              <div style={{
                background: 'var(--cardBg, #141618)',
                border: '1px solid var(--red, #c07070)',
                borderRadius: 8, padding: 12,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--red, #c07070)',
                  marginBottom: 8, textTransform: 'uppercase',
                }}>
                  inventory shortages
                </div>
                {summary.missingLedger.map((m, i) => (
                  <div key={i} style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, color: 'var(--text, #d4d9dd)',
                    padding: '2px 0',
                  }}>
                    {m.name}: need {m.needed}, have {m.available}
                  </div>
                ))}
              </div>
            )}

            {/* Draft device list */}
            <div style={{
              background: 'var(--cardBg, #141618)',
              border: '1px solid var(--border, #1d2022)',
              borderRadius: 8, padding: 12,
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700,
                color: 'var(--text2, #8a9299)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                draft devices
              </div>
              {drafts.map(d => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text, #d4d9dd)',
                }}>
                  <Icon name="edit" size={11} color="var(--blue, #7090b8)" />
                  <span>{d.name}</span>
                  <span style={{ color: 'var(--text3, #4e5560)', fontSize: 10 }}>
                    {d.uHeight ? `${d.uHeight}U` : ''} {d.rackId ? 'placed' : 'unplaced'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Promotion wizard overlay */}
      {showPromotion && drafts.length > 0 && (
        <PromotionWizard
          siteId={siteId!}
          drafts={drafts}
          accent={accent}
          onDone={() => { setShowPromotion(false); load(); }}
        />
      )}

      {/* Assembly manual overlay */}
      {showManual && (
        <AssemblyManualModal
          siteId={siteId!}
          siteName={site?.name ?? 'Site'}
          accent={accent}
          onClose={() => setShowManual(false)}
        />
      )}
    </div>
  );
}

// ── KpiBox helper ─────────────────────────────────────────────────────────────

function KpiBox({ label, value, loading, color }: {
  label: string; value: string | number; loading: boolean; color?: string;
}) {
  return (
    <div style={{
      background:   'var(--cardBg, #141618)',
      border:       '1px solid var(--border, #1d2022)',
      borderRadius: 8, padding: '16px 18px',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, color: 'var(--text3, #4e5560)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 24, fontWeight: 700,
        color: loading ? 'var(--text3, #4e5560)' : (color ?? 'var(--text, #d4d9dd)'),
      }}>
        {loading ? '—' : value}
      </div>
    </div>
  );
}
