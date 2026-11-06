import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { depthColor, project, REGIONS, type Quake, type Region } from './model';

export interface MapData {polygons:number[][][][];borders:number[][][];source:string;url:string}
type Label = {sprite:THREE.Sprite; base:number; depth:boolean; city:boolean};
export class QuakeScene {
  renderer:THREE.WebGLRenderer; camera:THREE.PerspectiveCamera; controls:OrbitControls;
  private scene=new THREE.Scene(); private mapGroup=new THREE.Group(); private pointsGroup=new THREE.Group();
  private focusGroup=new THREE.Group(); private labels:Label[]=[]; private known:Quake[]=[];private unknown:Quake[]=[];
  private mesh?:THREE.InstancedMesh; private rings?:THREE.InstancedMesh; private events:Quake[]=[];
  private region:Region='korea';private scale=4; private center:[number,number]=[127.25,37.5];private eventDepth=0;
  private ray=new THREE.Raycaster(); private pointer=new THREE.Vector2();private selected:Quake|null=null;
  private down=[0,0]; private resizeObserver:ResizeObserver;private frame=0;private last=performance.now();
  private needsRender=true;private hidden=false;private onVisibility=()=>{this.hidden=document.hidden;this.last=performance.now();};
  private dark=false;private depthColors=false;private hasSize=false;private broadcast=false;
  onManualControl?:()=>void;
  get hasTour(){return !!this.tour;}
  private tourPaused=false;
  private tour?:{stage:number;elapsed:number;interval:number;hero:Quake|null;from:THREE.Vector3;target:THREE.Vector3;change:(e:Quake|null,label:string)=>void};
  private fitDistance(direction:THREE.Vector3,aspect:number,target:THREE.Vector3){
    const b=REGIONS[this.region].bounds;
    const maxDepth=Math.max(this.region==='korea'?100:700,this.eventDepth);
    const right=new THREE.Vector3().crossVectors(this.camera.up,direction).normalize();
    const up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const tangent=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));let distance=40;
    // Fit all eight corners, including the lower depth frame, with space for labels.
    for(const lon of [b[0]-.2,b[2]+.2])for(const lat of [b[1]-.2,b[3]+.2])for(const depth of [0,maxDepth]){
      const p=this.point(lon,lat,depth).sub(target),near=p.dot(direction);
      distance=Math.max(distance,near+Math.abs(p.dot(up))/(tangent*.9),near+Math.abs(p.dot(right))/(tangent*Math.max(.3,aspect)*.9));
    }
    return distance;
  }
  private get palette(){return this.broadcast
    ? {land:0x8a97a8,coast:0x4b6079,border:0x8a97a8,grid:0xb7c3d1,edge:0x8796a7,label:'#546477',city:'#33465d',point:'#41566f',ring:0x8795a5,selection:0x1767d1,background:0xffffff}
    : this.dark
    ? {land:0x8592a2,coast:0xa7b3c2,border:0x778597,grid:0x596574,edge:0x718091,label:'#7e8998',city:'#b0b9c6',point:'#bbc4d1',ring:0x83909f,selection:0x78aaff,background:0x151619}
    : {land:0x9aa2aa,coast:0x606b77,border:0x939ba5,grid:0xc4c9d0,edge:0xa9b0ba,label:'#89919b',city:'#606973',point:'#687786',ring:0x9ba3ad,selection:0x246ee9,background:0xfcfcfd};}
  constructor(private host:HTMLElement,private map:MapData,private onSelect:(e:Quake)=>void) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(this.palette.background,0);
    this.host.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','드래그로 회전하는 3D 진원 지도');
    this.renderer.domElement.tabIndex=0;
    this.camera=new THREE.PerspectiveCamera(42,1,1,60000);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.controls.dampingFactor=.075;
    this.controls.autoRotateSpeed=.42;this.controls.minDistance=40;this.controls.maxDistance=40000;this.controls.maxPolarAngle=Math.PI*.94;
    this.controls.addEventListener('change',()=>{this.needsRender=true;});
    this.controls.addEventListener('start',()=>this.onManualControl?.());
    this.scene.add(this.mapGroup,this.pointsGroup,this.focusGroup);
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.down=[e.clientX,e.clientY];});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>5)return;
      const q=this.pick(e.clientX,e.clientY);if(q)this.onSelect(q);
    });
    this.renderer.domElement.addEventListener('keydown',e=>{
      if(e.target!==this.renderer.domElement)return;
      const offset=this.camera.position.clone().sub(this.controls.target);const spherical=new THREE.Spherical().setFromVector3(offset);
      if(e.key==='ArrowLeft')spherical.theta-=.12;else if(e.key==='ArrowRight')spherical.theta+=.12;
      else if(e.key==='ArrowUp')spherical.phi=Math.max(.01,spherical.phi-.12);else if(e.key==='ArrowDown')spherical.phi=Math.min(Math.PI-.01,spherical.phi+.12);
      else if(e.key==='+'||e.key==='=')spherical.radius*=.9;else if(e.key==='-')spherical.radius*=1.1;else return;
      e.preventDefault();this.onManualControl?.();this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));this.controls.update();
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.setRegion('korea');this.resize();this.animate();
  }
  private resize(){
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    const aspect=width/height;
    if(this.hasSize){const offset=this.camera.position.clone().sub(this.controls.target),direction=offset.clone().normalize();const ratio=this.fitDistance(direction,aspect,this.controls.target)/this.fitDistance(direction,this.camera.aspect,this.controls.target);this.camera.position.copy(this.controls.target).add(offset.multiplyScalar(ratio));}
    this.hasSize=true;this.renderer.setSize(width,height);this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.needsRender=true;
  }
  private clear(group:THREE.Group){
    group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Points){o.geometry.dispose();const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.dispose());}if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});group.clear();
  }
  private point(lon:number,lat:number,depth=0){const [x,z]=project(lon,lat,this.center);return new THREE.Vector3(x,-depth*this.scale,z);}
  private line(coords:number[][],color:number,opacity=.5){
    if(coords.length<2)return;const g=new THREE.BufferGeometry().setFromPoints(coords.map(c=>this.point(c[0],c[1])));
    const line=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));line.renderOrder=2;this.mapGroup.add(line);
  }
  private clip(ring:number[][]):number[][]{
    const b=REGIONS[this.region].bounds;let p=ring;
    for(const [axis,edge,direction] of [[0,b[0],1],[0,b[2],-1],[1,b[1],1],[1,b[3],-1]]){
      const input=p;p=[];if(!input.length)break;let a=input[input.length-1],prev=direction*(a[axis]-edge)>=0;
      for(const c of input){const inside=direction*(c[axis]-edge)>=0;if(prev!==inside){const t=(edge-a[axis])/(c[axis]-a[axis]);p.push([a[0]+t*(c[0]-a[0]),a[1]+t*(c[1]-a[1])]);}if(inside)p.push(c);a=c;prev=inside;}
    }return p;
  }
  private label(text:string,position:THREE.Vector3,color=this.palette.label,size=15,depth=false,city=false){
    const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d')!;
    ctx.font=`500 ${size*2}px "Segoe UI", "Malgun Gothic", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,32);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));sprite.position.copy(position);sprite.renderOrder=5;
    this.mapGroup.add(sprite);this.labels.push({sprite,base:1,depth,city});
  }
  setRegion(region:Region){
    this.region=region;const b=REGIONS[region].bounds;this.center=[(b[0]+b[2])/2,(b[1]+b[3])/2];
    this.buildMap();this.updateEvents(this.events,this.scale);this.setView('oblique');
  }
  private buildMap(){
    this.clear(this.mapGroup);this.labels=[];const b=REGIONS[this.region].bounds;
    for(const polygon of this.map.polygons){
      const rings=polygon.map(r=>this.clip(r)).filter(r=>r.length>=3);if(!rings.length)continue;
      const convert=(r:number[][])=>r.map(c=>{const p=this.point(c[0],c[1]);return new THREE.Vector2(p.x,p.z);});
      const shape=new THREE.Shape(convert(rings[0]));rings.slice(1).forEach(r=>shape.holes.push(new THREE.Path(convert(r))));
      const g=new THREE.ShapeGeometry(shape);g.rotateX(Math.PI/2); // xy -> xz, with local z sign preserved
      const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:this.palette.land,side:THREE.DoubleSide,transparent:true,opacity:this.dark?.1:.07,depthWrite:false}));mesh.renderOrder=0;this.mapGroup.add(mesh);
      rings.forEach(r=>this.line([...r,r[0]],this.palette.coast,.5));
    }
    for(const border of this.map.borders){let run:number[][]=[];for(const c of border){if(c[0]>=b[0]&&c[0]<=b[2]&&c[1]>=b[1]&&c[1]<=b[3])run.push(c);else{this.line(run,this.palette.border,.3);run=[];}}this.line(run,this.palette.border,.3);}
    for(let lon=Math.ceil(b[0]);lon<=b[2];lon+=(this.region==='korea'?2:5)){
      this.line([[lon,b[1]],[lon,b[3]]],this.palette.grid,.28);if(!this.broadcast)this.label(`${lon}°E`,this.point(lon,b[1]-.22));
    }
    for(let lat=Math.ceil(b[1]);lat<=b[3];lat+=(this.region==='korea'?2:4)){
      this.line([[b[0],lat],[b[2],lat]],this.palette.grid,.28);if(!this.broadcast)this.label(`${lat}°N`,this.point(b[0]-.3,lat));
    }
    this.line([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]],this.palette.edge,.4);
    const max=this.region==='korea'?100:700;const step=this.region==='korea'?20:100;
    for(let d=step;d<=max;d+=step){
      const corners=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]].map(c=>this.point(c[0],c[1],d));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color:this.palette.grid,transparent:true,opacity:.24,depthWrite:false}));this.mapGroup.add(line);
      this.label(`${d} km`,this.point(b[2]+.25,b[1],d),this.palette.label,12,true);
    }
    for(const [lon,lat] of [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]){
      this.mapGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.point(lon,lat),this.point(lon,lat,max)]),new THREE.LineBasicMaterial({color:this.palette.edge,transparent:true,opacity:.35})));
    }
    const cities:[string,number,number][]=[['서울',126.98,37.57],['부산',129.07,35.18],['제주',126.53,33.5],['평양',125.75,39.03],['울릉도',130.9,37.48],['독도',131.87,37.24],['도쿄',139.69,35.68],['후쿠오카',130.4,33.59],['베이징',116.4,39.9],['삿포로',141.35,43.06]];
    for(const [name,lon,lat] of cities){if(lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3])continue;
      this.label(name,this.point(lon,lat+.13),this.palette.city,12,false,true);
      const dot=new THREE.Mesh(new THREE.CircleGeometry(this.region==='korea'?2:5,12),new THREE.MeshBasicMaterial({color:this.palette.edge,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));dot.rotation.x=-Math.PI/2;dot.position.copy(this.point(lon,lat));dot.position.y=.5;this.mapGroup.add(dot);
    }
    this.label('N',this.point(this.center[0],b[3]+.38),this.palette.city,18);this.needsRender=true;
  }
  updateEvents(events:Quake[],scale:number){
    const changed=this.scale!==scale;this.scale=scale;if(changed)this.buildMap();this.events=events;this.eventDepth=events.reduce((max,e)=>Math.max(max,e.depth??0),0);
    this.clear(this.pointsGroup);this.known=events.filter(e=>e.depth!==null);this.unknown=events.filter(e=>e.depth===null);
    const geo=new THREE.SphereGeometry(1,10,7), material=new THREE.MeshBasicMaterial({color:0xffffff});
    this.mesh=new THREE.InstancedMesh(geo,material,this.known.length);
    this.rings=new THREE.InstancedMesh(new THREE.RingGeometry(.65,1,16),new THREE.MeshBasicMaterial({color:this.palette.ring,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}),this.unknown.length);
    const dummy=new THREE.Object3D(),color=new THREE.Color();
    const base=(this.region==='korea'?1:2.2)*(this.broadcast?1.25:1);
    this.known.forEach((e,i)=>{dummy.position.copy(this.point(e.lon,e.lat,e.depth!));dummy.rotation.set(0,0,0);dummy.scale.setScalar(base*(2+Math.max(e.mag,0)**1.6*.48));dummy.updateMatrix();this.mesh!.setMatrixAt(i,dummy.matrix);this.mesh!.setColorAt(i,color.set(this.depthColors?depthColor(e.depth):this.palette.point));});
    this.unknown.forEach((e,i)=>{dummy.position.copy(this.point(e.lon,e.lat));dummy.position.y=1;dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(base*(2+Math.max(e.mag,0)**1.6*.48));dummy.updateMatrix();this.rings!.setMatrixAt(i,dummy.matrix);});
    this.mesh.computeBoundingSphere();this.rings.computeBoundingSphere();this.pointsGroup.add(this.mesh,this.rings);this.select(this.selected);this.needsRender=true;
  }
  private pick(x:number,y:number){
    const b=this.renderer.domElement.getBoundingClientRect();this.pointer.set(((x-b.left)/b.width)*2-1,-((y-b.top)/b.height)*2+1);this.ray.setFromCamera(this.pointer,this.camera);
    const targets=[this.mesh,this.rings].filter(Boolean) as THREE.InstancedMesh[];
    const hit=this.ray.intersectObjects(targets,false)[0];if(!hit||hit.instanceId===undefined)return null;
    return hit.object===this.mesh?this.known[hit.instanceId]:this.unknown[hit.instanceId];
  }
  select(e:Quake|null){
    this.selected=e;this.clear(this.focusGroup);if(!e||!this.events.some(q=>q.id===e.id)){this.needsRender=true;return;}
    const p=this.point(e.lon,e.lat,e.depth??0);const radius=(this.region==='korea'?13:26)*(this.broadcast?1.3:1);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,1.2,6,48),new THREE.MeshBasicMaterial({color:this.palette.selection,depthTest:false,transparent:true,opacity:.95}));ring.position.copy(p);this.focusGroup.add(ring);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p,this.point(e.lon,e.lat)]),new THREE.LineDashedMaterial({color:this.palette.selection,dashSize:5,gapSize:4,transparent:true,opacity:.65,depthTest:false}));line.computeLineDistances();this.focusGroup.add(line);
    const highlight=new THREE.Mesh(new THREE.SphereGeometry(radius*.32,12,8),new THREE.MeshBasicMaterial({color:this.palette.selection,depthTest:false}));highlight.position.copy(p);this.focusGroup.add(highlight);this.needsRender=true;
  }
  focus(e:Quake){this.controls.target.copy(this.point(e.lon,e.lat,e.depth??0));const d=this.region==='korea'?400:800;this.camera.position.copy(this.controls.target).add(new THREE.Vector3(d*.5,d*.6,d));this.controls.update();}
  setView(view:'oblique'|'top'|'side'){
    const aspect=Math.max(.3,this.host.clientWidth/Math.max(1,this.host.clientHeight));
    const depth=this.region==='korea'?100:700;this.controls.target.set(0,-depth*this.scale*.4,0);
    const offsets={oblique:new THREE.Vector3(550,1050,1250),top:new THREE.Vector3(0,1900,1),side:new THREE.Vector3(0,30,1700)};
    const direction=offsets[view].normalize();this.camera.position.copy(this.controls.target).addScaledVector(direction,this.fitDistance(direction,aspect,this.controls.target));this.controls.update();this.needsRender=true;
  }
  setRotate(value:boolean,speed=.4){this.controls.autoRotate=value;this.controls.autoRotateSpeed=speed;this.needsRender=true;}
  startTour(hero:Quake|null,interval:number,speed:number,change:(e:Quake|null,label:string)=>void){
    this.stopTour();this.controls.autoRotate=false;this.controls.autoRotateSpeed=speed;this.controls.enableDamping=false;this.controls.update();
    this.tourPaused=false;this.tour={stage:0,elapsed:0,interval,hero,from:this.camera.position.clone(),target:this.controls.target.clone(),change};
    change(null,'전체 분포');
  }
  stopTour(){this.tour=undefined;this.controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;}
  pauseTour(paused:boolean){
    if(this.tour&&this.tourPaused&&!paused){this.tour.from.copy(this.camera.position);this.tour.target.copy(this.controls.target);this.tour.elapsed=0;}
    this.tourPaused=paused;
  }
  private animateTour(dt:number){
    const t=this.tour;if(!t||this.tourPaused)return;t.elapsed+=dt;
    if(t.elapsed>=t.interval){
      t.stage=(t.stage+1)%4;t.elapsed=0;t.from.copy(this.camera.position);t.target.copy(this.controls.target);
      t.change(t.stage===2?t.hero:null,['전체 분포','진원 깊이',t.hero?'주요 지진':'전체 분포','위에서 보기'][t.stage]);
    }
    const depth=this.region==='korea'?100:700;
    const target=t.stage===2&&t.hero?this.point(t.hero.lon,t.hero.lat,t.hero.depth??0):new THREE.Vector3(0,-depth*this.scale*(t.stage===3?0:.4),0);
    const direction=[new THREE.Vector3(550,1050,1250),new THREE.Vector3(-700,120,1700),new THREE.Vector3(650,700,1100),new THREE.Vector3(0,1900,1)][t.stage].normalize();
    const distance=t.stage===2&&t.hero?(this.region==='korea'?500:1100):this.fitDistance(direction,this.camera.aspect,target);
    const end=new THREE.Spherical().setFromVector3(direction.multiplyScalar(distance));
    const start=new THREE.Spherical().setFromVector3(t.from.clone().sub(t.target));
    const delta=Math.atan2(Math.sin(end.theta-start.theta),Math.cos(end.theta-start.theta));
    const p=Math.min(1,t.elapsed/4),ease=p*p*(3-2*p);
    const drift=t.stage===3?0:Math.max(0,t.elapsed-4)*this.controls.autoRotateSpeed*.018;
    const offset=new THREE.Spherical(THREE.MathUtils.lerp(start.radius,end.radius,ease),THREE.MathUtils.lerp(start.phi,end.phi,ease),start.theta+delta*ease+drift);
    this.controls.target.lerpVectors(t.target,target,ease);this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(offset));this.needsRender=true;
  }
  setAppearance(dark:boolean,depthColors:boolean,broadcast=false){this.dark=dark;this.depthColors=depthColors;this.broadcast=broadcast;this.renderer.setClearColor(this.palette.background,0);this.controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.buildMap();this.updateEvents(this.events,this.scale);}
  screenshot(){this.renderer.setClearAlpha(1);this.renderer.render(this.scene,this.camera);const image=this.renderer.domElement.toDataURL('image/png');this.renderer.setClearAlpha(0);this.needsRender=true;return image;}
  private animate=()=>{
    this.frame=requestAnimationFrame(this.animate);const now=performance.now(),elapsed=(now-this.last)/1000,dt=Math.min(elapsed,.1);this.last=now;if(this.hidden)return;
    this.animateTour(elapsed);this.controls.update(dt);
    if(this.needsRender||this.controls.autoRotate){
      const h=this.host.clientHeight;for(const l of this.labels){const angle=this.controls.getPolarAngle();l.sprite.visible=(!l.depth||angle>.12)&&(!this.broadcast||!l.city||angle<1.35);const distance=l.sprite.position.distanceTo(this.camera.position);const height=distance*2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));const size=height/Math.max(h,1)*(this.broadcast?42:26);l.sprite.scale.set(size*8,size,1);}
      const ring=this.focusGroup.children[0];if(ring)ring.quaternion.copy(this.camera.quaternion);
      const north=new THREE.Vector3(0,0,-1).transformDirection(this.camera.matrixWorldInverse);
      const compass=document.querySelector<HTMLElement>('.map-compass>div');if(compass)compass.style.transform=`rotate(${Math.atan2(north.x,north.y)*180/Math.PI}deg)`;
      this.renderer.render(this.scene,this.camera);this.needsRender=false;
    }
  };
  dispose(){cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.controls.dispose();this.clear(this.mapGroup);this.clear(this.pointsGroup);this.clear(this.focusGroup);this.renderer.dispose();}
}
