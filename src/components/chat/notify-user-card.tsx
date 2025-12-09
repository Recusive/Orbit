import { Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

import type { FC } from 'react';

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'destructive';
}

export interface NotifyUserCardProps {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  actions?: NotificationAction[];
  className?: string;
}

export const NotifyUserCard: FC<NotifyUserCardProps> = ({
  type,
  message,
  actions = [],
  className = '',
}) => {
  const getIcon = (): React.JSX.Element => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'error':
        return <XCircle className="w-4 h-4" />;
      case 'info':
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getStyles = (): { container: string; icon: string; text: string } => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900',
          icon: 'text-green-600 dark:text-green-400',
          text: 'text-green-900 dark:text-green-100',
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900',
          icon: 'text-yellow-600 dark:text-yellow-400',
          text: 'text-yellow-900 dark:text-yellow-100',
        };
      case 'error':
        return {
          container: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
          icon: 'text-red-600 dark:text-red-400',
          text: 'text-red-900 dark:text-red-100',
        };
      case 'info':
      default:
        return {
          container: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900',
          icon: 'text-blue-600 dark:text-blue-400',
          text: 'text-blue-900 dark:text-blue-100',
        };
    }
  };

  const getButtonStyles = (variant: NotificationAction['variant'] = 'default'): string => {
    switch (variant) {
      case 'primary':
        return 'bg-primary text-primary-foreground hover:bg-primary/90';
      case 'destructive':
        return 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
      case 'default':
      default:
        return 'bg-background text-foreground hover:bg-accent';
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`border rounded-lg p-4 ${styles.container} ${className}`}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 ${styles.icon}`}>
          {getIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Message */}
          <p className={`text-sm leading-relaxed ${styles.text}`}>
            {message}
          </p>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${getButtonStyles(
                    action.variant
                  )}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
