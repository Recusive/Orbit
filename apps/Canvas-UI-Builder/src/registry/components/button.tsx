/**
 * Button - Preview component with customizable props
 *
 * Props can be controlled from the properties panel.
 * AI can edit this file directly to modify the component.
 */
import * as React from 'react';

import type { ReactNode } from 'react';

// Utility function
function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}

export interface ButtonProps {
  /** Button text content */
  children?: ReactNode;
  /** Visual variant */
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
  /** Size variant */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Custom border radius in px (overrides variant) */
  borderRadius?: number;
  /** Custom font size in px (overrides size variant) */
  fontSize?: number;
  /** Custom background color */
  backgroundColor?: string;
  /** Custom text color */
  textColor?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

const variantStyles: Record<string, string> = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  outline:
    'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};

const sizeStyles: Record<string, string> = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-10 px-8 text-base',
  icon: 'h-9 w-9',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children = 'Button',
      variant = 'default',
      size = 'default',
      borderRadius,
      fontSize,
      backgroundColor,
      textColor,
      disabled = false,
      className,
      onClick,
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

    // Build custom inline styles from props
    const customStyles: React.CSSProperties = {};
    if (borderRadius !== undefined) customStyles.borderRadius = `${String(borderRadius)}px`;
    if (fontSize !== undefined) customStyles.fontSize = `${String(fontSize)}px`;
    if (backgroundColor !== undefined) customStyles.backgroundColor = backgroundColor;
    if (textColor !== undefined) customStyles.color = textColor;

    return (
      <button
        type="button"
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        style={Object.keys(customStyles).length > 0 ? customStyles : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
