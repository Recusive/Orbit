import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xyflow/react/dist/style.css';
import './globals.css';
import '@canvas/globals.css';
import App from './App';

// Initialize dev-monitor in development mode
async function initApp(): Promise<void> {
  // Dev-monitor initialization (no-op in production, tree-shaken)
  if (import.meta.env.DEV) {
    const { initDevMonitor, trace } = await import('@/dev-monitor');
    await initDevMonitor();

    // Subscribe to Rust tracing events
    await trace.rust.subscribe();
  }

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Failed to find the root element');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void initApp();
