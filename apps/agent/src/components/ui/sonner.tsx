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
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-lg-separator group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg',
          description: 'group-[.toast]:text-lg-text-secondary',
          actionButton: 'group-[.toast]:bg-lg-default-bg group-[.toast]:text-lg-default-text',
          cancelButton: 'group-[.toast]:bg-lg-control group-[.toast]:text-lg-text-secondary',
          error:
            'group-[.toaster]:border-destructive/40 group-[.toaster]:text-destructive [&_[data-icon]>svg]:text-destructive',
          success:
            'group-[.toaster]:border-success/40 group-[.toaster]:text-success [&_[data-icon]>svg]:text-success',
          info: 'group-[.toaster]:border-info/40 group-[.toaster]:text-info [&_[data-icon]>svg]:text-info',
          warning:
            'group-[.toaster]:border-warning/40 group-[.toaster]:text-warning [&_[data-icon]>svg]:text-warning',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
