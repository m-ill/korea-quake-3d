import type { MapData } from './scene';
import type { Quake } from './model';

/** A vertical east-west slice through one hypocentre. All distances are kilometres. */
export function drawSection(canvas: HTMLCanvasElement, map: MapData, event: Quake, scale: number, dark: boolean) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const ink = dark ? '#eff8f7' : '#102d48', coast = dark ? '#83aeb7' : '#537f84';
  ctx.fillStyle = dark ? '#152a34' : '#edf5f3';
  ctx.fillRect(0, 0, w, h);
  type Point = [number, number];
  function polygon(points: Point[], fill: string, stroke?: string) {
    ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function text(value: string, x: number, y: number, size: number, color = ink) {
    ctx.fillStyle = color; ctx.font = '650 '+size+'px system-ui, sans-serif'; ctx.fillText(value,x,y);
  }
  const depth = event.depth;
  const maxDepth = Math.max(28, (depth ?? 0) * 1.35);
  const kmWidth = Math.max(180, maxDepth * 3);
  const unit = Math.min(w * .79 / kmWidth, h * .48 / (maxDepth * Math.max(4,scale) + kmWidth * .23));
  const length = unit * kmWidth, dz = unit * maxDepth * scale;
  const skew = length * .075, rise = length * .21, tilt = length * .028;
  const x = (w-length-skew)/2, y = h*.54 + (rise-unit*maxDepth*Math.max(4,scale))/2;
  const a:Point=[x,y], b:Point=[x+length,y-tilt], c:Point=[b[0]+skew,b[1]-rise], d:Point=[x+skew,y-rise];
  const lower = (pt:Point,offset:number):Point => [pt[0],pt[1]+offset];
  polygon([b,c,lower(c,dz),lower(b,dz)],dark?'#286271':'#478f99');
  const bands=dark?['#37616a','#325b66','#294f5b','#234853']:['#b2d9d5','#9bcacb','#85bfc2','#70aab4'];
  bands.forEach((color,i)=>polygon([lower(a,dz*i/4),lower(b,dz*i/4),lower(b,dz*(i+1)/4),lower(a,dz*(i+1)/4)],color));
  polygon([a,b,c,d],dark?'#254654':'#c5e6ed',coast);
  ctx.save(); ctx.clip();
  const lonUnit=111.195*Math.cos(event.lat*Math.PI/180);
  for (const poly of map.polygons) {
    ctx.beginPath();
    for (const ring of poly) {
      ring.forEach(([lon,lat],i)=>{
        const east=(lon-event.lon)*lonUnit/kmWidth+.5, north=(lat-event.lat)*111.195/(kmWidth*.5);
        const px=x+east*length+north*skew, py=y-east*tilt-north*rise;
        if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
      });
      ctx.closePath();
    }
    ctx.fillStyle=dark?'#62685b':'#fff7db';ctx.fill('evenodd');ctx.strokeStyle=coast;ctx.stroke();
  }
  ctx.restore();
  const cx=x+length/2, surface=y-tilt/2, cy=surface+(depth??0)*unit*scale;
  const step=[1,2,5,10,20,50,100,200,500].find(k=> k*unit*scale>=24)??500;
  for(let k=0;k<maxDepth;k+=step)text(k+' km',x+5,y+unit*scale*k+13,12);
  ctx.strokeStyle=dark?'#ff927d':'#b53d28';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(cx,surface);ctx.lineTo(cx,cy);ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,6,0,Math.PI*2);if(depth===null)ctx.stroke();else {ctx.fillStyle=ctx.strokeStyle;ctx.fill();}
  const surfaceName=event.place.match(/(?:^|\s)([가-힣]{1,6})[시군구](?:\s|$)/)?.[1] ?? '진앙';
  text(surfaceName,cx+8,surface-10,16);
  const label=depth===null?'깊이 미상':'진원 '+depth+' km';
  ctx.font='700 16px system-ui';const width=ctx.measureText(label).width+20;
  const left=Math.min(w-width-6,cx+10);ctx.fillStyle='#102d48';ctx.beginPath();ctx.roundRect(left,cy-15,width,30,12);ctx.fill();text(label,left+10,cy+5,16,'white');
  canvas.setAttribute('aria-label',event.place+' 동서 단면, '+label+', 세로 '+scale+'배');
}
