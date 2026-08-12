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

-- ★일회성 데이터 정정 이력(reviewer-codex 3차 검토 지적, 2026-08-12): 위 `add column ... default
-- 'pending'`은 이미 존재하던 행에도 기본값 'pending'을 채워 넣는다 — 이 컬럼이 생기기 전(최초
-- 설계)에는 삭제가 "성공했을 때만" 행을 insert했으므로, 그 시절 행들은 전부 실제로는 성공한
-- 삭제였는데도 'pending'으로 잘못 표시되는 문제가 있었다. 이 파일을 최초로 라이브에 적용한
-- 직후, 그 시점까지 존재하던 단 1개 행(id=5a39d4f5-728d-434c-848d-cb7bbe12ecba)을 수동으로
-- status='success'로 1회성 정정했다(그 삭제가 실제로 성공했음을 배포 당시 evidence로 이미
-- 확인해뒀던 건). 이 파일 자체에는 반복 실행 가능한 backfill을 넣지 않는다 — "status='pending'
-- 인 행을 전부 success로 바꾼다"는 조건은 재실행 시 진짜(현재 진행 중이거나 update가 막힌)
-- pending 행까지 잘못 success로 덮어써버리므로 위험하다. 신규 설치(빈 테이블)에는 애초에 이
-- 문제가 발생하지 않는다.
--
-- ★운영 절차(reviewer-codex 지적 — 장기간 pending으로 남은 행 조사법 · 2026-08-12 문구 정정):
-- status='pending'인 행이 오래 남아있다면(정상 흐름은 수 초 내 success/failed로 update됨) 결과가
-- "미확정"이라는 뜻이다 — ★"삭제 시도는 이미 확정됐고 기록만 안 됐다"고 단정하면 안 된다
-- (reviewer-codex 재지적, 최초 버전 문구가 부정확했음): pending insert가 성공한 뒤 deleteUser를
-- 호출하기 *전에* 함수 인스턴스가 중단(타임아웃·크래시·재배포 등)되면 deleteUser 자체가 아예
-- 호출되지 않아 삭제가 전혀 시도되지 않았을 수도 있고, 반대로 deleteUser는 이미 끝났는데(성공
-- 또는 실패) 그 다음 update만 실패했을 수도 있다 — 이 표만 봐서는 둘을 구분할 수 없다.
-- 그러니 실제 상태는 반드시 target_id로 auth.users를 직접 조회해 확인한다: 그 id가 더 이상
-- 존재하지 않으면 삭제가 실제로 일어난 것이고(수동으로 status='success'로 고칠 수 있다), 여전히
-- 존재하면 삭제가 시도되지 않았거나 실패한 것이다(같은 시각의 Supabase Edge Function 로그의
-- console.error로 어느 쪽인지 추가 확인).
