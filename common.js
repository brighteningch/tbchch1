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

function loadSiteData(callback) {
  fetch('/content/site.json')
    .then(res => res.json())
    .then(data => {
      window.__siteData = data;
      applyBindings(document, data);
      if (data.contact && data.contact.instagram_url) {
        const igLink = document.getElementById('instagramLink');
        if (igLink) { igLink.href = data.contact.instagram_url; igLink.style.display = ''; }
      } else {
        const igLink = document.getElementById('instagramLink');
        if (igLink) igLink.style.display = 'none';
      }
      if (callback) callback(data);
      document.dispatchEvent(new CustomEvent('sitedata:loaded', { detail: data }));
    })
    .catch(err => console.error('site.json 로드 실패:', err));

  fetch('/content/notices.json')
    .then(res => res.json())
    .then(data => {
      window.__noticesData = data.notices;
      document.dispatchEvent(new CustomEvent('noticesdata:loaded', { detail: data.notices }));
    })
    .catch(err => console.error('notices.json 로드 실패:', err));

  fetch('/content/bulletins.json')
    .then(res => res.json())
    .then(data => {
      window.__bulletinsData = data.bulletins;
      document.dispatchEvent(new CustomEvent('bulletinsdata:loaded', { detail: data.bulletins }));
    })
    .catch(err => console.error('bulletins.json 로드 실패:', err));
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
    if (window.renderMemberAuthArea) renderMemberAuthArea();
    if (callback) callback();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectPartials(() => {
    loadSiteData();
  });
});
