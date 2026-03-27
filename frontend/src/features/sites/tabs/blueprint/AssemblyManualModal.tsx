import { useState, useEffect } from 'react';
import { api }  from '../../../../utils/api';
import type { AssemblyManual } from '@werkstack/shared';

// ── Print styles injected into a new window ────────────────────────────────────

function buildPrintHtml(manual: AssemblyManual, siteName: string): string {
  const bomRows = manual.bom.flatMap(line =>
    line.instances.map(inst => `
      <tr>
        <td>${line.make}</td>
        <td>${line.model}</td>
        <td>${inst.name}</td>
        <td>${inst.rackName ?? '—'}</td>
        <td>${inst.rackU != null ? `U${inst.rackU}` : '—'}</td>
        <td>${inst.uHeight != null ? `${inst.uHeight}U` : '—'}</td>
        <td>${inst.serial ?? '—'}</td>
        <td>${inst.assetTag ?? '—'}</td>
      </tr>`)
  ).join('');

  const wiringRows = manual.wiringGuide.map((step, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${step.cableType ?? '—'}</td>
      <td>${step.srcDevice}${step.srcRack ? ` (${step.srcRack}${step.srcRackU ? ` U${step.srcRackU}` : ''})` : ''}${step.srcPort ? ` / ${step.srcPort}` : ''}</td>
      <td>${step.dstDevice}${step.dstRack ? ` (${step.dstRack}${step.dstRackU ? ` U${step.dstRackU}` : ''})` : ''}${step.dstPort ? ` / ${step.dstPort}` : ''}</td>
      <td>${step.label ?? '—'}</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Assembly Manual — ${siteName}</title>
  <style>
    body { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 11px; color: #1a1a1a; margin: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 24px; text-transform: uppercase; letter-spacing: 0.08em; }
    .meta { font-size: 10px; color: #666; margin-bottom: 24px; }
    .kpis { display: flex; gap: 24px; margin-bottom: 16px; }
    .kpi { border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; }
    .kpi-label { font-size: 9px; text-transform: uppercase; color: #888; }
    .kpi-value { font-size: 18px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { font-size: 9px; text-transform: uppercase; color: #666; text-align: left; padding: 4px 8px; border-bottom: 1px solid #ccc; }
    td { padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Assembly Manual</h1>
  <div class="meta">
    Site: ${siteName} &nbsp;|&nbsp;
    Generated: ${new Date(manual.generatedAt).toLocaleString()} &nbsp;|&nbsp;
    ${manual.totalDrafts} draft device${manual.totalDrafts !== 1 ? 's' : ''}
  </div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Draft Devices</div>
      <div class="kpi-value">${manual.totalDrafts}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Projected Power</div>
      <div class="kpi-value">${manual.totalWatts} W</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Projected U-Height</div>
      <div class="kpi-value">${manual.totalU} U</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Wiring Steps</div>
      <div class="kpi-value">${manual.wiringGuide.length}</div>
    </div>
  </div>

  <h2>Bill of Materials</h2>
  <table>
    <thead>
      <tr>
        <th>Make</th><th>Model</th><th>Device Name</th>
        <th>Rack</th><th>Position</th><th>Height</th>
        <th>Serial</th><th>Asset Tag</th>
      </tr>
    </thead>
    <tbody>${bomRows || '<tr><td colspan="8">No draft devices</td></tr>'}</tbody>
  </table>

  <h2>Wiring Guide</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Cable</th><th>Source (rack / port)</th><th>Destination (rack / port)</th><th>Label</th></tr>
    </thead>
    <tbody>${wiringRows || '<tr><td colspan="5">No connections</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

// ── AssemblyManualModal ────────────────────────────────────────────────────────

interface Props {
  siteId:    string;
  siteName:  string;
  accent:    string;
  onClose:   () => void;
}

export function AssemblyManualModal({ siteId, siteName, accent, onClose }: Props) {
  const [manual, setManual]   = useState<AssemblyManual | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  useEffect(() => {
    api.get<AssemblyManual>(`/api/sites/${siteId}/blueprints/assembly-manual`)
      .then(m => setManual(m!))
      .catch(e => setErr(e instanceof Error ? e.message : 'failed to load'))
      .finally(() => setLoading(false));
  }, [siteId]);

  const handlePrint = () => {
    if (!manual) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildPrintHtml(manual, siteName));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
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
        borderRadius: 8,
        width: 680, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border, #1d2022)',
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
          }}>
            assembly manual
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {manual && (
              <button
                className="act-primary"
                onClick={handlePrint}
                style={{
                  background: accent, border: 'none', borderRadius: 4,
                  padding: '5px 12px', color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                print / export PDF
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}
              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 4 }}>
              close
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: 'var(--text3, #4e5560)',
            }}>
              generating assembly manual…
            </div>
          )}

          {err && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: 'var(--red, #c07070)',
            }}>
              {err}
            </div>
          )}

          {manual && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'draft devices', value: manual.totalDrafts },
                  { label: 'projected watts', value: `${manual.totalWatts} W`, color: 'var(--gold, #b89870)' },
                  { label: 'projected U', value: `${manual.totalU}U`, color: 'var(--blue, #7090b8)' },
                  { label: 'wiring steps', value: manual.wiringGuide.length, color: 'var(--green, #70b870)' },
                ].map(k => (
                  <div key={k.label} style={{
                    background: 'var(--inputBg, #1a1d20)',
                    border: '1px solid var(--border, #1d2022)',
                    borderRadius: 6, padding: '10px 12px',
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: 'var(--text3, #4e5560)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
                    }}>
                      {k.label}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 18, fontWeight: 700,
                      color: k.color ?? 'var(--text, #d4d9dd)',
                    }}>
                      {k.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* BOM */}
              <Section title="bill of materials">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: 'var(--text3, #4e5560)',
                      textTransform: 'uppercase', textAlign: 'left',
                    }}>
                      <Th>make</Th><Th>model</Th><Th>name</Th>
                      <Th>rack</Th><Th>pos</Th><Th>height</Th>
                      <Th>serial</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {manual.bom.flatMap(line =>
                      line.instances.map((inst, j) => (
                        <tr key={`${line.model}-${j}`} style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, color: 'var(--text, #d4d9dd)',
                          borderTop: '1px solid var(--border, #1d2022)',
                        }}>
                          <Td>{j === 0 ? line.make : ''}</Td>
                          <Td>{j === 0 ? line.model : ''}</Td>
                          <Td>{inst.name}</Td>
                          <Td>{inst.rackName ?? '—'}</Td>
                          <Td>{inst.rackU != null ? `U${inst.rackU}` : '—'}</Td>
                          <Td>{inst.uHeight != null ? `${inst.uHeight}U` : '—'}</Td>
                          <Td>{inst.serial ?? '—'}</Td>
                        </tr>
                      ))
                    )}
                    {manual.bom.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '8px 10px', color: 'var(--text3, #4e5560)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>no draft devices</td></tr>
                    )}
                  </tbody>
                </table>
              </Section>

              {/* Wiring guide */}
              <Section title="wiring guide">
                {manual.wiringGuide.length === 0 ? (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, color: 'var(--text3, #4e5560)', padding: '6px 0',
                  }}>
                    no connections involving draft devices
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9, color: 'var(--text3, #4e5560)',
                        textTransform: 'uppercase', textAlign: 'left',
                      }}>
                        <Th style={{ width: 24 }}>#</Th>
                        <Th>cable</Th>
                        <Th>source (device / rack / port)</Th>
                        <Th>destination (device / rack / port)</Th>
                        <Th>label</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {manual.wiringGuide.map((step, i) => (
                        <tr key={step.connectionId} style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, color: 'var(--text, #d4d9dd)',
                          borderTop: '1px solid var(--border, #1d2022)',
                        }}>
                          <Td style={{ color: 'var(--text3, #4e5560)' }}>{i + 1}</Td>
                          <Td>{step.cableType ?? '—'}</Td>
                          <Td>
                            <div>{step.srcDevice}</div>
                            {(step.srcRack || step.srcPort) && (
                              <div style={{ fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                                {step.srcRack}{step.srcRackU != null ? ` U${step.srcRackU}` : ''}{step.srcPort ? ` / ${step.srcPort}` : ''}
                              </div>
                            )}
                          </Td>
                          <Td>
                            <div>{step.dstDevice}</div>
                            {(step.dstRack || step.dstPort) && (
                              <div style={{ fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                                {step.dstRack}{step.dstRackU != null ? ` U${step.dstRackU}` : ''}{step.dstPort ? ` / ${step.dstPort}` : ''}
                              </div>
                            )}
                          </Td>
                          <Td>{step.label ?? '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--cardBg, #141618)',
      border: '1px solid var(--border, #1d2022)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 700,
        color: 'var(--text2, #8a9299)',
        padding: '7px 10px',
        borderBottom: '1px solid var(--border, #1d2022)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {title}
      </div>
      <div style={{ padding: 0 }}>{children}</div>
    </div>
  );
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '5px 10px', ...style }}>{children}</th>;
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '5px 10px', verticalAlign: 'top', ...style }}>{children}</td>;
}
