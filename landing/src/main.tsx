import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The app's typefaces (Figma design system), self-hosted: only the Latin
// subsets and the weights the page uses.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
