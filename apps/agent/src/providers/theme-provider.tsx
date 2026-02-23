import { createLogger } from '@orbit/common/lib';
import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useEffect, useState } from 'react';
import { GlassMaterialVariant, setLiquidGlassEffect } from 'tauri-plugin-liquid-glass-api';

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
  defaultWindowMode = 'solid',
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

  // Sync liquid glass effect and native defocus color with the current theme.
  useEffect(() => {
    // Tell the native glass-defocus layer which theme we're using so the
    // opaque fallback on window defocus matches Orbit's theme, not the system.
    void invoke('set_glass_theme', { isDark: effectiveTheme === 'dark' });

    if (windowMode === 'solid') {
      void invoke('set_frost_alpha', { alpha: 1.0 });
      void invoke('set_tint_opacity', { opacity: 0.0 });
      void invoke('configure_frost_theme', { isDark: effectiveTheme === 'dark' });
      void setLiquidGlassEffect({ enabled: false });
      return;
    }

    if (effectiveTheme === 'dark') {
      // Dark mode: NSVisualEffectView frost at full strength (looks great).
      // Liquid glass behind it adds depth. Screen tint hidden.
      void invoke('set_frost_alpha', { alpha: 1.0 });
      void invoke('set_tint_opacity', { opacity: 0.0 });
      void invoke('configure_frost_theme', { isDark: true });
      void setLiquidGlassEffect({
        variant: GlassMaterialVariant.Sidebar,
        tintColor: '#18181860',
      });
    } else {
      // Light mode: reduced frost for more see-through, white tint from below
      // via liquid glass to lighten the grey without blocking blur texture.
      void invoke('set_frost_alpha', { alpha: 0.2 });
      void invoke('set_tint_opacity', { opacity: 0.15 });
      void invoke('configure_frost_theme', { isDark: false });
      void setLiquidGlassEffect({
        variant: GlassMaterialVariant.Clear,
        tintColor: '#FFFFFF80',
      });
    }
  }, [effectiveTheme, windowMode]);

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
