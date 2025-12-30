import type { FC, ReactNode } from 'react';

export interface BadgePillProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  size?: 'sm' | 'md';
  className?: string;
}

export const BadgePill: FC<BadgePillProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const variantStyles = {
    success: 'bg-success-muted text-success border-success/20',
    warning: 'bg-warning-muted text-warning border-warning/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
    info: 'bg-info-muted text-info border-info/20',
    default: 'bg-muted text-muted-foreground border-border',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-full border font-medium
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
};
