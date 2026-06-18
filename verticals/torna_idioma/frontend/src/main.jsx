import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: register the service worker (installable + offline shell). Scoped to the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/Torna_Idioma/sw.js', { scope: '/Torna_Idioma/' })
      .catch(() => { /* non-fatal: app still works without the SW */ });
  });
}
