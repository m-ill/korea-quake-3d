import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { depthColor, project, REGIONS, type Quake, type Region } from './model';

export interface MapData {polygons:number[][][][];borders:number[][][];source:string;url:string}
type Label = {sprite:THREE.Sprite; base:number};
export class QuakeScene {
  renderer:THREE.WebGLRenderer; camera:THREE.PerspectiveCamera; controls:OrbitControls;
  private scene=new THREE.Scene(); private mapGroup=new THREE.Group(); private pointsGroup=new THREE.Group();
  private focusGroup=new THREE.Group(); private labels:Label[]=[]; private known:Quake[]=[];private unknown:Quake[]=[];
  private mesh?:THREE.InstancedMesh; private rings?:THREE.InstancedMesh; private events:Quake[]=[];
  private region:Region='korea';private scale=4; private center:[number,number]=[127.25,37.5];
  private ray=new THREE.Raycaster(); private pointer=new THREE.Vector2();private selected:Quake|null=null;
  private down=[0,0]; private resizeObserver:ResizeObserver;private frame=0;private last=performance.now();
  private needsRender=true;private hidden=false;private onVisibility=()=>{this.hidden=document.hidden;this.last=performance.now();};
  constructor(private host:HTMLElement,private map:MapData,private onSelect:(e:Quake)=>void) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0x0a111b,0);
    this.host.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','드래그로 회전하는 3D 진원 지도');
    this.renderer.domElement.tabIndex=0;
    this.camera=new THREE.PerspectiveCamera(42,1,1,16000);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.075;
    this.controls.autoRotateSpeed=.42;this.controls.minDistance=40;this.controls.maxDistance=8000;this.controls.maxPolarAngle=Math.PI*.94;
    this.controls.addEventListener('change',()=>{this.needsRender=true;});
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
      e.preventDefault();this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));this.controls.update();
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.setRegion('korea');this.animate();
  }
  private resize(){const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.needsRender=true;}
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
  private label(text:string,position:THREE.Vector3,color='#71849a',size=15){
    const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d')!;
    ctx.font=`500 ${size*2}px "Segoe UI", "Malgun Gothic", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,32);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));sprite.position.copy(position);sprite.renderOrder=5;
    this.mapGroup.add(sprite);this.labels.push({sprite,base:1});
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
      const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x426579,side:THREE.DoubleSide,transparent:true,opacity:.16,depthWrite:false}));mesh.renderOrder=0;this.mapGroup.add(mesh);
      rings.forEach(r=>this.line([...r,r[0]],0x6e9baf,.68));
    }
    for(const border of this.map.borders){let run:number[][]=[];for(const c of border){if(c[0]>=b[0]&&c[0]<=b[2]&&c[1]>=b[1]&&c[1]<=b[3])run.push(c);else{this.line(run,0x7090a2,.35);run=[];}}this.line(run,0x7090a2,.35);}
    for(let lon=Math.ceil(b[0]);lon<=b[2];lon+=(this.region==='korea'?2:5)){
      this.line([[lon,b[1]],[lon,b[3]]],0x334353,.4);this.label(`${lon}°E`,this.point(lon,b[1]-.22));
    }
    for(let lat=Math.ceil(b[1]);lat<=b[3];lat+=(this.region==='korea'?2:4)){
      this.line([[b[0],lat],[b[2],lat]],0x334353,.4);this.label(`${lat}°N`,this.point(b[0]-.3,lat));
    }
    this.line([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]],0x6c8598,.5);
    const max=this.region==='korea'?100:700;const step=this.region==='korea'?20:100;
    for(let d=step;d<=max;d+=step){
      const corners=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]].map(c=>this.point(c[0],c[1],d));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color:0x304255,transparent:true,opacity:.32,depthWrite:false}));this.mapGroup.add(line);
      this.label(`${d} km`,this.point(b[2]+.25,b[1],d),'#688095',12);
    }
    for(const [lon,lat] of [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]){
      this.mapGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.point(lon,lat),this.point(lon,lat,max)]),new THREE.LineBasicMaterial({color:0x40546a,transparent:true,opacity:.5})));
    }
    const cities:[string,number,number][]=[['서울',126.98,37.57],['부산',129.07,35.18],['제주',126.53,33.5],['평양',125.75,39.03],['울릉도',130.9,37.48],['독도',131.87,37.24],['도쿄',139.69,35.68],['후쿠오카',130.4,33.59],['베이징',116.4,39.9],['삿포로',141.35,43.06]];
    for(const [name,lon,lat] of cities){if(lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3])continue;
      this.label(name,this.point(lon,lat+.13),'#9fb5c8',12);
      const dot=new THREE.Mesh(new THREE.CircleGeometry(this.region==='korea'?2:5,12),new THREE.MeshBasicMaterial({color:0x94acba,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));dot.rotation.x=-Math.PI/2;dot.position.copy(this.point(lon,lat));dot.position.y=.5;this.mapGroup.add(dot);
    }
    this.label('N',this.point(this.center[0],b[3]+.38),'#b0c3d1',18);this.needsRender=true;
  }
  updateEvents(events:Quake[],scale:number){
    const changed=this.scale!==scale;this.scale=scale;if(changed)this.buildMap();this.events=events;
    this.clear(this.pointsGroup);this.known=events.filter(e=>e.depth!==null);this.unknown=events.filter(e=>e.depth===null);
    const geo=new THREE.SphereGeometry(1,10,7), material=new THREE.MeshBasicMaterial({color:0xffffff});
    this.mesh=new THREE.InstancedMesh(geo,material,this.known.length);
    this.rings=new THREE.InstancedMesh(new THREE.RingGeometry(.65,1,16),new THREE.MeshBasicMaterial({color:0x8495ad,side:THREE.DoubleSide,transparent:true,opacity:.55,depthWrite:false}),this.unknown.length);
    const dummy=new THREE.Object3D(),color=new THREE.Color();
    const base=this.region==='korea'?1:2.2;
    this.known.forEach((e,i)=>{dummy.position.copy(this.point(e.lon,e.lat,e.depth!));dummy.rotation.set(0,0,0);dummy.scale.setScalar(base*(2+Math.max(e.mag,0)**1.6*.48));dummy.updateMatrix();this.mesh!.setMatrixAt(i,dummy.matrix);this.mesh!.setColorAt(i,color.set(depthColor(e.depth)));});
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
    const p=this.point(e.lon,e.lat,e.depth??0);const radius=this.region==='korea'?13:26;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.8,6,48),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.9}));ring.position.copy(p);this.focusGroup.add(ring);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p,this.point(e.lon,e.lat)]),new THREE.LineDashedMaterial({color:0xb6dfdc,dashSize:5,gapSize:4,transparent:true,opacity:.7,depthTest:false}));line.computeLineDistances();this.focusGroup.add(line);this.needsRender=true;
  }
  focus(e:Quake){this.controls.target.copy(this.point(e.lon,e.lat,e.depth??0));const d=this.region==='korea'?400:800;this.camera.position.copy(this.controls.target).add(new THREE.Vector3(d*.5,d*.6,d));this.controls.update();}
  setView(view:'oblique'|'top'|'side'){
    const aspect=Math.max(.3,this.host.clientWidth/Math.max(1,this.host.clientHeight));
    const k=(this.region==='korea'?1:2.15)*Math.max(1,1.2/aspect);this.controls.target.set(0,-(this.region==='korea'?90:180),0);
    const offsets={oblique:new THREE.Vector3(550,1050,1250),top:new THREE.Vector3(0,1900,1),side:new THREE.Vector3(0,30,1700)};
    this.camera.position.copy(this.controls.target).add(offsets[view].multiplyScalar(k));this.controls.update();this.needsRender=true;
  }
  setRotate(value:boolean){this.controls.autoRotate=value;this.needsRender=true;}
  screenshot(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  private animate=()=>{
    this.frame=requestAnimationFrame(this.animate);const now=performance.now(),dt=Math.min((now-this.last)/1000,.1);this.last=now;if(this.hidden)return;
    this.controls.update(dt);
    if(this.needsRender||this.controls.autoRotate){
      const h=this.host.clientHeight;for(const l of this.labels){const distance=l.sprite.position.distanceTo(this.camera.position);const height=distance*2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));const size=height/Math.max(h,1)*26;l.sprite.scale.set(size*8,size,1);}
      const ring=this.focusGroup.children[0];if(ring)ring.quaternion.copy(this.camera.quaternion);
      const north=new THREE.Vector3(0,0,-1).transformDirection(this.camera.matrixWorldInverse);
      const compass=document.querySelector<HTMLElement>('.map-compass>div');if(compass)compass.style.transform=`rotate(${Math.atan2(north.x,north.y)*180/Math.PI}deg)`;
      this.renderer.render(this.scene,this.camera);this.needsRender=false;
    }
  };
  dispose(){cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.controls.dispose();this.clear(this.mapGroup);this.clear(this.pointsGroup);this.clear(this.focusGroup);this.renderer.dispose();}
}
