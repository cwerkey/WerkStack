import { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Icon } from '../../../../components/ui/Icon';
import { api } from '../../../../utils/api';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import type { DeviceTemplate } from '@werkstack/shared';

// ── Export Modal ────────────────────────────────────────────────────────────

interface ExportModalProps {
  open:     boolean;
  onClose:  () => void;
  template: DeviceTemplate | null;
}

export function ExportModal({ open, onClose, template }: ExportModalProps) {
  const [json, setJson] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !template) { setJson(''); return; }
    api.get<unknown>(`/api/templates/devices/${template.id}/export`)
      .then(data => setJson(JSON.stringify(data, null, 2)))
      .catch(() => setJson('{ "error": "failed to export" }'));
  }, [open, template]);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template?.make ?? 'template'}_${template?.model ?? 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Template" minWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--text3, #4e5560)',
        }}>
          Community Exchange Format v2
        </div>
        <textarea
          readOnly
          value={json}
          style={{
            background: 'var(--rowBg, #0a0c0e)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 4,
            padding: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--text2, #8a9299)',
            resize: 'vertical',
            minHeight: 200,
            maxHeight: 400,
            width: '100%',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={handleCopy}>
            <Icon name="copy" size={11} /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="act-primary" onClick={handleDownload}>
            <Icon name="download" size={11} /> Download
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Import Modal ────────────────────────────────────────────────────────────

interface ImportModalProps {
  open:    boolean;
  onClose: () => void;
}

export function ImportModal({ open, onClose }: ImportModalProps) {
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const upsertDeviceTemplate = useTemplateStore(s => s.upsertDeviceTemplate);

  useEffect(() => {
    if (open) { setJson(''); setError(''); setImporting(false); }
  }, [open]);

  const handleImport = async () => {
    setError('');
    setImporting(true);
    try {
      const parsed = JSON.parse(json);
      const result = await api.post<DeviceTemplate>('/api/templates/devices/import', parsed);
      upsertDeviceTemplate(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON');
      } else {
        setError(err instanceof Error ? err.message : 'import failed');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setJson(reader.result as string);
    reader.readAsText(file);
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Template" minWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--text3, #4e5560)',
        }}>
          Paste a Community Exchange Format v2 JSON or upload a file.
        </div>
        <textarea
          value={json}
          onChange={e => setJson(e.target.value)}
          placeholder='{"schema_version": "2", "metadata": {...}, "layout": {...}}'
          style={{
            background: 'var(--inputBg, #1a1d20)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 4,
            padding: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--text, #d4d9dd)',
            resize: 'vertical',
            minHeight: 200,
            maxHeight: 400,
            width: '100%',
            outline: 'none',
          }}
        />
        {error && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--red, #c07070)',
          }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--accent, #c47c5a)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Icon name="upload" size={11} /> Upload file
            <input type="file" accept=".json" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="act-primary"
              disabled={!json.trim() || importing}
              onClick={handleImport}
              style={{ opacity: !json.trim() || importing ? 0.5 : 1 }}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
