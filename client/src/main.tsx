import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HostApp } from './host/HostApp';
import { ParticipantApp } from './participant/ParticipantApp';
import './styles.css';

const isHost = window.location.pathname.replace(/\/+$/, '').endsWith('/host');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isHost ? <HostApp /> : <ParticipantApp />}</StrictMode>,
);
