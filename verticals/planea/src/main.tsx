import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './features/auth/hooks/AuthProvider'
import { AppRouter } from './components/Router'
import './configurations/i18n'
import 'flag-icons/css/flag-icons.min.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Root container not found')
}

const reactRoot = createRoot(rootElement)

reactRoot.render(
  <React.StrictMode>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </React.StrictMode>
)
