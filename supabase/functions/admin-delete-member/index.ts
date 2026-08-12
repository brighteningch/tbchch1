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
//
// ★감사 로그(reviewer-codex 보안검토 REVISE 반영, 2026-08-12): 계정 영구삭제는 되돌릴 수 없는데
// 누가/누구를/언제 지웠는지 기록이 없으면 오삭제나 탈취된 관리자 세션 악용을 사후에 추적할 방법이
// 없다. supabase/admin_delete_audit_schema.sql의 admin_delete_audit_log에 actor_id/target_id/
// target_name/created_at을 남긴다. target_name은 profiles 행이 삭제로 사라지기 전에 미리 조회해
// 담아둔다(삭제 후에는 다시 조회할 수 없으므로).
//
// ★운영계약(fail-open, 의도적 선택): 감사로그 insert는 실제 삭제가 "성공한 뒤"에만 시도하고,
// 그 insert가 실패하더라도 삭제 자체를 되돌리거나 클라이언트에 실패로 보고하지 않는다. 이유는
// deleteUser가 이미 실행되어 계정이 실제로 사라진 시점 이후이므로, 여기서 "실패로 되돌린다"는
// 개념 자체가 성립하지 않는다(이미 벌어진 일을 취소할 수 없다) — 굳이 fail-closed로 설계하려면
// 감사로그를 삭제보다 "먼저" 써야 하는데, 그러면 감사로그 테이블 문제로 정당한 긴급삭제가 막히는
// 것이 오삭제 추적 실패보다 더 나쁜 실패모드라고 판단했다(부가기능인 감사로그가 핵심기능인 삭제를
// 인질로 잡으면 안 된다). 대신 insert 실패는 console.error로 서버측 로그(Supabase Edge Function
// 로그)에 남겨 운영자가 인지할 수 있게 한다.

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
    from: (table: string) => any;
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

  // 4) 대상 회원의 이름을 삭제 전에 미리 확보 — 감사로그용. profiles 행은 삭제되면 사라지므로
  //    지금 시점의 값을 남겨두지 않으면 나중엔 target_id만으로 누구였는지 알 수 없다.
  //    이 조회가 실패해도(예: 이미 지워진 id) 감사로그의 부가정보일 뿐이니 삭제 자체는 막지 않는다.
  let targetName: string | null = null;
  try {
    const { data: targetProfile } = await ctx.supabase
      .from("profiles")
      .select("name")
      .eq("id", targetUserId)
      .single();
    targetName = targetProfile?.name ?? null;
  } catch {
    targetName = null;
  }

  // 5) 실제 삭제 — service_role 권한(ctx.supabaseAdmin)으로만 수행. 여기 도달했다는 것
  //    자체가 위 1)·3) 검증을 모두 통과했다는 뜻이다. profiles는 on delete cascade로
  //    자동 정리되므로 이 함수는 auth.users만 지운다.
  const { error: deleteErr } = await ctx.supabaseAdmin.auth.admin
    .deleteUser(targetUserId);

  if (deleteErr) {
    // ★Admin API의 상세 에러 메시지를 클라이언트에 그대로 노출하지 않는다(reviewer-codex 지적
    // 반영) — 내부 구현 세부사항 유출을 막기 위해 클라이언트에는 일반적인 문구만 보내고, 상세
    // 내용은 서버측 로그(Supabase Edge Function 로그에서 console.error로 확인 가능)로만 남긴다.
    console.error("admin-delete-member: deleteUser 실패", targetUserId, deleteErr.message);
    return Response.json(
      { error: "회원 삭제에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  // 6) 감사로그 기록 — fail-open(운영계약, 위 파일 상단 주석 참고): 삭제는 이미 성공적으로
  //    완료된 뒤이므로, 이 insert가 실패하더라도 삭제를 되돌리거나 클라이언트에 실패로 보고하지
  //    않는다. 실패 시 서버측 로그에만 남긴다.
  try {
    const { error: auditErr } = await ctx.supabaseAdmin
      .from("admin_delete_audit_log")
      .insert({
        actor_id: ctx.userClaims.id,
        target_id: targetUserId,
        target_name: targetName,
      });
    if (auditErr) {
      console.error("admin-delete-member: 감사로그 insert 실패(삭제는 이미 완료됨)", auditErr.message);
    }
  } catch (err) {
    console.error("admin-delete-member: 감사로그 insert 중 예외(삭제는 이미 완료됨)", err);
  }

  return Response.json({ success: true });
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    (req: Request, ctx: HandlerCtx) => handleRequest(req, ctx),
  ),
};
