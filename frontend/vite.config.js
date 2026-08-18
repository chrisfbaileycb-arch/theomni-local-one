import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      include: /\.(jsx|js)$/,
      babel: {
        plugins: [],
      },
    }),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  define: {
    'process.env': {
      REACT_APP_BACKEND_URL: '',
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  }
});
