import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App.js';
import * as Sentry from '@sentry/react';

const metaEnv = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
if (metaEnv['VITE_SENTRY_DSN']) {
  Sentry.init({
    dsn: metaEnv['VITE_SENTRY_DSN'],
    environment: metaEnv['MODE'] ?? 'production',
    tracesSampleRate: 0.1,
    integrations: [],
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
