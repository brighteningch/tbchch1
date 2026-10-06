-- 문화강좌 신청 — 부분 참석(주차 선택) 지원. Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- 기존 culture_class_signups 테이블에 weeks 컬럼만 추가한다(1=1주차, 2=2주차 ... 콘텐츠의
-- 주차 순서와 1:1 대응하는 정수 배열). 기존 신청(이 컬럼 추가 전 접수분)은 빈 배열로 남아
-- "주차 미지정(기존 신청)"으로 관리자 화면에 별도 표시한다 — 임의로 "전체 참석"을 추정해
-- 끼워넣지 않는다(환각0 원칙).

alter table culture_class_signups
  add column if not exists weeks smallint[] not null default '{}';
