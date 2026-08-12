// 관리자가 UI에서 직접 조절하는 전역 설정값 저장소 (app_settings 키-값 테이블).
// content/site.json은 정적 파일이라 비개발자인 오너가 직접 편집하기 어려워 이 용도로는
// 부적합하다고 판단해 Supabase 테이블 기반 최소 key-value 설정소를 신설했다
// (매거진 featured 자동전환 간격이 첫 사용처 — 다른 화면의 향후 전역 설정에도 재사용 가능).

async function fetchAppSetting(key) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

async function upsertAppSetting(key, value) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}
