import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for development and build
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests during development to the backend server
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});