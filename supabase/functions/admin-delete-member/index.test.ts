// index.ts의 handleRequest를 가짜(mock) ctx로 직접 호출해 실제 실행 검증한다.
// ★JWT 자체의 검증(서명 확인·만료 확인 등)은 배포된 플랫폼이 handler 실행 전에 수행하는
// 별도 레이어라(공식문서: "the platform validates the JWT before your handler runs")
// 로컬에서 배포 없이는 그 레이어까지 재현할 수 없다 — 이 테스트는 "이미 검증된 사용자가
// 관리자 권한을 실제로 갖고 있는지, 자기 자신을 지우려는 건 아닌지, 그리고 감사로그가
// pending→success/failed 순서로 정확히 남는지(혹은 pending insert 자체가 실패하면 삭제를
// 아예 진행하지 않는지)"부터의 서버측 로직을 검증 대상으로 삼는다.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleRequest, type HandlerCtx } from "./index.ts";

interface AuditRow {
  id: string;
  actor_id: string;
  target_id: string;
  target_name: string | null;
  status: string;
  error_message?: string | null;
}

function makeCtx(opts: {
  userId: string | null;
  isAdmin: boolean | null;
  profileQueryError?: { message: string } | null;
  targetName?: string | null;
  targetNameQueryError?: { message: string } | null;
  deleteError?: { message: string } | null;
  auditInsertError?: { message: string } | null;
  auditUpdateError?: { message: string } | null;
}): HandlerCtx & {
  deleteCallCount: number;
  lastDeletedUserId: string | null;
  auditInsertCallCount: number;
  auditUpdateCallCount: number;
  auditRows: AuditRow[];
} {
  const state = {
    deleteCallCount: 0,
    lastDeletedUserId: null as string | null,
    auditInsertCallCount: 0,
    auditUpdateCallCount: 0,
    auditRows: [] as AuditRow[],
    nextAuditId: 1,
  };

  const ctx: HandlerCtx & {
    deleteCallCount: number;
    lastDeletedUserId: string | null;
    auditInsertCallCount: number;
    auditUpdateCallCount: number;
    auditRows: AuditRow[];
  } = {
    userClaims: opts.userId ? { id: opts.userId } : null,
    supabase: {
      from: (table: string) => {
        if (table !== "profiles") throw new Error(`예상치 못한 테이블 조회(ctx.supabase): ${table}`);
        return {
          select: (cols: string) => ({
            eq: (col: string, val: string) => ({
              single: async () => {
                if (cols !== "is_admin") throw new Error(`예상치 못한 select 컬럼(ctx.supabase): ${cols}`);
                // 호출자 본인 관리자여부 조회 — 반드시 호출자 자신의 id로만 조회해야 한다
                // (다른 사람의 is_admin을 훔쳐볼 수 있으면 심각한 취약점이므로 목으로도 강제한다).
                if (col !== "id" || val !== opts.userId) {
                  throw new Error("호출자 id가 아닌 다른 id로 is_admin 조회 시도됨(위험)");
                }
                if (opts.profileQueryError) return { data: null, error: opts.profileQueryError };
                if (opts.isAdmin === null) return { data: null, error: null }; // 프로필 없음
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
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: (cols: string) => ({
              eq: (_col: string, _val: string) => ({
                single: async () => {
                  if (cols !== "name") throw new Error(`예상치 못한 select 컬럼(profiles/admin): ${cols}`);
                  if (opts.targetNameQueryError) return { data: null, error: opts.targetNameQueryError };
                  return { data: { name: opts.targetName ?? null }, error: null };
                },
              }),
            }),
          };
        }
        if (table === "admin_delete_audit_log") {
          return {
            insert: (row: Record<string, unknown>) => ({
              select: (_cols: string) => ({
                single: async () => {
                  state.auditInsertCallCount++;
                  if (opts.auditInsertError) return { data: null, error: opts.auditInsertError };
                  const id = `audit-row-${state.nextAuditId++}`;
                  const stored: AuditRow = {
                    id,
                    actor_id: row.actor_id as string,
                    target_id: row.target_id as string,
                    target_name: (row.target_name as string) ?? null,
                    status: row.status as string,
                  };
                  state.auditRows.push(stored);
                  return { data: { id }, error: null };
                },
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: async (_col: string, val: string) => {
                state.auditUpdateCallCount++;
                if (opts.auditUpdateError) return { error: opts.auditUpdateError };
                const row = state.auditRows.find((r) => r.id === val);
                if (row) {
                  row.status = patch.status as string;
                  if ("error_message" in patch) row.error_message = patch.error_message as string;
                }
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`예상치 못한 테이블 조회(supabaseAdmin): ${table}`);
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
    get auditUpdateCallCount() {
      return state.auditUpdateCallCount;
    },
    get auditRows() {
      return state.auditRows;
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

// ---------- (a) 정상 관리자가 다른 회원을 삭제 → 성공 + 감사로그 pending→success ----------
Deno.test("관리자가 다른 회원 계정 삭제를 요청하면 성공하고 deleteUser가 정확히 1회 호출된다", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true, targetName: "홍길동" });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(ctx.deleteCallCount, 1);
  assertEquals(ctx.lastDeletedUserId, "target-uuid-9");
});

Deno.test("삭제 성공 시 감사로그가 pending으로 먼저 insert된 뒤 success로 update된다(actor/target/name 정확)", async () => {
  const ctx = makeCtx({ userId: "admin-uuid-1", isAdmin: true, targetName: "홍길동" });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  assertEquals(ctx.auditInsertCallCount, 1);
  assertEquals(ctx.auditUpdateCallCount, 1);
  assertEquals(ctx.auditRows.length, 1);
  assertEquals(ctx.auditRows[0].actor_id, "admin-uuid-1");
  assertEquals(ctx.auditRows[0].target_id, "target-uuid-9");
  assertEquals(ctx.auditRows[0].target_name, "홍길동");
  assertEquals(ctx.auditRows[0].status, "success");
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
  assertEquals(ctx.auditRows[0].target_name, null);
});

// ---------- (핵심) 감사로그 pending insert 실패 시 삭제 자체를 진행하지 않는다(fail-closed) ----------
Deno.test("감사로그 pending insert가 실패하면 삭제를 아예 시도하지 않고(fail-closed) 500을 반환한다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    auditInsertError: { message: "insert denied" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.success, undefined);
  // "감사행 없는 영구삭제"가 구조적으로 불가능해야 한다 — deleteUser가 아예 호출되지 않는다.
  assertEquals(ctx.deleteCallCount, 0);
});

// ---------- 삭제 실패 시 감사로그가 failed로 update된다 ----------
Deno.test("deleteUser가 실패하면 감사로그가 failed로 update되고(error_message 포함) 클라이언트에는 일반화된 메시지만 간다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    deleteError: { message: "internal detail XYZ-123" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.error.includes("XYZ-123"), false);
  assertStringIncludes(json.error, "다시 시도");
  assertEquals(ctx.auditRows[0].status, "failed");
  assertEquals(ctx.auditRows[0].error_message, "internal detail XYZ-123");
  // pending insert는 됐었으니 1회, 그 뒤 failed로 update도 1회.
  assertEquals(ctx.auditInsertCallCount, 1);
  assertEquals(ctx.auditUpdateCallCount, 1);
});

// ---------- (fail-open) 결과 update 실패/예외가 이미 확정된 삭제 결과 응답을 흔들지 않는다 ----------
Deno.test("성공 후 감사로그 update가 실패해도(fail-open) 삭제는 이미 완료됐으므로 응답은 success:true를 유지한다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    auditUpdateError: { message: "update denied" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(ctx.deleteCallCount, 1);
  // update는 시도됐지만(실패) pending 행 자체는 이미 insert돼 있었다.
  assertEquals(ctx.auditRows[0].status, "pending");
});

Deno.test("실패 후 감사로그 update가 실패해도(fail-open) 클라이언트 응답(500·일반화 메시지)은 그대로다", async () => {
  const ctx = makeCtx({
    userId: "admin-uuid-1",
    isAdmin: true,
    targetName: "홍길동",
    deleteError: { message: "delete boom" },
    auditUpdateError: { message: "update denied too" },
  });
  const res = await handleRequest(makeReq({ userId: "target-uuid-9" }), ctx);
  assertEquals(res.status, 500);
  const json = await res.json();
  assertEquals(json.error.includes("delete boom"), false);
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
