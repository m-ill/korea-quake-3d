import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const c=JSON.parse(await readFile('public/data/catalog.json','utf8'));
assert.equal(c.schemaVersion,1);assert.equal(c.events.length,c.stats.total);assert.ok(c.events.length>1000);
const ids=new Set();let last='';const counts={KMA:0,USGS:0};let linked=0;
for(const e of c.events){
  assert.ok(!ids.has(e.id),`Duplicate ${e.id}`);ids.add(e.id);
  assert.ok(e.time>=last,'Catalog not chronological');last=e.time;
  assert.ok(Number.isFinite(e.lat)&&Math.abs(e.lat)<=90);assert.ok(Number.isFinite(e.lon)&&Math.abs(e.lon)<=180);
  assert.ok(Number.isFinite(e.mag));assert.ok(e.depth===null||Number.isFinite(e.depth));
  assert.ok(e.url.startsWith('https://'));assert.ok(e.place.length>0);assert.ok(!e.place.includes('\ufffd'),'Corrupt text');
  assert.ok(['KMA','USGS'].includes(e.source));counts[e.source]++;
  assert.ok(new Date(Date.parse(e.time)+9*3600_000).toISOString().slice(0,10)<=c.snapshotEnd);
  linked+=(e.alternate??[]).length;
}
assert.equal(c.stats.unknownDepth,c.events.filter(e=>e.depth===null).length);
assert.equal(linked,c.stats.linkedDuplicates);
assert.equal(counts.KMA+(c.unlocated?.length??0),c.sources.find(s=>s.id==='KMA').rawCount);
assert.equal(counts.USGS+linked,c.sources.find(s=>s.id==='USGS').rawCount);
assert.ok(c.events.some(e=>e.source==='KMA'&&e.mag>=5.7&&e.time.startsWith('2016-09-12')),'Gyeongju missing');
assert.ok(c.events.some(e=>e.source==='KMA'&&e.mag>=5.3&&e.time.startsWith('2017-11-15')),'Pohang missing');
assert.ok(c.events.some(e=>e.source==='USGS'&&e.mag>=9&&e.time.startsWith('2011-03-11')),'Tohoku missing');
const map=JSON.parse(await readFile('public/data/map.json','utf8'));assert.ok(map.polygons.length>20);assert.ok(map.borders.length>0);
console.log(JSON.stringify({total:c.events.length,counts,linked,unknownDepth:c.stats.unknownDepth,unlocated:c.stats.unlocated,snapshotEnd:c.snapshotEnd},null,2));
