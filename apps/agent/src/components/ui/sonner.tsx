import { useEffect, useState } from 'react';
import { Toaster as Sonner } from 'sonner';

import type { ComponentProps, FC } from 'react';

type ToasterProps = ComponentProps<typeof Sonner>;

/**
 * Hook to detect dark mode from document.documentElement.classList.
 * Syncs with the useThemeSync hook in App.tsx that manages the 'dark' class.
 */
function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return isDark;
}

/**
 * Toast notification provider using Sonner.
 * Automatically adapts to light/dark theme via MutationObserver on html.dark class.
 */
const Toaster: FC<ToasterProps> = (props) => {
  const isDark = useDarkMode();

  return (
    <Sonner
      theme={isDark ? 'dark' : 'light'}
      className="toaster group"
      toastOptions={{
        style: {
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.80)',
          border: isDark ? '0.5px solid rgba(255,255,255,0.10)' : '0.5px solid rgba(0,0,0,0.08)',
          boxShadow: isDark
            ? 'inset 0 0.5px 0 0 rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.18)'
            : 'inset 0 0.5px 0 0 rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.08)',
          borderRadius: '14px',
        },
        classNames: {
          toast: 'group toast group-[.toaster]:text-foreground',
          description: 'group-[.toast]:text-lg-text-secondary',
          actionButton: 'group-[.toast]:bg-lg-default-bg group-[.toast]:text-lg-default-text',
          cancelButton: 'group-[.toast]:bg-lg-control group-[.toast]:text-lg-text-secondary',
          error: 'group-[.toaster]:text-destructive [&_[data-icon]>svg]:text-destructive',
          success: 'group-[.toaster]:text-success [&_[data-icon]>svg]:text-success',
          info: 'group-[.toaster]:text-info [&_[data-icon]>svg]:text-info',
          warning: 'group-[.toaster]:text-warning [&_[data-icon]>svg]:text-warning',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
