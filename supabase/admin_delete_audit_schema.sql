-- 회원 계정 삭제(admin-delete-member) 감사 로그 — Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- reviewer-codex 보안검토 REVISE 반영(2026-08-12): 계정 영구삭제는 되돌릴 수 없는데
-- 누가/누구를/언제 지웠는지 기록이 없으면 오삭제나 탈취된 관리자 세션 악용을 사후에
-- 추적할 방법이 없다. 대상 계정(profiles 행)은 삭제 시점에 함께 사라지므로 target_name은
-- 그 시점의 값을 여기에 보존해둔다(삭제 후에는 profiles에서 더 이상 조회 불가).
--
-- ★2차 REVISE 반영(오너 승인 A안, 2026-08-12): 최초 설계(삭제 성공 후에만 insert)는
-- reviewer-codex가 "insert 자체가 실패하면 감사행 없는 영구삭제가 가능하다"고 재지적해
-- 오너 확인 후 더 견고한 방식으로 교체했다 — status 컬럼을 추가해 실제 삭제를 시도하기
-- *전에* status='pending'으로 먼저 insert하고, 결과가 나오면 그 행을 update한다(신규
-- insert 아님). 이러면 최초 pending insert 자체가 실패하는 경우에만 삭제를 아예 진행하지
-- 않도록 index.ts에서 막아서, "삭제는 됐는데 기록이 아예 없는" 상황이 구조적으로 불가능해진다.

create table if not exists admin_delete_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_id uuid not null,
  target_name text,
  created_at timestamptz not null default now()
);

-- 이미 만들어진 라이브 테이블(최초 설계 버전)에 status/error_message를 추가한다
-- (create table if not exists는 기존 테이블엔 컬럼을 추가해주지 않으므로 별도 alter 필요).
alter table admin_delete_audit_log add column if not exists status text not null default 'pending';
alter table admin_delete_audit_log add column if not exists error_message text;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_delete_audit_log_status_check'
  ) then
    alter table admin_delete_audit_log
      add constraint admin_delete_audit_log_status_check check (status in ('pending', 'success', 'failed'));
  end if;
end $$;

alter table admin_delete_audit_log enable row level security;

-- 조회는 관리자만(사후 추적 목적). 쓰기는 client-side 정책을 아예 만들지 않는다 —
-- supabase/functions/admin-delete-member/index.ts가 ctx.supabaseAdmin(service_role, RLS 우회)
-- 으로만 insert/update하므로, 클라이언트가 REST로 직접 이 표를 조작(위조·삭제)할 길이 없다.
drop policy if exists "admin_delete_audit_log admin select" on admin_delete_audit_log;
create policy "admin_delete_audit_log admin select" on admin_delete_audit_log
  for select using (is_admin());
