// 모든 페이지 공통: 헤더/푸터 삽입, 메가메뉴, 모바일메뉴, 로그인 상태, 공통 데이터 바인딩

// Netlify Identity 초대/비밀번호 재설정 메일 링크는 사이트 루트로 오는데,
// 그 토큰을 처리하는 위젯은 /admin/ 페이지에만 있다. 루트로 들어온 토큰을
// 감지해서 /admin/으로 그대로 넘겨준다 (관리자가 매번 URL을 직접 고치지 않도록).
if (!location.pathname.startsWith('/admin') && /recovery_token|confirmation_token|invite_token|type=recovery/.test(location.hash)) {
  location.replace('/admin/' + location.hash);
}

function applyBindings(root, data) {
  root.querySelectorAll('[data-bind]').forEach(el => {
    const path = el.getAttribute('data-bind').split('.');
    let value = data;
    for (const key of path) {
      value = value ? value[key] : undefined;
    }
    if (value !== undefined) el.textContent = value;
  });
}

// ---------- 사이트 서체(폰트) ----------
// 관리자에서 고른 서체를 사이트 전체에 적용한다. 후보는 전부 SIL Open Font License 1.1이라
// 상업적 이용이 가능하다(2026-08-10에 각 폰트의 CDN 응답과 라이선스 원문을 직접 확인).
//   - pretendard   : cdn.jsdelivr.net(CSS 헤더에 OFL 1.1 명시) — 기존 사이트 기본값
//   - noto-sans-kr : google/fonts METADATA.pb license "OFL", 고딕
//   - noto-serif-kr: google/fonts METADATA.pb license "OFL", 명조
//   - gowun-batang : google/fonts METADATA.pb license "OFL", 명조(부드러운 인상)
//   - nanum-myeongjo: google/fonts METADATA.pb license "OFL", 명조(전통적)
var JAVIS_FONTS = {
  'pretendard': {
    href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css',
    stack: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif"
  },
  'noto-sans-kr': {
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
    stack: "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif"
  },
  'noto-serif-kr': {
    href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700;900&display=swap',
    stack: "'Noto Serif KR', Georgia, serif"
  },
  'gowun-batang': {
    href: 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap',
    stack: "'Gowun Batang', Georgia, serif"
  },
  'nanum-myeongjo': {
    href: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap',
    stack: "'Nanum Myeongjo', Georgia, serif"
  }
};

// ★site.json 로드 콜백 안에서 실행되므로, 여기서 예외가 나면 뒤따르는 렌더링이 전부 멈춘다.
// 전체를 try/catch로 감싸고, 폰트 CDN이 죽어도 stack 끝의 시스템 기본 글꼴로 자연히 폴백된다
// (link 로드 실패는 예외를 던지지 않고 브라우저가 조용히 무시하며, font-family 목록의
//  다음 후보가 쓰인다).
function applySiteFont(data) {
  try {
    if (!data || !data.design) return;
    var id = data.design.font_id;
    if (!id) return;
    var font = JAVIS_FONTS[id];
    if (!font) {
      console.warn('알 수 없는 서체 id, 기본 서체 유지:', id);
      return;
    }
    if (!document.getElementById('siteFontLink')) {
      var link = document.createElement('link');
      link.id = 'siteFontLink';
      link.rel = 'stylesheet';
      link.href = font.href;
      link.onerror = function () {
        console.error('서체 CDN 로드 실패, 시스템 기본 글꼴로 표시됩니다:', font.href);
      };
      document.head.appendChild(link);
    }
    document.documentElement.style.setProperty('--font-body', font.stack);
  } catch (err) {
    console.error('applySiteFont 실패(기본 서체로 계속 진행):', err);
  }
}

// 섹션 배경사진: data-bg="section_backgrounds.about" 같은 속성이 붙은 요소에
// 관리자가 올린 사진을 배경으로 깔아준다. 사진이 비어있으면 아무것도 하지 않아서
// 원래 배경색이 그대로 유지된다.
// ★이 함수는 site.json 로드 콜백 안에서 불린다. 여기서 예외가 던져지면 같은 콜백에
// 이어 붙어있는 렌더링(예배표·유튜브·인스타·갤러리·히어로 슬라이드 등)이 전부 조용히
// 멈추기 때문에, 전체를 try/catch로 감싸고 요소별로도 개별 보호한다.
function applySectionBackgrounds(root, data) {
  try {
    if (!root || !data) return;
    root.querySelectorAll('[data-bg]').forEach(el => {
      try {
        const path = el.getAttribute('data-bg').split('.');
        let value = data;
        for (const key of path) {
          value = value ? value[key] : undefined;
        }
        if (typeof value === 'string' && value.trim() !== '') {
          el.style.backgroundImage = `url("${value}")`;
          el.classList.add('has-bg-image');
        } else {
          // 사진을 지웠을 때 원래 배경색으로 되돌린다
          el.style.backgroundImage = '';
          el.classList.remove('has-bg-image');
        }
      } catch (elErr) {
        console.error('섹션 배경 적용 실패(해당 섹션만 건너뜀):', elErr);
      }
    });
  } catch (err) {
    console.error('applySectionBackgrounds 실패(나머지 렌더링은 계속 진행):', err);
  }
}

function initMegaMenu() {
  document.querySelectorAll('.mm-item').forEach(item => {
    const trigger = item.querySelector('.mm-trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.mm-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.mm-item.open').forEach(i => i.classList.remove('open'));
  });
}

// 폴더(행사) 사진 전체보기 라이트박스 — 여러 페이지에서 공용으로 쓴다
function initPhotoLightbox() {
  const box = document.getElementById('photoLightbox');
  if (!box) return;
  const closeBtn = document.getElementById('lightboxClose');
  closeBtn.addEventListener('click', closePhotoLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) closePhotoLightbox();
  });
}

function closePhotoLightbox() {
  const box = document.getElementById('photoLightbox');
  if (box) box.hidden = true;
}

function openFolderLightbox(folderId, folderName, category) {
  const box = document.getElementById('photoLightbox');
  if (!box) return;
  document.getElementById('lightboxTitle').textContent = folderName || '';
  document.getElementById('lightboxSub').textContent = category ? `${category} · 불러오는 중...` : '불러오는 중...';
  const grid = document.getElementById('lightboxGrid');
  grid.className = 'lightbox-grid';
  grid.innerHTML = '<p class="lightbox-loading">사진을 불러오는 중입니다...</p>';
  box.hidden = false;

  fetch(`/.netlify/functions/drive-photos?folder=${encodeURIComponent(folderId)}`)
    .then(res => res.json())
    .then(data => {
      const photos = data.photos || [];
      document.getElementById('lightboxSub').textContent = category ? `${category} · 사진 ${photos.length}장` : `사진 ${photos.length}장`;
      if (photos.length === 0) {
        grid.innerHTML = '<p class="lightbox-loading">사진을 불러오지 못했습니다.</p>';
        return;
      }
      grid.innerHTML = photos.map(p =>
        `<a href="${p.link}" target="_blank" rel="noopener" title="${p.name}"><img src="${p.thumb}" alt="${p.name}" loading="lazy"></a>`
      ).join('');
    })
    .catch(() => {
      grid.innerHTML = '<p class="lightbox-loading">사진을 불러오지 못했습니다.</p>';
    });
}

// 카테고리(행사사진/청소년&청년/예배사진/교회학교) 안의 행사 폴더 목록을 최신순으로 보여준다
// 폴더 카드를 클릭하면 같은 라이트박스 안에서 openFolderLightbox로 전환되어 사진 전체를 보여준다
function openCategoryLightbox(categoryId, categoryName) {
  const box = document.getElementById('photoLightbox');
  if (!box) return;
  document.getElementById('lightboxTitle').textContent = categoryName || '';
  document.getElementById('lightboxSub').textContent = '불러오는 중...';
  const grid = document.getElementById('lightboxGrid');
  grid.className = 'lightbox-grid lightbox-grid--folders';
  grid.innerHTML = '<p class="lightbox-loading">불러오는 중입니다...</p>';
  box.hidden = false;

  fetch(`/.netlify/functions/drive-photos?category=${encodeURIComponent(categoryId)}`)
    .then(res => res.json())
    .then(data => {
      const folders = data.folders || [];
      document.getElementById('lightboxSub').textContent = `총 ${folders.length}개`;
      if (folders.length === 0) {
        grid.innerHTML = '<p class="lightbox-loading">아직 등록된 사진이 없습니다.</p>';
        return;
      }
      grid.innerHTML = folders.map((f, i) => `
        <button type="button" class="gallery-cat-card" data-cf-index="${i}">
          <div class="gallery-cat-thumb">
            <img src="${f.thumb}" alt="${f.name}" loading="lazy">
            <span class="gallery-cat-count">${f.count}장</span>
          </div>
          <div>
            <p class="gallery-cat-name">${f.name}</p>
            <p class="gallery-cat-date">${(f.date || '').slice(0, 10)}</p>
          </div>
        </button>`).join('');
      grid.querySelectorAll('[data-cf-index]').forEach(btn => {
        const folder = folders[Number(btn.dataset.cfIndex)];
        btn.addEventListener('click', () => openFolderLightbox(folder.id, folder.name, categoryName));
      });
    })
    .catch(() => {
      grid.innerHTML = '<p class="lightbox-loading">불러오지 못했습니다.</p>';
    });
}

// 목록형 페이지 공통 페이지네이션(15개 단위). 게시판/설교 목록 모두 재사용.
function renderPagination(container, totalItems, perPage, currentPage, onPageChange) {
  if (!container) return;
  const totalPages = Math.ceil(totalItems / perPage);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '<nav class="pagination" aria-label="페이지 이동">';
  html += `<button type="button" class="page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="이전 페이지">‹</button>`;
  for (let p = 1; p <= totalPages; p++) {
    html += `<button type="button" class="page-num${p === currentPage ? ' active' : ''}" data-page="${p}"${p === currentPage ? ' aria-current="page"' : ''}>${p}</button>`;
  }
  html += `<button type="button" class="page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="다음 페이지">›</button>`;
  html += '</nav>';
  container.innerHTML = html;

  container.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = Number(btn.dataset.page);
      if (p >= 1 && p <= totalPages && p !== currentPage) onPageChange(p);
    });
  });
}

function initMobileNav() {
  const navToggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');
  if (!navToggle || !nav) return;
  navToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    nav.classList.toggle('open');
  });
}

// #instagramLink는 nav_menu 동적 렌더링(applyDynamicNavMenu)이 #nav를 통째로 다시 그릴 때도
// 매번 새로 생성되는 요소라, "site.json 로드 완료"와 "nav 다시 그리기 완료" 중 어느 쪽이 먼저
// 끝나든 항상 최신 상태로 맞춰지도록 별도 함수로 뽑아 양쪽에서 호출한다(window.__siteData가
// 아직 없으면 아무 것도 하지 않고 조용히 넘어간다 — 나중에 site.json이 로드되면 그때 다시 불린다).
function applyInstagramLinkFromSiteData() {
  const igLink = document.getElementById('instagramLink');
  if (!igLink || !window.__siteData) return;
  if (window.__siteData.contact && window.__siteData.contact.instagram_url) {
    igLink.href = window.__siteData.contact.instagram_url;
    igLink.style.display = '';
  } else {
    igLink.style.display = 'none';
  }
}

function loadSiteData(callback) {
  fetch('/content/site.json')
    .then(res => res.json())
    .then(data => {
      window.__siteData = data;
      applySiteFont(data);
      applyBindings(document, data);
      applySectionBackgrounds(document, data);
      applyInstagramLinkFromSiteData();
      if (callback) callback(data);
      document.dispatchEvent(new CustomEvent('sitedata:loaded', { detail: data }));
    })
    .catch(err => console.error('site.json 로드 실패:', err));
}

function escNav(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

// ★href 스킴 검증(reviewer-codex 보안검토 REVISE 반영, 2026-08-12): 관리자만 nav_menu를 쓸 수
// 있다는 것만으로는 안전하지 않다 — 관리자 세션이 탈취되면 공격자가 href에 "javascript:..."를
// 넣을 수 있고, 이 값은 모든 방문자에게 그대로 <a href>로 렌더링돼 클릭하는 누구에게나 실행되는
// 저장형 XSS가 된다(관리자 자신만 위험한 게 아니라 전체 방문자가 위험해진다). 이 사이트 안에서
// 쓸 이유가 있는 형태(내부 경로 "/...", 외부 링크 "https://...", 이메일 "mailto:...", 전화
// "tel:...", 페이지 내 앵커 "#...")만 허용하고 그 외(javascript:, data:, vbscript:, 프로토콜
// 상대경로 "//..." 등)는 전부 막는다.
function isSafeNavHref(href) {
  return typeof href === 'string' && /^(\/(?!\/)|https:\/\/|mailto:|tel:|#)/i.test(href.trim());
}

// ★reviewer-codex 보안검토 REVISE 반영(2026-08-13): href(링크)는 방문자가 클릭해야 위험이
// 발동하지만, heroImage는 페이지 로드 즉시 클릭 없이 요청이 나가므로 "https://면 다 허용"
// 정도의 느슨한 기준을 재사용하면 안 된다는 지적. 우리 프로젝트의 nav-hero-images 버킷 공개
// URL 접두어와 정확히 일치하는 것만 허용한다 — 다른 버킷·다른 오리진의 https:// URL(예: 외부
// 이미지 호스팅, 추적 픽셀)은 전부 거부한다.
const NAV_HERO_IMAGE_URL_PREFIX =
  'https://vogslryxeicemtotleph.supabase.co/storage/v1/object/public/nav-hero-images/';
function isSafeImageUrl(url) {
  return url === null || (typeof url === 'string' && url.trim().startsWith(NAV_HERO_IMAGE_URL_PREFIX));
}

// ★2026-08-13(지역자료실 지도 링크): 지도 링크는 항상 target="_blank"로 열리는 외부
// 링크일 뿐, 이 사이트 내부 경로나 mailto:/tel:일 이유가 없다 — 그래서 isSafeNavHref
// (내부경로·mailto·tel·앵커까지 허용하는 범용 nav 검증)보다 더 좁게 https:// 스킴만
// 허용한다(오너 명시: "최소한 https://만 허용"). 저장(글쓰기 폼 제출) 시점과 렌더(카드/
// 라이트박스 표시) 시점 양쪽에서 이 함수로 검사한다 — 저장 시 통과했더라도 다른 경로로
// 데이터가 들어왔을 가능성에 대비한 이중 방어(isSafeNavHref를 isValidNavMenu 렌더링
// 검증에도 같이 쓰는 것과 동일한 원칙).
function isSafeMapUrl(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url.trim());
}

// ★2026-08-14(community_posts 다중이미지, 오너 명시): 첨부사진은 JPG·PNG만 받는다. accept
// 속성은 우회 가능한 UX 힌트일 뿐이라(sermon_images_schema.sql과 동일 원칙) 진짜 방어선은
// storage.buckets.allowed_mime_types(서버측)이지만, 사용자가 잘못된 형식을 골랐을 때
// 업로드 시도 전에 미리 걸러 알려주기 위한 클라이언트측 1차 필터. 선택된 FileList에서
// 허용 형식만 남기고, 걸러진 파일이 있으면 이름과 함께 반환해 호출부가 안내할 수 있게 한다.
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];
function filterJpgPngFiles(fileList) {
  const files = Array.from(fileList || []);
  const accepted = files.filter(f => ALLOWED_IMAGE_MIME_TYPES.includes(f.type));
  const rejected = files.filter(f => !ALLOWED_IMAGE_MIME_TYPES.includes(f.type));
  return { accepted, rejected };
}

// app_settings(key='nav_menu')에서 불러온 값이 렌더링해도 안전한 형태인지 검사한다.
// 이 검사를 통과 못하면 applyDynamicNavMenu는 아무것도 하지 않고 header.html의 하드코딩된
// 메뉴를 그대로 둔다 — "값이 없거나 파싱 실패해도 사이트가 절대 깨지면 안 된다"는 요구사항의
// 핵심 방어선이다. href 안전성(isSafeNavHref)도 여기서 함께 강제한다(reviewer-codex 지적
// 반영 — 예전엔 이 검사가 없어 악성href를 걸러내지 못했다). ★그룹 개수는 6개로 고정하지
// 않는다(오너 정정지시, 2026-08-12) — 최초에는 "그룹 6개 고정"으로 설계했으나 그룹 자체의
// 추가·삭제도 허용하는 쪽으로 방향이 바뀌어 groups.length > 0만 요구한다.
function isValidNavMenu(data) {
  return !!data && Array.isArray(data.groups) && data.groups.length > 0 &&
    data.groups.every(g => g && typeof g.label === 'string' && Array.isArray(g.items) &&
      (g.heroImage === undefined || isSafeImageUrl(g.heroImage)) &&
      g.items.every(it => it && typeof it.label === 'string' && isSafeNavHref(it.href)));
}

// 로그인 게이팅(오너 확정 2026-08-13): 메뉴 6개 그룹 중 '환영합니다'·'설교와 찬양'은 계속
// 비로그인 전체공개. 아래 3개 그룹은 통째로 비로그인 방문자에게 숨긴다(다음세대/교회소식/
// 지역자료실 — RLS로 이미 로그인전용인 테이블만 담고 있어 그룹 전체를 잠가도 안전).
// '공동체 & 양육' 그룹은 그룹 자체는 계속 보이되, 그 안의 3항목(교재/가정교회/중보기도)만
// 개별로 숨긴다 — 나머지 2항목(묵상과 삶/성경공부)은 외부 티스토리 블로그라 Supabase
// 테이블이 없어 RLS로 막을 대상 자체가 없으므로 계속 공개.
// ★이 목록은 UI 편의 힌트일 뿐이다 — 실제 방어선은 각 테이블 RLS(supabase/access_gating_schema.sql).
// 그룹/href가 여기서 빠지거나 잘못돼도 RLS가 서버측에서 최종 방어한다.
const LOGIN_GATED_GROUP_IDS = [
  '2d924573-53c3-463f-b129-2d350074c5e3', // 다음세대
  '29659d08-626c-4bbf-a043-7f1ae34b3b5b', // 교회소식
  'b254ec20-8538-4ea6-88b4-3003528a890e', // 지역자료실
];
const LOGIN_GATED_ITEM_HREFS = [
  '/pages/community-editorial.html', // 양육과 훈련 자료(교재)
  '/pages/community-home.html',      // 가정교회 및 가정 모임 자료
  '/pages/prayer-request.html',      // 중보기도요청
];

// nav_menu 데이터(그룹 배열)로 #nav 안의 메가메뉴 마크업을 header.html의 정적 버전과
// 동일한 클래스 구조(mm-item/mm-trigger/mm-chevron/mm-panel)로 다시 만든다.
// isLoggedIn이 false면 위 게이팅 목록에 해당하는 그룹/항목을 먼저 걸러낸 뒤 렌더링한다
// (필터링을 map보다 먼저 해서, 인스타그램 링크가 붙는 인덱스 i===4가 로그인 시(필터 없음,
// 원래 순서 그대로 6개)에는 여전히 '교회소식'을 정확히 가리키고, 비로그인 시(교회소식 자체가
// 걸러져 사라짐)에는 i===4가 어느 그룹에도 매칭되지 않아 인스타그램 링크도 자연히 함께 숨겨진다).
function buildNavMenuHtml(navMenu, isLoggedIn) {
  const groups = navMenu.groups
    .filter(g => isLoggedIn || !LOGIN_GATED_GROUP_IDS.includes(g.id))
    .map(g => isLoggedIn ? g : {
      ...g,
      items: (g.items || []).filter(it => !LOGIN_GATED_ITEM_HREFS.includes(it.href))
    });
  return groups.map((g, i) => {
    const itemsHtml = (g.items || [])
      .map(it => `<a href="${escNav(it.href)}">${escNav(it.label)}</a>`)
      .join('');
    // ★교회소식(고정 5번째 그룹, index 4)의 인스타그램 링크는 관리자 편집 대상이 아니다
    // (site.json의 contact.instagram_url이 채워주는 별도 동적 링크라 이 기능 범위 밖) —
    // 그룹 내용과 무관하게 그 그룹의 패널 맨 끝에 항상 고정으로 붙인다.
    const instagramHtml = i === 4
      ? '<a href="#" id="instagramLink" target="_blank" rel="noopener">공식 인스타그램 ↗</a>'
      : '';
    return `<div class="mm-item">
        <button class="mm-trigger">${escNav(g.label)}<svg class="mm-chevron" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>
        <div class="mm-panel">${itemsHtml}${instagramHtml}</div>
      </div>`;
  }).join('');
}

// app_settings(key='nav_menu')를 읽어 검증까지 마친 값을 반환한다. 실패하는 모든 경우
// (Supabase 미설정·값 없음·파싱 실패·형식 이상)에는 null을 반환한다 — 호출부(nav 렌더링·
// page-hero 이미지 적용)가 각자 "실패하면 아무것도 안 하고 기존 정적 화면을 그대로 둔다"는
// 동일한 원칙을 따르도록, 데이터를 가져오는 지점을 하나로 모았다(예전엔 nav 렌더링만 이걸
// 했는데, page-hero 이미지도 같은 nav_menu 데이터의 그룹별 heroImage를 써야 해서 공용화했다).
function fetchValidNavMenu() {
  const sb = getSupabaseClient();
  if (!sb) return Promise.resolve(null);
  return sb.from('app_settings').select('value').eq('key', 'nav_menu').maybeSingle()
    .then(({ data, error }) => {
      if (error || !data || !data.value) return null;
      let parsed;
      try {
        parsed = JSON.parse(data.value);
      } catch {
        return null;
      }
      return isValidNavMenu(parsed) ? parsed : null;
    })
    .catch(() => null);
}

// 관리자가 pages/admin-nav-menu.html에서 저장한 메뉴가 있으면 header.html의 하드코딩된
// 메뉴를 그것으로 다시 그린다(navMenu가 null이면 아무것도 안 함 — 이미 화면에 떠 있는
// 정적 메뉴가 그대로 유지되므로 이 함수가 실패해도 사이트는 절대 깨지지 않는다).
function applyDynamicNavMenu(navMenu, isLoggedIn) {
  if (!navMenu) return;
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = buildNavMenuHtml(navMenu, isLoggedIn);
  initMegaMenu(); // #nav 내용이 통째로 바뀌었으므로 새 .mm-item에 클릭 핸들러를 다시 건다
  applyInstagramLinkFromSiteData(); // site.json이 이미 로드돼 있었다면 새 인스타그램 링크에도 반영
}

// 현재 페이지(location.pathname)가 nav_menu의 어느 그룹에 속하는지 찾는다. 그룹의 items
// 안에 현재 경로와 정확히 일치하는 href가 있으면 그 그룹이다. 못 찾으면 undefined.
function findCurrentPageGroup(navMenu) {
  const path = location.pathname;
  return navMenu.groups.find(g => (g.items || []).some(it => it.href === path));
}

// 이 페이지가 속한 메뉴그룹에 대표이미지(heroImage)가 설정돼 있으면 .page-hero 배경으로
// 적용한다. ★그룹은 라벨(이름)이 아니라 id로 식별한다(오너 요구사항 — 그룹 이름을 나중에
// 바꿔도 이미지가 계속 그 그룹을 따라가야 하므로) — findCurrentPageGroup도 items의 href로만
// 매칭하지 라벨은 전혀 보지 않는다. 이미지가 없거나(null) navMenu 자체가 없으면(폴백 상태)
// 아무것도 하지 않아 기존 navy 그라데이션이 그대로 유지된다. .style.backgroundImage는
// innerHTML이 아니라 CSSOM 프로퍼티 대입이라 HTML/스크립트 삽입 위험이 없다 — 다만 URL
// 자체는 isValidNavMenu(isSafeImageUrl)에서 이미 nav-hero-images 버킷 공개 URL 접두어와
// 정확히 일치하는 값만 통과하도록 검증됐다.
function applyPageHeroImage(navMenu) {
  if (!navMenu) return;
  const hero = document.querySelector('.page-hero');
  if (!hero) return;
  const group = findCurrentPageGroup(navMenu);
  if (!group || !group.heroImage) return;
  // JSON.stringify로 따옴표를 안전하게 이스케이프한다(URL에 " 문자가 섞여있어도 CSS url()
  // 값이 깨지지 않도록 — 실제로는 Supabase getPublicUrl 결과에 " 가 나올 일이 없지만 방어적으로).
  hero.style.backgroundImage = `url(${JSON.stringify(group.heroImage)})`;
  hero.classList.add('has-hero-image');
}

// 메뉴 게이팅(buildNavMenuHtml/applyDynamicNavMenu)만을 위한 가벼운 로그인 여부 확인.
// renderMemberAuthArea가 쓰는 getCurrentProfile()은 profiles 테이블까지 다시 조회해서
// 로그인 영역(이름·관리자 메뉴)을 그리는 무거운 호출이라, 메뉴 렌더링은 세션 유무만 보는
// getSession()으로 분리해 왕복을 하나 줄인다. Supabase 미설정·오류 시에는 false(비로그인
// 취급)로 안전하게 폴백 — 실제 접근 차단은 어차피 RLS가 서버측에서 하므로, 메뉴가 잘못
// false로 떨어져도 "보여야 할 메뉴가 안 보이는" 정도의 UX 저하일 뿐 보안 구멍은 아니다.
function isMemberLoggedIn() {
  const sb = getSupabaseClient();
  if (!sb) return Promise.resolve(false);
  return sb.auth.getSession()
    .then(({ data }) => !!(data && data.session))
    .catch(() => false);
}

function injectPartials(callback) {
  const headerHost = document.getElementById('headerHost');
  const footerHost = document.getElementById('footerHost');
  Promise.all([
    fetch('/partials/header.html').then(r => r.text()),
    fetch('/partials/footer.html').then(r => r.text())
  ]).then(([headerHtml, footerHtml]) => {
    if (headerHost) headerHost.innerHTML = headerHtml;
    if (footerHost) footerHost.innerHTML = footerHtml;
    initMegaMenu();
    initMobileNav();
    initPhotoLightbox();
    Promise.all([fetchValidNavMenu(), isMemberLoggedIn()]).then(([navMenu, isLoggedIn]) => {
      applyDynamicNavMenu(navMenu, isLoggedIn);
      applyPageHeroImage(navMenu);
    });
    if (window.renderMemberAuthArea) renderMemberAuthArea();
    if (callback) callback();
  });
}

// 스크롤 중 계속 따라다니다가 눌리면 맨 위로 부드럽게 이동하는 버튼 (전 페이지 공통)
function initScrollTopButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'scroll-top-btn';
  btn.setAttribute('aria-label', '맨 위로');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
    <span>맨위로</span>`;
  document.body.appendChild(btn);

  // 모바일 브라우저는 주소창 높이만큼 layout viewport(window.innerHeight)가
  // 실제 보이는 visual viewport보다 커서, 단순 bottom:16px만 쓰면 버튼이
  // 화면 아래로 밀려 잘리거나 눌리지 않는 경우가 있다. visualViewport 기준으로
  // 여백을 보정해 항상 실제 보이는 영역 안에 뜨게 한다.
  function repositionForViewport() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const hiddenBelow = window.innerHeight - (vv.height + vv.offsetTop);
    btn.style.bottom = `calc(16px + ${Math.max(0, hiddenBelow)}px)`;
  }
  repositionForViewport();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', repositionForViewport);
    window.visualViewport.addEventListener('scroll', repositionForViewport);
  }

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
    repositionForViewport();
  });
  window.addEventListener('resize', repositionForViewport);

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectPartials(() => {
    loadSiteData();
  });
  initScrollTopButton();
});
