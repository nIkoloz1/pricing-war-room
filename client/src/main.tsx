import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HostApp } from './host/HostApp';
import { ParticipantApp } from './participant/ParticipantApp';
import './styles.css';

const isHost = window.location.pathname.replace(/\/+$/, '').endsWith('/host');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isHost ? <HostApp /> : <ParticipantApp />}</StrictMode>,
);
