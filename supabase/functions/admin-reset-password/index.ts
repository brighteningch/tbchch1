// 관리자가 특정 회원의 비밀번호를 새로 설정하는 Edge Function.
//
// ★보안상 절대 핵심(반드시 지켜야 함): 클라이언트가 "나는 관리자다"라고 보내는 값은
// 절대 신뢰하지 않는다. 이 함수는 요청의 Authorization 헤더에 담긴 호출자의 Supabase 세션
// JWT로 호출자를 서버측에서 식별하고, 그 호출자의 profiles.is_admin이 실제로 true인지
// 데이터베이스에서 재확인한 뒤에만 비밀번호 재설정을 진행한다. 이 검증을 건너뛰면 누구나
// 로그인만 하면 다른 사람 비밀번호를 바꿀 수 있는 심각한 취약점이 된다.
//
// 인증 방식은 Supabase 공식 서버 유틸리티(@supabase/server)의 withSupabase 래퍼를 쓴다.
// { auth: 'user' } 모드에서는:
//   - verify_jwt = true(기본값)일 때 플랫폼이 handler 실행 "전에" JWT를 검증하므로,
//     Authorization 헤더가 없거나 위조된 토큰이면 이 handler 코드는 아예 실행되지 않고
//     자동으로 401이 반환된다(공식문서: "the platform validates the JWT before your
//     handler runs"). → 이 함수 코드가 "인증 안 됨" 케이스를 직접 처리할 필요가 없다.
//   - ctx.userClaims.id 는 검증된 호출자의 auth.users.id다(JWT의 sub 클레임을 정규화한
//     값 — @supabase/server 소스의 UserClaims 타입 정의로 확인).
//   - ctx.supabase 는 그 호출자의 RLS 정책으로 범위가 제한된 클라이언트다. profiles 테이블의
//     "select own profile" 정책(auth.uid() = id)으로 본인 프로필의 is_admin만 안전하게
//     조회할 수 있다 — 그래서 이 조회만으로는 다른 사람의 관리자 여부를 훔쳐볼 수 없다.
//   - ctx.supabaseAdmin 은 service_role 클라이언트(RLS 우회)다. service_role 키 자체는
//     @supabase/server가 플랫폼이 자동 주입하는 환경변수에서 내부적으로 읽는다 — 이 파일은
//     그 키 값을 직접 다루거나 Deno.env.get()으로 읽지 않는다(키가 이 코드에 절대 나타나지
//     않는다).
//
// 실제 비밀번호 갱신은 ctx.supabaseAdmin.auth.admin.updateUserById로만 수행하며,
// 그 앞에 반드시 위 관리자 재검증이 성공해야만 도달한다.

// deno-lint-ignore-file no-explicit-any
import { withSupabase } from "npm:@supabase/server@^1";

const MIN_MANUAL_PASSWORD_LENGTH = 8;
const AUTO_PASSWORD_LENGTH = 12;
// 혼동되기 쉬운 문자(0/O, 1/l/I) 제외 — 관리자가 전화로 불러줄 때 실수를 줄인다
const AUTO_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateSecurePassword(
  length: number = AUTO_PASSWORD_LENGTH,
): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => AUTO_PASSWORD_CHARS[b % AUTO_PASSWORD_CHARS.length])
    .join("");
}

export interface RequestBody {
  userId?: string;
  newPassword?: string;
}

export interface HandlerCtx {
  // ★deno check로 실제 @supabase/server 타입정의 대조 중 발견: userClaims는 auth:'user'
  // 모드에서도 null일 수 있는 타입이다(UserClaims | null) — JWT 자체가 platform 단에서
  // 검증됐다고 해서 이 필드가 항상 채워진다고 가정하면 안 된다. null이면 즉시 거부한다.
  userClaims: { id: string; role?: string; email?: string } | null;
  supabase: {
    from: (table: string) => any;
  };
  supabaseAdmin: {
    auth: {
      admin: {
        updateUserById: (
          userId: string,
          attrs: { password: string },
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
}

// withSupabase가 감싸는 실제 로직. 별도로 export해서 Deno test에서 가짜(mock) ctx로
// 직접 호출·검증할 수 있게 한다(플랫폼의 JWT 검증 자체는 배포 환경에서만 실행되는 별도
// 레이어라 여기서 테스트 대상이 아니다 — 이 함수는 "JWT는 이미 검증됐다"는 전제 하에
// "그 검증된 사용자가 관리자인가"부터를 테스트한다).
export async function handleRequest(
  req: Request,
  ctx: HandlerCtx,
): Promise<Response> {
  // 0) 방어적 null 체크 — 정상 배포 환경에서는 auth:'user' 모드 진입 자체가 이미 유효한
  //    JWT를 전제하지만(플랫폼이 handler 실행 전에 검증), 타입상 null이 가능한 이상 코드로도
  //    명시적으로 막아 어떤 경우에도 신원 미상 호출자가 다음 단계로 못 넘어가게 한다.
  if (!ctx.userClaims || !ctx.userClaims.id) {
    return Response.json(
      { error: "인증된 사용자를 확인할 수 없습니다." },
      { status: 401 },
    );
  }

  // 1) 호출자가 실제 관리자인지 서버측 재확인 — 클라이언트가 보낸 어떤 값도 참고하지 않고,
  //    오직 검증된 ctx.userClaims.id로만 DB를 조회한다.
  const { data: callerProfile, error: profileErr } = await ctx.supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", ctx.userClaims.id)
    .single();

  if (profileErr || !callerProfile || callerProfile.is_admin !== true) {
    return Response.json(
      { error: "관리자 권한이 없습니다." },
      { status: 403 },
    );
  }

  // 2) 요청 본문 파싱
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 },
    );
  }

  const targetUserId = body?.userId;
  if (!targetUserId || typeof targetUserId !== "string") {
    return Response.json(
      { error: "대상 회원 id가 필요합니다." },
      { status: 400 },
    );
  }

  // 3) 새 비밀번호 결정 — 직접 입력이면 서버측에서도 최소 길이를 검증한다
  //    (클라이언트 쪽 검증만 믿지 않는다 — 클라이언트 검증은 우회 가능하다).
  let newPassword: string;
  if (body?.newPassword) {
    if (
      typeof body.newPassword !== "string" ||
      body.newPassword.length < MIN_MANUAL_PASSWORD_LENGTH
    ) {
      return Response.json(
        { error: `비밀번호는 ${MIN_MANUAL_PASSWORD_LENGTH}자 이상이어야 합니다.` },
        { status: 400 },
      );
    }
    newPassword = body.newPassword;
  } else {
    newPassword = generateSecurePassword();
  }

  // 4) 실제 갱신 — service_role 권한(ctx.supabaseAdmin)으로만 수행. 여기 도달했다는 것
  //    자체가 위 1)단계 관리자 검증을 통과했다는 뜻이다.
  const { error: updateErr } = await ctx.supabaseAdmin.auth.admin
    .updateUserById(targetUserId, { password: newPassword });

  if (updateErr) {
    return Response.json(
      { error: "비밀번호 재설정에 실패했습니다: " + updateErr.message },
      { status: 500 },
    );
  }

  // 새 비밀번호는 이 응답 한 번에만 담겨 나간다 — 서버는 평문을 저장하지 않는다
  // (auth.admin.updateUserById 자체가 Supabase Auth 내부에서 즉시 해시해 저장한다).
  return Response.json({ success: true, newPassword });
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    (req: Request, ctx: HandlerCtx) => handleRequest(req, ctx),
  ),
};
