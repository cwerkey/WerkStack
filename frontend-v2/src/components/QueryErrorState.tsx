import styles from './QueryErrorState.module.css';

interface QueryErrorStateProps {
  error: Error | unknown;
  onRetry?: () => void;
}

function getErrorMessage(error: Error | unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

export default function QueryErrorState({ error, onRetry }: QueryErrorStateProps) {
  const message = getErrorMessage(error);

  return (
    <div className={styles.wrapper}>
      <p className={styles.message}>Failed to load data: {message}</p>
      {onRetry && (
        <button className={styles.retryBtn} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
