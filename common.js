// 모든 페이지 공통: 헤더/푸터 삽입, 메가메뉴, 모바일메뉴, 로그인 상태, 공통 데이터 바인딩

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
    if (window.renderMemberAuthArea) renderMemberAuthArea();
    if (callback) callback();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectPartials(() => {
    loadSiteData();
  });
});
