// index.ts의 handleRequest를 가짜(mock) ctx로 직접 호출해 실제 실행 검증한다.
// ★JWT 자체의 검증(서명 확인·만료 확인 등)은 배포된 플랫폼이 handler 실행 전에 수행하는
// 별도 레이어라(공식문서: "the platform validates the JWT before your handler runs")
// 로컬에서 배포 없이는 그 레이어까지 재현할 수 없다 — 이 테스트는 "이미 검증된 사용자가
// 관리자 권한을 실제로 갖고 있는지, 그리고 자기 자신을 지우려는 건 아닌지"부터의 서버측
// 로직을 검증 대상으로 삼는다.
import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type HandlerCtx } from "./index.ts";

function makeCtx(opts: {
  userId: string | null;
  isAdmin: boolean | null;
  profileQueryError?: { message: string } | null;
  deleteError?: { message: string } | null;
}): HandlerCtx & { deleteCallCount: number; lastDeletedUserId: string | null } {
  const state = { deleteCallCount: 0, lastDeletedUserId: null as string | null };
  const ctx: HandlerCtx & { deleteCallCount: number; lastDeletedUserId: string | null } = {
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
          deleteUser: async (userId: string) => {
            state.deleteCallCount++;
            state.lastDeletedUserId = userId;
            if (opts.deleteError) return { data: null, error: opts.deleteError };
            return { data: { id: userId }, error: null };
          },
        },
      },
    },
    get deleteCallCount() {
      return state.deleteCallCount;
    },
    get lastDeletedUserId() {
      return state.lastDeletedUserId;
    },
  };
  return ctx;
}

function makeReq(body: unknown): Request {
  return new Request("https://example.test/admin-delete-member", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- (a) 정상 관리자가 다른 회원을 삭제 → 성공 ----------
Deno.test("관리자가 다른 회원 계정 삭제를 요청하면 성공하고 그 대상 id로 deleteUser가 정확히 1회 호출된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(ctx.deleteCallCount, 1);
  assertEquals(ctx.lastDeletedUserId, "target-uuid-9");
});

// ---------- (b) 로그인했지만 is_admin=false인 일반 회원이 호출 → 거부, 삭제 미도달 ----------
Deno.test("일반 회원(is_admin=false)이 호출하면 403으로 거부되고 deleteUser는 호출되지 않는다", async () => {
  const ctx = makeCtx({ userId: "member-uuid-2", isAdmin: false });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.success, undefined);
  assertEquals(typeof json.error, "string");
  assertEquals(ctx.deleteCallCount, 0);
});

Deno.test("profiles에 레코드가 아예 없는 사용자가 호출하면 403으로 거부되고 deleteUser는 호출되지 않는다", async () => {
  const ctx = makeCtx({ userId: "ghost-uuid-3", isAdmin: null });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
  assertEquals(ctx.deleteCallCount, 0);
});

Deno.test("profiles 조회 자체가 실패(DB 에러)하면 안전하게 403으로 거부된다(fail-closed)", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: null,
    profileQueryError: { message: "connection error" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
  assertEquals(ctx.deleteCallCount, 0);
});

// ---------- userClaims가 null인 경우(방어적 널체크) ----------
Deno.test("userClaims가 null이면(이론상 케이스) 401로 거부되고 DB 조회 자체를 시도하지 않는다", async () => {
  const ctx = makeCtx({ userId: null, isAdmin: true });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 401);
  assertEquals(ctx.deleteCallCount, 0);
});

// ---------- 입력 검증 ----------
Deno.test("관리자여도 userId 없이 호출하면 400으로 거부된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(makeReq({}), ctx);
  assertEquals(res.status, 400);
  assertEquals(ctx.deleteCallCount, 0);
});

Deno.test("잘못된 JSON 본문이면 400으로 거부된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const badReq = new Request("https://example.test/admin-delete-member", {
    method: "POST",
    body: "{ 이건 유효한 JSON이 아님",
  });
  const res = await handleRequest(badReq, ctx);
  assertEquals(res.status, 400);
  assertEquals(ctx.deleteCallCount, 0);
});

// ---------- (핵심) 자기 자신 삭제 차단 — 이 기능 고유의 안전장치 ----------
Deno.test("관리자가 자기 자신의 userId로 호출하면 서버가 거부하고 deleteUser는 호출되지 않는다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(makeReq({ userId: "admin-uuid-1" }), ctx);
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.success, undefined);
  assertEquals(typeof json.error, "string");
  assertEquals(ctx.deleteCallCount, 0);
});

// ---------- Admin API 실패 처리 ----------
Deno.test("auth.admin.deleteUser가 실패하면 500과 에러 메시지를 반환한다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    deleteError: { message: "user not found" },
  });
  const res = await handleRequest(makeReq({ userId: "nonexistent-uuid" }), ctx);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.success, undefined);
});
