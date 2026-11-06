import { icon } from './icons';
import type { Catalog } from './model';
export const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const fmt=(n:number)=>n.toLocaleString('ko-KR');
const tool=(id:string,shape:string,name:string)=>`<button class="tool" id="${id}" aria-label="${name}" title="${name}">${icon(shape)}<span>${name}</span></button>`;
const dialog=(id:string,title:string,body:string,cls='')=>`<dialog id="${id}" class="sheet ${cls}" aria-labelledby="${id}-title"><header class="sheet-header"><h2 id="${id}-title">${title}</h2><button class="done-button" data-close="${id}">완료</button></header>${body}</dialog>`;
export function layout(catalog:Catalog) {
  const end=catalog.snapshotEnd;
  return `
  <header class="app-header">
    <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="진원 지도 홈"><img src="${import.meta.env.BASE_URL}mascot/brand.png" alt="" width="40" height="40"><span>진원 지도<small>Korea Quake 3D</small></span></a>
    <nav class="header-tools" aria-label="탐색 도구">
      ${tool('period-open','calendar','기간')}${tool('display-open','sliders','표시')}${tool('list-open','list','목록')}${tool('broadcast-open','screen','방송')}
      <button class="tool icon-only" id="theme-toggle" aria-label="다크 모드" aria-pressed="false" title="다크 모드">${icon('moon')}</button>
      <button class="tool icon-only" id="more-open" aria-label="더 보기" title="더 보기">${icon('more')}</button>
    </nav>
  </header>
  <main class="workspace">
    <header class="broadcast-header"><div><p class="broadcast-kicker">과거 지진 관측 자료 · KST</p><h1 id="broadcast-heading"></h1></div><div class="broadcast-brand"><img src="${import.meta.env.BASE_URL}mascot/brand.png" alt="" width="48" height="48"><span>진원 지도<small>Korea Quake 3D</small></span></div></header>
    <section class="overview" aria-label="현재 탐색 영역">
      <div class="region-switch segmented" role="group" aria-label="탐색 영역"><button data-region="korea" aria-pressed="true">한반도</button><button data-region="eastasia" aria-pressed="false">동북아</button></div>
      <h1 id="region-heading">한반도</h1>
      <button id="period-summary" class="period-summary" aria-label="현재 기간, 기간 설정 열기"><span id="period-label"></span>${icon('down')}</button>
    </section>
    <section class="stage" aria-label="3D 진원 지도">
      <div id="map-canvas"></div>
      <div class="map-compass" aria-hidden="true"><span>N</span><div>↑</div></div>
      <div id="empty-state" hidden><h2>표시할 지진이 없어요</h2><p>기간이나 표시 조건을 조금 넓혀보세요.</p><button id="empty-reset">조건 초기화</button></div>
    </section>
    <aside class="broadcast-summary" id="broadcast-summary" aria-label="방송용 핵심 정보"></aside>
    <footer class="broadcast-footer"><div><p id="broadcast-period"></p><div class="broadcast-footnotes"><span id="broadcast-scale"></span><span id="broadcast-motion-status"></span><span>점 크기: 규모 · 빈 원: 깊이 미상</span></div><div id="broadcast-legend" hidden></div></div><div class="broadcast-source"><p>자료: 기상청 · USGS</p><span id="broadcast-snapshot"></span><small class="broadcast-copyright">© 단국대학교 건축공학과</small></div><button class="broadcast-mobile-exit" id="broadcast-exit">일반 화면으로</button></footer>
    <div class="map-toolbar">
      <div class="segmented view-tools" role="group" aria-label="카메라 시점"><button data-view="oblique" aria-pressed="true">3D</button><button data-view="top" aria-pressed="false">위에서</button><button data-view="side" aria-pressed="false">옆에서</button></div>
      <div class="view-actions"><span id="scale-badge" class="quiet-label"></span><button id="rotate" class="tool icon-only" title="자동 회전" aria-label="자동 회전" aria-pressed="false">${icon('orbit')}</button><button id="view-reset" class="tool icon-only" title="시점 초기화" aria-label="시점 초기화">${icon('reset')}</button></div>
    </div>
    <section class="reading" aria-label="현재 탐색 결과">
      <div class="current-reading" id="current-reading"></div>
      <div class="mascot-status" id="mascot-status"><div class="bear-frame" aria-hidden="true"></div><p id="bear-message" role="status" aria-live="polite"></p></div>
    </section>
    <section class="timeline" aria-label="시간 탐색">
      <div class="timeline-top"><span>시간 탐색</span><div><strong id="timeline-date"></strong><span>까지</span><button id="timeline-end" class="quiet-button" title="선택 기간 끝으로">전체 보기</button></div></div>
      <div class="timeline-track"><button id="play" class="tool play-button" aria-label="시간 재생" title="30일 간격으로 재생" aria-pressed="false">${icon('play')}</button><div class="timeline-chart"><div id="histogram" aria-hidden="true"></div><input type="range" id="timeline-slider" min="0" max="100" value="100" aria-label="누적 표시 종료 날짜"><div id="year-labels" class="year-labels"></div></div></div>
    </section>
    <footer class="app-footer"><span class="app-copyright">© 단국대학교 건축공학과</span><span id="snapshot"></span><span class="footer-method">과거 관측 자료</span><button id="source-open">데이터 안내</button><a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer" class="map-credit">지도 · Natural Earth</a></footer>
  </main>
  ${dialog('period-dialog','발생 기간',`
    <p class="sheet-intro">어느 시기의 지진을 살펴볼까요?</p>
    <div class="date-fields"><label for="from">시작일<input type="date" id="from" min="1978-01-01" max="${end}"></label><label for="to">종료일<input type="date" id="to" min="1978-01-01" max="${end}"></label></div>
    <p class="field-error" id="date-error" role="alert"></p>
    <div class="quick-period" role="group" aria-label="기간 바로 선택"><button data-years="5">최근 5년</button><button data-years="10">최근 10년</button><button data-years="all">전체 기간</button></div>
    <section class="sheet-section"><h3>주요 지진부터 살펴보기</h3><div class="case-list"><button data-case="gyeongju"><span>경주<small>2016.09.12 이후</small></span><strong>M 5.8</strong>${icon('chevron')}</button><button data-case="pohang"><span>포항<small>2017.11.15 이후</small></span><strong>M 5.4</strong>${icon('chevron')}</button><button data-case="tohoku"><span>동일본<small>2011.03.11 이후</small></span><strong>M 9.1</strong>${icon('chevron')}</button></div></section>
    <p class="hint">날짜와 시각은 한국 표준시(KST)입니다.</p>`)}
  ${dialog('display-dialog','표시 조건',`
    <section class="measure-setting"><label for="magnitude">최소 규모</label><div class="setting-value"><span>M</span><output id="mag-value">2.0</output><small>이상</small></div><input type="range" id="magnitude" min="0" max="7" step=".1"><div class="range-ticks"><span>0 · 미소지진 포함</span><span>7</span></div></section>
    <section class="measure-setting"><label for="depth">최대 깊이</label><div class="setting-value"><output id="depth-value">100</output><small>km</small></div><input type="range" id="depth" min="0" max="700" step="1"><div class="range-ticks"><span>지표</span><span>700 km</span></div></section>
    <div class="setting-row"><label for="scale">깊이 배율</label><select id="scale"><option value="1">1× · 실제 비율</option><option value="2">2×</option><option value="4">4×</option><option value="6">6×</option><option value="10">10×</option></select></div>
    <p class="hint">배율은 수직축에만 적용됩니다. 수평·수직 단위는 km입니다.</p>
    <label class="check-row"><span>깊이 미상 지진<small>지표의 빈 원으로 따로 표시</small></span><input type="checkbox" id="unknown"></label>
    <label class="check-row"><span>깊이를 색상으로 구분<small>진원 깊이별 색상과 범례 표시 · 기본 켜짐</small></span><input type="checkbox" id="depth-colors"></label>
    <div id="depth-legend" class="depth-legend" hidden></div>
    <section class="sheet-section"><h3>포함할 자료</h3><label class="check-row"><span>기상청<small>국내 공개 목록 · 미소지진 포함</small></span><input type="checkbox" id="kma"></label><label class="check-row"><span>USGS<small>주변 지역 · M4.5 이상</small></span><input type="checkbox" id="usgs"></label></section>
    <button id="reset" class="quiet-button reset-filters">표시 조건과 기간 초기화</button>`)}
  ${dialog('catalog-dialog','지진 목록',`
    <div class="list-top"><span id="list-count"></span><select id="list-sort" aria-label="지진 정렬"><option value="latest">최신순</option><option value="magnitude">규모순</option><option value="deepest">깊이순</option></select></div>
    <label class="list-search">${icon('search')}<input type="search" id="list-search" placeholder="위치로 찾기" aria-label="표시 지진 위치 검색"></label>
    <div id="event-list"></div><button id="list-more" class="load-more">더 보기</button><p id="list-note" class="hint"></p>`,'list-sheet')}
  ${dialog('detail-dialog','선택한 지진','<div id="event-detail"></div>')}
  ${dialog('more-dialog','도구',`
    <div class="action-list"><button id="more-broadcast">${icon('screen')}방송 화면${icon('chevron')}</button><button id="share">${icon('share')}현재 화면 공유${icon('chevron')}</button><button id="export">${icon('download')}표시 지진 CSV 저장${icon('chevron')}</button><button id="screenshot">${icon('camera')}지도 이미지 저장${icon('chevron')}</button><button id="more-source">${icon('info')}데이터와 조작 안내${icon('chevron')}</button><a href="https://github.com/m-ill/korea-quake-3d" target="_blank" rel="noopener noreferrer">${icon('list')}GitHub 소스 코드${icon('chevron')}</a></div>`)}
  ${dialog('broadcast-dialog','방송 화면',`
    <p class="sheet-intro">밝은 배경에 지도와 핵심 정보만 표시합니다. 현재 기간·표시 조건·선택한 지진을 그대로 사용합니다.</p>
    <label class="broadcast-title-field" for="broadcast-title">화면 제목<input id="broadcast-title" type="text" maxlength="60" placeholder="영역에 맞는 제목을 자동으로 표시"></label>
    <div class="setting-row"><label for="broadcast-view">시작 시점</label><select id="broadcast-view"><option value="oblique">3D · 기울여 보기</option><option value="top">위에서 보기</option><option value="side">옆에서 보기</option></select></div>
    <div class="setting-row"><label for="broadcast-motion">자동 연출</label><select id="broadcast-motion"><option value="still">고정 화면</option><option value="orbit">계속 회전</option><option value="tour">장면 순환</option></select></div>
    <p class="hint">장면 순환: 전체 → 깊이 → 주요 지진 확대 → 위에서 보기. 선택한 지진을 강조하고, 선택이 없으면 현재 조건의 최대 규모 지진을 사용합니다.</p>
    <div class="setting-row"><label for="broadcast-interval">장면 간격</label><select id="broadcast-interval"><option value="12">12초 · 빠르게</option><option value="20">20초 · 기본</option><option value="30">30초 · 여유롭게</option></select></div>
    <div class="setting-row"><label for="broadcast-speed">회전 속도</label><select id="broadcast-speed"><option value="0.4">느리게</option><option value="0.8">보통</option><option value="1.6">빠르게</option></select></div>
    <p class="hint">드래그·휠·방향키 조작 시 자동 연출이 멈춥니다. 방송 화면에서 Space로 일시정지·재개합니다. 동작 줄이기 설정에서는 고정 화면으로 표시합니다.</p>
    <div class="broadcast-setup-actions"><button class="primary-button" id="broadcast-preview">미리보기</button><a id="broadcast-new" class="text-link" target="_blank" rel="noopener noreferrer">새 창에서 열기 ↗</a></div>
    <section class="sheet-section"><h3>OBS 브라우저 소스에 사용</h3><p>아래 주소를 브라우저 소스 URL에 넣고 너비 1920, 높이 1080으로 설정하세요. 조작 도구와 알림은 방송 화면에 표시되지 않습니다.</p><label class="sr-only" for="broadcast-url">방송용 주소</label><textarea id="broadcast-url" readonly rows="3"></textarea><button id="broadcast-copy" class="quiet-button">방송용 주소 복사</button><p class="hint">방송 화면에서도 드래그·휠과 점 선택을 사용할 수 있습니다. B 또는 Esc 키로 일반 화면으로 돌아옵니다. 과거 자료의 기간과 기준일은 화면에 항상 표시합니다.</p></section>`)}
  ${dialog('sources-dialog','데이터와 조작 안내',`
    <section class="sheet-section first-section"><h3>지도를 움직이는 방법</h3><p>드래그로 회전하고, 스크롤·핀치로 확대합니다. 우클릭 드래그·두 손가락으로 이동합니다. 지도에 포커스를 두면 방향키로 회전하고 + / −로 확대할 수 있습니다.</p><p>점을 누르면 진원이 선택됩니다. 아래의 선택한 지진을 누르면 상세 정보가 열립니다. 시간축은 시작일부터 커서 날짜까지의 지진을 누적 표시합니다.</p></section>
    <div id="source-content"></div>
    <section class="sheet-section"><h3>표시를 읽는 방법</h3><p>점 크기는 규모의 시각적 척도이며 파열 범위나 에너지의 실제 비율이 아닙니다. 지표의 빈 원은 깊이 미상으로, 0 km 지진과 구분합니다. 음수 깊이는 원본 기준면 위로 표시합니다. 깊이 색상은 표시 창에서 켤 수 있습니다.</p><p>수평 좌표는 영역 중심 위도의 지역 등거리 원통 근사 투영이며 km 단위입니다. 깊이 배율 1×에서 수평·수직 단위 비율이 같습니다. 광역 투영 오차가 있으며 측량용 지도가 아닙니다. 지하 판·단층 모델은 포함하지 않았습니다.</p></section>
    <section class="sheet-section"><h3>자료의 범위</h3><p id="matching-note"></p><p>관측망·기간·수록 규모가 다른 두 기관을 함께 표시하므로 국가 간 점의 개수로 위험도를 비교할 수 없습니다. 최대진도는 기상청 값만 표시하며 일본의 진도와 혼합하지 않습니다. 자동으로 연결한 사건은 원문으로 확인하세요.</p><p>이 지도는 과거 관측 자료를 탐색합니다. 실시간 경보·예측 서비스가 아닙니다.</p></section>
    <p class="hint"><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">지도 · Natural Earth · public domain ↗</a></p>`)}
  <div id="toast" role="status" aria-live="polite"></div>`;
}
