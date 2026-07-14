// applyBindings()는 common.js에 정의되어 있다 (헤더/푸터 포함 전체 페이지 공통)

function formatDate(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// 구글드라이브 대표 사진 + 카테고리별 최근 사진을 불러와 카드로 그린다 (Netlify Function 경유)
function loadGallery(featuredId, catGridId) {
  const featuredEl = document.getElementById(featuredId);
  const catGridEl = document.getElementById(catGridId);
  if (!featuredEl || !catGridEl) return;

  fetch('/.netlify/functions/drive-photos')
    .then(res => res.json())
    .then(data => {
      if (data.error || !data.featured) {
        featuredEl.innerHTML = '<p class="gallery-empty">아직 사진이 없거나 불러오지 못했습니다.</p>';
        catGridEl.innerHTML = '';
        return;
      }

      const f = data.featured;
      featuredEl.innerHTML = `
        <div class="gallery-featured-card">
          <div class="gallery-featured-img">
            <span class="gallery-featured-badge">NEW FEATURED PHOTO</span>
            <img src="${f.thumb}" alt="${f.name}" loading="lazy">
          </div>
          <div class="gallery-featured-info">
            <p class="gallery-featured-cat">${f.category}</p>
            <p class="gallery-featured-title">${f.event}</p>
            <p class="gallery-featured-date">${formatDate(f.createdTime)} 업데이트</p>
            <a href="${f.link}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="width:fit-content;">앨범 사진첩 전체보기 →</a>
          </div>
        </div>`;

      catGridEl.innerHTML = (data.categories || []).map(c => `
        <a href="${c.photo.link}" target="_blank" rel="noopener" class="gallery-cat-card">
          <div class="gallery-cat-thumb"><img src="${c.photo.thumb}" alt="${c.name}" loading="lazy"></div>
          <div>
            <p class="gallery-cat-label">행사 사진첩</p>
            <p class="gallery-cat-name">${c.name}</p>
            <p class="gallery-cat-date">최근 업데이트 · ${formatDate(c.photo.createdTime)}</p>
          </div>
        </a>`).join('');
    })
    .catch(() => {
      featuredEl.innerHTML = '<p class="gallery-empty">아직 사진이 없거나 불러오지 못했습니다.</p>';
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

    // 갤러리: 대표 사진 + 카테고리별 최근 사진
    loadGallery('gallery-featured', 'gallery-cat-grid');

    // 메인 배경 사진 슬라이드 (15초마다 자동 전환)
    initHeroSlides(data.hero.images);

    // 매일 묵상 말씀 팝업
    showDailyVerse(data.daily_verses);
  })
  .catch(err => console.error('site.json 로드 실패:', err));

function initHeroSlides(images) {
  const wrap = document.getElementById('heroSlides');
  if (!wrap || !images || images.length === 0) return;

  images.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'hero-slide' + (i === 0 ? ' active' : '');
    div.style.backgroundImage = `url("${item.image}")`;
    wrap.appendChild(div);
  });

  if (images.length <= 1) return;

  const slides = wrap.querySelectorAll('.hero-slide');
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 15000);
}

function showDailyVerse(verses) {
  if (!verses || verses.length === 0) return;

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (localStorage.getItem('verseModalDismissed') === todayStr) return;

  // 오늘 날짜(연중 일수) 기준으로 말씀 목록을 순환하며 하나 선택
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = new Date() - start;
  const dayOfYear = Math.floor(diff / 86400000);
  const verse = verses[dayOfYear % verses.length];

  const modal = document.getElementById('verseModal');
  document.getElementById('verseModalText').textContent = `“${verse.text}”`;
  document.getElementById('verseModalRef').textContent = verse.reference || '';
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
        li.innerHTML = `<span class="notice-date">${n.date}</span><span class="notice-title">${n.title}</span>`;
        list.appendChild(li);
      });
  })
  .catch(err => console.error('notices.json 로드 실패:', err));
