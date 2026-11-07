import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { App } from './App'
import { initSentry } from './sentry'
import './styles.css'

// Initialize Sentry before rendering so startup/render errors are captured
// (no-op when VITE_SENTRY_DSN is unset).
initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please reload the app.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
