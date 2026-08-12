import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.tsx';
import { AuthGate } from './components/auth/AuthGate.tsx';

if ('serviceWorker' in navigator && import.meta.env.MODE !== 'test') {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate><App /></AuthGate>
    </AuthProvider>
  </StrictMode>,
);
