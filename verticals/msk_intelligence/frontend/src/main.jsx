import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const isCustomDomain = ['imagingmind.app', 'www.imagingmind.app'].includes(window.location.hostname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={isCustomDomain ? '/' : '/msk'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
