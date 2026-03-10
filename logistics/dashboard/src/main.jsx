import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import LoginPage from './pages/LoginPage'
import ErrorBoundary from './ErrorBoundary'
import './index.css'

const AUTH_KEY = 'logistics_auth'

function Root() {
  const [authed, setAuthed] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const handleLogin = (user) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    setAuthed(user)
  }

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY)
    setAuthed(null)
  }

  if (!authed) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter basename="/pinaxis">
      <App onLogout={handleLogout} userEmail={authed.email} />
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)
