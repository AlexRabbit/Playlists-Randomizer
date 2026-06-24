import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/Playlists-Randomizer/';

  return {
    base,
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    optimizeDeps: {
      include: ['youtubei.js'],
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            core: ['./src/core/models/workspace.ts', './src/core/url-state/codec.ts'],
            youtubei: ['youtubei.js'],
          },
        },
      },
    },
    server: { port: Number(env.VITE_DEV_PORT) || 5173 },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      globals: true,
    },
  };
});
