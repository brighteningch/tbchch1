// 회원가입/로그인 (Supabase) — "이름"으로 로그인하지만 내부적으로는 합성 이메일을 씀
// {이름(공백제거)}@members.tbchch1.com 형태로 자동 변환해 Supabase Auth(이메일 기반)에 맞춘다.
// 주의: 동명이인이 있으면 두 번째 가입자는 "이미 사용중인 이름"으로 막힌다 (작은 공동체 전제 하의 단순화).
const MEMBER_EMAIL_DOMAIN = "members.tbchch1.com";

function getSupabaseClient() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
  if (!window.__sbClient) {
    window.__sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window.__sbClient;
}

// 이름에서 공백만 제거해 로그인 식별자로 쓴다
function nameToKey(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

function nameToEmail(name) {
  return `${encodeURIComponent(nameToKey(name))}@${MEMBER_EMAIL_DOMAIN}`;
}

function requireSupabaseClient() {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("회원 시스템 준비 중입니다. 잠시 후 다시 시도해주세요.");
  return sb;
}

async function checkNameAvailable(name) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.rpc("username_available", { check_username: nameToKey(name) });
  if (error) throw error;
  return data;
}

async function memberSignUp({ name, password, position }) {
  const sb = requireSupabaseClient();
  const email = nameToEmail(name);
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  const userId = data.user && data.user.id;
  if (!userId) throw new Error("회원가입 처리 중 사용자 정보를 받지 못했습니다.");

  const { error: profileError } = await sb.from("profiles").insert({
    id: userId,
    username: nameToKey(name),
    name: name.trim(),
    position: position.trim(),
  });
  if (profileError) throw profileError;
  return data;
}

async function memberSignIn({ name, password }) {
  const sb = requireSupabaseClient();
  const email = nameToEmail(name);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function memberSignOut() {
  const sb = getSupabaseClient();
  await sb.auth.signOut();
}

async function fetchCurrentProfileOnce() {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) return null;
  return data;
}

// ★네트워크 순단 방어(2026-08-13 — 관리자 드롭다운 "메뉴 관리 등"이 간헐적으로 사라지는 버그
// 수정): 실측으로 재현·추적한 진짜 원인은 예외(throw)가 아니라 **행(hang)**이었다 — profiles
// REST 요청이 네트워크 레벨에서 실패(모바일 WiFi↔셀룰러 전환, 일시적 연결 끊김 등으로 요청이
// 응답도 에러도 없이 그냥 사라지는 경우, devtools에서 net::ERR_FAILED로만 보임)하면
// `sb.from("profiles")...single()`이 반환하는 프로미스가 resolve도 reject도 하지 않고
// 영원히 pending 상태로 멈춘다(직접 디버그 로그로 확인 — "profiles select 호출 직전"까지는
// 찍히고 그 다음 줄이 영원히 안 찍힘). await로 그 프로미스를 기다리는 renderMemberAuthArea는
// 그래서 영원히 멈추고, 로그인 영역(#memberAuthArea)은 header.html의 빈 <span>인 채로
// 영원히 남는다 — 콘솔에 잡을 만한 에러조차 없어("Failed to load resource"만 보이고 그게
// 로그인영역과 관련있다는 단서가 없음) 원인 파악이 특히 어려웠다.
// try/catch만으로는 못 막는다(멈춘 프로미스는 애초에 던지지도 않으므로) — Promise.race로
// 타임아웃을 걸어 일정 시간 안에 응답이 없으면 강제로 실패 처리한다. 짧은 네트워크 순단은
// 잠깐 기다리면 회복되는 경우가 많으므로 1회 재시도하고, 재시도도 타임아웃/실패하면(그때는
// 진짜 네트워크가 끊긴 것) null을 반환해 최소한 "로그인/회원가입" 링크는 항상 뜨게 한다.
const PROFILE_FETCH_TIMEOUT_MS = 4000;

function fetchCurrentProfileOnceWithTimeout() {
  return Promise.race([
    fetchCurrentProfileOnce(),
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error(`프로필 조회가 ${PROFILE_FETCH_TIMEOUT_MS}ms 안에 응답하지 않음(네트워크 순단으로 추정)`)), PROFILE_FETCH_TIMEOUT_MS);
    }),
  ]);
}

async function getCurrentProfile() {
  try {
    return await fetchCurrentProfileOnceWithTimeout();
  } catch (err) {
    console.error("프로필 조회 실패(네트워크 문제로 추정), 0.7초 후 재시도:", err);
    await new Promise(resolve => setTimeout(resolve, 700));
    try {
      return await fetchCurrentProfileOnceWithTimeout();
    } catch (retryErr) {
      console.error("프로필 조회 재시도도 실패 — 로그인 안 된 상태로 표시:", retryErr);
      return null;
    }
  }
}

// 로그인 여부만 필요한 곳(프로필 행 존재는 불필요)에서 쓰는 가벼운 세션 확인.
// 로그인 게이팅된 게시판(매거진/다음세대/지역자료실)에서 비로그인 방문자에게
// "글이 없습니다" 대신 "로그인이 필요합니다" 안내를 보여주기 위해 추가.
async function isLoggedIn() {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { data: { session } } = await sb.auth.getSession();
  return !!session;
}

// 헤더의 로그인 영역을 현재 로그인 상태에 맞게 그린다
async function renderMemberAuthArea() {
  const area = document.getElementById("memberAuthArea");
  if (!area) return;
  const sb = getSupabaseClient();
  if (!sb) {
    // Supabase 연동 전이라도 로그인/회원가입 링크는 항상 보이게 한다
    area.innerHTML = `<a href="/pages/login.html">로그인</a><span class="member-auth-sep">/</span><a href="/pages/signup.html">회원가입</a>`;
    return;
  }
  const profile = await getCurrentProfile();
  if (profile) {
    area.innerHTML = `
      <div class="member-auth-logged">
        <button class="member-auth-name" id="memberMenuBtn">${profile.name}님 ▾</button>
        <div class="member-auth-dropdown" id="memberMenuDropdown">
          ${profile.is_admin ? '<a href="/admin/">홈페이지 관리</a><a href="/pages/admin-nav-menu.html">메뉴 관리</a><a href="/pages/admin-members.html">회원 관리</a><a href="/pages/admin-sermons.html">말씀과 찬양 관리</a><a href="/pages/admin-weekly-word.html">주간말씀 관리</a><a href="/pages/admin-popups.html">홈페이지 팝업 관리</a><a href="/pages/admin-news.html">공지사항·주보 관리</a><a href="/pages/admin-magazine.html">매거진 관리</a>' : ''}
          ${profile.is_pastoral_admin ? '<a href="/pages/pastoral-dashboard.html">재적 관리</a>' : ''}
          <a href="/pages/change-password.html">비밀번호 변경</a>
          <button id="memberLogoutBtn">로그아웃</button>
        </div>
      </div>`;
    const menuBtn = document.getElementById("memberMenuBtn");
    const dropdown = document.getElementById("memberMenuDropdown");
    menuBtn.addEventListener("click", (e) => { e.stopPropagation(); dropdown.classList.toggle("open"); });
    document.addEventListener("click", () => dropdown.classList.remove("open"));
    document.getElementById("memberLogoutBtn").addEventListener("click", async () => {
      await memberSignOut();
      location.href = "/";
    });
  } else {
    area.innerHTML = `<a href="/pages/login.html">로그인</a><span class="member-auth-sep">/</span><a href="/pages/signup.html">회원가입</a>`;
  }
}
