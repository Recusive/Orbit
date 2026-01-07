import React from 'react';
import { createRoot } from 'react-dom/client';

import './globals.css';
import '@xyflow/react/dist/style.css';

import { CanvasApp } from './CanvasApp';

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

function logEnvironment(): void {
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
  if (isTauri) {
    console.warn('[Canvas] Running in Tauri environment');
  } else {
    console.warn('[Canvas] Running in standalone browser mode');
  }
}

// =============================================================================
// ERROR SUPPRESSION
// =============================================================================

// Suppress ResizeObserver loop warnings (harmless, caused by React Flow internals)
const originalOnError = window.onerror;
window.onerror = (
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean => {
  if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
    return true; // Suppress the error
  }
  if (originalOnError !== null) {
    const result: unknown = originalOnError(message, source, lineno, colno, error);
    return typeof result === 'boolean' ? result : false;
  }
  return false;
};

// Also suppress in console.error for Chromium
const originalConsoleError = console.error;
console.error = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && args[0].includes('ResizeObserver loop')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// =============================================================================
// APP INITIALIZATION
// =============================================================================

const container = document.getElementById('root');
if (container === null) {
  throw new Error('[Canvas] Root element not found');
}

logEnvironment();

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <CanvasApp />
  </React.StrictMode>
);
