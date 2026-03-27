import { icons } from '../../icons';

interface IconProps {
  name:    string;
  size?:   number;
  color?:  string;
  style?:  React.CSSProperties;
  className?: string;
}

export function Icon({ name, size = 14, color = 'currentColor', style, className }: IconProps) {
  const content = icons[name];
  if (!content) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0, color, ...style }}
      className={className}
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}
