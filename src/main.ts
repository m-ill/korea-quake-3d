import './style.css';
import { csv, depthColor, filterEvents, kstDate, readState, REGIONS, validDate, type Catalog, type Filters, type Quake, type Region } from './model';
import { QuakeScene, type MapData } from './scene';

const paths:Record<string,string>={orbit:'M21 12a9 9 0 1 1-9-9M3 3l18 18M16 3h5v5',layers:'m12 3 10 6-10 6L2 9l10-6Zm-10 12 10 6 10-6M2 12l10 6 10-6',sliders:'M4 21V14m0-5V3m8 18v-9m0-5V3m8 18v-5m0-5V3M1 9h6m2-2h6m2 9h6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',share:'M9 12 3 6m6 6-6 6m6-6h12M16 7l5 5-5 5',info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',close:'m6 6 12 12M6 18 18 6',chevron:'m9 5 7 7-7 7',play:'m8 4 12 8-12 8V4Z',pause:'M8 4v16M16 4v16',reset:'M3 11a9 9 0 1 1 2 7M3 4v7h7',focus:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8',camera:'M14 4h-4L8 7H3v13h18V7h-5l-2-3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',search:'M20 20l-5-5M17 10A7 7 0 1 1 3 10a7 7 0 0 1 14 0',github:'M9 19c-4 1-4-2-6-2m12 5v-4c0-1 .1-2-.5-2.5 3.5-.4 7-1.7 7-7.5A6 6 0 0 0 20 4c.2-1 0-2-.4-3 0 0-1.3-.4-4.3 1.6a15 15 0 0 0-7 0C5.3.6 4 1 4 1c-.4 1-.6 2-.4 3A6 6 0 0 0 2 8c0 5.8 3.5 7.1 7 7.5-.6.5-.6 1.5-.5 2.5v4'};
const icon=(name:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]??paths.info}"/></svg>`;
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fmt=(n:number)=>n.toLocaleString('ko-KR');
const timeLabel=(s:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(s));
const app=$('#app');
app.innerHTML=`<div class="loading"><div class="loading-orbit"></div><h1>KOREA QUAKE <span>3D</span></h1><p>한반도의 지하를 펼치는 중</p></div>`;

let catalog:Catalog, scene:QuakeScene|undefined, filters:Filters;
let selected:Quake|null=null, visible:Quake[]=[], scale=4, rotating=false, playing=false, playTimer:number|undefined;
let cursor=1, totalDays=1;let listSort='latest', listQuery='';

async function boot(){
  const base=import.meta.env.BASE_URL;
  const [c,m]=await Promise.all(['catalog.json','map.json'].map(async file=>{const r=await fetch(`${base}data/${file}`);if(!r.ok)throw new Error(`${file} HTTP ${r.status}`);return r.json();}));
  catalog=c as Catalog;const map=m as MapData;
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.events)||!catalog.events.length||!Array.isArray(map.polygons))throw new Error('데이터 형식이 올바르지 않습니다.');
  const shared=readState(location.search,catalog.snapshotEnd);const region=shared.region??'korea';
  filters={region,from:'2016-01-01',to:catalog.snapshotEnd,minMag:2,maxDepth:REGIONS[region].depth,unknown:true,kma:true,usgs:true,...shared};scale=shared.scale??REGIONS[region].scale;
  if(filters.from>filters.to)filters.from=filters.to;
  app.innerHTML=`
    <header class="app-header">
      <a class="brand" href="${base}" aria-label="Korea Quake 3D 홈"><span class="brand-symbol">${icon('orbit')}</span><span>KOREA QUAKE <b>3D</b><small>한반도 진원 탐색</small></span></a>
      <div class="header-center"><span class="status-dot"></span> 과거 관측 데이터 <span class="header-separator">/</span><span id="snapshot"></span></div>
      <nav aria-label="도움말 및 공유"><button class="text-button" id="source-open">${icon('layers')}<span>데이터 안내</span></button><button class="text-button" id="share">${icon('share')}<span>공유</span></button><a class="icon-button github" href="https://github.com/m-ill/korea-quake-3d" target="_blank" rel="noopener noreferrer" aria-label="GitHub 소스 코드">${icon('github')}</a></nav>
    </header>
    <main class="workspace">
      <aside class="sidebar" id="sidebar" aria-label="탐색 조건">
        <div class="section-heading"><h2>${icon('sliders')} 탐색 조건</h2><button class="icon-button" id="reset" title="필터 초기화" aria-label="필터 초기화">${icon('reset')}</button></div>
        <div class="field-label">탐색 영역</div><div class="segmented region-switch"><button data-region="korea">한반도</button><button data-region="eastasia">동북아</button></div>
        <div class="sidebar-block"><div class="field-label">발생 기간 <span>KST</span></div><div class="date-fields"><label><span class="sr-only">시작일</span><input type="date" id="from" min="1978-01-01" max="${catalog.snapshotEnd}"></label><span>—</span><label><span class="sr-only">종료일</span><input type="date" id="to" min="1978-01-01" max="${catalog.snapshotEnd}"></label></div><div class="quick-period"><button data-years="5">최근 5년</button><button data-years="10">최근 10년</button><button data-years="all">전체 기간</button></div><p class="field-error" id="date-error" role="status"></p></div>
        <div class="sidebar-block"><label class="field-label" for="magnitude">최소 규모 <output id="mag-value"></output></label><input type="range" id="magnitude" min="0" max="7" step=".1"><div class="range-ticks"><span>M0</span><span>M3.5</span><span>M7+</span></div></div>
        <div class="sidebar-block"><label class="field-label" for="depth">최대 깊이 <output id="depth-value"></output></label><input type="range" id="depth" min="0" max="700" step="1"><div class="range-ticks"><span>지표</span><span>700 km</span></div><label class="check-row"><input type="checkbox" id="unknown"><span>깊이 미상 지진 포함</span><i class="unknown-ring"></i></label><p class="hint">깊이 미상은 지표의 빈 원으로 표시합니다.</p></div>
        <div class="sidebar-block"><div class="field-label">데이터 출처</div><label class="check-row"><input type="checkbox" id="kma"><span>기상청 <small>국내 · 미소지진 포함</small></span><span class="source-tag">KMA</span></label><label class="check-row"><input type="checkbox" id="usgs"><span>USGS <small>주변 지역 · M4.5 이상</small></span><span class="source-tag">USGS</span></label></div>
        <div class="sidebar-block"><label class="field-label" for="scale">깊이 배율 <output id="scale-value"></output></label><select id="scale" aria-label="깊이 배율"><option value="1">1× · 실제 비율</option><option value="2">2×</option><option value="4">4× · 한반도 권장</option><option value="6">6×</option><option value="10">10×</option></select><p class="hint">수평·수직 단위는 km입니다. 배율은 수직축에만 적용됩니다.</p></div>
        <div class="sidebar-bottom"><button id="export" class="export-button">${icon('download')} 필터 결과 CSV</button><p>관측된 과거 지진을 탐색합니다.<br>실시간 경보·예측 서비스가 아닙니다.</p></div>
      </aside>
      <section class="stage" aria-label="3D 지도">
        <div id="map-canvas"></div>
        <div class="stage-heading"><div class="eyebrow">BENEATH THE PENINSULA</div><h1 id="region-heading">한반도, 그 아래의 기록<span>HYPOCENTER EXPLORER</span></h1><p>지표 너머, 지진이 시작된 곳을 살펴보세요.</p></div>
        <div class="view-tools" role="group" aria-label="카메라 시점"><button data-view="oblique" class="active">3D</button><button data-view="top">위에서</button><button data-view="side">옆에서</button><span></span><button id="rotate" title="자동 회전" aria-label="자동 회전" aria-pressed="false">${icon('orbit')}</button><button id="screenshot" title="지도 이미지 저장" aria-label="지도 이미지 저장">${icon('camera')}</button></div>
        <button class="mobile-filters" id="mobile-filters">${icon('sliders')} 조건</button>
        <div class="map-badge"><span class="status-dot"></span><span id="map-badge">한반도</span><span class="badge-divider"></span><span id="scale-badge">깊이 4×</span></div>
        <div class="map-compass"><span>N</span><div>↑</div></div>
        <div class="map-bottom"><div class="map-stats"><div><strong id="stat-total">—</strong><span>표시 지진</span></div><div><strong id="stat-known">—</strong><span>깊이 확인</span></div><div><strong id="stat-max">—</strong><span>최대 규모</span></div></div><div class="legend"><div>진원 깊이 <span>km</span></div><div class="legend-items">${[[0,'0–10'],[20,'10–30'],[50,'30–70'],[100,'70–150'],[200,'150–300'],[400,'300+']].map(([d,t])=>`<span><i style="background:${depthColor(Number(d))}"></i>${t}</span>`).join('')}</div><p>점 크기 = 규모 · 빈 원 = 깊이 미상</p></div></div>
        <div class="map-guide">드래그 회전 <span>·</span> 스크롤 확대 <span>·</span> 우클릭 이동 <span>·</span> 점을 눌러 상세 보기</div><div class="map-credit">지도: Natural Earth · 지역 평면 투영</div>
        <div id="empty-state" hidden><span>${icon('search')}</span><h3>조건에 맞는 지진이 없습니다</h3><p>기간이나 규모·깊이 조건을 넓혀보세요.</p><button id="empty-reset">필터 초기화</button></div>
      </section>
      <aside class="inspector" aria-label="지진 상세 및 목록">
        <div class="section-heading"><h2>${icon('focus')} 지진 상세</h2><span class="eyebrow">EVENT</span></div><div id="event-detail"></div>
        <div class="section-heading list-heading"><h2>표시 지진 <span id="list-count"></span></h2><select id="list-sort" aria-label="지진 정렬"><option value="latest">최신순</option><option value="magnitude">규모순</option><option value="deepest">깊이순</option></select></div><label class="list-search">${icon('search')}<input type="search" id="list-search" placeholder="위치 검색" aria-label="표시 지진 위치 검색"></label><div id="event-list"></div><p id="list-note" class="hint list-note"></p>
      </aside>
      <section class="timeline" aria-label="시간 탐색">
        <div class="timeline-top"><div><span class="eyebrow">TIME EXPLORER</span><strong id="timeline-date"></strong><span class="timeline-caption">까지 누적 표시</span></div><div class="cases"><span>주요 사례</span><button data-case="gyeongju">2016 경주</button><button data-case="pohang">2017 포항</button><button data-case="tohoku">2011 동일본</button></div></div>
        <div class="timeline-track"><button id="play" class="play-button" title="월별 시간 재생" aria-label="월별 시간 재생" aria-pressed="false">${icon('play')}</button><div class="timeline-chart"><div id="histogram" aria-hidden="true"></div><input type="range" id="timeline-slider" min="0" max="100" value="100" aria-label="누적 표시 종료 날짜"><div class="year-labels" id="year-labels"></div></div><button id="timeline-end" class="timeline-end" title="선택 기간 끝으로">전체 보기 ${icon('chevron')}</button></div>
      </section>
    </main>
    <dialog id="sources-dialog"><div class="dialog-heading"><div><span class="eyebrow">DATA & METHOD</span><h2>관측 기록에서, 입체 지도로</h2></div><button class="icon-button" id="source-close" aria-label="안내 닫기">${icon('close')}</button></div><p>과거 지진을 위도·경도·깊이에 따라 배치했습니다. 지표 아래의 점은 진원이며, 지표면의 지도는 위치를 이해하기 위한 기준입니다.</p><div id="source-content"></div><div class="method-note"><h3>표시 방법</h3><p>색상은 깊이, 점 크기는 규모를 나타냅니다. 점 크기는 실제 파열 범위나 에너지의 비율이 아닙니다. 깊이가 없는 사건은 회색 빈 원으로 지표에 따로 표시하며, 0 km로 추정하지 않습니다. 음수 깊이는 원본 기준면 위로 표시합니다.</p><p>수평 좌표는 영역 중심 위도의 지역 등거리 원통 근사 투영이며 단위는 km입니다. 깊이 배율 1×에서 수평·수직 단위 비율이 같습니다. 광역에서는 평면 투영 오차가 있으며 측량용 지도가 아닙니다. 지하 판·단층 모델은 포함하지 않았습니다.</p><h3>기관 간 연결과 수록 범위</h3><p id="matching-note"></p><p>두 기관은 관측망·기간·수록 규모가 다릅니다. 국가 간 점의 개수는 위험도를 직접 비교하는 지표가 아닙니다. 최대진도는 기상청 값만 표시하며 일본의 진도와 혼합하지 않습니다. 일부 사건의 기관 간 연결은 자동 추정이므로 원문으로 확인하세요.</p></div><footer>지도 <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth · public domain ↗</a><br>이 서비스는 공식 경보나 지진 예측을 제공하지 않습니다.</footer></dialog>
    <div id="toast" role="status" aria-live="polite"></div>`;
  $('#snapshot').textContent=`${catalog.snapshotEnd.replaceAll('-','.')} 기준`;
  $('#matching-note').textContent=catalog.matchingRule+` 위경도가 없는 원본 ${catalog.stats.unlocated??0}건은 데이터에 별도 보존하며 지도에서 제외합니다.`;
  $('#source-content').innerHTML=catalog.sources.map(s=>`<article class="source-card"><span class="source-tag">${esc(s.id)}</span><h3>${esc(s.name)}</h3><p>${esc(s.coverage)}</p><div>${esc(s.start)} — ${esc(s.end)} · 원본 ${fmt(s.rawCount)}건</div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">공식 데이터 확인 ↗</a></article>`).join('')+`<p class="hint">스냅샷 ${esc(catalog.snapshotEnd)} · 기관 간 연결 ${fmt(catalog.stats.linkedDuplicates)}건 · 원본 다운로드 후 Rust로 정규화<br>웹에서 실시간으로 데이터를 요청하지 않습니다.</p>`;
  try { scene=new QuakeScene($('#map-canvas'),map,selectEvent);scene.setRegion(filters.region); }
  catch(error){$('#map-canvas').innerHTML='<div class="webgl-error"><h3>3D 지도를 시작하지 못했습니다</h3><p>브라우저의 하드웨어 가속과 WebGL 지원을 확인해주세요.<br>오른쪽 지진 목록과 CSV 다운로드는 계속 사용할 수 있습니다.</p></div>';console.error(error);}
  bind();syncControls();resetTimeline();refresh();
  if(shared.event){const e=visible.find(e=>e.id===shared.event);if(e)selectEvent(e);}
}
function syncControls(){
  for(const key of ['from','to'] as const)$<HTMLInputElement>(`#${key}`).value=filters[key];
  $<HTMLInputElement>('#magnitude').value=String(filters.minMag);$<HTMLInputElement>('#depth').value=String(filters.maxDepth);
  for(const key of ['unknown','kma','usgs'] as const)$<HTMLInputElement>(`#${key}`).checked=filters[key];
  const scaleSelect=$<HTMLSelectElement>('#scale');if(![...scaleSelect.options].some(o=>Number(o.value)===scale))scaleSelect.add(new Option(`${scale}×`,String(scale)));scaleSelect.value=String(scale);
  document.querySelectorAll<HTMLButtonElement>('[data-region]').forEach(b=>{b.classList.toggle('active',b.dataset.region===filters.region);b.setAttribute('aria-pressed',String(b.dataset.region===filters.region));});
}
function resetTimeline(){
  pause();totalDays=Math.max(1,Math.round((Date.parse(filters.to)-Date.parse(filters.from))/86400_000));cursor=totalDays;
  const range=$<HTMLInputElement>('#timeline-slider');range.max=String(totalDays);range.value=String(cursor);
  $('#year-labels').innerHTML=[0,.25,.5,.75,1].map(t=>`<span>${new Date(Date.parse(filters.from)+Math.round(totalDays*t)*86400_000).toISOString().slice(0,7).replace('-','.')}</span>`).join('');
  histogram();
}
function effectiveTo(){return cursor===totalDays?filters.to:new Date(Date.parse(filters.from)+cursor*86400_000).toISOString().slice(0,10);}
function histogram(){
  const all=filterEvents(catalog.events,{...filters,to:filters.to});const counts=new Array(64).fill(0);const start=Date.parse(filters.from),span=Math.max(86400_000,(totalDays+1)*86400_000);
  for(const e of all){const date=Date.parse(`${kstDate(e.time)}T00:00:00Z`);counts[Math.min(63,Math.max(0,Math.floor((date-start)/span*64)))]++;}
  const max=Math.max(1,...counts);$('#histogram').innerHTML=counts.map((c,i)=>`<i style="height:${Math.max(3,c/max*100)}%;--i:${i}" title="${fmt(c)}건"></i>`).join('');
}
function refresh(){
  visible=filterEvents(catalog.events,{...filters,to:effectiveTo()});
  if(selected&&!visible.some(e=>e.id===selected!.id)){selected=null;renderDetail();}
  scene?.updateEvents(visible,scale);
  $('#stat-total').textContent=fmt(visible.length);$('#stat-known').textContent=fmt(visible.filter(e=>e.depth!==null).length);
  $('#stat-max').textContent=visible.length?`M${Math.max(...visible.map(e=>e.mag)).toFixed(1)}`:'—';
  $('#mag-value').textContent=`M ${filters.minMag.toFixed(1)}+`;$('#depth-value').textContent=`${filters.maxDepth} km`;
  $('#scale-value').textContent=`${scale}×`;$('#scale-badge').textContent=scale===1?'깊이 실제 비율':`깊이 ${scale}× 과장`;
  $('#map-badge').textContent=REGIONS[filters.region].name;
  $('#region-heading').innerHTML=(filters.region==='korea'?'한반도, 그 아래의 기록':'동북아, 지진의 깊이를 읽다')+'<span>HYPOCENTER EXPLORER</span>';
  $('#timeline-date').textContent=effectiveTo().replaceAll('-','.');
  $('#empty-state').hidden=visible.length>0;
  document.querySelectorAll<HTMLElement>('#histogram i').forEach((e,i)=>e.classList.toggle('future',i/64>cursor/totalDays));
  renderList();if(!selected)renderDetail();
}
function renderDetail(){
  const root=$('#event-detail');
  if(!selected){root.innerHTML=`<div class="detail-placeholder"><div class="target-illustration">${icon('focus')}</div><h3>지진 하나의 이야기를<br>자세히 살펴보세요</h3><p>지도 위 점이나 아래 목록에서<br>지진을 선택하세요.</p></div>`;return;}
  const e=selected;const color=depthColor(e.depth);const known=e.depth!==null;
  root.innerHTML=`<article class="event-card"><div class="event-card-top"><span class="source-tag">${esc(e.source)}</span><span class="event-date">${kstDate(e.time).replaceAll('-','.')} KST</span><button class="icon-button" id="deselect" title="선택 해제" aria-label="선택 해제">${icon('close')}</button></div><div class="event-magnitude" style="color:${color}"><span>M</span>${e.mag.toFixed(1)}<small>${esc(e.magType)}</small></div><h3>${esc(e.place)}</h3><p class="event-time">${timeLabel(e.time)} KST</p><div class="event-metrics"><div><span>진원 깊이</span><strong>${known?`${e.depth!.toFixed(1)} <small>km</small>`:'미상'}</strong></div><div><span>최대진도 · 기상청</span><strong>${esc(e.intensity??'—')}</strong></div></div><div class="coordinates"><span>${e.lat.toFixed(3)}° N</span><span>${e.lon.toFixed(3)}° E</span></div>${!known?'<p class="unknown-note">깊이 자료가 없어 지표의 빈 원으로 표시합니다.</p>':''}${e.alternate?.length?`<details class="alternate"><summary>다른 기관의 연결 기록 (${e.alternate.length})</summary>${e.alternate.map(a=>`<p>${esc(a.source)} ${esc(a.magType)} ${a.mag.toFixed(1)} · 깊이 ${a.depth===null?'미상':a.depth+' km'}<br><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">원본 확인 ↗</a></p>`).join('')}<p>기관별 추정치이며 현재 표시값을 대체하지 않습니다.</p></details>`:''}<div class="event-actions"><button id="focus-event">${icon('focus')} 확대</button><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">출처 확인 ↗</a></div></article>`;
  $('#deselect').onclick=()=>{selected=null;scene?.select(null);renderDetail();renderList();};$('#focus-event').onclick=()=>scene?.focus(e);
}
function selectEvent(e:Quake){selected=e;scene?.select(e);renderDetail();renderList();if(innerWidth<1000)$('#event-detail').scrollIntoView({behavior:'smooth',block:'center'});}
function renderList(){
  const all=visible.filter(e=>e.place.toLowerCase().includes(listQuery.toLowerCase())).sort((a,b)=>listSort==='latest'?b.time.localeCompare(a.time):listSort==='deepest'?(b.depth??-Infinity)-(a.depth??-Infinity):b.mag-a.mag||b.time.localeCompare(a.time));
  const list=all.slice(0,40);$('#list-count').textContent=fmt(visible.length);
  $('#event-list').innerHTML=list.map(e=>`<button class="event-row ${selected?.id===e.id?'selected':''}" data-event="${esc(e.id)}"><span class="magnitude-pill" style="--event-color:${depthColor(e.depth)}">${e.mag.toFixed(1)}</span><span class="event-row-body"><strong>${esc(e.place)}</strong><small>${kstDate(e.time).replaceAll('-','.')} <span>·</span> ${e.depth===null?'깊이 미상':`${e.depth.toFixed(0)} km`} <span>·</span> ${e.source}</small></span>${icon('chevron')}</button>`).join('')||'<p class="list-empty">검색 결과가 없습니다.</p>';
  $('#list-note').textContent=all.length>40?`검색 결과 ${fmt(all.length)}건 중 상위 40건 · 전체는 CSV로 저장`:`검색 결과 ${fmt(all.length)}건`;
}
function pause(){playing=false;clearInterval(playTimer);playTimer=undefined;const b=$('#play');if(b){b.innerHTML=icon('play');b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','월별 시간 재생');}}
function toast(message:string){$('#toast').textContent=message;$('#toast').classList.add('visible');window.setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function download(content:Blob|string,name:string){const url=typeof content==='string'?content:URL.createObjectURL(content);const a=document.createElement('a');a.href=url;a.download=name;a.click();if(typeof content!=='string')setTimeout(()=>URL.revokeObjectURL(url),1000);}
function reset(){filters={region:'korea',from:'2016-01-01',to:catalog.snapshotEnd,minMag:2,maxDepth:100,unknown:true,kma:true,usgs:true};scale=4;selected=null;scene?.setRegion('korea');rotating=false;scene?.setRotate(false);$('#rotate').setAttribute('aria-pressed','false');$('#date-error').textContent='';syncControls();resetTimeline();refresh();setView('oblique');}
function setView(view:'oblique'|'top'|'side'){scene?.setView(view);document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});}
function changeRegion(region:Region){pause();filters.region=region;filters.maxDepth=REGIONS[region].depth;scale=REGIONS[region].scale;scene?.setRegion(region);syncControls();histogram();refresh();setView('oblique');}
function bind(){
  document.querySelectorAll<HTMLButtonElement>('[data-region]').forEach(b=>b.onclick=()=>changeRegion(b.dataset.region as Region));
  for(const key of ['from','to'] as const)$(`#${key}`).addEventListener('change',()=>{
    const from=$<HTMLInputElement>('#from').value,to=$<HTMLInputElement>('#to').value;
    if(!validDate(from)||!validDate(to)||from>to||from<'1978-01-01'||to>catalog.snapshotEnd){$('#date-error').textContent=`1978-01-01부터 ${catalog.snapshotEnd} 사이의 올바른 기간을 선택하세요.`;return;}
    $('#date-error').textContent='';filters.from=from;filters.to=to;resetTimeline();refresh();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-years]').forEach(b=>b.onclick=()=>{filters.to=catalog.snapshotEnd;const year=Number(catalog.snapshotEnd.slice(0,4));filters.from=b.dataset.years==='all'?'1978-01-01':`${year-Number(b.dataset.years)+1}-01-01`;$('#date-error').textContent='';syncControls();resetTimeline();refresh();});
  $<HTMLInputElement>('#magnitude').oninput=e=>{filters.minMag=Number((e.target as HTMLInputElement).value);histogram();refresh();};
  $<HTMLInputElement>('#depth').oninput=e=>{filters.maxDepth=Number((e.target as HTMLInputElement).value);histogram();refresh();};
  for(const key of ['unknown','kma','usgs'] as const)$<HTMLInputElement>(`#${key}`).onchange=e=>{filters[key]=(e.target as HTMLInputElement).checked;histogram();refresh();};
  $('#scale').onchange=e=>{scale=Number((e.target as HTMLSelectElement).value);refresh();};
  $('#reset').onclick=reset;$('#empty-reset').onclick=reset;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view as 'oblique'|'top'|'side'));
  $('#rotate').onclick=()=>{rotating=!rotating;scene?.setRotate(rotating);$('#rotate').setAttribute('aria-pressed',String(rotating));};
  $('#screenshot').onclick=()=>{if(scene)download(scene.screenshot(),`korea-quake-${effectiveTo()}.png`);else toast('3D 지도가 시작되지 않았습니다.');};
  $('#source-open').onclick=()=>$<HTMLDialogElement>('#sources-dialog').showModal();$('#source-close').onclick=()=>$<HTMLDialogElement>('#sources-dialog').close();
  $('#sources-dialog').onclick=e=>{if(e.target===e.currentTarget)$<HTMLDialogElement>('#sources-dialog').close();};
  $('#mobile-filters').onclick=()=>{const open=$('#sidebar').classList.toggle('mobile-open');$('#mobile-filters').setAttribute('aria-expanded',String(open));};
  $('#export').onclick=()=>{download(new Blob([csv(visible)],{type:'text/csv;charset=utf-8'}),`korea-quakes-${filters.from}-${effectiveTo()}.csv`);toast(`${fmt(visible.length)}건의 지진을 CSV로 저장했습니다.`);};
  $('#share').onclick=async()=>{const url=new URL(location.href);url.search='';for(const [k,v] of Object.entries(filters))url.searchParams.set(k,typeof v==='boolean'?(v?'1':'0'):String(v));url.searchParams.set('to',effectiveTo());url.searchParams.set('scale',String(scale));if(selected)url.searchParams.set('event',selected.id);try{await navigator.clipboard.writeText(url.toString());history.replaceState(null,'',url);toast('현재 조건과 선택 지진의 링크를 복사했습니다.');}catch{history.replaceState(null,'',url);toast('주소창의 링크를 복사해 공유하세요.');}};
  $('#event-list').onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-event]');if(!b)return;const q=visible.find(q=>q.id===b.dataset.event);if(q)selectEvent(q);};
  $('#list-sort').onchange=e=>{listSort=(e.target as HTMLSelectElement).value;renderList();};$('#list-search').oninput=e=>{listQuery=(e.target as HTMLInputElement).value.trim();renderList();};
  $('#timeline-slider').oninput=e=>{pause();cursor=Number((e.target as HTMLInputElement).value);refresh();};
  $('#timeline-end').onclick=()=>{pause();cursor=totalDays;$<HTMLInputElement>('#timeline-slider').value=String(cursor);refresh();};
  $('#play').onclick=()=>{if(playing){pause();return;}playing=true;if(cursor>=totalDays)cursor=0;$('#play').innerHTML=icon('pause');$('#play').setAttribute('aria-pressed','true');$('#play').setAttribute('aria-label','시간 재생 일시정지');
    playTimer=window.setInterval(()=>{cursor=Math.min(totalDays,cursor+30);$<HTMLInputElement>('#timeline-slider').value=String(cursor);refresh();if(cursor>=totalDays)pause();},350);};
  document.querySelectorAll<HTMLButtonElement>('[data-case]').forEach(b=>b.onclick=()=>{
    const cases={gyeongju:{from:'2016-09-12',to:'2016-12-31',region:'korea' as Region,label:'경주'},pohang:{from:'2017-11-15',to:'2017-12-31',region:'korea' as Region,label:'포항'},tohoku:{from:'2011-03-11',to:'2011-04-11',region:'eastasia' as Region,label:'동일본'}};
    const c=cases[b.dataset.case as keyof typeof cases];filters.from=c.from;filters.to=c.to;filters.minMag=0;filters.kma=true;filters.usgs=true;filters.unknown=true;selected=null;changeRegion(c.region);syncControls();resetTimeline();refresh();const q=[...visible].sort((a,b)=>b.mag-a.mag)[0];if(q)selectEvent(q);toast(`${c.label} 지진과 이후 기록을 표시합니다.`);
  });
  window.addEventListener('pagehide',()=>{pause();scene?.dispose();},{once:true});
}
boot().catch(error=>{console.error(error);app.innerHTML=`<div class="loading"><h1>데이터를 불러오지 못했습니다</h1><p>연결 상태를 확인한 뒤 다시 시도해주세요.</p><button onclick="location.reload()">다시 불러오기</button><small>${esc(error instanceof Error?error.message:error)}</small></div>`;});
