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

async function getCurrentProfile() {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) return null;
  return data;
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
          ${profile.is_admin ? '<a href="/pages/admin-members.html">관리자 모드</a>' : ''}
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
