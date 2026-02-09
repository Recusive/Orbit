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
            'group toast group-[.toaster]:bg-gray-2 group-[.toaster]:text-gray-12 group-[.toaster]:border group-[.toaster]:border-gray-5 group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg dark:group-[.toaster]:bg-gray-3',
          description: 'group-[.toast]:text-gray-10',
          actionButton: 'group-[.toast]:bg-gray-12 group-[.toast]:text-gray-1',
          cancelButton: 'group-[.toast]:bg-gray-4 group-[.toast]:text-gray-11',
          error:
            'group-[.toaster]:border-destructive/40 group-[.toaster]:text-destructive [&_[data-icon]>svg]:text-destructive',
          success:
            'group-[.toaster]:border-green-600/40 group-[.toaster]:text-green-700 dark:group-[.toaster]:text-green-400 [&_[data-icon]>svg]:text-green-600 dark:[&_[data-icon]>svg]:text-green-400',
          info: 'group-[.toaster]:border-blue-600/40 group-[.toaster]:text-blue-700 dark:group-[.toaster]:text-blue-400 [&_[data-icon]>svg]:text-blue-600 dark:[&_[data-icon]>svg]:text-blue-400',
          warning:
            'group-[.toaster]:border-amber-600/40 group-[.toaster]:text-amber-700 dark:group-[.toaster]:text-amber-400 [&_[data-icon]>svg]:text-amber-600 dark:[&_[data-icon]>svg]:text-amber-400',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
