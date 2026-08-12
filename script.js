// applyBindings()는 common.js에 정의되어 있다 (헤더/푸터 포함 전체 페이지 공통)

function formatDate(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// 홈페이지 갤러리 미리보기: 자체 저장된 앨범 중 최신 3개만 보여주고, 전체는 /pages/news-gallery.html 에서 본다
function loadGallery(previewId) {
  const wrap = document.getElementById(previewId);
  const emptyEl = document.getElementById('gallery-preview-empty');
  if (!wrap) return;

  fetchGalleryAlbums()
    .then(albums => {
      const preview = albums.slice(0, 3);
      if (preview.length === 0) {
        wrap.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      wrap.innerHTML = preview.map(a => `
        <a class="gallery-album-card" href="/pages/news-gallery.html">
          <div class="gallery-album-thumb">
            ${a.cover_image_url
              ? `<img src="${a.cover_image_url}" alt="${a.title}" loading="lazy">`
              : `<div class="gallery-cat-thumb-empty">사진 없음</div>`}
          </div>
          <p class="gallery-album-title">${a.title}</p>
          <p class="gallery-album-date">${(a.album_date || '').replace(/-/g, '.')}</p>
        </a>`).join('');
    })
    .catch(() => {
      wrap.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
    });
}

fetch('/content/site.json')
  .then(res => res.json())
  .then(data => {
    applyBindings(document, data);

    // 예배안내: 주일예배→교회학교→주중예배 순서로 표 하나에 병합, 카테고리는 rowspan으로 묶어 표시(한 줄 표)
    const WORSHIP_GROUPS = [
      { key: '주일예배', cls: 'wg-sunday' },
      { key: '교회학교', cls: 'wg-kids' },
      { key: '주중예배', cls: 'wg-week' },
    ];
    const groups = WORSHIP_GROUPS
      .map(g => ({ ...g, items: data.worship.filter(w => w.category === g.key) }))
      .filter(g => g.items.length > 0);
    const bodyRows = groups.map(g => g.items.map((w, i) => {
      const timeLabel = (g.key === '주일예배' || g.key === '교회학교') ? `주일 ${w.time}` : w.time;
      return `
        <tr>
          ${i === 0 ? `<td class="worship-cat ${g.cls}" rowspan="${g.items.length}">${g.key.slice(0, 2)}<br>${g.key.slice(2)}</td>` : ''}
          <td>${w.name}</td><td>${timeLabel}</td><td>${w.location || '본당'}</td>
        </tr>`;
    }).join('')).join('');
    document.getElementById('worship-groups').innerHTML = `
      <div class="worship-table-wrap">
        <table class="worship-table worship-unified">
          <thead><tr><th></th><th>예배</th><th>시간</th><th>장소</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;

    // 헌금안내(계좌 목록)는 홈페이지에서 제거됨 — /pages/online-offering.html 에서 렌더링(2026-08-10)

    // 빠른링크 예배시간 요약(1부/2부만)
    const w1 = data.worship[0], w2 = data.worship[1];
    if (w1 && w2) {
      document.getElementById('qcard-worship').textContent =
        `${w1.name.replace('주일예배 ', '')} ${w1.time} · ${w2.name.replace('주일예배 ', '')} ${w2.time}`;
    }

    // 빠른링크: 유튜브 · 인스타그램
    document.getElementById('qcardYoutube').href = data.sermon.youtube_channel_url;
    const igCard = document.getElementById('qcardInstagram');
    if (data.contact && data.contact.instagram_url) {
      igCard.href = data.contact.instagram_url;
    } else {
      igCard.style.display = 'none';
    }

    // 갤러리: 카테고리 4개 요약
    loadGallery('gallery-album-preview');

    // 메인 배경 사진 슬라이드 (15초마다 자동 전환)
    initHeroSlides(data.hero.images);
  })
  .catch(err => console.error('site.json 로드 실패:', err));

// 빛나는 매거진 홈페이지 미리보기: site.json이 아니라 Supabase(magazine_posts)에서 직접
// 조회하는 완전히 별도의 비동기 흐름이다 — 위 site.json .then() 체인과 절대 섞지 않는다
// (project_brighteningch-scriptjs-monolithic-then-chain 교훈: 하나의 순차 체인 안에 넣으면
// 이 조회가 실패했을 때 체인 뒤쪽 코드 전체가 멈출 위험이 있다). 실패해도 홈페이지 나머지
// 렌더링에는 전혀 영향이 없도록 이 함수 자체가 try/catch로 완전히 감싸져 있다.
function escMagazine(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

// '교회뉴스'는 오너가 이름으로 직접 지정한 고정 피처드 카테고리다(자유 카테고리 확장
// 원칙과 별개인 제품 결정) — 카테고리 목록에 아직 없어도(글이 0건이어도) 항상 큰
// 영역을 시도하고, 없으면 빈 상태 문구만 보여준다. 나머지 카테고리는 몇 개가 있든
// 전부(개수 제한 없음) 오른쪽에 최신 글 1건씩 작은 미리보기로 나열한다.
const MAGAZINE_FEATURED_CATEGORY = '교회뉴스';

function renderMagazinePostBody(post) {
  return `
    <div>
      <p class="magazine-post-title">${escMagazine(post.title)}</p>
      <p class="magazine-post-date">${(post.created_at || '').slice(0, 10)}</p>
    </div>
    <span class="magazine-post-badge">${post.file_type === 'pdf' ? 'PDF' : '사진'}</span>`;
}

function renderMagazineFeaturedCard(post) {
  if (!post) return '<p class="magazine-empty">아직 등록된 글이 없습니다.</p>';
  const thumb = post.file_type === 'image'
    ? `<div class="magazine-home-featured-thumb"><img src="${post.file_url}" alt="${escMagazine(post.title)}" loading="lazy"></div>`
    : `<div class="magazine-home-featured-thumb magazine-home-featured-thumb--pdf">📄</div>`;
  return `
    <a class="magazine-post-card magazine-post-card--featured" href="${post.file_url}" target="_blank" rel="noopener">
      ${thumb}
      ${renderMagazinePostBody(post)}
    </a>`;
}

function renderMagazineOtherItem(category, post) {
  return `
    <div class="magazine-home-other-item">
      <p class="magazine-home-other-cat">${escMagazine(category)}</p>
      <a class="magazine-post-card" href="${post.file_url}" target="_blank" rel="noopener">
        ${renderMagazinePostBody(post)}
      </a>
    </div>`;
}

async function loadMagazinePreview() {
  const featuredEl = document.getElementById('magazine-featured');
  const othersEl = document.getElementById('magazine-others');
  const section = document.getElementById('magazine');
  if (!featuredEl || !othersEl || !section) return;

  try {
    const categories = await fetchMagazineCategories();
    const otherCategories = categories.filter(c => c !== MAGAZINE_FEATURED_CATEGORY);

    const featuredPosts = await fetchMagazinePosts(MAGAZINE_FEATURED_CATEGORY);
    featuredEl.innerHTML = renderMagazineFeaturedCard(featuredPosts[0]);

    if (otherCategories.length === 0) {
      othersEl.innerHTML = '';
      return;
    }
    const otherResults = await Promise.all(
      otherCategories.map(async (category) => {
        const posts = await fetchMagazinePosts(category);
        return { category, post: posts[0] };
      })
    );
    othersEl.innerHTML = otherResults
      .filter(r => r.post)
      .map(r => renderMagazineOtherItem(r.category, r.post))
      .join('');
  } catch (err) {
    console.error('빛나는 매거진 미리보기 로딩 실패(홈페이지 다른 영역에는 영향 없음):', err);
    featuredEl.innerHTML = '<p class="magazine-empty">아직 등록된 글이 없습니다.</p>';
    othersEl.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', () => setTimeout(loadMagazinePreview, 400));

// 이미지 자체에 이미 문구가 박혀있는 슬라이드(overlay:false)는 사이트 자체 제목/성구 문구를 숨긴다
function initHeroSlides(images) {
  const wrap = document.getElementById('heroSlides');
  const inner = document.querySelector('.hero-inner');
  const tint = document.querySelector('.hero-overlay');
  if (!wrap || !images || images.length === 0) return;

  images.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'hero-slide' + (i === 0 ? ' active' : '');
    div.style.backgroundImage = `url("${item.image}")`;
    wrap.appendChild(div);
  });

  const setOverlay = (index) => {
    const hide = images[index].overlay === false;
    if (inner) inner.classList.toggle('hero-inner--hidden', hide);
    if (tint) tint.classList.toggle('hero-overlay--hidden', hide);
  };
  setOverlay(0);

  if (images.length <= 1) return;

  const slides = wrap.querySelectorAll('.hero-slide');
  let current = 0;
  let timer = null;

  function goTo(index) {
    slides[current].classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    setOverlay(current);
  }

  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 10000);
  }
  restartTimer();

  const prevBtn = document.getElementById('heroPrev');
  const nextBtn = document.getElementById('heroNext');
  if (prevBtn && nextBtn) {
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    prevBtn.addEventListener('click', () => { goTo(current - 1); restartTimer(); });
    nextBtn.addEventListener('click', () => { goTo(current + 1); restartTimer(); });
  }
}

// 홈페이지 팝업 3종(이번 주 소식/주일 말씀/잠언 묵상): 모바일에서는 하나씩 순서대로,
// 데스크톱(769px 이상)에서는 3개를 한 화면에 동시에 띄운다. 쇼츠가 항상 가장 먼저(모바일 순서상 1번째,
// 데스크톱 트레이의 맨 왼쪽) 오도록 배열 순서를 고정한다.
function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
}

const POPUP_TODAY_STR = new Date().toISOString().slice(0, 10);

// 이번 주 소식(유튜브 쇼츠 또는 광고 이미지): weekly_content(category='shorts')의 최신 항목을 준비한다.
// 등록된 게 없거나 오늘 하루 닫기 상태면 null을 반환해 팝업 자체를 건너뛴다.
async function prepareShortsPopup() {
  if (localStorage.getItem('shortsModalDismissed') === POPUP_TODAY_STR) return false;
  let items = [];
  try { items = await fetchWeeklyContent('shorts'); } catch (err) { return false; }
  const latest = items[0] && items[0].data;
  if (!latest) return false;

  const videoWrap = document.getElementById('shortsModalVideoWrap');
  const frame = document.getElementById('shortsModalFrame');
  const imageEl = document.getElementById('shortsModalImage');

  if (latest.type === 'image' && latest.imageUrl) {
    imageEl.src = latest.imageUrl;
    imageEl.hidden = false;
    videoWrap.hidden = true;
    return true;
  }
  const videoId = extractYoutubeId(latest.videoUrl);
  if (videoId) {
    // 다른 팝업과 동시에 노출되므로 자동재생시킨다(브라우저 정책상 자동재생은 음소거 필수).
    frame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
    videoWrap.hidden = false;
    imageEl.hidden = true;
    return true;
  }
  return false;
}

function prepareSundayPopup() {
  return localStorage.getItem('verseModalDismissed') !== POPUP_TODAY_STR;
}

function prepareProverbsPopup() {
  return localStorage.getItem('proverbsModalDismissed') !== POPUP_TODAY_STR;
}

const POPUP_DEFS = [
  {
    id: 'shortsModal', dismissKey: 'shortsModalDismissed',
    closeBtn: 'shortsModalClose', backdrop: 'shortsModalBackdrop', hideToday: 'shortsModalHideToday',
    prepare: prepareShortsPopup,
    cleanup: () => { document.getElementById('shortsModalFrame').src = ''; document.getElementById('shortsModalImage').src = ''; },
  },
  {
    id: 'verseModal', dismissKey: 'verseModalDismissed',
    closeBtn: 'verseModalClose', backdrop: 'verseModalBackdrop', hideToday: 'verseModalHideToday',
    prepare: prepareSundayPopup,
  },
  {
    id: 'proverbsModal', dismissKey: 'proverbsModalDismissed',
    closeBtn: 'proverbsModalClose', backdrop: 'proverbsModalBackdrop', hideToday: 'proverbsModalHideToday',
    prepare: prepareProverbsPopup,
  },
];

// 새벽기도 묵상은 이미지 업로드 대신 목사님의 티스토리 '묵상' 카테고리로 바로 연결한다
// (오너 요청, 2026-08-11 — 매일 티스토리에 올리는 묵상 글이 곧 새벽기도 묵상 자료이므로
// 별도 이미지 업로드 없이 그 글로 바로 이동시키는 게 더 실용적).
const DAWN_PRAYER_TISTORY_URL = 'https://eshallom.tistory.com/category/%EB%AC%B5%EC%83%81';

function wireContentCategoryButtons(box, onOpen) {
  box.querySelectorAll('[data-content-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      onOpen();
      if (btn.dataset.contentCategory === 'dawn-prayer') {
        window.open(DAWN_PRAYER_TISTORY_URL, '_blank', 'noopener');
        return;
      }
      openContentLightbox(btn.dataset.contentCategory);
    });
  });
}

// 모바일: 순서대로 하나씩만 띄운다(닫으면 다음 팝업).
async function runPopupsSequential(index) {
  if (index >= POPUP_DEFS.length) return;
  const def = POPUP_DEFS[index];
  const ok = await def.prepare();
  if (!ok) { runPopupsSequential(index + 1); return; }

  const modal = document.getElementById(def.id);
  modal.hidden = false;

  const close = () => {
    const hideTodayEl = document.getElementById(def.hideToday);
    if (hideTodayEl && hideTodayEl.checked) localStorage.setItem(def.dismissKey, POPUP_TODAY_STR);
    if (def.cleanup) def.cleanup();
    modal.hidden = true;
    runPopupsSequential(index + 1);
  };

  document.getElementById(def.closeBtn).addEventListener('click', close);
  document.getElementById(def.backdrop).addEventListener('click', close);
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
  });

  if (def.id === 'verseModal') {
    wireContentCategoryButtons(modal, () => { modal.hidden = true; });
  }
}

// 데스크톱(769px 이상): 준비된 팝업 박스를 전부 공유 트레이 하나로 모아 동시에 띄운다.
async function runPopupsSimultaneous() {
  const results = await Promise.all(POPUP_DEFS.map(def => def.prepare()));
  const activeDefs = POPUP_DEFS.filter((def, i) => results[i]);
  if (activeDefs.length === 0) return;

  const tray = document.getElementById('popupTray');
  const row = document.getElementById('popupTrayRow');

  function closeBoxAndMaybeHideTray(def, box) {
    const hideTodayEl = document.getElementById(def.hideToday);
    if (hideTodayEl && hideTodayEl.checked) localStorage.setItem(def.dismissKey, POPUP_TODAY_STR);
    if (def.cleanup) def.cleanup();
    box.hidden = true;
    if (![...row.children].some(c => !c.hidden)) tray.hidden = true;
  }

  activeDefs.forEach(def => {
    const modal = document.getElementById(def.id);
    const box = modal.querySelector('.verse-modal-box');
    row.appendChild(box);

    const close = () => closeBoxAndMaybeHideTray(def, box);
    document.getElementById(def.closeBtn).addEventListener('click', close);

    if (def.id === 'verseModal') {
      wireContentCategoryButtons(box, () => close());
    }
  });

  function closeAll() {
    activeDefs.forEach(def => {
      const hideTodayEl = document.getElementById(def.hideToday);
      if (hideTodayEl && hideTodayEl.checked) localStorage.setItem(def.dismissKey, POPUP_TODAY_STR);
      if (def.cleanup) def.cleanup();
    });
    row.querySelectorAll('.verse-modal-box').forEach(b => { b.hidden = true; });
    tray.hidden = true;
  }
  document.getElementById('popupTrayBackdrop').addEventListener('click', closeAll);
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') { closeAll(); document.removeEventListener('keydown', escClose); }
  });

  tray.hidden = false;
}

function initHomepagePopups() {
  if (window.matchMedia('(min-width: 769px)').matches) {
    runPopupsSimultaneous();
  } else {
    runPopupsSequential(0);
  }
}
initHomepagePopups();

// 주일 말씀 팝업 메뉴 4종(설교 인포그래픽/주간묵상집/매일성경묵상/소그룹자료) 공용:
// 관리자가 카테고리별로 업로드한 이미지를 날짜별로 보여준다(weekly_content 테이블)
const CONTENT_CATEGORY_LABELS = { infographic: '설교 인포그래픽', daily: '매일성경묵상', 'family-worship': '가정예배 순서지', 'dawn-prayer': '새벽기도 묵상' };
let __contentItemsByCategory = {};
let __currentContentCategory = 'daily';

let __currentDevotionImage = null; // { url, filename } — 다운로드 버튼이 참조

// 로컬(한국시간) 기준 오늘 날짜 문자열. toISOString()은 UTC라서 자정~9시 사이엔 전날로 나오므로 쓰지 않는다.
function todayLocalDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 매일성경묵상은 한 주치를 미리 올려두는 경우가 있어서, 아직 오지 않은 날짜의 자료는
// 목록·조회 어디서도 노출하지 않는다(업로드는 오늘 하더라도 게시는 해당 날짜부터).
function visibleContentItems(category) {
  const items = __contentItemsByCategory[category] || [];
  if (category !== 'daily') return items;
  const todayStr = todayLocalDateStr();
  return items.filter(it => (it.period || '') <= todayStr);
}

function showContentItem(index) {
  const items = visibleContentItems(__currentContentCategory);
  const item = items[index];
  if (!item) return;
  const imageUrl = (item.data && item.data.imageUrl) || '';
  const bodyText = (item.data && item.data.body) || '';
  const imageEl = document.getElementById('devotionImage');
  const textEl = document.getElementById('devotionTextBody');
  const downloadBtn = document.getElementById('devotionDownloadBtn');
  if (imageUrl) {
    imageEl.src = imageUrl;
    imageEl.hidden = false;
    textEl.hidden = true;
    downloadBtn.hidden = false;
  } else {
    imageEl.hidden = true;
    textEl.hidden = false;
    textEl.textContent = bodyText;
    downloadBtn.hidden = true;
  }
  document.getElementById('devotionDate').textContent = item.period || '';
  document.querySelectorAll('#devotionDateList button').forEach((b, i) => b.classList.toggle('is-active', i === index));
  const label = CONTENT_CATEGORY_LABELS[__currentContentCategory] || '이미지';
  const lastSegment = imageUrl.split('?')[0].split('/').pop() || '';
  const ext = lastSegment.includes('.') ? lastSegment.split('.').pop() : 'jpg';
  __currentDevotionImage = imageUrl ? { url: imageUrl, filename: `${label}_${item.period || ''}.${ext}` } : null;
}

// Supabase Storage 이미지는 다른 도메인이라 <a download>가 그냥 안 먹는다(크로스오리진).
// blob으로 직접 받아와 다운로드시키고, 그것도 안 되면 새 탭으로 열어 사용자가 저장하게 한다.
async function downloadCurrentDevotionImage() {
  if (!__currentDevotionImage) return;
  const { url, filename } = __currentDevotionImage;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    window.open(url, '_blank');
  }
}
document.getElementById('devotionDownloadBtn').addEventListener('click', downloadCurrentDevotionImage);

function renderContentDateList() {
  const items = visibleContentItems(__currentContentCategory);
  const wrap = document.getElementById('devotionDateList');
  wrap.innerHTML = items.slice(0, 14).map((item, i) =>
    `<button type="button" data-i="${i}">${(item.period || '').slice(5) || (item.title || '')}</button>`).join('');
  wrap.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => showContentItem(Number(btn.dataset.i))));
}

async function openContentLightbox(category) {
  __currentContentCategory = category;
  const lb = document.getElementById('devotionLightbox');
  const img = document.getElementById('devotionImage');
  const empty = document.getElementById('devotionEmpty');
  document.getElementById('devotionTitle').textContent = CONTENT_CATEGORY_LABELS[category] || '';
  lb.hidden = false;
  try {
    if (!__contentItemsByCategory[category]) __contentItemsByCategory[category] = await fetchWeeklyContent(category);
  } catch (err) {
    console.error(`${CONTENT_CATEGORY_LABELS[category]} 로드 실패:`, err);
    __contentItemsByCategory[category] = __contentItemsByCategory[category] || [];
  }
  const items = visibleContentItems(category);
  if (items.length === 0) {
    img.hidden = true;
    document.getElementById('devotionTextBody').hidden = true;
    document.getElementById('devotionDownloadBtn').hidden = true;
    empty.hidden = false;
    document.getElementById('devotionDate').textContent = '';
    document.getElementById('devotionDateList').innerHTML = '';
    return;
  }
  empty.hidden = true;
  renderContentDateList();
  // 오늘 날짜에 맞는 항목이 있으면 그걸 먼저 보여주고, 없으면 가장 최근(과거) 항목을 보여준다
  const todayStr = todayLocalDateStr();
  const todayIndex = items.findIndex(it => it.period === todayStr);
  showContentItem(todayIndex >= 0 ? todayIndex : 0);
}

document.getElementById('devotionLightboxClose').addEventListener('click', () => {
  document.getElementById('devotionLightbox').hidden = true;
});

// 유튜브 실시간 방송 여부 확인 (30초마다 재확인, 방송 중이면 빨간 LIVE 배지 표시)
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/channel/UCFEmEydneJGmF5DN9UYeTmA';
const YOUTUBE_DEFAULT_DESC = '주일 대예배 실시간 스트리밍 시청 및 지난 아카이브 보기.';

async function checkYoutubeLive() {
  const card = document.getElementById('qcardYoutube');
  if (!card) return;
  try {
    const res = await fetch('/.netlify/functions/youtube-live-check');
    const data = await res.json();
    const badge = card.querySelector('.qcard2-badge');
    const desc = card.querySelector('p');
    if (data.live && data.videoId) {
      badge.textContent = 'LIVE';
      badge.classList.add('qb-live');
      card.href = `https://www.youtube.com/watch?v=${data.videoId}`;
      if (desc) desc.textContent = '지금 실시간으로 예배가 진행 중입니다. 클릭해서 바로 시청하세요.';
    } else {
      badge.textContent = 'YOUTUBE';
      badge.classList.remove('qb-live');
      card.href = YOUTUBE_CHANNEL_URL;
      if (desc) desc.textContent = YOUTUBE_DEFAULT_DESC;
    }
  } catch (err) {
    console.error('유튜브 실시간 상태 확인 실패:', err);
  }
}
checkYoutubeLive();
setInterval(checkYoutubeLive, 30000);

// 말씀과 찬양 캐러셀 (주일설교 메인 + 수요설교/금요설교/수요찬양)
const SHOWCASE_LABELS = {
  'sermon-sunday': '주일설교',
  'sermon-wed': '수요설교',
  'sermon-fri': '금요설교',
  'praise-wed': '수요찬양',
  'praise-fri': '금요찬양',
  '3min': '곱씹다',
};

function showcaseEsc(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

function showcaseThumb(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

function showcaseCard(item, isMain) {
  const thumb = showcaseThumb(item.video_url);
  const label = SHOWCASE_LABELS[item.category] || '';
  const meta = [item.scripture, item.speaker, (item.date || '').slice(0, 10)].filter(Boolean).join(' · ');
  return `
    <a href="/pages/sermon-view.html?id=${encodeURIComponent(item.id)}" class="showcase-card${isMain ? ' showcase-card--main' : ''}">
      <div class="showcase-thumb"${thumb ? ` style="background-image:url('${thumb}')"` : ''}>
        <span class="showcase-play">▶</span>
      </div>
      <div class="showcase-body">
        <span class="showcase-badge">${label}</span>
        <h3>${showcaseEsc(item.title)}</h3>
        <p>${showcaseEsc(meta)}</p>
      </div>
    </a>`;
}

// 미션 스테이트먼트 영역의 곱씹다 (최신 1건 인라인 재생) — 유튜브 재생목록에서 바로 가져온다
async function loadMissionVideo() {
  const el = document.getElementById('mission-media');
  if (!el) return;
  try {
    const res = await fetch('/.netlify/functions/youtube-playlist');
    const data = await res.json();
    const latest = (data.items || [])[0];
    if (latest) {
      el.innerHTML = `<iframe src="https://www.youtube.com/embed/${latest.videoId}" title="${showcaseEsc(latest.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    } else {
      el.innerHTML = '<div class="mission-media-empty">곱씹다 영상이 곧 올라올 예정입니다.</div>';
    }
  } catch (err) {
    console.error('곱씹다 로드 실패:', err);
    el.innerHTML = '<div class="mission-media-empty">곱씹다 영상이 곧 올라올 예정입니다.</div>';
  }
}
loadMissionVideo();

// 말씀과 찬양 캐러셀: 탭 선택 시 해당 카테고리 최근 4개를 보여준다
const SHOWCASE_TABS = [
  { label: '주일설교', category: 'sermon-sunday' },
  { label: '수요설교', category: 'sermon-wed' },
  { label: '금요설교', category: 'sermon-fri' },
];

async function renderShowcaseRow(category) {
  const row = document.getElementById('showcase-row');
  row.innerHTML = '<p class="showcase-empty">불러오는 중…</p>';
  try {
    const items = (await fetchSermons(category)).slice(0, 4);
    row.innerHTML = items.length
      ? items.map(item => showcaseCard(item, false)).join('')
      : '<p class="showcase-empty">아직 등록된 설교가 없습니다.</p>';
  } catch (err) {
    console.error('말씀과 찬양 로드 실패:', err);
    row.innerHTML = '<p class="showcase-empty">불러오지 못했습니다.</p>';
  }
}

function loadShowcase() {
  const tabsEl = document.getElementById('showcase-tabs');
  tabsEl.innerHTML = SHOWCASE_TABS.map((t, i) => `
    <button type="button" class="showcase-tab${i === 0 ? ' is-active' : ''}" data-category="${t.category}">${t.label}</button>`).join('');
  tabsEl.querySelectorAll('.showcase-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      tabsEl.querySelectorAll('.showcase-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.getElementById('showcase-row').scrollTo({ left: 0 });
      renderShowcaseRow(btn.dataset.category);
    });
  });
  document.getElementById('showcasePrev').addEventListener('click', () =>
    document.getElementById('showcase-row').scrollBy({ left: -300, behavior: 'smooth' }));
  document.getElementById('showcaseNext').addEventListener('click', () =>
    document.getElementById('showcase-row').scrollBy({ left: 300, behavior: 'smooth' }));
  renderShowcaseRow(SHOWCASE_TABS[0].category);
}
loadShowcase();

// 찬양 듣기 플로팅 플레이어 (고정곡 1곡, 히어로 버튼 클릭 시 재생)
const PRAISE_YOUTUBE_ID = 'rlgvUfQAsAo';
function togglePraisePlayer(forceOpen) {
  const player = document.getElementById('praisePlayer');
  const frame = document.getElementById('praisePlayerFrame');
  const open = forceOpen !== undefined ? forceOpen : player.hidden;
  if (open) {
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${PRAISE_YOUTUBE_ID}?autoplay=1" title="찬양" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    player.hidden = false;
  } else {
    frame.innerHTML = ''; // iframe 제거로 재생 정지
    player.hidden = true;
  }
}

fetchMergedNotices()
  .then(items => {
    const list = document.getElementById('notice-list');
    list.innerHTML = '';
    items.forEach(n => {
      const li = document.createElement('li');
      li.style.display = 'block';
      const body = n.body ? `<p style="margin-top:8px;color:var(--text-gray);font-size:14px;">${showcaseEsc(n.body).replace(/\n/g, '<br>')}</p>` : '';
      const titleHtml = n.id
        ? `<a href="/pages/news-notice-view.html?id=${encodeURIComponent(n.id)}" style="color:inherit;text-decoration:none;">${showcaseEsc(n.title)}</a>`
        : showcaseEsc(n.title);
      li.innerHTML = `<div><span class="notice-date">${n.date}</span><span class="notice-title">${titleHtml}</span></div>${body}`;
      list.appendChild(li);
    });
  })
  .catch(err => console.error('공지사항 로드 실패:', err));
