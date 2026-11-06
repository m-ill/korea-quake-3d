import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'esnext', minify: 'terser', chunkSizeWarningLimit: 700,
  rollupOptions: { output: { manualChunks: { three: ['three', 'three/addons/controls/OrbitControls.js'] } } } } });
