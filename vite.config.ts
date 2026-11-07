import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import type { Catalog } from './src/model';

const rootFile = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({ base: './', build: { target: 'esnext', minify: 'terser', chunkSizeWarningLimit: 700,
  rollupOptions: {
    input: { map: rootFile('./index.html'), guide: rootFile('./guide/index.html') },
    output: { manualChunks: { three: ['three', 'three/addons/controls/OrbitControls.js'] } },
  } },
  plugins: [{
    name: 'catalog-guide',
    transformIndexHtml(html, context) {
      if (normalizePath(context.filename) !== normalizePath(rootFile('./guide/index.html'))) return html;
      const catalog: Catalog = JSON.parse(readFileSync(rootFile('./public/data/catalog.json'), 'utf8'));
      const number = new Intl.NumberFormat('ko-KR');
      return html
        .replaceAll('{{snapshotEnd}}', catalog.snapshotEnd)
        .replaceAll('{{total}}', number.format(catalog.events.length))
        .replaceAll('{{unknownDepth}}', number.format(catalog.stats.unknownDepth))
        .replaceAll('{{linkedDuplicates}}', number.format(catalog.stats.linkedDuplicates));
    },
  }],
});
