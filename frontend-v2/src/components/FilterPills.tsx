import React from 'react';

export interface PillGroup {
  key:      string;
  label?:   string;
  options:  { value: string; label: string }[];
  selected: string | null;          // null = "all"
  onChange: (value: string | null) => void;
}

interface FilterPillsProps {
  groups: PillGroup[];
  style?: React.CSSProperties;
}

export default function FilterPills({ groups, style }: FilterPillsProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', ...style }}>
      {groups.map(group => (
        <div key={group.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {group.label && (
            <span style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>
              {group.label}
            </span>
          )}
          <button
            onClick={() => group.onChange(group.selected === null ? '\x00' : null)}
            style={{
              padding: '3px 10px',
              borderRadius: 12,
              border: '1px solid',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.12s',
              background:   group.selected === null ? 'var(--color-accent)'       : 'transparent',
              borderColor:  group.selected === null ? 'var(--color-accent)'       : 'var(--color-border)',
              color:        group.selected === null ? 'var(--color-accent-text)'  : 'var(--color-text-muted)',
              fontWeight:   group.selected === null ? 600 : 400,
            }}
          >
            all
          </button>
          {group.options.map(opt => {
            const on = group.selected === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => group.onChange(on ? null : opt.value)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  border: '1px solid',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  background:  on ? 'var(--color-accent)'       : 'transparent',
                  borderColor: on ? 'var(--color-accent)'       : 'var(--color-border)',
                  color:       on ? 'var(--color-accent-text)'  : 'var(--color-text-muted)',
                  fontWeight:  on ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
