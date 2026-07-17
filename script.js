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

function renderParagraphs(container, text) {
  container.innerHTML = '';
  text.split('\n\n').forEach(block => {
    if (!block.trim()) return;
    const p = document.createElement('p');
    p.innerHTML = block.replace(/\n/g, '<br>');
    container.appendChild(p);
  });
}

fetch('/content/site.json')
  .then(res => res.json())
  .then(data => {
    applyBindings(document, data);

    // 인사말 본문 (문단 나누기)
    renderParagraphs(document.getElementById('about-message'), data.about.message);

    // 예배안내 테이블
    const worshipTbody = document.getElementById('worship-tbody');
    worshipTbody.innerHTML = '';
    data.worship.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.name}</td><td>${item.time}</td>`;
      worshipTbody.appendChild(tr);
    });

    // 빠른링크 예배시간 요약(1부/2부만)
    const w1 = data.worship[0], w2 = data.worship[1];
    if (w1 && w2) {
      document.getElementById('qcard-worship').textContent =
        `${w1.name.replace('주일예배 ', '')} ${w1.time} · ${w2.name.replace('주일예배 ', '')} ${w2.time}`;
    }

    // 설교 영상
    const iframe = document.getElementById('sermon-iframe');
    iframe.src = `https://www.youtube.com/embed/videoseries?list=${data.sermon.youtube_playlist_id}`;
    document.getElementById('sermon-channel-link').href = data.sermon.youtube_channel_url;

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
