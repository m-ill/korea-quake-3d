import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Catalog } from './src/model';

const rootFile = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const site = 'https://m-ill.github.io/korea-quake-3d/';
const catalog = ():Catalog => JSON.parse(readFileSync(rootFile('./public/data/catalog.json'), 'utf8'));
const modified = (c:Catalog) => [c.snapshotEnd, '2026-11-18'].sort().at(-1)!;

export default defineConfig({ base: './', build: { target: 'esnext', minify: 'terser', chunkSizeWarningLimit: 700,
  rollupOptions: {
    input: { map: rootFile('./index.html'), guide: rootFile('./guide/index.html'), about: rootFile('./about/index.html') },
    output: { manualChunks: { three: ['three', 'three/addons/controls/OrbitControls.js'] } },
  } },
  plugins: [{
    name: 'catalog-guide',
    transformIndexHtml(html, context) {
      const c = catalog();
      const number = new Intl.NumberFormat('ko-KR');
      const path=context.filename.includes('about')?'about/':context.filename.includes('guide')?'guide/':'';
      const title=html.match(/<title>(.*?)<\/title>/)?.[1]??'한반도 3D 진원 지도';
      const description=html.match(/name="description" content="([^"]+)"/)?.[1]??'';
      return html.replace('</head>',`<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:url" content="${site+path}"><meta property="og:site_name" content="한반도 3D 진원 지도">
<meta property="og:image" content="${site}mascot/brand.png"><meta property="og:image:alt" content="진원 지도의 파란 곰돌이 로고">
<meta name="twitter:card" content="summary"></head>`)
        .replaceAll('{{snapshotEnd}}', c.snapshotEnd)
        .replaceAll('{{modified}}', modified(c))
        .replaceAll('{{total}}', number.format(c.events.length))
        .replaceAll('{{unknownDepth}}', number.format(c.stats.unknownDepth))
        .replaceAll('{{linkedDuplicates}}', number.format(c.stats.linkedDuplicates));
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'sitemap.xml',source:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['','about/','guide/'].map(path=>`<url><loc>${site+path}</loc><lastmod>${modified(catalog())}</lastmod></url>`).join('')}</urlset>`});
    },
  }],
});
