/**
 * Toast - Simple notification component for brief feedback messages
 */
import React, { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastProps {
  message: ToastMessage | null;
  duration?: number;
  onDismiss: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 16,
    right: 16,
    zIndex: 10000,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: 500,
    animation: 'toast-slide-in 0.2s ease-out',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
  },
};

const SuccessIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ErrorIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const InfoIcon = (): React.JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export function Toast({
  message,
  duration = 2000,
  onDismiss,
}: ToastProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (message) {
      setCurrentMessage(message);
      setIsVisible(true);

      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 200); // Wait for fade out animation
      }, duration);

      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [message, duration, onDismiss]);

  if (!currentMessage || !isVisible) return null;

  const Icon =
    currentMessage.type === 'error'
      ? ErrorIcon
      : currentMessage.type === 'info'
        ? InfoIcon
        : SuccessIcon;

  return (
    <div style={styles['container']}>
      <style>{`
				@keyframes toast-slide-in {
					from {
						transform: translateY(20px);
						opacity: 0;
					}
					to {
						transform: translateY(0);
						opacity: 1;
					}
				}
			`}</style>
      <div
        style={{
          ...styles['toast'],
          transition: 'opacity 0.2s, transform 0.2s',
        }}
      >
        <span style={styles['icon']}>
          <Icon />
        </span>
        {currentMessage.message}
      </div>
    </div>
  );
}
