// 재적관리(성도 정보) CRUD — cell_groups / members / family_relations / prayer_requests
// 전부 RLS로 is_pastoral_admin_user()만 접근 가능하도록 DB에서 강제되어 있다(supabase/pastoral_schema.sql).

async function fetchCellGroups() {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("cell_groups").select("*").order("group_no", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchMembers({ search, cellGroupId } = {}) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let q = sb.from("members").select("*, cell_groups(id, name, group_no)").order("name", { ascending: true });
  if (search) q = q.ilike("name", `%${search}%`);
  if (cellGroupId) q = q.eq("cell_group_id", cellGroupId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchMemberById(id) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.from("members").select("*, cell_groups(id, name, group_no)").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function createMember(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("members").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateMember(id, payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("members").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function deleteMember(id) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("members").delete().eq("id", id);
  if (error) throw error;
}

// 이번 주 생일자 등 배너용 — 소량 데이터라 필요한 필드만 한 번에 불러와 클라이언트에서 계산한다
async function fetchAllMembersForBanner() {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("members")
    .select("id, name, position, birth_month, birth_day, is_lunar, phone")
    .not("birth_month", "is", null)
    .not("birth_day", "is", null);
  if (error) throw error;
  return data || [];
}

async function fetchFamilyRelations(memberId) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("family_relations").select("*").eq("member_id", memberId);
  if (error) throw error;
  const relatedIds = data.map(r => r.related_member_id);
  if (relatedIds.length === 0) return [];
  const { data: relatedMembers, error: mErr } = await sb.from("members").select("id, name, position").in("id", relatedIds);
  if (mErr) throw mErr;
  const byId = Object.fromEntries(relatedMembers.map(m => [m.id, m]));
  return data.map(r => ({ ...r, related_member: byId[r.related_member_id] || null }));
}

// 같은 주소를 쓰는 다른 성도들 — 가족관계 후보 추천에 사용 (본인 제외)
async function fetchMembersByAddress(address, excludeId) {
  const sb = getSupabaseClient();
  if (!sb || !address) return [];
  const { data, error } = await sb.from("members")
    .select("id, name, position, gender, birth_year")
    .eq("address", address)
    .neq("id", excludeId);
  if (error) throw error;
  return data || [];
}

async function addFamilyRelation({ memberId, relatedMemberId, relationType, note }) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("family_relations")
    .insert({ member_id: memberId, related_member_id: relatedMemberId, relation_type: relationType, note: note || null })
    .select().single();
  if (error) throw error;
  return data;
}

async function deleteFamilyRelation(id) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("family_relations").delete().eq("id", id);
  if (error) throw error;
}

// 양방향으로 만들어둔 관계는 반대쪽(상대방→나) 행도 함께 지워야 정보가 어긋나지 않는다
async function deleteFamilyRelationPair(memberId, relatedMemberId) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("family_relations").delete()
    .eq("member_id", relatedMemberId).eq("related_member_id", memberId);
  if (error) throw error;
}

async function fetchPrayerRequests(memberId) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("prayer_requests").select("*").eq("member_id", memberId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchRecentPrayingRequests(limit = 8) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("prayer_requests")
    .select("*, members(id, name)")
    .eq("status", "praying")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function addPrayerRequest({ memberId, content }) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("prayer_requests").insert({ member_id: memberId, content }).select().single();
  if (error) throw error;
  return data;
}

async function setPrayerRequestStatus(id, status) {
  const sb = requireSupabaseClient();
  const payload = { status };
  if (status === "answered") payload.resolved_at = new Date().toISOString();
  else payload.resolved_at = null;
  const { data, error } = await sb.from("prayer_requests").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function deletePrayerRequest(id) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("prayer_requests").delete().eq("id", id);
  if (error) throw error;
}

// ── 출석 체크 ──
async function fetchAttendanceByDate(serviceDate) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("attendance").select("*").eq("service_date", serviceDate);
  if (error) throw error;
  return data || [];
}

// 체크박스 토글마다 바로 호출 — 같은 (member_id, service_date)면 덮어쓴다
async function setAttendance({ memberId, serviceDate, present }) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("attendance")
    .upsert({ member_id: memberId, service_date: serviceDate, present }, { onConflict: "member_id,service_date" })
    .select().single();
  if (error) throw error;
  return data;
}

async function fetchAttendanceHistory(memberId, limit = 12) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("attendance").select("*")
    .eq("member_id", memberId)
    .order("service_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
