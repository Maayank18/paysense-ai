import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// ── App ──────────────────────────────────────────────────────────────────────
// App lives at src/app/App.jsx — the original had './App' which resolved to
// src/App.jsx (doesn't exist) and caused a Vite module-not-found error.
import App from './app/App';

// ── Global styles ─────────────────────────────────────────────────────────────
// Original had '../styles/…' which would resolve to /styles/ at the project
// root (outside src/) — fixed to relative paths from src/.
import './styles/paytm-tokens.css';
import './styles/animations.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);