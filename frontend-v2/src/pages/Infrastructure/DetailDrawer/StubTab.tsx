import type { DrawerTab } from '@werkstack/shared';

interface StubTabProps {
  tab: DrawerTab;
}

export function StubTab({ tab }: StubTabProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 120,
      color: 'var(--color-text-muted, #5a6068)',
      fontSize: 12,
    }}>
      {tab} tab — coming soon
    </div>
  );
}
