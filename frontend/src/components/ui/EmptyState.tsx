import { Icon } from './Icon';

interface EmptyStateProps {
  icon?:    string;
  title:    string;
  subtitle?: string;
  action?:  React.ReactNode;
}

export function EmptyState({ icon = 'box', title, subtitle, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: '60px 24px', flex: 1,
    }}>
      <div style={{ color: 'var(--border3, #2e3538)', marginBottom: 4 }}>
        <Icon name={icon} size={32} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
        fontWeight: 700, color: 'var(--text3, #4e5560)',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--text3, #4e5560)', textAlign: 'center', maxWidth: 320,
        }}>
          {subtitle}
        </div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
