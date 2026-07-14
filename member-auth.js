// 회원가입/로그인 (Supabase) — "아이디"로 로그인하지만 내부적으로는 합성 이메일을 씀
// {아이디}@members.tbchch1.internal 형태로 자동 변환해 Supabase Auth(이메일 기반)에 맞춘다.
const MEMBER_EMAIL_DOMAIN = "members.tbchch1.internal";

function getSupabaseClient() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
  if (!window.__sbClient) {
    window.__sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window.__sbClient;
}

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${MEMBER_EMAIL_DOMAIN}`;
}

async function checkUsernameAvailable(username) {
  const sb = getSupabaseClient();
  const { data, error } = await sb.rpc("username_available", { check_username: username.trim().toLowerCase() });
  if (error) throw error;
  return data;
}

async function memberSignUp({ name, username, password, phone, position }) {
  const sb = getSupabaseClient();
  const email = usernameToEmail(username);
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  const userId = data.user && data.user.id;
  if (!userId) throw new Error("회원가입 처리 중 사용자 정보를 받지 못했습니다.");

  const { error: profileError } = await sb.from("profiles").insert({
    id: userId,
    username: username.trim().toLowerCase(),
    name: name.trim(),
    phone: phone.trim(),
    position: position.trim(),
  });
  if (profileError) throw profileError;
  return data;
}

async function memberSignIn({ username, password }) {
  const sb = getSupabaseClient();
  const email = usernameToEmail(username);
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
    area.innerHTML = "";
    return;
  }
  const profile = await getCurrentProfile();
  if (profile) {
    area.innerHTML = `
      <div class="member-auth-logged">
        <button class="member-auth-name" id="memberMenuBtn">${profile.username}님 ▾</button>
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
