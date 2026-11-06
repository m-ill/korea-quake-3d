export interface Alternate { id: string; source: string; mag: number; magType: string; depth: number|null; url: string }
export interface Quake {
  id: string; time: string; lat: number; lon: number; depth: number|null; mag: number;
  magType: string; intensity: string|null; place: string; source: 'KMA'|'USGS'; url: string; alternate?: Alternate[];
}
export interface Catalog {
  schemaVersion: number; generatedAt: string; snapshotEnd: string;
  sources: {id:string;name:string;url:string;start:string;end:string;rawCount:number;coverage:string}[];
  stats: {total:number;unknownDepth:number;linkedDuplicates:number;unlocated?:number}; matchingRule:string; events:Quake[];
}
export type Region = 'korea'|'eastasia';
export interface Filters { region:Region; from:string; to:string; minMag:number; maxDepth:number; unknown:boolean; kma:boolean; usgs:boolean }
export const REGIONS: Record<Region,{name:string; bounds:[number,number,number,number]; depth:number; scale:number}> = {
  korea:{name:'한반도',bounds:[122.5,32,132,43],depth:100,scale:4},
  eastasia:{name:'동북아',bounds:[118,29,148,47],depth:700,scale:1},
};
export function kstDate(time:string) { return new Date(Date.parse(time)+9*3600_000).toISOString().slice(0,10); }
export function validDate(value:string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value); }
export function filterEvents(events:Quake[], f:Filters):Quake[] {
  const b=REGIONS[f.region].bounds;
  const from=Date.parse(`${f.from}T00:00:00+09:00`), to=Date.parse(`${f.to}T00:00:00+09:00`)+86400_000;
  return events.filter(e => {
    const t=Date.parse(e.time);
    return t>=from && t<to && e.lon>=b[0] && e.lon<=b[2] && e.lat>=b[1] && e.lat<=b[3]
      && e.mag>=f.minMag && (e.source==='KMA'?f.kma:f.usgs)
      && (e.depth===null ? f.unknown : e.depth<=f.maxDepth);
  });
}
/** Local equirectangular projection. Both horizontal axes and depth are in km.
 * Regional approximation, not a geodesic ruler or global Earth model. */
export function project(lon:number,lat:number,center:[number,number]):[number,number] {
  const k=6371.0088*Math.PI/180;
  return [(lon-center[0])*k*Math.cos(center[1]*Math.PI/180), -(lat-center[1])*k];
}
export function depthColor(depth:number|null):string {
  if(depth===null)return '#8d9aaf';
  if(depth<=10)return '#59e2cf'; if(depth<=30)return '#50baf5'; if(depth<=70)return '#a39afa';
  if(depth<=150)return '#ffc174'; if(depth<=300)return '#ff8869'; return '#ed64a6';
}
export function csv(events:Quake[]):string {
  const safe=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@\-]/,"'$&")+'"';
  return '\uFEFF'+[['id','time_utc','time_kst','latitude','longitude','depth_km','magnitude','magnitude_type','max_intensity_kma','source','place','source_url'],
    ...events.map(e=>[e.id,e.time,new Date(Date.parse(e.time)+9*3600_000).toISOString().replace('Z','+09:00'),e.lat,e.lon,e.depth,e.mag,e.magType,e.intensity,e.source,e.place,e.url])]
    .map(row=>row.map(safe).join(',')).join('\r\n');
}
export function readState(search:string,end:string):Partial<Filters> & {event?:string;scale?:number} {
  const p=new URLSearchParams(search); const out:Partial<Filters> & {event?:string;scale?:number}={};
  if(p.get('region')==='eastasia')out.region='eastasia';
  for(const key of ['from','to'] as const) { const v=p.get(key); if(v && validDate(v) && v>='1978-01-01' && v<=end)out[key]=v; }
  for(const [key,min,max] of [['minMag',0,9],['maxDepth',0,700],['scale',1,10]] as const) {
    const v=p.get(key);if(v!==null && Number.isFinite(Number(v)) && Number(v)>=min && Number(v)<=max) out[key]=Number(v);
  }
  for(const key of ['unknown','kma','usgs'] as const) if(p.has(key))out[key]=p.get(key)==='1';
  if(p.get('event'))out.event=p.get('event')!.slice(0,100);
  if(out.from && out.to && out.from>out.to) { const t=out.from;out.from=out.to;out.to=t; }
  return out;
}
