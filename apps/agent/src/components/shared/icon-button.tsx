import { TooltipWrapper } from './tooltip-wrapper';

import type { FC, ReactNode, ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tooltip?: string;
  variant?: 'default' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton: FC<IconButtonProps> = ({
  icon,
  tooltip,
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}) => {
  const baseStyles = 'rounded transition-colors focus:outline-none focus:ring-2 focus:ring-ring';

  const variantStyles = {
    default: 'hover:bg-muted text-foreground',
    ghost: 'hover:bg-muted/50 text-muted-foreground hover:text-foreground',
    destructive: 'hover:bg-destructive/10 text-destructive',
  };

  const sizeStyles = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };

  const button = (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );

  if (tooltip) {
    return <TooltipWrapper content={tooltip}>{button}</TooltipWrapper>;
  }

  return button;
};
