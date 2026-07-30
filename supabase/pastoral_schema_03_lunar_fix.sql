-- 증분 마이그레이션: 음력 표시 추가 + 잘못 들어간 성별 데이터 정정
-- 배경: 원본 주소록의 생년월일 뒤 (+)/(-) 기호는 성별이 아니라 양력/음력 표시였음.
--       (-) = 음력, (+) = 양력. 지난 시드 작업에서 이를 성별(M/F)로 잘못 해석해 저장했었음.

alter table members add column if not exists is_lunar boolean not null default false;

-- gender='F'였던 행 = 원본에 (-) 표시가 있던 행 = 실제로는 음력
update members set is_lunar = true where gender = 'F';

-- 성별 데이터는 신뢰할 수 없으므로 전부 비움 (필요하면 성도 상세 화면에서 목회자가 직접 입력)
update members set gender = null;
