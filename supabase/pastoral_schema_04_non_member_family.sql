-- 증분 마이그레이션: 비성도(전도대상자) 가족을 등록할 수 있게 플래그 추가
-- 배경: 성도의 자녀·손주 등 아직 교회에 다니지 않는 가족도 가족관계에 남겨서
--       확인·기도할 수 있게 해달라는 요청. members 테이블 하나를 그대로 재사용하되
--       실제 등록 성도와 구분되도록 is_church_member 플래그만 추가한다.

alter table members add column if not exists is_church_member boolean not null default true;

comment on column members.is_church_member is
  '실제 등록된 성도면 true. 성도 가족(자녀/손주 등)이지만 아직 교회에 다니지 않는
   전도대상자로 가족관계에만 남겨둔 경우 false — 출석체크 목록에서는 제외되고
   성도 목록·생일알림에는 "비성도" 표시와 함께 그대로 노출된다.';
