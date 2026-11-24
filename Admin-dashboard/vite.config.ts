import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  // The admin lives under /admin on the one KOBANIQ website (landing at /).
  base: '/admin/',
  plugins: [react()],
});
