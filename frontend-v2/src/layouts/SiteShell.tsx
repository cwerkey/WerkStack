import { Outlet } from 'react-router-dom';
import styles from './SiteShell.module.css';

export function SiteShell() {
  return (
    <div className={styles.wrap}>
      <Outlet />
    </div>
  );
}
