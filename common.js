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
      g.items.every(it => it && typeof it.label === 'string' && isSafeNavHref(it.href)));
}

// nav_menu 데이터(그룹 배열)로 #nav 안의 메가메뉴 마크업을 header.html의 정적 버전과
// 동일한 클래스 구조(mm-item/mm-trigger/mm-chevron/mm-panel)로 다시 만든다.
function buildNavMenuHtml(navMenu) {
  return navMenu.groups.map((g, i) => {
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

// 관리자가 pages/admin-nav-menu.html에서 저장한 메뉴가 있으면 header.html의 하드코딩된
// 메뉴를 그것으로 다시 그린다. 실패하는 모든 경우(Supabase 미설정·값 없음·파싱 실패·형식
// 이상)에는 조용히 아무것도 하지 않는다 — 이미 화면에 떠 있는 정적 메뉴가 그대로 유지되므로
// 이 함수가 실패해도 사이트는 절대 깨지지 않는다. loadSiteData와 병렬로 실행되며 다른
// 렌더링을 기다리게 하지 않는다(await하지 않음).
function applyDynamicNavMenu() {
  const sb = getSupabaseClient();
  if (!sb) return;
  sb.from('app_settings').select('value').eq('key', 'nav_menu').maybeSingle()
    .then(({ data, error }) => {
      if (error || !data || !data.value) return;
      let parsed;
      try {
        parsed = JSON.parse(data.value);
      } catch {
        return;
      }
      if (!isValidNavMenu(parsed)) return;
      const nav = document.getElementById('nav');
      if (!nav) return;
      nav.innerHTML = buildNavMenuHtml(parsed);
      initMegaMenu(); // #nav 내용이 통째로 바뀌었으므로 새 .mm-item에 클릭 핸들러를 다시 건다
      applyInstagramLinkFromSiteData(); // site.json이 이미 로드돼 있었다면 새 인스타그램 링크에도 반영
    })
    .catch(() => {});
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
    applyDynamicNavMenu();
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
