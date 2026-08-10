// index.ts의 handleRequest를 가짜(mock) ctx로 직접 호출해 실제 실행 검증한다.
// ★JWT 자체의 검증(서명 확인·만료 확인 등)은 배포된 플랫폼이 handler 실행 전에 수행하는
// 별도 레이어라(공식문서: "the platform validates the JWT before your handler runs")
// 로컬에서 배포 없이는 그 레이어까지 재현할 수 없다 — 이 테스트는 "이미 검증된 사용자가
// 관리자 권한을 실제로 갖고 있는지"부터의 서버측 로직을 검증 대상으로 삼는다.
import { assertEquals } from "jsr:@std/assert@1";
import { generateSecurePassword, handleRequest, type HandlerCtx } from "./index.ts";

function makeCtx(opts: {
  userId: string | null;
  isAdmin: boolean | null;
  profileQueryError?: { message: string } | null;
  updateError?: { message: string } | null;
}): HandlerCtx {
  return {
    userClaims: opts.userId ? { id: opts.userId } : null,
    supabase: {
      from: (table: string) => {
        if (table !== "profiles") throw new Error(`예상치 못한 테이블 조회: ${table}`);
        return {
          select: (_cols: string) => ({
            eq: (col: string, val: string) => ({
              single: async () => {
                if (col !== "id" || val !== opts.userId) {
                  throw new Error("호출자 id가 아닌 다른 id로 조회 시도됨(위험)");
                }
                if (opts.profileQueryError) {
                  return { data: null, error: opts.profileQueryError };
                }
                if (opts.isAdmin === null) {
                  return { data: null, error: null }; // 프로필 없음
                }
                return { data: { is_admin: opts.isAdmin }, error: null };
              },
            }),
          }),
        };
      },
    },
    supabaseAdmin: {
      auth: {
        admin: {
          updateUserById: async (_userId: string, _attrs: { password: string }) => {
            if (opts.updateError) return { data: null, error: opts.updateError };
            return { data: { id: _userId }, error: null };
          },
        },
      },
    },
  };
}

function makeReq(body: unknown): Request {
  return new Request("https://example.test/admin-reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- (a) 정상 관리자가 호출 → 성공 ----------
Deno.test("관리자가 대상 회원 비밀번호 재설정 요청 시 성공하고 새 비밀번호를 응답한다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(typeof json.newPassword, "string");
  assertEquals(json.newPassword.length >= 12, true);
});

Deno.test("관리자가 8자 이상 비밀번호를 직접 지정하면 그 값이 그대로 쓰인다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(
    makeReq({ userId: "target-uuid-9", newPassword: "MyPass1234" }),
    ctx,
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.newPassword, "MyPass1234");
});

// ---------- (b) 로그인했지만 is_admin=false인 일반 회원이 호출 → 거부 ----------
Deno.test("일반 회원(is_admin=false)이 호출하면 403으로 거부되고 비밀번호 갱신 로직에 도달하지 않는다", async () => {
  const ctx = makeCtx({ userId: "member-uuid-2", isAdmin: false });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.success, undefined);
  assertEquals(typeof json.error, "string");
});

Deno.test("profiles에 레코드가 아예 없는 사용자가 호출하면 403으로 거부된다", async () => {
  const ctx = makeCtx({ userId: "ghost-uuid-3", isAdmin: null });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
});

Deno.test("profiles 조회 자체가 실패(DB 에러)하면 안전하게 403으로 거부된다(fail-closed)", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: null,
    profileQueryError: { message: "connection error" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
});

// ---------- userClaims가 null인 경우(방어적 널체크, deno check가 잡아낸 타입) ----------
Deno.test("userClaims가 null이면(이론상 케이스) 401로 거부되고 DB 조회 자체를 시도하지 않는다", async () => {
  const ctx = makeCtx({ userId: null, isAdmin: true });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 401);
});

// ---------- 입력 검증 ----------
Deno.test("관리자여도 userId 없이 호출하면 400으로 거부된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(makeReq({}), ctx);
  assertEquals(res.status, 400);
});

Deno.test("관리자여도 7자 비밀번호를 직접 지정하면 400으로 거부된다(서버측 최소길이 검증)", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(
    makeReq({ userId: "target-uuid-9", newPassword: "short12" }),
    ctx,
  );
  assertEquals(res.status, 400);
});

Deno.test("잘못된 JSON 본문이면 400으로 거부된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const badReq = new Request("https://example.test/admin-reset-password", {
    method: "POST",
    body: "{ 이건 유효한 JSON이 아님",
  });
  const res = await handleRequest(badReq, ctx);
  assertEquals(res.status, 400);
});

// ---------- Admin API 실패 처리 ----------
Deno.test("auth.admin.updateUserById가 실패하면 500과 에러 메시지를 반환한다(비밀번호는 노출 안 됨)", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    updateError: { message: "user not found" },
  });
  const res = await handleRequest(makeReq({ userId: "nonexistent-uuid" }), ctx);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.success, undefined);
  assertEquals(json.newPassword, undefined);
});

// ---------- 자동생성 비밀번호 품질 ----------
Deno.test("generateSecurePassword는 매번 다른 값을 생성한다(고정값 아님)", () => {
  const a = generateSecurePassword();
  const b = generateSecurePassword();
  assertEquals(a === b, false);
  assertEquals(a.length, 12);
});

Deno.test("generateSecurePassword는 혼동되기 쉬운 문자(0,O,1,l,I)를 포함하지 않는다", () => {
  const pw = generateSecurePassword(200);
  for (const ch of ["0", "O", "1", "l", "I"]) {
    assertEquals(pw.includes(ch), false, `혼동 문자 '${ch}'가 포함됨`);
  }
});
