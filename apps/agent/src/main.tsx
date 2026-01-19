import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * CSS Import Order - IMPORTANT
 *
 * Third-party library styles are imported HERE (not in components) to ensure
 * predictable cascade order. Our globals.css comes LAST so its overrides win.
 *
 * Example: Allotment sets --focus-border: #007fd4 (blue) for resize handles.
 * Our globals.css overrides this with --focus-border: var(--primary) (coral).
 * If Allotment CSS loaded after globals.css, the blue would win.
 *
 * Order:
 * 1. ReactFlow base styles
 * 2. Allotment base styles
 * 3. Our globals.css (overrides)
 */
import '@xyflow/react/dist/style.css';
import 'allotment/dist/style.css';
import './globals.css';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
