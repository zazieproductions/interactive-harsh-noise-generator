import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline / home-screen support. Registered relative to the document so it
// works from a project subpath (GitHub Pages) as well as a domain root, and
// skipped entirely on `file://`, where service workers are unavailable.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* offline support is optional — the app itself is a single file */
    });
  });
}
