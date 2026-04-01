import React from 'react';
import styles from './Skeleton.module.css';

// Width patterns for varying visual interest
const TEXT_WIDTHS = ['100%', '80%', '90%', '70%'];
const TABLE_CELL_WIDTHS = ['60%', '80%', '50%', '30%'];

interface SkeletonProps {
  variant: 'table-row' | 'card' | 'text' | 'block';
  count?: number;
  className?: string;
}

export default function Skeleton({ variant, count = 3, className }: SkeletonProps) {
  if (variant === 'table-row') {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} className={styles.tableRow}>
            {TABLE_CELL_WIDTHS.map((w, j) => (
              <td key={j}>
                <span className={styles.tableCell} style={{ width: w }} />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <div className={className}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={styles.card} />
        ))}
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className={className}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={styles.textLine}
            style={{ width: TEXT_WIDTHS[i % TEXT_WIDTHS.length] }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'block') {
    return <div className={`${styles.block} ${className ?? ''}`} />;
  }

  return null;
}
