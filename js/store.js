// 데이터 저장소 (서버 연결 버전: Supabase)
// 모든 기록은 서버에 있고, 서버의 함수가 권한을 직접 확인합니다 (서버/schema.sql).
// 여기에는 공개해도 되는 주소와 공개 키만 들어 있습니다.
const Store = (() => {
  const URL_ = SERVER.url, KEY = SERVER.key;
  const AUTH = "qdp-auth", ADMIN = "qdp-admin", NOTE = "qdp-login-note";

  const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
               del: k => { try { localStorage.removeItem(k); } catch {} } };
  const ss = { get: k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
               set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
               del: k => { try { sessionStorage.removeItem(k); } catch {} } };
  const fail = (code, msg, scope) => { const e = new Error(msg); e.code = code; if (scope) e.scope = scope; throw e; };

  // ---------- 학생 로그인 세션 (Supabase Auth) ----------
  const saveSession = d => ls.set(AUTH, { access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at ? +d.expires_at : Math.floor(Date.now() / 1000) + (+d.expires_in || 3600) });

  // 구글 로그인에서 돌아오면 주소에 토큰이 붙어 옴 → 저장하고 주소에서 지움
  (function readRedirect() {
    const h = location.hash || "";
    if (!/[#&](access_token|error)=/.test(h)) return;
    const p = new URLSearchParams(h.replace(/^#/, ""));
    if (p.get("access_token")) { saveSession(Object.fromEntries(p)); ls.del(NOTE); }
    else ls.set(NOTE, "로그인하지 못했어요. 다시 해보세요.");
    let back = "#/";
    try { const s = sessionStorage.getItem("pendingClub"); if (s && /^c\d{2,3}$/.test(s)) { back = "#/s/" + s; sessionStorage.removeItem("pendingClub"); } } catch {}
    history.replaceState(null, "", location.pathname + location.search + back);
  })();

  let refreshing = null;
  async function accessToken() {
    const s = ls.get(AUTH);
    if (!s || !s.access_token) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    if (!refreshing) refreshing = (async () => {
      try {
        const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: "POST",
          headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
        if (r.status === 400 || r.status === 401 || r.status === 403) { ls.del(AUTH); return null; }
        if (!r.ok) return s.access_token;
        const d = await r.json(); saveSession(d); return d.access_token;
      } catch { return s.access_token; } finally { setTimeout(() => { refreshing = null; }, 0); }
    })();
    return refreshing;
  }

  // ---------- 서버 함수 부르기 ----------
  async function rpc(fn, args = {}, auth = false) {
    const headers = { apikey: KEY, "Content-Type": "application/json" };
    if (auth) {
      const t = await accessToken();
      if (!t) fail("denied", "로그인이 필요해요.", "student");
      headers.Authorization = "Bearer " + t;
    }
    let r;
    try { r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) }); }
    catch { fail("network", "인터넷 연결이 불안정해요. 잠시 뒤 다시 해보세요."); }
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      const m = (data && data.message) || "";
      const d = /^denied:(\w+):(.*)$/.exec(m);
      if (d) { if (d[1] === "admin") ss.del(ADMIN); fail("denied", d[2], d[1]); }
      if (auth && (r.status === 401 || /JWT/i.test(m))) { ls.del(AUTH); fail("denied", "다시 로그인해 주세요.", "student"); }
      if (r.status === 429 || r.status >= 500) fail("network", "지금 접속하는 사람이 많아요. 잠시 뒤 다시 해보세요.");
      console.error(fn, r.status, m);
      fail("server", "문제가 생겼어요. 다시 해보세요.");
    }
    return data;
  }
  const token = () => { const a = ss.get(ADMIN); if (!a || !a.token) fail("denied", "관리자 로그인이 필요해요.", "admin"); return a.token; };
  const adm = (fn, args = {}) => rpc(fn, { p_token: token(), ...args });

  // 자주 바뀌지 않는 목록은 잠깐 기억해서 서버 부담을 줄임
  const cache = {};
  const cached = (k, ms, f) => { const c = cache[k]; if (c && Date.now() - c.t < ms) return c.p; const p = f().catch(e => { delete cache[k]; throw e; }); cache[k] = { t: Date.now(), p }; return p; };
  const clearCache = () => { for (const k in cache) delete cache[k]; };
  const changed = r => { clearCache(); return r; };

  // 학생 정보: 로그인한 뒤 처음 한 번 서버에 등록 (명단에서 이름·동아리 찾음)
  let meCache = null;
  async function ensureStudent() {
    const r = await rpc("student_login", {}, true);
    if (r && r.error) { await logout(); ls.set(NOTE, r.error); return null; }
    return r && r.user;
  }
  async function logout() {
    const s = ls.get(AUTH);
    ls.del(AUTH); meCache = null;
    if (s && s.access_token) { try { await fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.access_token } }); } catch {} }
  }

  // 사진: 서버는 base64 글자로 주고받음
  const b64ToBlob = b64 => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: "image/jpeg" }); };
  const blobToB64 = blob => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.onerror = () => no(fr.error); fr.readAsDataURL(blob); });

  // 학생 이메일: s + 입학년도 2자리 + 학년 1자리 + 반 2자리 + 번호 2자리 @siheung.hs.kr
  const EMAIL_RE = /^s(\d{2})([1-3])(\d{2})(\d{2})@siheung\.hs\.kr$/;
  function parseEmail(email) {
    const m = EMAIL_RE.exec(String(email).trim().toLowerCase());
    if (!m || +m[3] < 1 || +m[4] < 1) return null;
    return { entry: 2000 + +m[1], grade: +m[2], cls: +m[3], num: +m[4], hakbun: m[2] + m[3] + m[4] };
  }

  return {
    parseEmail,
    loginNote() { const n = ls.get(NOTE); ls.del(NOTE); return n; },

    // ===== 학생 쪽 =====
    settings() { return cached("settings", 15e3, () => rpc("get_settings")); },
    clubs() { return cached("clubs", 60e3, () => rpc("get_clubs")).then(l => l.map(c => ({ ...c }))); },
    async club(id) { const c = (await this.clubs()).find(x => x.id === id); return c || null; },
    schedule() { return cached("schedule", 60e3, () => rpc("get_schedule")).then(l => l.map(r => ({ ...r }))); },

    // 구글 학교 계정 로그인: 구글 화면으로 갔다가 이 주소로 돌아옴
    loginGoogle() {
      if (!SERVER.google) return { error: "구글 로그인은 아직 준비 중이에요. 관리자에게 문의하세요." };
      const back = location.origin + location.pathname;
      location.href = `${URL_}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
      return { redirect: true };
    },
    // 외부 방문객: 익명 로그인
    async loginGuest() {
      let r;
      try { r = await fetch(`${URL_}/auth/v1/signup`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" }); }
      catch { fail("network", "인터넷 연결이 불안정해요. 잠시 뒤 다시 해보세요."); }
      if (!r.ok) return { error: r.status === 429 ? "지금 접속하는 사람이 많아요. 잠시 뒤 다시 해보세요." : "게스트로 들어가지 못했어요. 다시 해보세요." };
      saveSession(await r.json());
      const u = await ensureStudent();
      return u ? { user: u } : { error: "게스트로 들어가지 못했어요." };
    },
    async logoutStudent() { await logout(); },
    async me() {
      if (!ls.get(AUTH)) { meCache = null; return null; }
      let u = await rpc("me", {}, true);
      if (!u) u = await ensureStudent();
      meCache = u; return u;
    },
    async addStamp(clubId) { return rpc("add_stamp", { p_club: String(clubId || "").slice(0, 5) }, true); },
    async redeem(pin) { return rpc("redeem", { p_pin: String(pin) }, true); },

    // ===== 관리자 =====
    async adminLogin(pin) {
      const r = await rpc("admin_login", { p_pin: String(pin || "") });
      if (r.error) return r;
      ss.set(ADMIN, { token: r.token, role: r.role });
      return { role: r.role };
    },
    async adminLogout() { const a = ss.get(ADMIN); ss.del(ADMIN); if (a && a.token) { try { await rpc("admin_logout", { p_token: a.token }); } catch {} } },
    async currentAdmin() {
      const a = ss.get(ADMIN);
      if (!a || !a.token) return null;
      const r = await rpc("admin_current", { p_token: a.token });
      if (!r) ss.del(ADMIN);
      return r;
    },
    selectClub: id => adm("select_club", { p_club: id }),
    clubVisitors: id => adm("club_visitors", { p_club: id }),
    clubMembers: id => adm("club_members", { p_club: id }),
    async clubPhotos(id) {
      const l = await cached("photos:" + id, 60e3, () => rpc("club_photos", { p_club: id }));
      return l.map(p => ({ id: p.id, at: p.at, thumb: b64ToBlob(p.thumb) }));
    },
    async photoFull(photoId) { const b = await cached("full:" + photoId, 300e3, () => rpc("photo_full", { p_id: photoId })); return b ? b64ToBlob(b) : null; },
    async addClubPhoto(id, full, thumb) { return changed(await adm("add_club_photo", { p_club: id, p_full: await blobToB64(full), p_thumb: await blobToB64(thumb) })); },
    async deleteClubPhoto(id, photoId) { return changed(await adm("delete_club_photo", { p_club: id, p_id: photoId })); },
    async updateClubInfo(id, info) { return changed(await adm("update_club_info", { p_club: id, p_info: info })); },

    // ===== 총괄 =====
    allUsers: () => adm("all_users"),
    findStudent: (input, name) => adm("find_student", { p_input: String(input || ""), p_name: name || null }),
    proxyStamp: (uid, clubId, on) => adm("proxy_stamp", { p_uid: uid, p_club: clubId, p_on: !!on }),
    proxyReward: uid => adm("proxy_reward", { p_uid: uid }),
    unlockStudentPin: uid => adm("unlock_student_pin", { p_uid: uid }),
    exportRows: () => adm("export_rows"),
    async updateRequired(n) { return changed(await adm("update_required", { p_n: parseInt(n, 10) || 0 })); },
    async setFestival(date, forceOpen) { return changed(await adm("set_festival", { p_date: String(date || ""), p_force: !!forceOpen })); },
    async addClub(name, loc, floor) { return changed(await adm("add_club", { p_name: name, p_loc: loc, p_floor: floor })); },
    async removeClub(id) { return changed(await adm("remove_club", { p_id: id })); },
    async setSchedule(list) { return changed(await adm("set_schedule", { p_list: list })); },
    logs: () => adm("get_logs"),
    rosterCount: () => adm("roster_count"),
    liveStats: () => adm("live_stats"),
    resetProgress: pin => adm("reset_progress", { p_pin: String(pin || "") }),
    uploadRoster: rows => adm("upload_roster", { p_rows: rows }),
    rosterAddOne: (hakbun, name, club) => adm("roster_add_one", { p_hakbun: String(hakbun || ""), p_name: String(name || ""), p_club: String(club || "") }),
    wipeStudents: (pin, withRoster) => adm("wipe_students", { p_pin: String(pin || ""), p_with_roster: !!withRoster }),
    async wipeEverything(pin) { const r = await adm("wipe_everything", { p_pin: String(pin || "") }); if (r.ok) { ss.del(ADMIN); clearCache(); } return r; }
  };
})();
