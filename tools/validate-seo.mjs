import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const site='https://m-ill.github.io/korea-quake-3d/';
const c=JSON.parse(readFileSync('public/data/catalog.json','utf8'));
const sitemap=readFileSync('dist/sitemap.xml','utf8');
for(const path of ['', 'about/', 'guide/']){
  const html=readFileSync(`dist/${path}index.html`,'utf8');
  assert.ok(!html.includes('{{'),'Unresolved catalog token');
  assert.ok(html.includes(`rel="canonical" href="${site+path}"`));
  assert.ok(html.includes(`property="og:url" content="${site+path}"`));
  assert.ok(sitemap.includes(`<loc>${site+path}</loc>`));
  const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length>0);
  for(const [,json] of blocks) assert.equal(JSON.parse(json)['@context'],'https://schema.org');
  if(path){assert.ok(html.includes(c.snapshotEnd));assert.ok(html.includes(c.events.length.toLocaleString('ko-KR')));}
}
const about=readFileSync('dist/about/index.html','utf8');
const example=c.events.find(e=>e.id==='kma-2016-364');
assert.equal(example.mag,5.8);assert.equal(example.depth,15);
assert.ok(about.includes('event='+example.id));
console.log('SEO: canonical URLs, metadata, JSON-LD, sitemap, catalog facts and example verified.');
