import { useEffect, useRef } from 'react';
import styles from './BlockContextMenu.module.css';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface BlockContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function BlockContextMenu({ x, y, items, onClose }: BlockContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 32 - 8),
    zIndex: 1200,
  };

  return (
    <div ref={ref} className={styles.menu} style={style}>
      {items.map((item, i) => (
        <button
          key={i}
          className={item.danger ? styles.itemDanger : styles.item}
          onClick={() => { item.onClick(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
