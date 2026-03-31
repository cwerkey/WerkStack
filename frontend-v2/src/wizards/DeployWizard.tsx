interface DeployWizardProps {
  open: boolean;
  rackU?: number;
  onClose: () => void;
}

export function DeployWizard({ open, rackU, onClose }: DeployWizardProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1a1e22',
          border: '1px solid #2a3038',
          borderRadius: 8,
          padding: '32px 40px',
          minWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, fontWeight: 600, color: '#d4d9dd' }}>
          Deploy Wizard
        </h2>
        <p style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#8a9299' }}>
          {rackU != null ? `U${rackU} — ` : ''}Coming in Phase 10
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#2a3038',
              border: '1px solid #3a4248',
              borderRadius: 4,
              padding: '6px 16px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              color: '#d4d9dd',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
