import { useUIStore } from '@/stores/uiStore';

const icons = {
  error: '✕',
  success: '✓',
  warning: '⚠',
  info: 'ℹ',
};

const colors = {
  error: { bg: 'var(--error-bg)', text: 'var(--error-text)', border: 'var(--error-border)' },
  success: { bg: 'var(--success-bg)', text: 'var(--success-text)', border: 'var(--success-border)' },
  warning: { bg: 'var(--warning-bg)', text: 'var(--warning-text)', border: 'var(--warning-border)' },
  info: { bg: 'var(--info-bg)', text: 'var(--info-text)', border: 'var(--info-border)' },
};

export const Toast: React.FC = () => {
  const { toasts, dismissToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          style={{
            backgroundColor: colors[toast.type].bg,
            color: colors[toast.type].text,
            borderLeftColor: colors[toast.type].border,
          }}
          onClick={() => dismissToast(toast.id)}
        >
          <span className="toast-icon">{icons[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
};