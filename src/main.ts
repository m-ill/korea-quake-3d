import './style.css';
import { csv, depthColor, filterEvents, kstDate, readState, REGIONS, validDate, type Catalog, type Filters, type Quake, type Region } from './model';
import { QuakeScene, type MapData } from './scene';
import { icon } from './icons';
import { esc, fmt, layout } from './ui';
import { broadcastURL, readBroadcast, type CameraView } from './broadcast';

const $ = <T extends HTMLElement = HTMLElement>(s:string) => document.querySelector<T>(s)!;
const app = $('#app');
const base = import.meta.env.BASE_URL;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const broadcast = readBroadcast(location.search);
document.documentElement.classList.toggle('broadcast-mode',broadcast.enabled);
let dark = false;
try { dark = localStorage.getItem('quake-theme') === 'dark'; } catch { /* Private storage may be unavailable. */ }
document.documentElement.dataset.theme = dark && !broadcast.enabled ? 'dark' : 'light';
app.innerHTML = `<div class="loading"><img src="${base}mascot/brand.png" alt="" width="64" height="64"><h1>진원 지도</h1><p>과거의 지진 기록을 불러오고 있어요.</p></div>`;
let catalog:Catalog, scene:QuakeScene|undefined, filters:Filters;
let selected:Quake|null = null, visible:Quake[] = [], scale = 4;
let rotating = false, playing = false, depthColors = true;
let tourHero:Quake|null|undefined, motionPaused=false, motionLabel='전체 분포';
let cursor = 1, totalDays = 1, listSort = 'latest', listQuery = '', listLimit = 40;
let playTimer:number|undefined, toastTimer:number|undefined;
const timeLabel = (s:string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
}).format(new Date(s));

async function boot() {
  const [c, map] = await Promise.all(['catalog.json','map.json'].map(async file => {
    const r = await fetch(`${base}data/${file}`);if (!r.ok) throw new Error(`${file} HTTP ${r.status}`);return r.json();
  }));
  catalog = c as Catalog;
  if (catalog.schemaVersion !== 1 || !catalog.events?.length || !Array.isArray(map.polygons)) throw new Error('데이터 형식이 올바르지 않습니다.');
  const {event:sharedEvent, scale:sharedScale, ...sharedFilters} = readState(location.search,catalog.snapshotEnd);
  const region = sharedFilters.region ?? 'korea';
  filters = {region,from:'2016-01-01',to:catalog.snapshotEnd,minMag:2,maxDepth:REGIONS[region].depth,unknown:true,kma:true,usgs:true,...sharedFilters};
  scale = sharedScale ?? REGIONS[region].scale;
  depthColors = new URLSearchParams(location.search).get('colors')!=='0';
  if (filters.from > filters.to) filters.from = filters.to;
  app.innerHTML = layout(catalog);
  $<HTMLInputElement>('#broadcast-title').value=broadcast.title;
  $<HTMLSelectElement>('#broadcast-view').value=broadcast.view;
  $<HTMLSelectElement>('#broadcast-motion').value=broadcast.tour?'tour':broadcast.rotate?'orbit':'still';
  $<HTMLSelectElement>('#broadcast-interval').value=String(broadcast.interval);
  $<HTMLSelectElement>('#broadcast-speed').value=String(broadcast.speed);
  $('#snapshot').textContent = `${catalog.snapshotEnd.replaceAll('-','.')} 기준`;
  $('#matching-note').textContent = catalog.matchingRule + ` 위경도가 없는 원본 ${catalog.stats.unlocated??0}건은 별도 보존하며 지도에서 제외합니다.`;
  $('#source-content').innerHTML = catalog.sources.map(s => `<section class="sheet-section"><h3>${esc(s.name)}</h3><p>${esc(s.coverage)}</p><p class="hint">${esc(s.start)} — ${esc(s.end)} · 원본 ${fmt(s.rawCount)}건</p><a class="text-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">공식 데이터 확인 ↗</a></section>`).join('') + `<p class="hint">스냅샷 ${esc(catalog.snapshotEnd)} · 기관 간 연결 ${fmt(catalog.stats.linkedDuplicates)}건<br>웹 화면은 실시간 API를 호출하지 않습니다.</p>`;
  $('#depth-legend').innerHTML = [[0,'0–10'],[20,'10–30'],[50,'30–70'],[100,'70–150'],[200,'150–300'],[400,'300+']].map(([d,t]) => `<span><i style="background:${depthColor(Number(d))}"></i>${t} km</span>`).join('');
  try { scene = new QuakeScene($('#map-canvas'),map as MapData,selectEvent);scene.setRegion(filters.region); }
  catch (error) {
    $('#map-canvas').innerHTML = '<div class="webgl-error"><h2>3D 지도를 시작하지 못했어요</h2><p>브라우저의 하드웨어 가속과 WebGL 지원을 확인해주세요.<br>목록과 CSV 저장은 계속 사용할 수 있습니다.</p></div>';console.error(error);
  }
  if(scene)scene.onManualControl=()=>{if(broadcast.enabled&&(broadcast.tour||broadcast.rotate))pauseBroadcastMotion(true);};
  bind(); applyTheme(); syncControls(); resetTimeline(); refresh();
  if (sharedEvent) { const e=visible.find(q=>q.id===sharedEvent); if(e)selectEvent(e); }
  if(broadcast.enabled)setBroadcastMode(true,false);
}
function openSheet(id:string) {
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());
  const d=$<HTMLDialogElement>(`#${id}`);d.showModal();d.scrollTop=0;
}
function closeSheet(id:string) { $<HTMLDialogElement>(`#${id}`).close(); }
function applyTheme() {
  const effectiveDark=dark&&!broadcast.enabled;
  document.documentElement.dataset.theme=effectiveDark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',effectiveDark?'#151619':broadcast.enabled?'#ffffff':'#fcfcfd');
  const b=$('#theme-toggle');b.innerHTML=icon(dark?'sun':'moon');b.setAttribute('aria-pressed',String(dark));b.setAttribute('aria-label','다크 모드');b.setAttribute('aria-description',dark?'현재 다크 모드입니다. 누르면 라이트 모드로 전환합니다.':'현재 라이트 모드입니다. 누르면 다크 모드로 전환합니다.');b.title=dark?'라이트 모드로 전환':'다크 모드로 전환';
  scene?.setAppearance(effectiveDark,depthColors,broadcast.enabled);
}
function syncControls() {
  for(const key of ['from','to'] as const)$<HTMLInputElement>(`#${key}`).value=filters[key];
  $<HTMLInputElement>('#magnitude').value=String(filters.minMag);$<HTMLInputElement>('#depth').value=String(filters.maxDepth);
  for(const key of ['unknown','kma','usgs'] as const)$<HTMLInputElement>(`#${key}`).checked=filters[key];
  $<HTMLInputElement>('#depth-colors').checked=depthColors;
  const select=$<HTMLSelectElement>('#scale');if(![...select.options].some(o=>Number(o.value)===scale))select.add(new Option(`${scale}×`,String(scale)));select.value=String(scale);
  document.querySelectorAll<HTMLButtonElement>('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===filters.region)));
}
function resetTimeline() {
  pause();totalDays=Math.max(1,Math.round((Date.parse(filters.to)-Date.parse(filters.from))/86400_000));cursor=totalDays;
  const range=$<HTMLInputElement>('#timeline-slider');range.max=String(totalDays);range.value=String(cursor);
  $('#year-labels').innerHTML=[0,.5,1].map(t=>`<span>${new Date(Date.parse(filters.from)+Math.round(totalDays*t)*86400_000).toISOString().slice(0,7).replace('-','.')}</span>`).join('');histogram();
}
function effectiveTo() { return cursor===totalDays?filters.to:new Date(Date.parse(filters.from)+cursor*86400_000).toISOString().slice(0,10); }
function histogram() {
  const all=filterEvents(catalog.events,{...filters,to:filters.to}), counts=new Array(64).fill(0);
  const start=Date.parse(filters.from), span=Math.max(86400_000,(totalDays+1)*86400_000);
  for(const e of all) { const date=Date.parse(`${kstDate(e.time)}T00:00:00Z`);counts[Math.min(63,Math.max(0,Math.floor((date-start)/span*64)))]++; }
  const max=Math.max(1,...counts);$('#histogram').innerHTML=counts.map(c=>`<i style="height:${Math.max(3,c/max*100)}%"></i>`).join('');
}
function refresh() {
  visible=filterEvents(catalog.events,{...filters,to:effectiveTo()});if(selected&&!visible.some(e=>e.id===selected!.id))selected=null;
  const refreshTour=broadcast.enabled&&broadcast.tour&&(scene?.hasTour||tourHero)&&(
    tourHero ? !visible.some(e=>e.id===tourHero?.id) : visible.length>0
  );
  if(refreshTour){
    tourHero=null;
    scene?.stopTour();
  }
  scene?.updateEvents(visible,scale);
  if(refreshTour&&!motionPaused&&!reducedMotion.matches)startBroadcastTour();
  $('#mag-value').textContent=filters.minMag.toFixed(1);$('#depth-value').textContent=String(filters.maxDepth);
  $('#scale-badge').textContent=scale===1?'깊이 1× · 실제 비율':`깊이 ${scale}×`;
  $('#period-label').textContent=`${filters.from.replaceAll('-','.')} — ${filters.to.replaceAll('-','.')} · M${filters.minMag.toFixed(1)}+`;
  $('#region-heading').textContent=REGIONS[filters.region].name;$('#timeline-date').textContent=effectiveTo().replaceAll('-','.');
  $<HTMLInputElement>('#timeline-slider').setAttribute('aria-valuetext',`${effectiveTo()}까지 누적 표시`);
  $('#empty-state').hidden=visible.length>0;$('#depth-legend').hidden=!depthColors;
  document.querySelectorAll<HTMLElement>('#histogram i').forEach((e,i)=>e.classList.toggle('future',i/64>cursor/totalDays));
  renderReading();renderList();renderDetail();updateBear();renderBroadcast();
}
function renderReading() {
  const root=$('#current-reading');
  if(selected) {
    const e=selected;
    root.innerHTML=`<div class="reading-label">선택한 진원 <button id="deselect" class="tool icon-only small-close" aria-label="선택 해제" title="선택 해제">${icon('close')}</button></div><button id="selected-detail" class="selected-reading" aria-label="선택한 지진 상세 보기"><span class="reading-number"><small>M</small>${e.mag.toFixed(1)}</span><span class="selected-place">${esc(e.place)}${icon('chevron')}</span><span class="reading-meta">${kstDate(e.time).replaceAll('-','.')} · 깊이 ${e.depth===null?'미상':`${e.depth.toFixed(1)} km`}</span></button>`;
    $('#deselect').onclick=()=>{selected=null;scene?.select(null);renderReading();renderList();updateBear();renderBroadcast();};
    $('#selected-detail').onclick=()=>{renderDetail();openSheet('detail-dialog');};
  } else {
    const known=visible.filter(e=>e.depth!==null).length, max=visible.length?Math.max(...visible.map(e=>e.mag)):null;
    root.innerHTML=`<span class="reading-label">지금 표시한 지진</span><div class="reading-number"><strong id="stat-total">${fmt(visible.length)}</strong><small>건</small></div><p class="reading-meta">깊이 확인 <span id="stat-known">${fmt(known)}</span>건<span class="meta-dot">·</span>최대 규모 <span id="stat-max">${max===null?'—':`M${max.toFixed(1)}`}</span></p>`;
  }
}
function updateBear() {
  const state=playing?'playing':!visible.length?'thinking':selected?'focused':'calm';$('#mascot-status').dataset.state=state;
  const message=playing?'시간을 따라 기록을 살펴보고 있어요.':!visible.length?'조건을 조금 넓혀볼까요?':selected?'선택한 진원을 더 자세히 살펴보세요.':'점을 누르면 그 지진을 살펴볼 수 있어요.';
  const m=$('#bear-message');if(m.textContent!==message)m.textContent=message;
}
function renderDetail() {
  if(!selected){$('#event-detail').innerHTML='';return;}const e=selected;
  $('#event-detail').innerHTML=`<article class="event-detail"><div class="detail-magnitude"><small>M</small>${e.mag.toFixed(1)}<span>${esc(e.magType)}</span></div><h3>${esc(e.place)}</h3><p class="detail-time">${timeLabel(e.time)} KST</p><dl class="detail-measures"><div><dt>진원 깊이</dt><dd>${e.depth===null?'미상':`${e.depth.toFixed(1)} <small>km</small>`}</dd></div><div><dt>최대진도 · 기상청</dt><dd>${esc(e.intensity??'—')}</dd></div><div><dt>위도</dt><dd>${e.lat.toFixed(3)}° N</dd></div><div><dt>경도</dt><dd>${e.lon.toFixed(3)}° E</dd></div></dl>${e.depth===null?'<p class="hint">깊이 자료가 없어 지표의 빈 원으로 표시합니다.</p>':''}${e.alternate?.length?`<details class="alternate"><summary>다른 기관의 연결 기록 (${e.alternate.length})</summary>${e.alternate.map(a=>`<p>${esc(a.source)} ${esc(a.magType)} ${a.mag.toFixed(1)} · 깊이 ${a.depth===null?'미상':a.depth+' km'}<br><a class="text-link" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">원본 확인 ↗</a></p>`).join('')}<p class="hint">기관별 추정치를 그대로 보존하며 표시값을 대체하지 않습니다.</p></details>`:''}<div class="detail-actions"><button id="focus-event" class="primary-button">${icon('focus')}지도에서 확대</button><a class="text-link" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${e.source} 원본 ↗</a></div></article>`;
  $('#focus-event').onclick=()=>{closeSheet('detail-dialog');scene?.focus(e);$('.stage').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'center'});};
}
function selectEvent(e:Quake) {
  if(broadcast.enabled&&broadcast.tour){
    tourHero=e;
    scene?.stopTour();
    pauseBroadcastMotion(true);
  }
  selected=e;scene?.select(e);renderReading();renderDetail();renderList();updateBear();renderBroadcast();closeSheet('catalog-dialog');
}

function currentBroadcastURL(clean=false) {
  const motion=$<HTMLSelectElement>('#broadcast-motion').value;
  const sanitized=readBroadcast(new URLSearchParams({broadcast:'1',title:$<HTMLInputElement>('#broadcast-title').value,view:$<HTMLSelectElement>('#broadcast-view').value as CameraView,rotate:motion==='orbit'?'1':'0',tour:motion==='tour'?'1':'0',interval:$<HTMLSelectElement>('#broadcast-interval').value,speed:$<HTMLSelectElement>('#broadcast-speed').value}).toString());
  const url=new URL(broadcastURL(location.href,{...filters,to:effectiveTo()},scale,depthColors,(broadcast.enabled&&broadcast.tour&&tourHero!==undefined?tourHero:selected)?.id,sanitized));
  if(clean)url.searchParams.set('clean','1');
  return url.href;
}
function renderBroadcast() {
  $('#broadcast-heading').textContent=broadcast.title||`${REGIONS[filters.region].name} 진원 분포`;
  $('#broadcast-preview').textContent=broadcast.enabled?'방송 설정 적용':'미리보기';
  const selection=$('#broadcast-selection');
  selection.hidden=!broadcast.enabled||!selected;
  selection.textContent=selected
    ? `M ${selected.mag.toFixed(1)} · ${selected.place} · 깊이 ${selected.depth===null?'미상':selected.depth.toFixed(1)+' km'} · ${timeLabel(selected.time)} KST`
    : '';
  const motionButton=$('#broadcast-motion-toggle');
  motionButton.hidden=!(broadcast.tour||broadcast.rotate)||reducedMotion.matches;
  motionButton.textContent=motionPaused?'자동 연출 재개':'자동 연출 일시정지';
  const status=$('#broadcast-motion-status');status.textContent=!(broadcast.tour||broadcast.rotate)?'고정 화면':reducedMotion.matches?'고정 화면 · 동작 줄이기':motionPaused?'자동 연출 일시정지 · Space로 재개':broadcast.tour?`자동 연출 · ${motionLabel}`:'자동 회전';
  $('#broadcast-source').textContent=`자료: ${[filters.kma?'기상청':null,filters.usgs?'USGS':null].filter(Boolean).join(' · ')||'선택 없음'}`;
  $('#broadcast-snapshot').textContent=`자료 기준일 ${catalog.snapshotEnd.replaceAll('-','.')}`;
  $<HTMLTextAreaElement>('#broadcast-url').value=currentBroadcastURL(true);$<HTMLAnchorElement>('#broadcast-new').href=currentBroadcastURL();
}
function setBroadcastSettings(open:boolean) {
  const panel=$('#broadcast-settings');
  const toggle=$('#broadcast-settings-toggle');
  if(!open&&panel.contains(document.activeElement))toggle.focus();
  panel.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  document.documentElement.classList.toggle('broadcast-settings-open',open);
}
function startBroadcastTour() {
  tourHero=tourHero??selected??[...visible].sort((a,b)=>b.mag-a.mag||b.time.localeCompare(a.time)||a.id.localeCompare(b.id))[0]??null;
  scene?.startTour(tourHero,broadcast.interval,broadcast.speed,(e,label)=>{
    selected=e;
    scene?.select(e);
    motionLabel=label;
    renderBroadcast();
  });
}
function setBroadcastMode(enabled:boolean,updateURL=true) {
  const applyingInPanel=enabled&&broadcast.enabled&&!$('#broadcast-settings').hidden;
  pause();
  scene?.stopTour();
  if(tourHero!==undefined){
    selected=tourHero;
    scene?.select(selected);
    renderReading();renderDetail();renderList();updateBear();
    tourHero=undefined;
  }
  if(enabled){const options=readBroadcast(new URL(currentBroadcastURL()).search);Object.assign(broadcast,options);}
  broadcast.enabled=enabled;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());
  if(!applyingInPanel)setBroadcastSettings(false);
  // Keep one set of controls and listeners for both the dialogs and the inline panel.
  document.querySelectorAll<HTMLElement>('[data-settings-sheet]').forEach(section=>{
    const id=section.dataset.settingsSheet!;
    const destination=enabled?section:$(`#${id}`);
    const body=$(`#${id}-body`);
    if(body.parentElement!==destination)destination.append(body);
  });
  document.documentElement.classList.toggle('broadcast-clean',enabled&&!updateURL&&new URLSearchParams(location.search).get('clean')==='1');
  document.documentElement.classList.toggle('broadcast-mode',enabled);applyTheme();renderBroadcast();
  setView(enabled?broadcast.view:'oblique');
  motionPaused=false;rotating=enabled&&broadcast.rotate&&!broadcast.tour&&!reducedMotion.matches;scene?.setRotate(rotating,broadcast.speed);$('#rotate').setAttribute('aria-pressed',String(rotating));
  if(enabled&&broadcast.tour&&!reducedMotion.matches)startBroadcastTour();
  renderBroadcast();
  if(updateURL){
    const url=new URL(enabled?currentBroadcastURL():location.href);
    if(!enabled)for(const k of ['broadcast','view','rotate','title','tour','interval','speed','clean'])url.searchParams.delete(k);
    history.replaceState(null,'',url);
  }
  if(!applyingInPanel){
    window.scrollTo(0,0);
    if(enabled)$<HTMLCanvasElement>('#map-canvas canvas')?.focus({preventScroll:true});
  }
}
function pauseBroadcastMotion(paused:boolean){
  if(!paused&&!reducedMotion.matches&&broadcast.tour&&!scene?.hasTour)startBroadcastTour();
  motionPaused=paused;scene?.pauseTour(paused||reducedMotion.matches);
  rotating=broadcast.enabled&&broadcast.rotate&&!broadcast.tour&&!paused&&!reducedMotion.matches;
  scene?.setRotate(rotating,broadcast.speed);renderBroadcast();
}
function renderList() {
  const all=visible.filter(e=>e.place.toLowerCase().includes(listQuery.toLowerCase())).sort((a,b)=>listSort==='latest'?b.time.localeCompare(a.time):listSort==='deepest'?(b.depth??-Infinity)-(a.depth??-Infinity):b.mag-a.mag||b.time.localeCompare(a.time));
  $('#list-count').textContent=`표시 조건에 맞는 ${fmt(visible.length)}건`;
  $('#event-list').innerHTML=all.slice(0,listLimit).map(e=>`<button class="event-row ${selected?.id===e.id?'selected':''}" data-event="${esc(e.id)}" aria-pressed="${selected?.id===e.id}"><span class="list-magnitude"><small>M</small>${e.mag.toFixed(1)}</span><span class="event-row-body"><strong>${esc(e.place)}</strong><small>${kstDate(e.time).replaceAll('-','.')} · ${e.depth===null?'깊이 미상':`${e.depth.toFixed(0)} km`} · ${e.source}</small></span>${selected?.id===e.id?icon('check'):icon('chevron')}</button>`).join('')||'<p class="list-empty">검색 결과가 없어요.</p>';
  $('#list-more').hidden=all.length<=listLimit;$('#list-note').textContent=`검색 결과 ${fmt(all.length)}건 중 ${fmt(Math.min(listLimit,all.length))}건 표시`;
}
function pause() {
  playing=false;clearInterval(playTimer);playTimer=undefined;const b=$('#play');
  if(b){b.innerHTML=icon('play');b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','시간 재생');}if($('#mascot-status'))updateBear();
}
function toast(message:string) { clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=window.setTimeout(()=>$('#toast').classList.remove('visible'),3000); }
function download(content:Blob|string,name:string) {
  const url=typeof content==='string'?content:URL.createObjectURL(content), a=document.createElement('a');a.href=url;a.download=name;a.click();if(typeof content!=='string')setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setView(view:'oblique'|'top'|'side') { scene?.setView(view);document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view))); }
function reset() {
  filters={region:'korea',from:'2016-01-01',to:catalog.snapshotEnd,minMag:2,maxDepth:100,unknown:true,kma:true,usgs:true};
  scale=4;selected=null;depthColors=true;
  rotating=broadcast.enabled&&broadcast.rotate&&!motionPaused&&!reducedMotion.matches;
  scene?.setRotate(rotating,broadcast.speed);
  $('#rotate').setAttribute('aria-pressed',String(rotating));$('#date-error').textContent='';
  scene?.setRegion('korea');applyTheme();syncControls();resetTimeline();refresh();setView('oblique');
}
function changeRegion(region:Region) {
  if(broadcast.enabled&&(broadcast.tour||broadcast.rotate))pauseBroadcastMotion(true);
  pause();selected=null;filters.region=region;filters.maxDepth=REGIONS[region].depth;scale=REGIONS[region].scale;
  scene?.setRegion(region);syncControls();histogram();refresh();setView('oblique');
}
function bind() {
  const openings:Record<string,string>={'period-open':'period-dialog','period-summary':'period-dialog','display-open':'display-dialog','list-open':'catalog-dialog','more-open':'more-dialog','source-open':'sources-dialog','more-source':'sources-dialog','broadcast-open':'broadcast-dialog','more-broadcast':'broadcast-dialog'};
  for(const [button,id] of Object.entries(openings))$(`#${button}`).onclick=()=>openSheet(id);
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b=>b.onclick=()=>closeSheet(b.dataset.close!));
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();}));
  $('#theme-toggle').onclick=()=>{dark=!dark;try{localStorage.setItem('quake-theme',dark?'dark':'light');}catch{}applyTheme();};
  document.querySelectorAll<HTMLButtonElement>('[data-region]').forEach(b=>b.onclick=()=>changeRegion(b.dataset.region as Region));
  for(const key of ['from','to'] as const)$(`#${key}`).addEventListener('change',()=>{
    const from=$<HTMLInputElement>('#from').value,to=$<HTMLInputElement>('#to').value;
    if(!validDate(from)||!validDate(to)||from>to||from<'1978-01-01'||to>catalog.snapshotEnd){$('#date-error').textContent=`1978-01-01부터 ${catalog.snapshotEnd} 사이의 올바른 기간을 선택해주세요.`;return;}
    $('#date-error').textContent='';filters.from=from;filters.to=to;resetTimeline();refresh();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-years]').forEach(b=>b.onclick=()=>{
    filters.to=catalog.snapshotEnd;filters.from=b.dataset.years==='all'?'1978-01-01':`${Number(catalog.snapshotEnd.slice(0,4))-Number(b.dataset.years)+1}-01-01`;
    $('#date-error').textContent='';syncControls();resetTimeline();refresh();
  });
  $<HTMLInputElement>('#magnitude').oninput=e=>{filters.minMag=Number((e.target as HTMLInputElement).value);listLimit=40;histogram();refresh();};
  $<HTMLInputElement>('#depth').oninput=e=>{filters.maxDepth=Number((e.target as HTMLInputElement).value);histogram();refresh();};
  for(const key of ['unknown','kma','usgs'] as const)$<HTMLInputElement>(`#${key}`).onchange=e=>{filters[key]=(e.target as HTMLInputElement).checked;histogram();refresh();};
  $('#depth-colors').onchange=e=>{depthColors=(e.target as HTMLInputElement).checked;applyTheme();$('#depth-legend').hidden=!depthColors;renderBroadcast();};
  $('#scale').onchange=e=>{scale=Number((e.target as HTMLSelectElement).value);refresh();};$('#reset').onclick=reset;$('#empty-reset').onclick=reset;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
    if(broadcast.enabled&&(broadcast.tour||broadcast.rotate))pauseBroadcastMotion(true);
    setView(b.dataset.view as CameraView);
  });
  $('#view-reset').onclick=()=>setView('oblique');
  $('#rotate').onclick=()=>{if(reducedMotion.matches){toast('동작 줄이기 설정에 따라 수동 회전을 사용해주세요.');return;}rotating=!rotating;scene?.setRotate(rotating);$('#rotate').setAttribute('aria-pressed',String(rotating));};
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){rotating=false;scene?.setRotate(false);scene?.pauseTour(true);motionPaused=true;$('#rotate').setAttribute('aria-pressed','false');}renderBroadcast();});
  $('#screenshot').onclick=()=>{if(scene){download(scene.screenshot(),`korea-quake-${effectiveTo()}.png`);closeSheet('more-dialog');}else toast('3D 지도를 시작하지 못했습니다.');};
  $('#export').onclick=()=>{download(new Blob([csv(visible)],{type:'text/csv;charset=utf-8'}),`korea-quakes-${filters.from}-${effectiveTo()}.csv`);closeSheet('more-dialog');toast(`${fmt(visible.length)}건을 CSV로 저장했습니다.`);};
  $('#share').onclick=async()=>{
    const url=new URL(location.href);url.search='';for(const [k,v] of Object.entries(filters))url.searchParams.set(k,typeof v==='boolean'?(v?'1':'0'):String(v));url.searchParams.set('to',effectiveTo());url.searchParams.set('scale',String(scale));url.searchParams.set('colors',depthColors?'1':'0');if(selected)url.searchParams.set('event',selected.id);
    try{await navigator.clipboard.writeText(url.toString());history.replaceState(null,'',url);toast('현재 조건과 선택한 지진의 링크를 복사했습니다.');}catch{history.replaceState(null,'',url);toast('주소창의 링크를 복사해 공유해주세요.');}closeSheet('more-dialog');
  };
  $('#event-list').onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-event]');const q=b?visible.find(q=>q.id===b.dataset.event):null;if(q)selectEvent(q);};
  $('#list-sort').onchange=e=>{listSort=(e.target as HTMLSelectElement).value;listLimit=40;renderList();};$('#list-search').oninput=e=>{listQuery=(e.target as HTMLInputElement).value.trim();listLimit=40;renderList();};$('#list-more').onclick=()=>{listLimit+=40;renderList();};
  $('#timeline-slider').oninput=e=>{pause();cursor=Number((e.target as HTMLInputElement).value);refresh();};$('#timeline-end').onclick=()=>{pause();cursor=totalDays;$<HTMLInputElement>('#timeline-slider').value=String(cursor);refresh();};
  $('#play').onclick=()=>{
    if(playing){pause();return;}playing=true;if(cursor>=totalDays)cursor=0;
    $('#play').innerHTML=icon('pause');$('#play').setAttribute('aria-pressed','true');$('#play').setAttribute('aria-label','시간 재생 일시정지');updateBear();
    playTimer=window.setInterval(()=>{cursor=Math.min(totalDays,cursor+30);$<HTMLInputElement>('#timeline-slider').value=String(cursor);refresh();if(cursor>=totalDays)pause();},500);
  };
  document.querySelectorAll<HTMLButtonElement>('[data-case]').forEach(b=>b.onclick=()=>{
    const cases={gyeongju:{from:'2016-09-12',to:'2016-12-31',region:'korea' as Region},pohang:{from:'2017-11-15',to:'2017-12-31',region:'korea' as Region},tohoku:{from:'2011-03-11',to:'2011-04-11',region:'eastasia' as Region}};
    const c=cases[b.dataset.case as keyof typeof cases];filters.from=c.from;filters.to=c.to;filters.minMag=0;filters.kma=true;filters.usgs=true;filters.unknown=true;
    changeRegion(c.region);syncControls();resetTimeline();refresh();const q=[...visible].sort((a,b)=>b.mag-a.mag)[0];if(q)selectEvent(q);closeSheet('period-dialog');
  });
  window.addEventListener('pagehide',()=>pause());
  for(const id of ['broadcast-title','broadcast-view','broadcast-motion','broadcast-interval','broadcast-speed'])$(`#${id}`).addEventListener('input',()=>renderBroadcast());
  $('#broadcast-preview').onclick=()=>setBroadcastMode(true);
  $('#broadcast-settings-toggle').onclick=()=>setBroadcastSettings($('#broadcast-settings').hidden);
  $('#broadcast-settings-close').onclick=()=>setBroadcastSettings(false);
  $('#broadcast-motion-toggle').onclick=()=>pauseBroadcastMotion(!motionPaused);
  $('#broadcast-exit').onclick=()=>setBroadcastMode(false);
  $('#broadcast-copy').onclick=async()=>{const url=currentBroadcastURL(true);try{await navigator.clipboard.writeText(url);toast('방송용 주소를 복사했습니다.');}catch{$<HTMLTextAreaElement>('#broadcast-url').focus();$<HTMLTextAreaElement>('#broadcast-url').select();toast('선택한 방송용 주소를 복사해주세요.');}};
  window.addEventListener('keydown',e=>{
    const target=e.target as Element|null;
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||target?.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
    if(e.key.toLowerCase()==='b'){e.preventDefault();setBroadcastMode(!broadcast.enabled);}
    else if(e.key==='Escape'&&broadcast.enabled){
      e.preventDefault();
      if($('#broadcast-settings').hidden)setBroadcastMode(false);
      else setBroadcastSettings(false);
    }
    else if(e.code==='Space'&&!target?.closest('button,a')&&broadcast.enabled&&(broadcast.tour||broadcast.rotate)){e.preventDefault();pauseBroadcastMotion(!motionPaused);}
  });
}
boot().catch(error=>{console.error(error);app.innerHTML=`<div class="loading"><img src="${base}mascot/brand.png" alt="" width="64" height="64"><h1>기록을 불러오지 못했어요</h1><p>연결 상태를 확인한 뒤 다시 시도해주세요.</p><button id="retry" class="primary-button">다시 불러오기</button><small>${esc(error instanceof Error?error.message:error)}</small></div>`;$('#retry').onclick=()=>location.reload();});
