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
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg dark:group-[.toaster]:!bg-stone-800 dark:group-[.toaster]:border-stone-700',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error:
            'group-[.toaster]:bg-destructive/10 group-[.toaster]:border-destructive/50 group-[.toaster]:!text-destructive dark:group-[.toaster]:!bg-red-950 [&_[data-icon]>svg]:text-destructive',
          success:
            'group-[.toaster]:bg-green-500/10 group-[.toaster]:border-green-500/50 group-[.toaster]:text-green-700 dark:group-[.toaster]:!text-green-300 dark:group-[.toaster]:!bg-green-950 [&_[data-icon]>svg]:text-green-600 dark:[&_[data-icon]>svg]:text-green-400',
          info: 'group-[.toaster]:bg-blue-500/10 group-[.toaster]:border-blue-500/50 group-[.toaster]:text-blue-700 dark:group-[.toaster]:!text-blue-300 dark:group-[.toaster]:!bg-blue-950 [&_[data-icon]>svg]:text-blue-600 dark:[&_[data-icon]>svg]:text-blue-400',
          warning:
            'group-[.toaster]:bg-amber-500/10 group-[.toaster]:border-amber-500/50 group-[.toaster]:text-amber-700 dark:group-[.toaster]:!text-amber-300 dark:group-[.toaster]:!bg-amber-950 [&_[data-icon]>svg]:text-amber-600 dark:[&_[data-icon]>svg]:text-amber-400',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
