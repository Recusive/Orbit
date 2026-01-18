import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './globals.css';
import { CanvasApp } from './CanvasApp';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <CanvasApp />
  </StrictMode>
);
