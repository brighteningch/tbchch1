// 관리자가 특정 회원의 로그인 계정을 영구 삭제하는 Edge Function.
//
// ★보안상 절대 핵심(admin-reset-password/index.ts와 동일한 원칙 — 반드시 지켜야 함): 클라이언트가
// "나는 관리자다"라고 보내는 값은 절대 신뢰하지 않는다. 이 함수는 요청의 Authorization 헤더에
// 담긴 호출자의 Supabase 세션 JWT로 호출자를 서버측에서 식별하고, 그 호출자의 profiles.is_admin이
// 실제로 true인지 데이터베이스에서 재확인한 뒤에만 삭제를 진행한다. 이 검증을 건너뛰면 누구나
// 로그인만 하면 다른 사람 계정을 지울 수 있는 심각한 취약점이 된다.
//
// 인증 방식은 admin-reset-password와 동일하게 Supabase 공식 서버 유틸리티(@supabase/server)의
// withSupabase 래퍼를 쓴다. { auth: 'user' } 모드에서는:
//   - verify_jwt = true(기본값)일 때 플랫폼이 handler 실행 "전에" JWT를 검증하므로,
//     Authorization 헤더가 없거나 위조된 토큰이면 이 handler 코드는 아예 실행되지 않고
//     자동으로 401이 반환된다(공식문서: "the platform validates the JWT before your
//     handler runs"). → 이 함수 코드가 "인증 안 됨" 케이스를 직접 처리할 필요가 없다.
//   - ctx.userClaims.id 는 검증된 호출자의 auth.users.id다.
//   - ctx.supabase 는 그 호출자의 RLS 정책으로 범위가 제한된 클라이언트다. profiles 테이블의
//     "select own profile" 정책(auth.uid() = id)으로 본인 프로필의 is_admin만 안전하게
//     조회할 수 있다 — 그래서 이 조회만으로는 다른 사람의 관리자 여부를 훔쳐볼 수 없다.
//   - ctx.supabaseAdmin 은 service_role 클라이언트(RLS 우회)다. service_role 키 자체는
//     @supabase/server가 플랫폼이 자동 주입하는 환경변수에서 내부적으로 읽는다 — 이 파일은
//     그 키 값을 직접 다루거나 Deno.env.get()으로 읽지 않는다.
//
// ★이 기능 고유의 추가 위험(admin-reset-password엔 없던 것 — 계정 삭제는 되돌릴 수 없는 파괴적
// 작업이라 한 단계 더 방어한다): 관리자가 실수로(또는 탈취된 세션으로) 자기 자신의 계정을 삭제하는
// 것을 서버측에서도 차단한다. 클라이언트 UI에서 자기 자신을 목록에서 숨기거나 버튼을 비활성화하는
// 것만으로는 개발자도구로 우회 가능하므로, 이 서버 코드가 targetUserId와 ctx.userClaims.id를
// 직접 비교해 최종 방어선을 친다.
//
// 실제 삭제는 ctx.supabaseAdmin.auth.admin.deleteUser로만 수행하며, 그 앞에 반드시 위 관리자
// 재검증·자기자신 차단이 모두 통과해야만 도달한다. profiles 행은 supabase-schema.sql에서
// `id uuid references auth.users on delete cascade`로 정의돼 있으므로 auth.users 삭제만으로
// profiles도 자동 정리된다 — 이 함수가 profiles를 별도로 delete하지 않는다.

// deno-lint-ignore-file no-explicit-any
import { withSupabase } from "npm:@supabase/server@^1";

export interface RequestBody {
  userId?: string;
}

export interface HandlerCtx {
  // ★admin-reset-password와 동일한 이유로 null 가능 타입을 유지한다(UserClaims | null) —
  // JWT가 platform 단에서 검증됐다고 해서 이 필드가 항상 채워진다고 가정하면 안 된다.
  userClaims: { id: string; role?: string; email?: string } | null;
  supabase: {
    from: (table: string) => any;
  };
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: (
          userId: string,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
}

// withSupabase가 감싸는 실제 로직. 별도로 export해서 Deno test에서 가짜(mock) ctx로
// 직접 호출·검증할 수 있게 한다(플랫폼의 JWT 검증 자체는 배포 환경에서만 실행되는 별도
// 레이어라 여기서 테스트 대상이 아니다 — 이 함수는 "JWT는 이미 검증됐다"는 전제 하에
// "그 검증된 사용자가 관리자인가, 그리고 자기 자신을 지우려는 건 아닌가"부터를 테스트한다).
export async function handleRequest(
  req: Request,
  ctx: HandlerCtx,
): Promise<Response> {
  // 0) 방어적 null 체크 — 정상 배포 환경에서는 auth:'user' 모드 진입 자체가 이미 유효한
  //    JWT를 전제하지만, 타입상 null이 가능한 이상 코드로도 명시적으로 막는다.
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

  // 3) 자기 자신 삭제 차단 — 클라이언트 가드만 믿지 않고 서버측에서 다시 확인한다.
  //    (클라이언트 쪽 검증은 우회 가능하다.)
  if (targetUserId === ctx.userClaims.id) {
    return Response.json(
      { error: "자기 자신의 계정은 이 기능으로 삭제할 수 없습니다." },
      { status: 403 },
    );
  }

  // 4) 실제 삭제 — service_role 권한(ctx.supabaseAdmin)으로만 수행. 여기 도달했다는 것
  //    자체가 위 1)·3) 검증을 모두 통과했다는 뜻이다. profiles는 on delete cascade로
  //    자동 정리되므로 이 함수는 auth.users만 지운다.
  const { error: deleteErr } = await ctx.supabaseAdmin.auth.admin
    .deleteUser(targetUserId);

  if (deleteErr) {
    return Response.json(
      { error: "회원 삭제에 실패했습니다: " + deleteErr.message },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    (req: Request, ctx: HandlerCtx) => handleRequest(req, ctx),
  ),
};
