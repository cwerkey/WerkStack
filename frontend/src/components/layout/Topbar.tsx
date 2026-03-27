import { Icon } from '../ui/Icon';

interface TopbarProps {
  placeholder?: string;
  value?:       string;
  onChange?:    (v: string) => void;
}

export function Topbar({ placeholder = 'search...', value = '', onChange }: TopbarProps) {
  return (
    <div className="topbar">
      <Icon name="search" size={13} color="var(--text3, #4e5560)" />
      <input
        type="text"
        className="topbar-search-input"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        aria-label="Search"
      />
    </div>
  );
}
