-- 회원 계정 삭제(admin-delete-member) 감사 로그 — Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- reviewer-codex 보안검토 REVISE 반영(2026-08-12): 계정 영구삭제는 되돌릴 수 없는데
-- 누가/누구를/언제 지웠는지 기록이 없으면 오삭제나 탈취된 관리자 세션 악용을 사후에
-- 추적할 방법이 없다. 대상 계정(profiles 행)은 삭제 시점에 함께 사라지므로 target_name은
-- 그 시점의 값을 여기에 보존해둔다(삭제 후에는 profiles에서 더 이상 조회 불가).

create table if not exists admin_delete_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_id uuid not null,
  target_name text,
  created_at timestamptz not null default now()
);

alter table admin_delete_audit_log enable row level security;

-- 조회는 관리자만(사후 추적 목적). 쓰기는 client-side 정책을 아예 만들지 않는다 —
-- supabase/functions/admin-delete-member/index.ts가 ctx.supabaseAdmin(service_role, RLS 우회)
-- 으로만 insert하므로, 클라이언트가 REST로 직접 이 표를 조작(위조·삭제)할 길이 없다.
drop policy if exists "admin_delete_audit_log admin select" on admin_delete_audit_log;
create policy "admin_delete_audit_log admin select" on admin_delete_audit_log
  for select using (is_admin());
