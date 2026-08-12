// index.ts의 handleRequest를 가짜(mock) ctx로 직접 호출해 실제 실행 검증한다.
// ★JWT 자체의 검증(서명 확인·만료 확인 등)은 배포된 플랫폼이 handler 실행 전에 수행하는
// 별도 레이어라(공식문서: "the platform validates the JWT before your handler runs")
// 로컬에서 배포 없이는 그 레이어까지 재현할 수 없다 — 이 테스트는 "이미 검증된 사용자가
// 관리자 권한을 실제로 갖고 있는지, 자기 자신을 지우려는 건 아닌지, 그리고 삭제가 실제로
// 일어났을 때 감사로그가 정확히 남는지(혹은 실패해도 삭제 응답이 흔들리지 않는지)"부터의
// 서버측 로직을 검증 대상으로 삼는다.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleRequest, type HandlerCtx } from "./index.ts";

function makeCtx(opts: {
  userId: string | null;
  isAdmin: boolean | null;
  profileQueryError?: { message: string } | null;
  targetName?: string | null;
  targetNameQueryError?: { message: string } | null;
  deleteError?: { message: string } | null;
  auditError?: { message: string } | null;
  auditThrows?: boolean;
}): HandlerCtx & {
  deleteCallCount: number;
  lastDeletedUserId: string | null;
  auditInsertCallCount: number;
  lastAuditInsert: Record<string, unknown> | null;
} {
  const state = {
    deleteCallCount: 0,
    lastDeletedUserId: null as string | null,
    auditInsertCallCount: 0,
    lastAuditInsert: null as Record<string, unknown> | null,
  };
  const ctx: HandlerCtx & {
    deleteCallCount: number;
    lastDeletedUserId: string | null;
    auditInsertCallCount: number;
    lastAuditInsert: Record<string, unknown> | null;
  } = {
    userClaims: opts.userId ? { id: opts.userId } : null,
    supabase: {
      from: (table: string) => {
        if (table !== "profiles") throw new Error(`예상치 못한 테이블 조회: ${table}`);
        return {
          select: (cols: string) => ({
            eq: (col: string, val: string) => ({
              single: async () => {
                if (cols === "is_admin") {
                  // 호출자 본인 관리자여부 조회 — 반드시 호출자 자신의 id로만 조회해야 한다
                  // (다른 사람의 is_admin을 훔쳐볼 수 있으면 심각한 취약점이므로 이 불변식을
                  // 목으로도 강제한다).
                  if (col !== "id" || val !== opts.userId) {
                    throw new Error("호출자 id가 아닌 다른 id로 is_admin 조회 시도됨(위험)");
                  }
                  if (opts.profileQueryError) {
                    return { data: null, error: opts.profileQueryError };
                  }
                  if (opts.isAdmin === null) {
                    return { data: null, error: null }; // 프로필 없음
                  }
                  return { data: { is_admin: opts.isAdmin }, error: null };
                }
                if (cols === "name") {
                  // 감사로그용 대상 회원 이름 조회 — 대상 id(호출자와 다를 수 있음)로 조회한다.
                  if (opts.targetNameQueryError) {
                    return { data: null, error: opts.targetNameQueryError };
                  }
                  return { data: { name: opts.targetName ?? null }, error: null };
                }
                throw new Error(`예상치 못한 select 컬럼: ${cols}`);
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
      from: (table: string) => {
        if (table !== "admin_delete_audit_log") {
          throw new Error(`예상치 못한 테이블 조회(supabaseAdmin): ${table}`);
        }
        return {
          insert: async (row: Record<string, unknown>) => {
            state.auditInsertCallCount++;
            state.lastAuditInsert = row;
            if (opts.auditThrows) throw new Error("감사로그 insert 중 네트워크 예외(테스트용)");
            if (opts.auditError) return { data: null, error: opts.auditError };
            return { data: row, error: null };
          },
        };
      },
    },
    get deleteCallCount() {
      return state.deleteCallCount;
    },
    get lastDeletedUserId() {
      return state.lastDeletedUserId;
    },
    get auditInsertCallCount() {
      return state.auditInsertCallCount;
    },
    get lastAuditInsert() {
      return state.lastAuditInsert;
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

// ---------- (a) 정상 관리자가 다른 회원을 삭제 → 성공 + 감사로그 정확히 기록 ----------
Deno.test("관리자가 다른 회원 계정 삭제를 요청하면 성공하고 그 대상 id로 deleteUser가 정확히 1회 호출된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true, targetName: "홍길동" });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(ctx.deleteCallCount, 1);
  assertEquals(ctx.lastDeletedUserId, "target-uuid-9");
});

Deno.test("삭제 성공 시 감사로그(actor_id/target_id/target_name)가 정확히 1회 insert된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true, targetName: "홍길동" });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  assertEquals(ctx.auditInsertCallCount, 1);
  assertEquals(ctx.lastAuditInsert, {
    actor_id: "admin-uuid-1",
    target_id: "target-uuid-9",
    target_name: "홍길동",
  });
});

Deno.test("대상 이름 조회가 실패해도(예: 이미 지워진 프로필) 삭제는 진행되고 target_name은 null로 기록된다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetNameQueryError: { message: "not found" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  assertEquals(ctx.deleteCallCount, 1);
  assertEquals(ctx.auditInsertCallCount, 1);
  assertEquals(ctx.lastAuditInsert?.target_name, null);
});

// ---------- (fail-open) 감사로그 insert 실패/예외가 삭제 성공 응답을 흔들지 않는다 ----------
Deno.test("감사로그 insert가 실패해도(fail-open) 삭제는 이미 완료됐으므로 응답은 success:true를 유지한다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    auditError: { message: "insert denied" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(ctx.deleteCallCount, 1);
  assertEquals(ctx.auditInsertCallCount, 1);
});

Deno.test("감사로그 insert 중 예외가 발생해도(fail-open) 응답은 success:true를 유지한다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    auditThrows: true,
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(ctx.deleteCallCount, 1);
});

// ---------- (b) 로그인했지만 is_admin=false인 일반 회원이 호출 → 거부, 삭제·감사로그 모두 미도달 ----------
Deno.test("일반 회원(is_admin=false)이 호출하면 403으로 거부되고 deleteUser·감사로그 모두 호출되지 않는다", async () => {
  const ctx = makeCtx({ userId: "member-uuid-2", isAdmin: false });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.success, undefined);
  assertEquals(typeof json.error, "string");
  assertEquals(ctx.deleteCallCount, 0);
  assertEquals(ctx.auditInsertCallCount, 0);
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
Deno.test("관리자가 자기 자신의 userId로 호출하면 서버가 거부하고 deleteUser·감사로그 모두 호출되지 않는다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true });
  const res = await handleRequest(makeReq({ userId: "admin-uuid-1" }), ctx);
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.success, undefined);
  assertEquals(typeof json.error, "string");
  assertEquals(ctx.deleteCallCount, 0);
  assertEquals(ctx.auditInsertCallCount, 0);
});

// ---------- Admin API 실패 처리 ----------
Deno.test("auth.admin.deleteUser가 실패하면 500과 일반화된 에러 메시지를 반환하고(상세 메시지 비노출) 감사로그도 남기지 않는다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    deleteError: { message: "user not found in internal system XYZ-123" },
  });
  const res = await handleRequest(makeReq({ userId: "nonexistent-uuid" }), ctx);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.success, undefined);
  // ★상세 내부 에러 메시지가 클라이언트 응답에 그대로 노출되면 안 된다(reviewer-codex 지적).
  assertEquals(typeof json.error, "string");
  assertEquals(json.error.includes("XYZ-123"), false);
  assertStringIncludes(json.error, "다시 시도");
  // 삭제 자체가 실패했으므로 감사로그(성공 이벤트 기록)는 남기지 않는다.
  assertEquals(ctx.auditInsertCallCount, 0);
});
