import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
// The app's typefaces (Figma design system), self-hosted: only the Latin
// subsets and the weights the page uses.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './index.css';
import App from './App.tsx';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);
// Built pages already contain the rendered HTML (fast first paint): React only
// takes it over. The dev server sends an empty page, so it renders it.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
