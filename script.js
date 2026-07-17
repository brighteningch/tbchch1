// applyBindings()는 common.js에 정의되어 있다 (헤더/푸터 포함 전체 페이지 공통)

function formatDate(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// 구글드라이브 카테고리 4개(행사사진/청소년&청년/예배사진/교회학교)를 불러와 카드로 그린다 (Netlify Function 경유)
// 카드를 클릭하면 그 카테고리 안의 행사 폴더 목록이 최신순으로 뜬다 (common.js의 openCategoryLightbox)
function loadGallery(catGridId) {
  const catGridEl = document.getElementById(catGridId);
  if (!catGridEl) return;

  fetch('/.netlify/functions/drive-photos')
    .then(res => res.json())
    .then(data => {
      const categories = data.categories || [];
      if (data.error || categories.length === 0) {
        catGridEl.innerHTML = '<p class="gallery-empty">아직 사진이 없거나 불러오지 못했습니다.</p>';
        return;
      }

      catGridEl.innerHTML = categories.map((cat, i) => `
        <button type="button" class="gallery-cat-card" data-cat-index="${i}">
          <div class="gallery-cat-thumb">
            ${cat.thumb
              ? `<img src="${cat.thumb}" alt="${cat.name}" loading="lazy">`
              : `<div class="gallery-cat-thumb-empty">사진 없음</div>`}
            <span class="gallery-cat-count">${cat.count}개</span>
          </div>
          <div>
            <p class="gallery-cat-label">카테고리</p>
            <p class="gallery-cat-name">${cat.name}</p>
            <p class="gallery-cat-date">${cat.date ? formatDate(cat.date) + ' 업데이트' : '최근 업데이트 없음'}</p>
          </div>
        </button>`).join('');

      catGridEl.querySelectorAll('[data-cat-index]').forEach(btn => {
        const cat = categories[Number(btn.dataset.catIndex)];
        btn.addEventListener('click', () => openCategoryLightbox(cat.id, cat.name));
      });
    })
    .catch(() => {
      catGridEl.innerHTML = '<p class="gallery-empty">아직 사진이 없거나 불러오지 못했습니다.</p>';
    });
}

fetch('/content/site.json')
  .then(res => res.json())
  .then(data => {
    applyBindings(document, data);

    // 예배안내: 주일예배/교회학교/주중예배 3개 컬러 그룹 카드
    const WORSHIP_GROUPS = [
      { key: '주일예배', cls: 'wg-sunday' },
      { key: '교회학교', cls: 'wg-kids' },
      { key: '주중예배', cls: 'wg-week' },
    ];
    document.getElementById('worship-groups').innerHTML = WORSHIP_GROUPS.map(g => {
      const items = data.worship.filter(w => w.category === g.key);
      if (items.length === 0) return '';
      return `
        <div class="worship-group ${g.cls}">
          <div class="worship-group-label">${g.key.slice(0, 2)}<br>${g.key.slice(2)}</div>
          <table class="worship-mini-table">
            <thead><tr><th>예배</th><th>시간</th></tr></thead>
            <tbody>
              ${items.map(w => `<tr><td>${w.name}</td><td>${w.time}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }).join('');

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
    loadGallery('gallery-cat-grid');

    // 메인 배경 사진 슬라이드 (15초마다 자동 전환)
    initHeroSlides(data.hero.images);

  })
  .catch(err => console.error('site.json 로드 실패:', err));

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
    timer = setInterval(() => goTo(current + 1), 15000);
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

// 주일 말씀 팝업 (설교 인포그래픽/주간묵상집/매일성경묵상/소그룹나눔 바로가기)
function showSundayPopup() {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (localStorage.getItem('verseModalDismissed') === todayStr) return;

  const modal = document.getElementById('verseModal');
  modal.hidden = false;

  const close = () => {
    if (document.getElementById('verseModalHideToday').checked) {
      localStorage.setItem('verseModalDismissed', todayStr);
    }
    modal.hidden = true;
  };

  document.getElementById('verseModalClose').addEventListener('click', close);
  document.getElementById('verseModalBackdrop').addEventListener('click', close);
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
  });
}
showSundayPopup();

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

// 미션 스테이트먼트 영역의 곱씹다 (최신 1건 인라인 재생)
function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

async function loadMissionVideo() {
  const el = document.getElementById('mission-media');
  if (!el) return;
  try {
    const items = await fetchSermons('3min');
    const latest = items[0];
    const embedUrl = latest && youtubeEmbedUrl(latest.video_url);
    if (embedUrl) {
      el.innerHTML = `<iframe src="${embedUrl}" title="${showcaseEsc(latest.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    } else {
      el.innerHTML = '<div class="mission-media-empty">곱씹다 영상이 곧 올라올 예정입니다.</div>';
    }
  } catch (err) {
    console.error('곱씹다 로드 실패:', err);
    el.innerHTML = '<div class="mission-media-empty">곱씹다 영상이 곧 올라올 예정입니다.</div>';
  }
}
loadMissionVideo();

async function loadShowcase() {
  try {
    const [sunday, wed, fri, praiseWed] = await Promise.all([
      fetchSermons('sermon-sunday'),
      fetchSermons('sermon-wed'),
      fetchSermons('sermon-fri'),
      fetchSermons('praise-wed'),
    ]);

    const mainItems = sunday.slice(0, 2);
    const mainEl = document.getElementById('showcase-main');
    mainEl.classList.toggle('showcase-main--single', mainItems.length === 1);
    mainEl.innerHTML = mainItems.length
      ? mainItems.map(item => showcaseCard(item, true)).join('')
      : '<p class="showcase-empty">아직 등록된 주일설교가 없습니다.</p>';

    const rowItems = [wed[0], fri[0], praiseWed[0]].filter(Boolean);
    const rowWrap = document.querySelector('.showcase-row-wrap');
    if (rowItems.length === 0) {
      rowWrap.hidden = true;
    } else {
      const row = document.getElementById('showcase-row');
      row.innerHTML = rowItems.map(item => showcaseCard(item, false)).join('');
      document.getElementById('showcasePrev').addEventListener('click', () => row.scrollBy({ left: -300, behavior: 'smooth' }));
      document.getElementById('showcaseNext').addEventListener('click', () => row.scrollBy({ left: 300, behavior: 'smooth' }));
    }
  } catch (err) {
    console.error('말씀과 찬양 로드 실패:', err);
  }
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

fetch('/content/notices.json')
  .then(res => res.json())
  .then(data => {
    const list = document.getElementById('notice-list');
    list.innerHTML = '';
    data.notices
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach(n => {
        const li = document.createElement('li');
        li.style.display = 'block';
        const body = n.body ? `<p style="margin-top:8px;color:var(--text-gray);font-size:14px;">${n.body.replace(/\n/g, '<br>')}</p>` : '';
        li.innerHTML = `<div><span class="notice-date">${n.date}</span><span class="notice-title">${n.title}</span></div>${body}`;
        list.appendChild(li);
      });
  })
  .catch(err => console.error('notices.json 로드 실패:', err));
