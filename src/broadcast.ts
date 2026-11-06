import type { Filters } from './model';

export type CameraView = 'oblique'|'top'|'side';
export interface BroadcastOptions { enabled:boolean; title:string; view:CameraView; rotate:boolean; tour:boolean; interval:number; speed:number }
export function readBroadcast(search:string):BroadcastOptions {
  const p=new URLSearchParams(search), view=p.get('view');
  return {
    enabled:p.get('broadcast')==='1',
    title:Array.from((p.get('title')??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,60).join(''),
    view:view==='top'||view==='side'?view:'oblique',
    rotate:p.get('rotate')==='1'&&p.get('tour')!=='1',
    tour:p.get('tour')==='1',
    interval:[12,20,30].includes(Number(p.get('interval')))?Number(p.get('interval')):20,
    speed:[.4,.8,1.6].includes(Number(p.get('speed')))?Number(p.get('speed')):.4,
  };
}
export function broadcastURL(base:string,filters:Filters,scale:number,colors:boolean,eventId:string|undefined,options:BroadcastOptions):string {
  const u=new URL(base);u.search='';u.hash='';
  for(const [k,v] of Object.entries(filters))u.searchParams.set(k,typeof v==='boolean'?(v?'1':'0'):String(v));
  u.searchParams.set('scale',String(scale));
  u.searchParams.set('colors',colors?'1':'0');
  if(eventId)u.searchParams.set('event',eventId);
  u.searchParams.set('broadcast','1');u.searchParams.set('view',options.view);
  if(options.title)u.searchParams.set('title',options.title);
  if(options.rotate)u.searchParams.set('rotate','1');
  if(options.tour)u.searchParams.set('tour','1');
  u.searchParams.set('interval',String(options.interval));u.searchParams.set('speed',String(options.speed));
  return u.toString();
}
