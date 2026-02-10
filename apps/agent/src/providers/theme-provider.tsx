import { createLogger } from '@orbit/common/lib';
import { createContext, useContext, useEffect, useState } from 'react';

import type { FC, ReactNode } from 'react';

const logger = createLogger('ThemeProvider');

export type Theme = 'light' | 'dark' | 'system';
export type WindowMode = 'liquid-glass' | 'solid';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'light' | 'dark';
  windowMode: WindowMode;
  setWindowMode: (mode: WindowMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  defaultWindowMode?: WindowMode;
  storageKey?: string;
  windowModeStorageKey?: string;
}

export const ThemeProvider: FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'system',
  defaultWindowMode = 'liquid-glass',
  storageKey = 'orbit-agent-theme',
  windowModeStorageKey = 'orbit-agent-window-mode',
}) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return defaultTheme;
  });

  const [windowMode, setWindowModeState] = useState<WindowMode>(() => {
    const stored = localStorage.getItem(windowModeStorageKey);
    if (stored === 'liquid-glass' || stored === 'solid') {
      return stored;
    }
    return defaultWindowMode;
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove previous theme classes
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
      setEffectiveTheme(systemTheme);
    } else {
      root.classList.add(theme);
      setEffectiveTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = (e: MediaQueryListEvent): void => {
        const systemTheme = e.matches ? 'dark' : 'light';
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(systemTheme);
        setEffectiveTheme(systemTheme);
      };

      mediaQuery.addEventListener('change', handleChange);
      return (): void => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }
    return undefined;
  }, [theme]);

  // Window mode effect - adds class to HTML element for CSS overrides
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('window-mode-liquid-glass', 'window-mode-solid');
    root.classList.add(`window-mode-${windowMode}`);
  }, [windowMode]);

  const setTheme = (newTheme: Theme): void => {
    logger.debug('Theme changed', { theme: newTheme });
    localStorage.setItem(storageKey, newTheme);
    setThemeState(newTheme);
  };

  const setWindowMode = (newMode: WindowMode): void => {
    logger.debug('Window mode changed', { mode: newMode });
    localStorage.setItem(windowModeStorageKey, newMode);
    setWindowModeState(newMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme, windowMode, setWindowMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
