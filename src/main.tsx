import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';
import './mobileRecords.css';
import { installMobileRecordTableLabels } from './mobileRecordTables';
import { AuthProvider } from './context/AuthContext.tsx';
import { AuthGate } from './components/auth/AuthGate.tsx';

if ('serviceWorker' in navigator && import.meta.env.MODE !== 'test') {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  });
}

const rootElement = document.getElementById('root')!;
installMobileRecordTableLabels(rootElement);

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate><App /></AuthGate>
    </AuthProvider>
  </StrictMode>,
);
