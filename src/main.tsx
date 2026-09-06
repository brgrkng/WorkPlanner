import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted, not a Google Fonts <link>: the app has to start on a connection
// that just came back, and a render-blocking third-party request is exactly the
// wrong dependency for that. Vite emits the woff2 alongside the bundle; the
// browser downloads only the latin subset via unicode-range.
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
