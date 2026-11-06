// Natural Earth (public domain). Clip the original polygons, never hand-draw coastlines.
import { mkdir, writeFile } from 'node:fs/promises';
const bbox = [118, 29, 148, 47];
const origin = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
async function get(name) {
  const r = await fetch(origin + name); if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}
function clipRing(ring) {
  let poly = ring.slice();
  for (const [axis, edge, direction] of [[0, bbox[0], 1], [0, bbox[2], -1], [1, bbox[1], 1], [1, bbox[3], -1]]) {
    const input = poly; poly = []; if (!input.length) break;
    let prev = input.at(-1); let wasIn = direction * (prev[axis] - edge) >= 0;
    for (const cur of input) {
      const isIn = direction * (cur[axis] - edge) >= 0;
      if (wasIn !== isIn) {
        const t = (edge - prev[axis]) / (cur[axis] - prev[axis]);
        poly.push([prev[0] + t*(cur[0]-prev[0]), prev[1] + t*(cur[1]-prev[1])]);
      }
      if (isIn) poly.push(cur); prev = cur; wasIn = isIn;
    }
  }
  if (poly.length > 2) poly.push(poly[0]);
  return poly.map(p => p.map(v => Math.round(v * 1e4)/1e4));
}
const [land, borders] = await Promise.all([get('ne_50m_land.geojson'), get('ne_50m_admin_0_boundary_lines_land.geojson')]);
const polygons = land.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
  .map(p => p.map(clipRing).filter(r => r.length >= 4)).filter(p => p.length);
const inside = p => p[0]>=bbox[0] && p[0]<=bbox[2] && p[1]>=bbox[1] && p[1]<=bbox[3];
const lines = borders.features.flatMap(f => f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)
  .flatMap(line => {
    const runs = []; let run = [];
    for (let i=1;i<line.length;i++) {
      if (inside(line[i-1]) && inside(line[i])) { if (!run.length) run.push(line[i-1]); run.push(line[i]); }
      else if(run.length) { runs.push(run); run=[]; }
    }
    if(run.length) runs.push(run); return runs;
  });
await mkdir('public/data', {recursive:true});
await writeFile('public/data/map.json', JSON.stringify({source:'Natural Earth 1:50m · public domain',url:'https://www.naturalearthdata.com/',bbox,polygons,borders:lines}));
console.log(`Map saved: ${polygons.length} polygons, ${lines.length} borders`);
