/**
 * InputGroup Component
 *
 * A flexible input group component following shadcn/ui patterns.
 * Supports textarea, addons, buttons, and separators.
 */

import React, { forwardRef, useState, useEffect, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  disabled?: boolean;
}

export interface InputGroupTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

export interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'inline-start' | 'inline-end' | 'block-start' | 'block-end';
  children: React.ReactNode;
}

export interface InputGroupButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon' | 'icon-xs';
  children: React.ReactNode;
}

export interface InputGroupTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export interface InputGroupSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  group: {
    position: 'relative' as const,
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--muted)',
    transition: 'border-color 0.15s ease',
    outline: 'none',
    minWidth: 0,
  },
  groupFocused: {
    borderColor: 'var(--muted-foreground)',
  },
  groupBlockEnd: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  textarea: {
    flex: 1,
    resize: 'none' as const,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: 13,
    lineHeight: 1.5,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    minHeight: 24,
    maxHeight: 120,
    padding: '12px',
    width: '100%',
  },
  addon: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    color: 'var(--muted-foreground)',
    fontSize: 12,
    fontWeight: 500,
  },
  addonBlockEnd: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    border: 'none',
    borderRadius: 9999,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    fontWeight: 500,
    fontSize: 12,
    flexShrink: 0,
  },
  buttonDefault: {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  buttonDefaultHover: {
    backgroundColor: 'var(--primary)',
    opacity: 0.9,
  },
  buttonOutline: {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
  },
  buttonOutlineHover: {
    backgroundColor: 'var(--accent)',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
  },
  buttonGhostHover: {
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    pointerEvents: 'none' as const,
  },
  buttonIconXs: {
    width: 24,
    height: 24,
    padding: 0,
  },
  buttonIcon: {
    width: 28,
    height: 28,
    padding: 0,
  },
  buttonSm: {
    height: 24,
    padding: '0 8px',
  },
  text: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: 'var(--muted-foreground)',
    fontSize: 12,
  },
  separator: {
    backgroundColor: 'var(--border)',
    flexShrink: 0,
  },
  separatorVertical: {
    width: 1,
    height: 16,
  },
  separatorHorizontal: {
    width: '100%',
    height: 1,
  },
};

// =============================================================================
// COMPONENTS
// =============================================================================

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
  ({ children, disabled = false, style, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasBlockEndAddon = React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) && (child.props as { align?: string }).align === 'block-end'
    );

    return (
      <div
        ref={ref}
        role="group"
        data-slot="input-group"
        data-disabled={disabled}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        style={{
          ...styles.group,
          ...(hasBlockEndAddon ? styles.groupBlockEnd : {}),
          ...(isFocused ? styles.groupFocused : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
InputGroup.displayName = 'InputGroup';

export const InputGroupTextarea = forwardRef<HTMLTextAreaElement, InputGroupTextareaProps>(
  ({ autoResize = true, style, onChange, ...props }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = ref !== null ? (ref as React.RefObject<HTMLTextAreaElement>) : internalRef;

    // Auto-resize effect
    useEffect(() => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${String(Math.min(textareaRef.current.scrollHeight, 120))}px`;
      }
    }, [autoResize, textareaRef, props.value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${String(Math.min(textareaRef.current.scrollHeight, 120))}px`;
      }
      onChange?.(e);
    };

    return (
      <textarea
        ref={textareaRef}
        data-slot="input-group-control"
        rows={1}
        style={{
          ...styles.textarea,
          ...style,
        }}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
InputGroupTextarea.displayName = 'InputGroupTextarea';

export function InputGroupAddon({
  align = 'inline-end',
  children,
  style,
  ...props
}: InputGroupAddonProps): React.JSX.Element {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      style={{
        ...styles.addon,
        ...(align === 'block-end' ? styles.addonBlockEnd : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function InputGroupButton({
  variant = 'default',
  size = 'default',
  disabled = false,
  children,
  style,
  ...props
}: InputGroupButtonProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'outline':
        return isHovered && !disabled
          ? { ...styles.buttonOutline, ...styles.buttonOutlineHover }
          : styles.buttonOutline;
      case 'ghost':
        return isHovered && !disabled
          ? { ...styles.buttonGhost, ...styles.buttonGhostHover }
          : styles.buttonGhost;
      case 'default':
        return isHovered && !disabled
          ? { ...styles.buttonDefault, ...styles.buttonDefaultHover }
          : styles.buttonDefault;
    }
  };

  const getSizeStyle = (): React.CSSProperties => {
    switch (size) {
      case 'icon-xs':
        return styles.buttonIconXs;
      case 'icon':
        return styles.buttonIcon;
      case 'sm':
        return styles.buttonSm;
      case 'default':
        return {};
    }
  };

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      type="button"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      style={{
        ...styles.button,
        ...getVariantStyle(),
        ...getSizeStyle(),
        ...(disabled ? styles.buttonDisabled : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function InputGroupText({
  children,
  style,
  ...props
}: InputGroupTextProps): React.JSX.Element {
  return (
    <span
      data-slot="input-group-text"
      style={{
        ...styles.text,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export function InputGroupSeparator({
  orientation = 'vertical',
  style,
  ...props
}: InputGroupSeparatorProps): React.JSX.Element {
  return (
    <div
      role="none"
      data-slot="separator"
      data-orientation={orientation}
      style={{
        ...styles.separator,
        ...(orientation === 'vertical' ? styles.separatorVertical : styles.separatorHorizontal),
        ...style,
      }}
      {...props}
    />
  );
}

export default InputGroup;
