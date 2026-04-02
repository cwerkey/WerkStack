import { useState, useEffect, useCallback } from 'react';
import type { Container } from '@werkstack/shared';
import { useParseDockerCompose, useCommitDockerCompose } from '@/api/containers';
import styles from './DockerComposeImport.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DockerComposeImportProps {
  open:       boolean;
  siteId:     string;
  hostId?:    string;
  vmId?:      string;
  onClose:    () => void;
  onImported: (count: number) => void;
}

type ParsedContainer = Omit<Container, 'id' | 'orgId' | 'siteId' | 'createdAt'>;

// ─── Shared Styles ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#d4d9dd',
  background: '#0e1012',
  border: '1px solid #2a3038',
  borderRadius: 4,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter,system-ui,sans-serif',
  fontSize: 11,
  color: '#8a9299',
  marginBottom: 4,
  display: 'block',
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 500,
  background: '#c47c5a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnGhost: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  background: 'none',
  color: '#8a9299',
  border: '1px solid #2a3038',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const monoStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  color: '#8a9299',
};

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepDot({ num, label, state }: { num: number; label: string; state: 'active' | 'done' | 'pending' }) {
  const color =
    state === 'active' ? '#c47c5a' :
    state === 'done'   ? '#3a8c4a' :
                         '#3a4248';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, fontWeight: 600,
        color: state === 'pending' ? '#8a9299' : '#fff',
      }}>
        {state === 'done' ? '\u2713' : num}
      </div>
      <span style={{
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 10,
        color: state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#5a6068',
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DockerComposeImport({
  open,
  siteId,
  hostId,
  vmId,
  onClose,
  onImported,
}: DockerComposeImportProps) {
  const [step, setStep]             = useState<1 | 2>(1);
  const [yamlText, setYamlText]     = useState('');
  const [parsed, setParsed]         = useState<ParsedContainer[]>([]);
  const [included, setIncluded]     = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState('');

  const parseMutation  = useParseDockerCompose(siteId);
  const commitMutation = useCommitDockerCompose(siteId);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setYamlText('');
      setParsed([]);
      setIncluded(new Set());
      setParseError('');
      parseMutation.reset();
      commitMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleParse = useCallback(async () => {
    setParseError('');
    try {
      const result = await parseMutation.mutateAsync({
        yaml: yamlText,
        hostId,
        vmId,
      });
      const containers = result.containers;
      setParsed(containers);
      setIncluded(new Set(containers.map((_, i) => i)));
      setStep(2);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'failed to parse');
    }
  }, [yamlText, hostId, vmId, parseMutation]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setYamlText(reader.result);
      }
    };
    reader.readAsText(file);
  }, []);

  const toggleInclude = useCallback((idx: number) => {
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (included.size === parsed.length) {
      setIncluded(new Set());
    } else {
      setIncluded(new Set(parsed.map((_, i) => i)));
    }
  }, [included, parsed]);

  const handleImport = useCallback(async () => {
    const selected = parsed.filter((_, i) => included.has(i));
    if (selected.length === 0) return;
    try {
      const result = await commitMutation.mutateAsync({
        containers: selected,
        hostId,
        vmId,
      });
      onImported(result.length);
      onClose();
    } catch {
      // error displayed via mutation state
    }
  }, [parsed, included, hostId, vmId, commitMutation, onImported, onClose]);

  if (!open) return null;

  const formatPorts = (ports: ParsedContainer['ports']) =>
    ports.map(p => `${p.hostPort}:${p.containerPort}/${p.protocol}`).join(', ');

  const formatVolumes = (volumes: ParsedContainer['volumes']) =>
    volumes.map(v => `${v.hostPath}:${v.containerPath}${v.readOnly ? ':ro' : ''}`).join(', ');

  return (
    <div className={styles.overlay}>
      <div
        className={styles.panel}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 15, fontWeight: 600, color: '#d4d9dd',
          }}>
            Import Docker Compose
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a6068', fontSize: 18, lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StepDot num={1} label="Upload" state={step === 1 ? 'active' : 'done'} />
          <StepDot num={2} label="Preview" state={step === 2 ? 'active' : 'pending'} />
        </div>

        {/* ── Step 1: Upload ─────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Paste docker-compose.yml contents</label>
              <textarea
                style={{
                  ...inputStyle,
                  height: 240,
                  resize: 'vertical',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
                value={yamlText}
                onChange={e => setYamlText(e.target.value)}
                placeholder="version: '3'\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - '8080:80'"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10, color: '#5a6068' }}>or</span>
              <label style={{
                ...btnGhost,
                padding: '4px 12px',
                fontSize: 11,
                display: 'inline-block',
              }}>
                Choose file
                <input
                  type="file"
                  accept=".yml,.yaml"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {parseError && (
              <div style={{
                padding: '6px 10px',
                background: '#2a1515',
                border: '1px solid #5a2020',
                borderRadius: 4,
                fontSize: 11,
                color: '#e08080',
                fontFamily: 'Inter,system-ui,sans-serif',
              }}>
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Preview & Map ──────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>
                {parsed.length} service{parsed.length !== 1 ? 's' : ''} found
                ({included.size} selected)
              </span>
              <button
                style={{ ...btnGhost, padding: '3px 10px', fontSize: 10 }}
                onClick={toggleAll}
              >
                {included.size === parsed.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div style={{
              border: '1px solid #2a3038',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 1fr 1fr 1fr',
                gap: 0,
                padding: '6px 8px',
                background: '#111417',
                borderBottom: '1px solid #2a3038',
                fontSize: 10,
                fontWeight: 600,
                color: '#5a6068',
                fontFamily: 'Inter,system-ui,sans-serif',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                <span />
                <span>Service</span>
                <span>Image</span>
                <span>Ports</span>
                <span>Volumes</span>
              </div>

              {/* Service rows */}
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {parsed.map((ctr, idx) => (
                  <div
                    key={idx}
                    className={styles.serviceRow}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr 1fr 1fr 1fr',
                      gap: 0,
                      padding: '6px 8px',
                      borderBottom: idx < parsed.length - 1 ? '1px solid #1e2428' : 'none',
                      cursor: 'pointer',
                      background: included.has(idx) ? 'transparent' : '#0e1012',
                      opacity: included.has(idx) ? 1 : 0.5,
                    }}
                    onClick={() => toggleInclude(idx)}
                  >
                    <input
                      type="checkbox"
                      checked={included.has(idx)}
                      onChange={() => toggleInclude(idx)}
                      style={{ accentColor: '#c47c5a', cursor: 'pointer' }}
                    />
                    <span style={{
                      fontSize: 11, color: '#d4d9dd', fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ctr.composeService || ctr.name}
                    </span>
                    <span style={{
                      ...monoStyle,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ctr.image}:{ctr.tag}
                    </span>
                    <span style={{
                      ...monoStyle,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ctr.ports.length > 0 ? formatPorts(ctr.ports) : '-'}
                    </span>
                    <span style={{
                      ...monoStyle,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ctr.volumes.length > 0 ? formatVolumes(ctr.volumes) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {commitMutation.isError && (
              <div style={{
                padding: '6px 10px',
                background: '#2a1515',
                border: '1px solid #5a2020',
                borderRadius: 4,
                fontSize: 11,
                color: '#e08080',
                fontFamily: 'Inter,system-ui,sans-serif',
              }}>
                {commitMutation.error instanceof Error
                  ? commitMutation.error.message
                  : 'failed to import containers'}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation buttons ──────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {step === 2 && (
            <button style={btnGhost} onClick={() => setStep(1)}>
              Back
            </button>
          )}
          {step === 1 && (
            <button
              style={{
                ...btnPrimary,
                opacity: yamlText.trim().length > 0 && !parseMutation.isPending ? 1 : 0.4,
              }}
              disabled={yamlText.trim().length === 0 || parseMutation.isPending}
              onClick={handleParse}
            >
              {parseMutation.isPending ? 'Parsing...' : 'Parse'}
            </button>
          )}
          {step === 2 && (
            <button
              style={{
                ...btnPrimary,
                opacity: included.size > 0 && !commitMutation.isPending ? 1 : 0.4,
              }}
              disabled={included.size === 0 || commitMutation.isPending}
              onClick={handleImport}
            >
              {commitMutation.isPending
                ? 'Importing...'
                : `Import ${included.size} Service${included.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
