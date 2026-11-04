"use strict";
const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"'`]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const $ = id => document.getElementById(id);
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const fmtTime = t => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const fmtDate = t => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const baseUrl = () => location.href.split("#")[0];
const clubUrl = id => baseUrl() + "#/s/" + id;
const who = u => u.guest ? "게스트" : `${u.grade}학년 ${u.cls}반 ${u.num}번`;
const fmtDay = d => { if (!d) return ""; const [y, m, dd] = d.split("-").map(Number); return `${m}월 ${dd}일 (${"일월화수목금토"[new Date(y, m - 1, dd).getDay()]})`; };
const closedText = s => s.festivalDate ? `스탬프와 보상은 축제 날인 ${fmtDay(s.festivalDate)}에만 할 수 있어요.` : "스탬프와 보상은 축제 날에만 할 수 있어요. (축제 날짜가 아직 정해지지 않았어요)";
// 앱 안 브라우저(카카오톡 등)에서는 구글이 로그인을 막음 → 카카오톡·라인은 바깥 브라우저로 자동으로 다시 열고, 나머지는 안내
const UA = navigator.userAgent || "";
const IN_APP = /KAKAOTALK/i.test(UA) ? "kakao" : /\bLine\//i.test(UA) ? "line"
  : /NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|DaumApps|everytimeApp/i.test(UA) || /; wv\)/.test(UA) ? "other" : "";
function openOutside() {
  const here = location.href;
  if (IN_APP === "kakao") location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(here);
  else if (IN_APP === "line") location.href = here.replace(/#.*$/, "") + (here.includes("?") ? "&" : "?") + "openExternalBrowser=1" + location.hash;
}
const inAppNotice = () => IN_APP ? `<div class="notice warn-bg inapp"><b>이 화면은 ${IN_APP === "kakao" ? "카카오톡" : IN_APP === "line" ? "라인" : "앱"} 안의 브라우저예요.</b><br>여기서는 구글 로그인이 막혀요. 오른쪽 위(또는 아래) <b>⋮ 메뉴 → "다른 브라우저로 열기"</b>를 눌러 크롬·사파리로 열어주세요.${IN_APP !== "other" ? `<button class="secondary" id="openOut">바깥 브라우저로 열기</button>` : ""}</div>` : "";
// 일정표: 지금 시각과 비교 (축제 날에만 "지금" 표시)
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// 끝 시각이 없으면 다음 일정 시작까지, 마지막 줄이면 1시간 동안
const addHour = hm => { const [h, m] = hm.split(":").map(Number); return h >= 23 ? "24:00" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
const rowEnd = (list, i) => list[i].e || (list[i + 1] ? list[i + 1].s : addHour(list[i].s));
// 지금 진행 중인 일정들 (겹치는 시간이 있으면 여러 개)
const nowRows = (list, t = nowHM()) => list.map((r, i) => ({ r, i })).filter(({ r, i }) => r.s <= t && t < rowEnd(list, i));
const myTask = (r, me) => me && !me.guest ? (me.grade === 1 ? r.g1 : me.grade === 2 ? r.g2 : "") : "";
// 확인·알림 창 (브라우저 기본 창 대신 화면 안에 띄움: 일부 앱 속 브라우저는 기본 창을 막음)
function dialogBox(msg, withCancel) {
  return new Promise(done => {
    const wrap = document.createElement("div"); wrap.className = "dlg"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
    const box = document.createElement("div"); box.className = "dlg-box";
    const p = document.createElement("p"); p.textContent = msg;
    const row = document.createElement("div"); row.className = "dlg-btns";
    const ok = document.createElement("button"); ok.className = "primary dlg-ok"; ok.textContent = "확인";
    const finish_ = v => { wrap.remove(); document.removeEventListener("keydown", key); done(v); };
    const key = e => { if (e.key === "Escape") finish_(false); };
    ok.addEventListener("click", () => finish_(true));
    if (withCancel) { const no = document.createElement("button"); no.className = "secondary dlg-no"; no.textContent = "취소"; no.addEventListener("click", () => finish_(false)); row.append(no); }
    row.append(ok); box.append(p, row); wrap.append(box); document.body.appendChild(wrap);
    document.addEventListener("keydown", key); ok.focus();
  });
}
const ask = msg => dialogBox(msg, true);
const say = msg => { dialogBox(msg, false); };
// 사진 Blob → 화면 주소. 화면이 바뀔 때마다 이전 주소를 정리해 메모리를 아낌
let blobUrls = [];
const blobUrl = b => { const u = URL.createObjectURL(b); blobUrls.push(u); return u; };
const releaseBlobs = () => { blobUrls.forEach(u => URL.revokeObjectURL(u)); blobUrls = []; };
// 사진 크게 보기
function openLightbox(src, caption) {
  const box = document.createElement("div");
  box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "사진 크게 보기");
  const img = document.createElement("img"); img.src = src; img.alt = caption || "";
  const cap = document.createElement("p"); cap.textContent = caption || "";
  const close = document.createElement("button"); close.className = "lb-close"; close.textContent = "닫기";
  box.append(img, cap, close);
  const done = () => { box.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = e => { if (e.key === "Escape") done(); };
  box._done = done;
  box.addEventListener("click", done); document.addEventListener("keydown", esc_);
  document.body.appendChild(box); close.focus();
}
// 큰 사진은 누를 때만 서버에서 받아옴 (데이터 절약)
async function showFull(p, caption) {
  openLightbox(blobUrl(p.thumb), caption);
  try {
    const full = await Store.photoFull(p.id);
    const img = document.querySelector(".lightbox img");
    if (full && img) img.src = blobUrl(full);
  } catch {}
}
async function photoStrip(clubId, caption) {
  const list = await Store.clubPhotos(clubId);
  if (!list.length) return null;
  const wrap = document.createElement("div"); wrap.className = "photo-strip";
  list.forEach(p => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ph"; b.setAttribute("aria-label", `${caption} 사진 크게 보기`);
    const img = document.createElement("img"); img.src = blobUrl(p.thumb); img.alt = ""; img.loading = "lazy";
    b.appendChild(img); b.addEventListener("click", () => showFull(p, caption));
    wrap.appendChild(b);
  });
  return wrap;
}

// 화면에 그린 뒤: 막대 길이 채우기 (CSP 때문에 style 속성 대신 스크립트로 설정)
function finish(root = $app) {
  root.querySelectorAll("[data-w]").forEach(el => { el.style.width = Math.max(0, Math.min(100, +el.dataset.w)) + "%"; });
}
// 화면 이동 버튼은 data-go로 한 곳에서 처리
document.addEventListener("click", e => {
  const t = e.target.closest("[data-go]");
  if (t) { e.preventDefault(); go(t.dataset.go); }
});
// 버튼 하나에 비동기 작업 걸기: 처리 중에는 다시 못 누르게
function act(id, fn) {
  const b = $(id); if (!b) return;
  b.addEventListener("click", async () => {
    if (b.disabled) return;
    b.disabled = true;
    try { await fn(); } catch (err) { handleError(err); } finally { if (document.body.contains(b)) b.disabled = false; }
  });
}
function onEnter(inputId, buttonId) { const i = $(inputId); if (i) i.addEventListener("keydown", e => { if (e.key === "Enter") $(buttonId)?.click(); }); }
function handleError(err) {
  if (err && err.code === "denied") { say(err.message); go(err.scope === "student" ? "#/" : "#/admin"); }
  else if (err && (err.code === "network" || err.code === "server")) { say(err.message); }
  else { console.error(err); say("문제가 생겼어요. 다시 해보세요."); }
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const parts = (location.hash || "#/").slice(2).split("/");
  const [route, arg, sub] = parts;
  document.body.className = "";
  document.querySelectorAll(".lightbox").forEach(b => b._done ? b._done() : b.remove());
  releaseBlobs();
  try {
    if (route === "admin") return await adminRoute(arg || "stats", sub, seq);
    const me = await Store.me();
    if (seq !== renderSeq) return;
    if (route === "s") return await scan(arg, me);
    if (!me) return await login();
    if (route === "reward") return await reward(me);
    if (route === "list") return await clubList(me);
    if (route === "map") return await schoolMap(me, arg, sub);
    if (route === "schedule") return await schedulePage(me);
    return await board(me);
  } catch (err) { handleError(err); }
}
window.addEventListener("hashchange", render);
// 다른 탭에서 기록이 바뀌면 이 화면도 새로 그림 (입력 중일 때는 방해하지 않음)
window.addEventListener("storage", e => {
  if (e.key && !e.key.startsWith("qdp-")) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (document.querySelector(".lightbox, .keypad, .dlg") || location.hash.startsWith("#/admin/settings")) return;
  render();
});

/* =================== 학생 =================== */
async function login(note, mode = "student") {
  const s = await Store.settings();
  const admin = mode === "admin";
  $app.innerHTML = `
  <section class="card center">
    <div class="logo">한울림제</div>
    <h1>동아리 스탬프 투어</h1>
    <p class="muted">부스 QR을 찍어 스탬프 ${s.required}개를 모으면 보상을 받아요.</p>
    <div class="seg login-seg" role="tablist">
      <button role="tab" aria-selected="${!admin}" class="${admin ? "" : "on"}" data-go="#/">학생</button>
      <button role="tab" aria-selected="${admin}" class="${admin ? "on" : ""}" data-go="#/admin">관리자</button>
    </div>
    ${note ? `<p class="notice">${esc(note)}</p>` : ""}
    ${admin ? `
    <div class="login-box">
      <b>관리자 로그인</b>
      <p class="muted small">동아리 관리자 핀 또는 총괄 관리자 핀(숫자 8자리)을 넣어주세요.</p>
      <input id="apin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="핀 8자리" aria-label="관리자 핀 8자리">
      <p id="err" class="error" role="alert"></p>
      <button class="primary" id="aBtn">로그인</button>
      <p class="muted small">5번 틀리면 10분 동안 잠겨요. 30분 동안 아무것도 안 하면 자동으로 로그아웃돼요.</p>
    </div>` : `
    ${inAppNotice()}
    <div class="login-box">
      <b>학생 로그인</b>
      <p class="muted small">학교 구글 계정(s로 시작하는 @siheung.hs.kr)으로 로그인해요. 이름과 동아리는 학번으로 자동으로 찾아요.</p>
      <p id="err" class="error" role="alert"></p>
      <button class="primary" id="loginBtn">학교 구글 계정으로 로그인</button>
    </div>
    <button class="link" id="guestBtn">학교 계정이 없어요 (외부 방문객)</button>`}
    <p class="small"><a class="muted" href="privacy.html">개인정보 처리 안내</a></p>
  </section>`;
  if (admin) {
    const inp = $("apin");
    inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 8); });
    act("aBtn", async () => {
      $("err").textContent = "";
      const r = await Store.adminLogin(inp.value);
      inp.value = "";
      if (r.error) return $("err").textContent = r.error;
      go(r.role === "owner" ? "#/admin/stats" : "#/admin/club");
    });
    onEnter("apin", "aBtn");
    inp.focus();
    return;
  }
  const ln = Store.loginNote(); if (ln) $("err").textContent = ln;
  if ($("openOut")) $("openOut").addEventListener("click", openOutside);
  act("loginBtn", async () => {
    $("err").textContent = "";
    if (IN_APP) { openOutside(); $("err").textContent = "앱 안의 브라우저에서는 구글 로그인이 안 돼요. 위 안내대로 크롬·사파리로 열어주세요."; return; }
    const r = Store.loginGoogle();
    if (r.error) $("err").textContent = r.error;
  });
  act("guestBtn", async () => {
    if (!(await ask("학교 학생은 꼭 학교 구글 계정으로 로그인해 주세요.\n외부 방문객이라면 확인을 눌러주세요."))) return;
    const r = await Store.loginGuest();
    if (r.error) { $("err").textContent = r.error; return; }
    afterLogin();
  });
}
function afterLogin() {
  let pending = null;
  try { pending = sessionStorage.getItem("pendingClub"); sessionStorage.removeItem("pendingClub"); } catch {}
  go(pending && /^c\d{2,3}$/.test(pending) ? "#/s/" + pending : "#/");
}

async function scan(clubId, me) {
  if (!me) { try { sessionStorage.setItem("pendingClub", String(clubId || "").slice(0, 5)); } catch {} return login("로그인하면 바로 스탬프가 찍혀요."); }
  const s = await Store.settings();
  const r = await Store.addStamp(clubId);
  const club = await Store.club(clubId), fresh = await Store.me();
  const count = Object.keys(fresh.stamps).length;
  const view = r === "unknown" ? { t: "없는 QR이에요", d: "부스 담당 학생에게 알려주세요.", c: "bad", m: "×" }
    : r === "closed" ? { t: "아직 스탬프를 찍을 수 없어요", d: closedText(s), c: "warn", m: "!" }
    : r === "already" ? { t: "이미 찍은 동아리예요", d: club.name, c: "warn", m: "!" }
    : { t: "스탬프 획득!", d: club.name, c: "good", m: "✓" };
  $app.innerHTML = `
  <section class="card center stamp-result ${view.c}">
    <div class="big-stamp" aria-hidden="true">${view.m}</div>
    <h1>${esc(view.t)}</h1><p class="${r === "closed" ? "" : "club-name"}">${esc(view.d)}</p>
    <p class="progress-text">${Math.min(count, s.required)} / ${s.required}</p>
    ${count >= s.required && !fresh.rewardAt ? `<button class="primary huge" data-go="#/reward">보상 받기</button>` : ""}
    <button class="${count >= s.required && !fresh.rewardAt ? "secondary" : "primary"}" data-go="#/">내 스탬프판 보기</button>
  </section>`;
  // 새로고침해도 같은 스탬프가 다시 처리되지 않게 주소를 스탬프판으로 바꿔둠
  history.replaceState(null, "", "#/done");
}

async function board(me) {
  const s = await Store.settings(), clubs = await Store.clubs(), sched = await Store.schedule();
  const byId = Object.fromEntries(clubs.map(c => [c.id, c]));
  const isDay = s.festivalDate && s.festivalDate === (s.today || todayStr());
  const cur = isDay ? nowRows(sched) : [];
  const got = Object.entries(me.stamps).sort((a, b) => a[1] - b[1]);
  const count = got.length, done = count >= s.required;
  const cells = Array.from({ length: Math.max(s.required, count) }, (_, i) => {
    const st = got[i], c = st && byId[st[0]];
    return `<div class="cell ${st ? "on" : ""}">${st ? `<span>${esc(c ? c.name : "종료된 부스")}</span>` : i + 1}</div>`;
  }).join("");
  $app.innerHTML = `
  <header class="top"><div><b>${esc(me.name)}</b> <span class="muted small">${esc(who(me))}</span></div>
    <button class="link small" id="logout">로그아웃</button></header>
  ${me.clubName || (!me.guest && me.inRoster) ? `<p class="my-club">내 동아리 <b>${esc(me.clubName ? (me.clubId && byId[me.clubId] ? byId[me.clubId].name : me.clubName) : "없음")}</b>${me.clubName && !(me.clubId && byId[me.clubId]) ? ` <span class="muted small">부스 없음</span>` : ""}</p>` : ""}
  ${cur.length ? `<button type="button" class="now-banner" data-go="#/schedule"><span class="pill now">지금</span> ${cur.map(({ r }) => `<b>${esc(r.t)}</b>${myTask(r, me) ? ` <span class="small">· 나: ${esc(myTask(r, me))}</span>` : ""}`).join("<br>")} <span class="muted small nowrap">일정표 ›</span></button>` : ""}
  ${s.open ? "" : `<p class="notice">${esc(closedText(s))}<br><span class="small">지금은 지도와 동아리 소개를 미리 볼 수 있어요.</span></p>`}
  <section class="card">
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.required}" aria-valuenow="${Math.min(count, s.required)}"><div data-w="${count / s.required * 100}"></div></div>
    <p class="progress-text">${Math.min(count, s.required)} / ${s.required}${count > s.required ? ` <span class="muted small">(총 ${count}개)</span>` : ""}</p>
    <div class="grid">${cells}</div>
    ${me.rewardAt ? `<p class="notice good-bg">보상 받음 · ${fmtTime(me.rewardAt)}</p>` :
      done && s.open ? `<button class="primary huge" data-go="#/reward">보상 받기</button>` :
      `<p class="muted center">부스에 있는 QR을 휴대폰 카메라로 찍으세요.</p>`}
    <div class="three-btn"><button class="secondary" data-go="#/map">지도</button><button class="secondary" data-go="#/list">목록</button><button class="secondary" data-go="#/schedule">일정표</button></div>
  </section>`;
  finish();
  act("logout", async () => { await Store.logoutStudent(); go("#/"); });
}

async function clubList(me) {
  const clubs = await Store.clubs();
  const floors = [...new Set(clubs.map(c => c.floor))].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  $app.innerHTML = `
  <header class="top"><button class="link" data-go="#/">← 스탬프판</button><button class="link small" data-go="#/map">지도로 보기</button></header>
  ${floors.map(f => `<section class="card"><h2>${esc(f)}</h2>
    ${clubs.filter(c => c.floor === f).map(c => { const at = mapPlace(c); return `<${at ? `button type="button" data-go="#/map/${at.floor}/${esc(c.id)}"` : "div"} class="row ${at ? "row-btn" : ""} ${me.stamps[c.id] ? "done" : ""}">
      <span>${me.stamps[c.id] ? "✓ " : ""}${esc(c.name)}${c.intro ? `<span class="intro">${esc(c.intro)}</span>` : ""}</span><span class="muted nowrap">${esc(c.loc)}${at ? " ›" : ""}</span></${at ? "button" : "div"}>`; }).join("")}
  </section>`).join("")}`;
}

/* =================== 지도 =================== */
const FLOORS = ["1층", "2층", "3층", "4층", "5층"];
// 동아리 → 지도 위치 (층, 칸). 지도는 처음 동아리 이름으로 그렸으므로 번호로 원래 이름을 찾아 연결
function mapPlace(club) {
  const name = DEFAULT_NAME_BY_ID[club.id];
  if (!name) return null;
  for (const f of FLOORS) {
    const room = SCHOOL_MAP[f].find(r => r[0] === "b" && r[6].includes(name));
    if (room) return { floor: FLOORS.indexOf(f) + 1, room };
  }
  return null;
}
// 칸 크기에 맞춰 글자 크기를 정하고, 너무 작아지면 두 줄로 나눔
const textWidth = str => [...str].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1 : .6), 0);
function fitLabel(text, w, h, bold) {
  const k = bold ? 1.08 : 1, maxFs = 9;
  if (!text) return { lines: [], fs: 7 };
  const one = Math.min(maxFs, (w - 3) / (textWidth(text) * k), h * .42);
  if (one >= 6.5 || text.length < 4 || h < 18) return { lines: [text], fs: Math.max(4.5, one) };
  const sp = text.indexOf(" "), cut = sp > 0 ? sp : Math.ceil(text.length / 2);
  const lines = [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean);
  const two = Math.min(maxFs, (w - 3) / (Math.max(...lines.map(textWidth)) * k), h * .3);
  return two > one ? { lines, fs: two } : { lines: [text], fs: Math.max(4.5, one) };
}
async function schoolMap(me, floorArg, focusId) {
  const clubs = await Store.clubs();
  const byId = Object.fromEntries(clubs.map(c => [c.id, c]));
  const fi = Math.min(5, Math.max(1, parseInt(floorArg, 10) || 1)), floor = FLOORS[fi - 1];
  const focus = clubs.find(c => c.id === focusId);
  const rooms = SCHOOL_MAP[floor];
  // 지금 있는 동아리만 부스로 표시 (관리자가 삭제한 동아리는 일반 교실로)
  const boothClubs = r => r[0] === "b" ? r[6].map(n => byId[DEFAULT_ID_BY_NAME[n]]).filter(Boolean) : [];
  const floorStat = f => { let all = 0, got = 0; SCHOOL_MAP[f].forEach(r => boothClubs(r).forEach(c => { all++; if (me.stamps[c.id]) got++; })); return { all, got }; };

  // 그림 범위
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  rooms.forEach(r => { x1 = Math.min(x1, r[1]); y1 = Math.min(y1, r[2]); x2 = Math.max(x2, r[3]); y2 = Math.max(y2, r[4]); });
  const pad = 6, vb = `${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}`;

  const badgeText = cl => !cl.length ? "" : cl.every(c => me.stamps[c.id]) ? "✓" : cl.length > 1 ? `${cl.filter(c => me.stamps[c.id]).length}/${cl.length}` : "";
  const cell = (r, i) => {
    const [t, ax, ay, bx, by, name] = r, w = bx - ax, h = by - ay, cx = ax + w / 2, cy = ay + h / 2;
    const cl = boothClubs(r), isBooth = cl.length > 0;
    const done = isBooth && cl.every(c => me.stamps[c.id]), part = isBooth && !done && cl.some(c => me.stamps[c.id]);
    const isFocus = focus && cl.some(c => c.id === focus.id);
    const isMine = cl.some(c => c.id === me.clubId);
    const kind = t === "c" ? "m-corr" : t === "s" ? "m-stair" : t === "w" ? "m-wc" : t === "h" ? "m-hall" : isBooth ? (done ? "m-done" : part ? "m-part" : "m-booth") : "m-room";
    const shown = t === "w" ? (name || "").replace("화장실", "WC") : (name || "");
    const { lines, fs } = fitLabel(shown, w, h, isBooth);
    const top = cy - (lines.length - 1) * fs * .55 - (isBooth && badgeText(cl) ? fs * .45 : 0);
    const label = shown && t !== "c" && t !== "s" ? `<text font-size="${fs.toFixed(1)}">${lines.map((l, k) => `<tspan x="${cx}" y="${(top + k * fs * 1.1).toFixed(1)}">${esc(l)}</tspan>`).join("")}</text>` : "";
    const bt = badgeText(cl);
    const badge = isBooth && bt ? `<text class="m-badge" x="${cx}" y="${(top + lines.length * fs * 1.1 - fs * .15).toFixed(1)}" font-size="${Math.max(6, Math.min(8, fs)).toFixed(1)}">${bt}</text>` : "";
    return `<g class="${kind}${isFocus ? " m-focus" : ""}${isMine ? " m-mine" : ""}" ${isBooth ? `data-room="${i}" tabindex="0" role="button" aria-label="${esc(name)}: ${esc(cl.map(c => c.name).join(", "))}"` : ""}>
      <rect x="${ax}" y="${ay}" width="${w}" height="${h}" rx="${t === "c" ? 0 : 2}"></rect>${t === "s" ? `<path d="M${ax},${by}L${bx},${ay}" class="m-stair-line"></path>` : ""}${label}${badge}</g>`;
  };
  const order = { c: 0, h: 1, s: 1, w: 1, r: 1, b: 2 };
  const drawn = rooms.map((r, i) => [r, i]).sort((a, b) => order[a[0][0]] - order[b[0][0]]);
  const unmapped = clubs.filter(c => !mapPlace(c));

  $app.innerHTML = `
  <header class="top"><button class="link" data-go="#/">← 스탬프판</button><button class="link small" data-go="#/list">목록으로 보기</button></header>
  <nav class="floor-tabs" aria-label="층 선택">${FLOORS.map((f, i) => { const st = floorStat(f); return `<button class="ftab ${i + 1 === fi ? "on" : ""}" data-go="#/map/${i + 1}">${f}${st.all ? `<small>${st.got}/${st.all}</small>` : `<small>부스 없음</small>`}</button>`; }).join("")}</nav>
  <section class="card map-card">
    <svg class="map-svg" viewBox="${vb}" role="img" aria-label="${floor} 지도">${drawn.map(([r, i]) => cell(r, i)).join("")}</svg>
    <div class="legend"><span><i class="lg lg-booth"></i>부스</span><span><i class="lg lg-done"></i>스탬프 완료</span><span><i class="lg lg-part"></i>일부 완료</span>${me.clubId ? `<span><i class="lg lg-mine"></i>내 동아리</span>` : ""}<span><i class="lg lg-wc"></i>화장실</span><span><i class="lg lg-stair"></i>계단</span></div>
  </section>
  <section class="card" id="roomInfo"><p class="muted center small">색칠된 교실을 누르면 동아리가 나와요.</p></section>
  ${unmapped.length ? `<section class="card"><h2>지도에 표시되지 않은 부스</h2>${unmapped.map(c => `<div class="row ${me.stamps[c.id] ? "done" : ""}"><span>${me.stamps[c.id] ? "✓ " : ""}${esc(c.name)}</span><span class="muted">${esc(c.floor)} · ${esc(c.loc)}</span></div>`).join("")}</section>` : ""}`;

  const info = $("roomInfo");
  let selSeq = 0;
  const select = i => {
    const r = rooms[i]; if (!r) return;
    $app.querySelectorAll(".map-svg g.m-sel").forEach(g => g.classList.remove("m-sel"));
    $app.querySelector(`.map-svg g[data-room="${i}"]`)?.classList.add("m-sel");
    const cl = boothClubs(r), seq = ++selSeq;
    info.innerHTML = `<h2>${esc(r[5])} <span class="muted small">${esc(floor)}</span></h2>
      ${cl.map(c => `<div class="club-block"><div class="row ${me.stamps[c.id] ? "done" : ""}"><span>${me.stamps[c.id] ? "✓ " : ""}${esc(c.name)}${c.id === me.clubId ? ` <span class="pill mine">내 동아리</span>` : ""}${c.intro ? `<span class="intro">${esc(c.intro)}</span>` : ""}</span><span class="muted small nowrap">${me.stamps[c.id] ? "스탬프 완료" : "아직 안 찍음"}</span></div><div class="ph-slot" data-club="${esc(c.id)}"></div></div>`).join("")}`;
    cl.forEach(async c => {
      const strip = await photoStrip(c.id, c.name);
      const slot = info.querySelector(`.ph-slot[data-club="${c.id}"]`);
      if (strip && slot && seq === selSeq) slot.appendChild(strip);
    });
  };
  $app.querySelectorAll(".map-svg g[data-room]").forEach(g => {
    g.addEventListener("click", () => select(+g.dataset.room));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(+g.dataset.room); } });
  });
  if (focus) { const at = mapPlace(focus); if (at && at.floor === fi) select(rooms.indexOf(at.room)); }
}

async function schedulePage(me) {
  const s = await Store.settings(), list = await Store.schedule();
  const isDay = s.festivalDate && s.festivalDate === (s.today || todayStr()), t = nowHM();
  const curIdx = new Set(isDay ? nowRows(list, t).map(x => x.i) : []);
  const grade = !me.guest && (me.grade === 1 || me.grade === 2) ? me.grade : 0;
  $app.innerHTML = `
  <header class="top"><button class="link" data-go="#/">← 스탬프판</button><button class="link small" data-go="#/map">지도</button></header>
  <section class="card">
    <h1>축제 일정표</h1>
    <p class="muted small">${s.festivalDate ? esc(fmtDay(s.festivalDate)) : "축제 날짜 미정"}${grade ? ` · ${grade}학년 할 일은 <b>나</b>로 표시돼요` : ""}</p>
    ${!grade && !me.guest && me.grade === 3 ? `<p class="notice small">3학년은 부스 운영과 순회에 참여하지 않아요. 공연 발표회 일정을 확인하세요.</p>` : ""}
    <ol class="sched">${list.map((r, i) => {
      const past = isDay && rowEnd(list, i) <= t, now = curIdx.has(i), mine = grade ? (grade === 1 ? r.g1 : r.g2) : "";
      return `<li class="${now ? "now" : ""} ${past ? "past" : ""}">
        <div class="sc-time">${esc(r.s)}${r.e ? `<span>~${esc(r.e)}</span>` : ""}</div>
        <div class="sc-body"><b>${esc(r.t)}</b>${now ? ` <span class="pill now">지금</span>` : ""}
          ${r.p ? `<span class="sc-place">${esc(r.p)}</span>` : ""}
          ${mine ? `<span class="sc-mine">나: ${esc(mine)}</span>` : ""}
          ${r.n ? `<span class="muted small">${esc(r.n)}</span>` : ""}</div></li>`;
    }).join("")}</ol>
    <p class="muted small">스탬프는 축제 날 하루 종일 찍을 수 있어요. 일정이 바뀌면 이 화면도 바뀌어요.</p>
  </section>`;
}

async function reward(me) {
  const s = await Store.settings();
  if (me.rewardAt) return showResult(me, "already", me.rewardAt);
  if (Object.keys(me.stamps).length < s.required) return go("#/");
  if (!s.open) { $app.innerHTML = `<section class="card center"><h1>보상 받기</h1><p class="notice">${esc(closedText(s))}</p><button class="primary" data-go="#/">스탬프판으로</button></section>`; return; }
  let pin = "", busy = false;
  const draw = (msg) => {
    const locked = me.pinLock > Date.now();
    $app.innerHTML = `
    <section class="card center">
      <p class="muted">학부모님께 이 화면을 보여주세요</p>
      <h1>${esc(me.name)}</h1>
      <p class="muted">${esc(who(me))} · 스탬프 ${Object.keys(me.stamps).length}개</p>
      ${!s.pinSet ? `<p class="notice">아직 학부모 비밀번호가 정해지지 않았어요. 관리자에게 알려주세요.</p>` :
        locked ? `<p class="notice bad-bg">비밀번호를 여러 번 틀려서 잠겼어요.<br>${fmtTime(me.pinLock)} 이후에 다시 해주세요.</p>` : `
      <p class="pin-label">학부모님 확인 비밀번호</p>
      <div class="pin-dots" aria-label="${pin.length}자리 입력됨">${[0, 1, 2, 3].map(i => `<span class="${i < pin.length ? "on" : ""}"></span>`).join("")}</div>
      <p class="error" role="alert">${esc(msg || "")}</p>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map(k => `<button type="button" data-k="${k}" ${k === "" ? "disabled" : ""} aria-label="${k === "⌫" ? "지우기" : k}">${k}</button>`).join("")}</div>`}
      <button class="link" data-go="#/">취소</button>
    </section>`;
    $app.querySelectorAll(".keypad button[data-k]").forEach(b => b.addEventListener("click", async () => {
      if (busy) return;
      const k = b.dataset.k;
      if (k === "⌫") pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      if (pin.length < 4) return draw();
      busy = true;
      const r = await Store.redeem(pin); pin = ""; busy = false;
      me = await Store.me();
      if (r.r === "wrong") return draw(`비밀번호가 틀렸어요 (${r.left}번 남음)`);
      if (r.r === "closed") return go("#/reward");
      if (r.r === "locked" || r.r === "nopin" || r.r === "notyet") return draw();
      showResult(me, r.r, r.at);
    }));
  };
  draw();
}
function showResult(me, r, at) {
  document.body.className = r === "ok" ? "full-good" : "full-bad";
  $app.innerHTML = `
  <section class="result-full" role="status">
    <div class="result-mark" aria-hidden="true">${r === "ok" ? "✓" : "×"}</div>
    <h1>${r === "ok" ? "지급하세요" : "이미 받았어요"}</h1>
    <p>${esc(me.name)} · ${esc(who(me))}</p>
    <p>${r === "ok" ? "수령 처리 완료" : "수령 시각"} ${fmtTime(at)}</p>
    <button class="secondary" data-go="#/">확인</button>
  </section>`;
}

/* =================== 관리자 =================== */
// 총괄: 전체 관리 / 동아리 관리자: 공용 핀으로 로그인 후 동아리를 골라 그 동아리만 관리
async function adminRoute(tab, sub, seq) {
  const me = await Store.currentAdmin();
  if (seq !== renderSeq) return;
  if (!me) return login(null, "admin");
  if (tab === "club") return clubRoute(me, sub, seq);
  if (me.role !== "owner") return go(me.club ? `#/admin/club/${me.club}` : "#/admin/club");
  const tabs = [["stats", "현황"], ["monitor", "서버 상태"], ["club", "동아리별"], ["proxy", "대리 기록"], ["print", "인쇄"], ["settings", "설정"], ["logs", "활동 기록"], ["data", "데이터"]];
  if (!tabs.some(([k]) => k === tab)) tab = "stats";
  document.body.className = "wide";
  $app.innerHTML = `
  ${adminTop("총괄 관리자")}
  <nav class="tabs no-print">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? "on" : ""}" data-go="#/admin/${k}">${l}</button>`).join("")}</nav>
  <div id="tabBody"></div>`;
  bindAdminTop();
  const body = $("tabBody");
  await ({ stats: aStats, monitor: aMonitor, proxy: aProxy, print: aPrint, settings: aSettings, logs: aLogs, data: aData })[tab](body, me, sub);
  finish(body);
}
function adminTop(title, extra = "") {
  return `<header class="admin-top no-print">
    <div><b>${esc(title)}</b></div>
    <div>${extra}<button class="link small" data-go="#/">학생 화면</button><button class="link small" id="aLogout">로그아웃</button></div>
  </header>`;
}
function bindAdminTop() { act("aLogout", async () => { await Store.adminLogout(); go("#/admin"); }); }

// ---------- 동아리별 관리 ----------
async function clubRoute(me, sub, seq) {
  const parts = (location.hash || "").split("/"), clubId = parts[3], view = parts[4] || "stats";
  if (!clubId) return clubPicker(me);
  const r = await Store.selectClub(clubId);
  if (seq !== renderSeq) return;
  if (r.error) return go("#/admin/club");
  const club = await Store.club(clubId);
  const views = [["stats", "방문 현황"], ["members", "부원"], ["photos", "사진"], ["qr", "우리 QR"], ["info", "정보 수정"]];
  const v = views.some(([k]) => k === view) ? view : "stats";
  document.body.className = "wide";
  $app.innerHTML = `
  ${adminTop(me.role === "owner" ? "총괄 관리자" : "동아리 관리자", `<button class="link small" data-go="${me.role === "owner" ? "#/admin/stats" : "#/admin/club"}">${me.role === "owner" ? "전체 관리" : "동아리 바꾸기"}</button>`)}
  <section class="club-head no-print">
    ${me.role === "owner" ? `<button class="link small" data-go="#/admin/club">← 동아리 목록</button>` : ""}
    <h1>${esc(club.name)}</h1><p class="muted">${esc(club.floor)} · ${esc(club.loc)}</p>
  </section>
  <nav class="tabs no-print">${views.map(([k, l]) => `<button class="tab ${k === v ? "on" : ""}" data-go="#/admin/club/${esc(clubId)}/${k}">${l}</button>`).join("")}</nav>
  <div id="tabBody"></div>`;
  bindAdminTop();
  const body = $("tabBody");
  await ({ stats: cStats, members: cMembers, photos: cPhotos, qr: cQr, info: cInfo })[v](body, club, me);
  finish(body);
}

async function clubPicker(me) {
  const clubs = await Store.clubs();
  const floors = [...new Set(clubs.map(c => c.floor))].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  document.body.className = "wide";
  $app.innerHTML = `
  ${adminTop(me.role === "owner" ? "총괄 관리자" : "동아리 관리자", me.role === "owner" ? `<button class="link small" data-go="#/admin/stats">전체 관리</button>` : "")}
  <section class="card">
    <h1>관리할 동아리를 고르세요</h1>
    <input id="cq" placeholder="동아리 이름 검색" autocomplete="off" aria-label="동아리 검색">
    <div id="clist">${floors.map(f => `<div class="pick-floor" data-floor><h2>${esc(f)}</h2><div class="pick-grid">
      ${clubs.filter(c => c.floor === f).map(c => `<button class="pick" data-name="${esc(c.name)}" data-go="#/admin/club/${esc(c.id)}"><b>${esc(c.name)}</b><span>${esc(c.loc)}</span></button>`).join("")}
    </div></div>`).join("")}</div>
    <p id="cnone" class="muted center" hidden>찾는 동아리가 없어요.</p>
  </section>`;
  bindAdminTop();
  const q = $("cq");
  q.addEventListener("input", () => {
    const t = q.value.trim().toLowerCase(); let any = false;
    $app.querySelectorAll(".pick-floor").forEach(fl => {
      let shown = 0;
      fl.querySelectorAll(".pick").forEach(b => { const ok = !t || b.dataset.name.toLowerCase().includes(t); b.hidden = !ok; if (ok) shown++; });
      fl.hidden = !shown; if (shown) any = true;
    });
    $("cnone").hidden = any;
  });
}

async function cStats(el, club) {
  const list = await Store.clubVisitors(club.id);
  const byGrade = [1, 2, 3].map(g => list.filter(v => !v.guest && v.grade === g).length);
  const guests = list.filter(v => v.guest).length;
  const hourly = {};
  list.forEach(v => { const h = new Date(v.at).getHours(); hourly[h] = (hourly[h] || 0) + 1; });
  const hours = Object.keys(hourly).map(Number).sort((a, b) => a - b), hmax = Math.max(1, ...Object.values(hourly));
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><b>${list.length}</b><span>방문(스탬프)</span></div>
    <div class="kpi"><b>${byGrade[0]} · ${byGrade[1]}</b><span>1학년 · 2학년</span></div>
    <div class="kpi"><b>${byGrade[2] + guests}</b><span>3학년·게스트</span></div>
  </div>
  ${hours.length ? `<section class="card"><h2>시간대별</h2>${hours.map(h => `<div class="bar-row"><span>${h}시</span><div class="bar"><div data-w="${hourly[h] / hmax * 100}"></div></div><b>${hourly[h]}</b></div>`).join("")}</section>` : ""}
  <section class="card"><h2>방문한 학생 <span class="muted small">최근 순</span></h2>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>시각</th><th>학생</th><th>이름</th></tr></thead><tbody>
      ${list.map(v => `<tr><td>${fmtTime(v.at)}</td><td>${esc(who(v))}</td><td>${esc(v.name)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">아직 방문한 학생이 없어요.</p>`}
    <button class="secondary" id="refresh">새로고침</button>
  </section>`;
  $("refresh").addEventListener("click", () => render());
}

async function cMembers(el, club) {
  const list = await Store.clubMembers(club.id), s = await Store.settings();
  const logged = list.filter(m => m.loggedIn).length;
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><b>${list.length}</b><span>부원</span></div>
    <div class="kpi"><b>${logged}</b><span>로그인함</span></div>
    <div class="kpi"><b>${list.filter(m => m.stamps >= s.required).length}</b><span>${s.required}개 완료</span></div>
  </div>
  <section class="card"><h2>부원 목록</h2>
    ${list.length ? `<p class="muted small">축제 전에 로그인하지 않은 부원에게 미리 로그인하라고 알려주세요.</p>
    <div class="table-wrap"><table><thead><tr><th>학생</th><th>이름</th><th>로그인</th><th>스탬프</th></tr></thead><tbody>
      ${list.map(m => `<tr><td>${m.grade}학년 ${m.cls}반 ${m.num}번</td><td>${esc(m.name)}</td><td>${m.loggedIn ? "✓" : `<span class="danger-text">안 함</span>`}</td><td>${m.stamps}${m.rewarded ? " · 보상" : ""}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">명단에 이 동아리 부원이 없어요.</p>`}
  </section>`;
}

// 사진은 휴대폰에서 줄여서 올림 (큰 사진 최대 1280px·600KB, 미리보기 360px·80KB). 다시 그리면서 위치 등 사진 속 정보도 지워짐
async function shrinkImage(file, maxSide, maxBytes) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  let side = maxSide, q = .82, blob = null;
  for (let tries = 0; tries < 8; tries++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", q));
    if (blob && blob.size <= maxBytes) break;
    if (q > .55) q -= .1; else side = Math.round(side * .8);
  }
  bmp.close?.();
  return blob;
}
async function cPhotos(el, club) {
  const list = await Store.clubPhotos(club.id);
  const left = 3 - list.length;
  el.innerHTML = `
  <section class="card"><h2>동아리 사진 <span class="muted small">${list.length}/3</span></h2>
    <p class="muted small">올린 사진은 학생 지도에서 우리 동아리를 누르면 보여요. 나중에 동아리 홍보에도 쓰일 예정이에요.</p>
    <p class="notice small">학생 얼굴이 나온 사진은 꼭 본인 동의를 받고 올려주세요.</p>
    <div class="photo-grid" id="pg"></div>
    ${left > 0 ? `<label class="upload-btn">사진 올리기 (${left}장 더 가능)<input type="file" id="pfile" accept="image/*" hidden></label>` : `<p class="muted small">3장을 모두 올렸어요. 바꾸려면 먼저 하나를 지워주세요.</p>`}
    <p id="pmsg" class="muted small" role="status"></p>
  </section>`;
  const grid = $("pg");
  if (!list.length) grid.innerHTML = `<p class="muted">아직 올린 사진이 없어요.</p>`;
  list.forEach(p => {
    const cell = document.createElement("div"); cell.className = "pg-cell";
    const b = document.createElement("button"); b.type = "button"; b.className = "ph"; b.setAttribute("aria-label", "크게 보기");
    const img = document.createElement("img"); img.src = blobUrl(p.thumb); img.alt = "";
    b.appendChild(img); b.addEventListener("click", () => showFull(p, club.name));
    const del = document.createElement("button"); del.type = "button"; del.className = "link small danger-text"; del.textContent = "지우기";
    del.addEventListener("click", async () => {
      if (!(await ask("이 사진을 지울까요?"))) return;
      try { const r = await Store.deleteClubPhoto(club.id, p.id); if (r.error) say(r.error); render(); } catch (e) { handleError(e); }
    });
    cell.append(b, del); grid.appendChild(cell);
  });
  const inp = $("pfile");
  if (inp) inp.addEventListener("change", async () => {
    const f = inp.files && inp.files[0]; inp.value = "";
    if (!f) return;
    const msg = $("pmsg");
    if (!/^image\//.test(f.type) || f.size > 25 * 1024 * 1024) { msg.textContent = "사진 파일(25MB 이하)만 올릴 수 있어요."; return; }
    msg.textContent = "사진을 줄이는 중…";
    try {
      const full = await shrinkImage(f, 1280, 600 * 1024), thumb = await shrinkImage(f, 360, 80 * 1024);
      const r = await Store.addClubPhoto(club.id, full, thumb);
      if (r.error) { msg.textContent = r.error; return; }
      render();
    } catch (e) {
      if (e && e.code === "denied") return handleError(e);
      msg.textContent = "이 사진은 열 수 없어요. 휴대폰 카메라 설정을 'JPG'로 바꾸거나 다른 사진으로 해보세요.";
    }
  });
}

async function cQr(el, club) {
  el.innerHTML = `
  <section class="card center no-print">
    <p class="muted small">QR이 훼손되거나 없어졌을 때 이 화면을 학생에게 바로 보여주거나, 한 장만 다시 인쇄할 수 있어요.</p>
    ${location.protocol === "file:" ? `<p class="notice">지금은 PC 파일로 열려 있어서 이 QR을 휴대폰으로 찍어도 열리지 않아요.</p>` : ""}
  </section>
  <div class="qr-big print-area" id="qrBig"></div>
  <button class="primary no-print" id="doPrint">이 QR만 인쇄하기</button>`;
  const box = $("qrBig");
  const title = document.createElement("div"); title.className = "qr-title"; title.textContent = "한울림제 스탬프 투어";
  const b = document.createElement("b"); b.textContent = club.name;
  const sp = document.createElement("span"); sp.textContent = `${club.floor} · ${club.loc}`;
  const sm = document.createElement("small"); sm.textContent = "휴대폰 카메라로 찍으세요";
  box.append(title, QR.toSvg(clubUrl(club.id), 300), b, sp, sm);
  $("doPrint").addEventListener("click", () => print());
}

async function cInfo(el, club, me) {
  const owner = me.role === "owner";
  el.innerHTML = `
  <section class="card"><h2>동아리 정보</h2>
    ${owner ? `<label>동아리명 <input id="iname" maxlength="20" value="${esc(club.name)}"></label>
    <label>층 <input id="ifloor" maxlength="10" value="${esc(club.floor)}"></label>` :
    `<p class="muted small">동아리명과 층은 총괄 관리자만 바꿀 수 있어요.</p>`}
    <label>위치 설명 <input id="iloc" maxlength="20" value="${esc(club.loc)}" placeholder="예: 1-6 교실 뒤쪽"></label>
    <label>소개 문구 <span class="muted small" id="icount"></span>
      <textarea id="iintro" maxlength="80" rows="3" placeholder="학생들이 지도와 목록에서 보는 한 줄 소개 (80자까지)">${esc(club.intro || "")}</textarea></label>
    <p id="imsg" class="muted small" role="status"></p>
    <button class="primary" id="isave">저장</button>
  </section>
  <section class="card"><h2>학생에게 이렇게 보여요</h2>
    <div class="row"><span><b id="pvname">${esc(club.name)}</b><span class="intro" id="pvintro">${esc(club.intro || "")}</span></span><span class="muted nowrap" id="pvloc">${esc(club.loc)}</span></div>
  </section>`;
  const sync = () => {
    $("icount").textContent = `${$("iintro").value.length}/80`;
    $("pvintro").textContent = $("iintro").value; $("pvloc").textContent = $("iloc").value;
    if (owner) $("pvname").textContent = $("iname").value;
  };
  ["iintro", "iloc", "iname"].forEach(id => $(id)?.addEventListener("input", sync)); sync();
  act("isave", async () => {
    const info = { loc: $("iloc").value, intro: $("iintro").value };
    if (owner) { info.name = $("iname").value; info.floor = $("ifloor").value; }
    const r = await Store.updateClubInfo(club.id, info);
    $("imsg").textContent = r.error || (r.same ? "바뀐 내용이 없어요." : "저장했어요.");
    if (!r.error && !r.same && owner) setTimeout(render, 600);
  });
}

// ---------- 총괄 전용 탭 ----------
async function aStats(el) {
  const users = await Store.allUsers(), clubs = await Store.clubs(), s = await Store.settings();
  const students = users.filter(u => !u.guest);
  const done = users.filter(u => Object.keys(u.stamps).length >= s.required).length;
  const rewarded = users.filter(u => u.rewardAt).length;
  const locked = users.filter(u => u.pinLock > Date.now());
  const visits = clubs.map(c => ({ c, n: users.filter(u => u.stamps[c.id]).length })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...visits.map(v => v.n));
  const classes = {};
  students.forEach(u => { const k = `${u.grade}-${u.cls}`; const r = (classes[k] ||= { g: u.grade, c: u.cls, n: 0, d: 0, r: 0 }); r.n++; if (Object.keys(u.stamps).length >= s.required) r.d++; if (u.rewardAt) r.r++; });
  const crow = Object.values(classes).sort((a, b) => a.g - b.g || a.c - b.c);
  el.innerHTML = `
  <p class="notice ${s.open ? "good-bg" : ""}">스탬프·보상: <b>${s.open ? "열림" : "닫힘"}</b> · 축제 날 ${s.festivalDate ? esc(fmtDay(s.festivalDate)) : "미정"}${s.forceOpen ? " · 강제로 열어둔 상태" : ""}</p>
  <div class="kpis">
    <div class="kpi"><b>${users.length}</b><span>참여자<br>(게스트 ${users.length - students.length})</span></div>
    <div class="kpi"><b>${done}</b><span>${s.required}개 완료</span></div>
    <div class="kpi"><b>${rewarded}</b><span>보상 수령</span></div>
  </div>
  ${locked.length ? `<section class="card"><h2>보상 화면이 잠긴 학생</h2><p class="muted small">학부모 비밀번호를 5번 틀린 학생이에요. 대리 기록 화면에서 잠금을 풀 수 있어요.</p>
    ${locked.map(u => `<div class="row"><span>${esc(u.name)} <span class="muted small">${esc(who(u))}</span></span><span class="muted small">${fmtTime(u.pinLock)}까지</span></div>`).join("")}</section>` : ""}
  <section class="card"><h2>동아리별 방문 수</h2>
    ${visits.map(v => `<div class="bar-row"><span title="${esc(v.c.name)}">${esc(v.c.name)}</span><div class="bar"><div data-w="${v.n / max * 100}"></div></div><b>${v.n}</b></div>`).join("")}
  </section>
  <section class="card"><h2>학년·반별 참여</h2>
    ${crow.length ? `<div class="table-wrap"><table><thead><tr><th>반</th><th>참여</th><th>${s.required}개 완료</th><th>보상 수령</th></tr></thead><tbody>
      ${crow.map(r => `<tr><td>${r.g}학년 ${r.c}반</td><td>${r.n}</td><td>${r.d}</td><td>${r.r}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">아직 참여한 학생이 없어요.</p>`}
  </section>
  <button class="secondary" id="csv">결과 파일 내려받기 (엑셀용 CSV)</button>`;
  act("csv", downloadCsv);
}

// 엑셀이 =, +, -, @ 로 시작하는 칸을 수식으로 실행하지 않도록 막음
const csvCell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function downloadCsv() {
  const { users, clubs, required } = await Store.exportRows();
  const head = ["구분", "학년", "반", "번호", "이름", "스탬프 수", `${required}개 완료`, "보상 수령", "수령 시각", "수령 처리", ...clubs.map(c => c.name)];
  const rows = users.sort((a, b) => (a.guest - b.guest) || ((a.grade || 0) - (b.grade || 0)) || ((a.cls || 0) - (b.cls || 0)) || ((a.num || 0) - (b.num || 0)) || String(a.uid).localeCompare(String(b.uid))).map(u => [
    u.guest ? "게스트" : "학생", u.grade ?? "", u.cls ?? "", u.num ?? "", u.name, Object.keys(u.stamps).length,
    Object.keys(u.stamps).length >= required ? "O" : "", u.rewardAt ? "O" : "", u.rewardAt ? fmtDate(u.rewardAt) : "", u.rewardBy || "",
    ...clubs.map(c => u.stamps[c.id] ? "O" : "")]);
  const text = "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = `스탬프투어_결과_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function aProxy(el, me) {
  el.innerHTML = `
  <section class="card"><h2>학생 찾기</h2>
    <p class="muted small">휴대폰이 없는 학생 등, 관리자가 대신 스탬프와 보상을 기록해요. 모든 대리 기록은 활동 기록에 남아요.</p>
    <div class="inline"><input id="pid" placeholder="s2620101" maxlength="40" autocapitalize="off" spellcheck="false"><button class="primary" id="pFind">찾기</button></div>
    <p id="perr" class="error" role="alert"></p>
    <div id="pResult"></div>
  </section>`;
  const show = async u => {
    const clubs = await Store.clubs(), s = await Store.settings();
    const n = Object.keys(u.stamps).length;
    $("pResult").innerHTML = `
      <div class="student-head"><b>${esc(u.name)}</b> <span class="muted">${esc(who(u))}</span>
        <span class="pill">${n} / ${s.required}</span>${u.rewardAt ? `<span class="pill good-bg">보상 받음 ${fmtTime(u.rewardAt)}</span>` : ""}</div>
      ${u.pinLock > Date.now() ? `<p class="notice bad-bg">보상 화면이 잠겨 있어요 (${fmtTime(u.pinLock)}까지) <button class="link small" id="pUnlock">잠금 풀기</button></p>` : ""}
      <div class="chip-grid">${clubs.map(c => `<label class="chip ${u.stamps[c.id] ? "on" : ""}"><input type="checkbox" data-club="${esc(c.id)}" ${u.stamps[c.id] ? "checked" : ""}>${esc(c.name)}</label>`).join("")}</div>
      ${!u.rewardAt && n >= s.required ? `<button class="primary" id="pReward">보상 지급 기록하기</button>` : ""}`;
    $("pResult").querySelectorAll("input[data-club]").forEach(cb => cb.addEventListener("change", async () => {
      cb.disabled = true;
      try { const r = await Store.proxyStamp(u.uid, cb.dataset.club, cb.checked); if (r.error) say(r.error); await show(r.user || u); } catch (e) { handleError(e); }
    }));
    act("pReward", async () => { if (!(await ask(`${u.name} 학생에게 보상을 지급했다고 기록할까요?`))) return; const r = await Store.proxyReward(u.uid); if (r.error) say(r.error); else await show(r.user); });
    act("pUnlock", async () => { const r = await Store.unlockStudentPin(u.uid); if (r.user) await show(r.user); });
  };
  act("pFind", async () => {
    $("perr").textContent = ""; $("pResult").innerHTML = "";
    const r = await Store.findStudent($("pid").value);
    if (r.error) return $("perr").textContent = r.error;
    if (r.notFound) {
      const info = Store.parseEmail(r.email);
      $("pResult").innerHTML = `<p>명단에 없고 로그인한 적도 없는 학생이에요 (${info.grade}학년 ${info.cls}반 ${info.num}번). 전학생이라면 이름을 넣어 등록하세요.</p>
        <div class="inline"><input id="pname" placeholder="학생 이름" maxlength="20"><button class="secondary" id="pCreate">이 학생 등록하기</button></div>`;
      act("pCreate", async () => {
        if (!$("pname").value.trim()) return $("perr").textContent = "이름을 넣어주세요.";
        const r2 = await Store.findStudent(r.email, $("pname").value);
        if (r2.error) return $("perr").textContent = r2.error;
        await show(r2.user);
      });
      return;
    }
    await show(r.user);
  });
  onEnter("pid", "pFind");
}

async function aPrint(el, me, sub) {
  const view = sub === "guide" ? "guide" : "qr";
  const clubs = await Store.clubs(), s = await Store.settings();
  el.innerHTML = `
  <section class="card no-print">
    <div class="seg"><button class="${view === "qr" ? "on" : ""}" data-go="#/admin/print/qr">부스 QR</button><button class="${view === "guide" ? "on" : ""}" data-go="#/admin/print/guide">학부모 안내문</button></div>
    ${view === "qr" ? `<p>동아리마다 QR 한 장씩, A4 한 장에 6개가 들어가요. (${clubs.length}개)</p>
      ${location.protocol === "file:" ? `<p class="notice">지금은 PC 파일로 열려 있어서 이 QR을 휴대폰으로 찍어도 열리지 않아요. 실제 QR은 서버 주소가 생긴 뒤 다시 인쇄하세요.</p>` : ""}`
    : `<p>보상 지급 자리에 놓을 안내문이에요. 학부모 비밀번호가 함께 인쇄돼요.</p>`}
    <button class="primary" id="doPrint">인쇄하기</button>
  </section>
  <div id="printArea" class="print-area"></div>`;
  $("doPrint").addEventListener("click", () => print());
  const area = $("printArea");
  if (view === "qr") {
    area.className = "print-area qr-sheet";
    clubs.forEach(c => {
      const card = document.createElement("div"); card.className = "qr-card";
      const title = document.createElement("div"); title.className = "qr-title"; title.textContent = "한울림제 스탬프 투어";
      const b = document.createElement("b"); b.textContent = c.name;
      const sp = document.createElement("span"); sp.textContent = `${c.floor} · ${c.loc}`;
      const sm = document.createElement("small"); sm.textContent = "휴대폰 카메라로 찍으세요";
      card.append(title, QR.toSvg(clubUrl(c.id), 170), b, sp, sm);
      area.appendChild(card);
    });
  } else {
    area.className = "print-area guide";
    area.innerHTML = `
      <h1>스탬프 투어 보상 지급 방법</h1>
      <p class="guide-sub">학부모님, 도와주셔서 감사합니다. 아래 순서대로만 해주시면 됩니다.</p>
      <ol class="guide-steps">
        <li><b>학생이 휴대폰 화면을 보여줍니다.</b><span>화면 위쪽에 학생 이름과 학년·반·번호가 나옵니다.</span></li>
        <li><b>학생 휴대폰에 비밀번호 4자리를 누릅니다.</b><span>학생에게 비밀번호를 알려주지 마시고, 직접 눌러주세요.</span></li>
        <li><b>화면 색을 확인합니다.</b>
          <span class="guide-result"><span class="g-good">초록색 "지급하세요"</span> → 보상을 드립니다.</span>
          <span class="guide-result"><span class="g-bad">빨간색 "이미 받았어요"</span> → 이미 받은 학생입니다. 드리지 않습니다.</span></li>
      </ol>
      <div class="guide-pin">비밀번호: <span class="pin-big">${esc(PARENT_PIN)}</span></div>
      <p class="guide-note">· 보상 기준: 스탬프 ${s.required}개<br>· 비밀번호를 5번 틀리면 그 학생 화면이 10분 동안 잠깁니다.<br>· 문제가 생기면 관리자에게 학생을 보내주세요.</p>`;
  }
}

// CSV 읽기 (따옴표 안의 쉼표·줄바꿈 처리)
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function aSettings(el) {
  const s = await Store.settings(), clubs = await Store.clubs();
  el.innerHTML = `
  <section class="card"><h2>축제 날짜</h2>
    <p class="muted small">이 날에만 스탬프와 보상이 열려요. 다른 날에는 학생이 로그인하고 지도·동아리 소개만 볼 수 있어요.</p>
    <label>축제 날 <input id="fdate" type="date" value="${esc(s.festivalDate)}"></label>
    <label class="check"><input type="checkbox" id="fforce" ${s.forceOpen ? "checked" : ""}> 날짜와 상관없이 지금 열기 (학급 사전 테스트용)</label>
    <p class="muted small">지금 상태: <b>${s.open ? "열림" : "닫힘"}</b></p>
    <p id="fmsg" class="muted small" role="status"></p>
    <button class="primary" id="fsave">저장</button></section>
  <section class="card"><h2>보상 기준</h2>
    <div class="inline"><label class="grow">필요한 스탬프 수 <input id="req" type="number" min="1" max="${clubs.length}" value="${s.required}"></label><button class="primary" id="saveReq">저장</button></div>
    <p id="reqMsg" class="muted small" role="status"></p></section>
  <section class="card"><h2>일정표</h2>
    <p class="muted small">학생 화면 "일정표"에 나와요. 1학년·2학년 칸에 그 시간에 할 일을 쓰면 학생에게 "나: …"로 보여요. 시각은 09:30처럼 넣어요.</p>
    <div id="schBody" class="sch-list"></div>
    <button class="secondary" id="schAdd">줄 추가</button>
    <p id="schMsg" class="error" role="alert"></p>
    <button class="primary" id="schSave">일정표 저장</button>
    <button class="link small" id="schReset">기본 일정으로 되돌리기</button></section>
  <section class="card"><h2>학생 명단</h2>
    <p class="muted small">학생이 로그인하면 학번으로 이름과 소속 동아리를 찾는 명단이에요. 지금 <b id="rosterN">…</b>명이 올라가 있어요.</p>
    <p class="muted small">CSV 파일(학번 5자리, 이름, 소속 동아리명 순서)을 고르면 기존 명단을 통째로 바꿔요. 파일은 이 화면에서만 읽고 바로 서버로 보내요.</p>
    <label class="upload-btn">명단 CSV 파일 고르기<input type="file" id="rosterFile" accept=".csv,text/csv" hidden></label>
    <p id="rosterMsg" class="muted small" role="status"></p>
    <h3 class="sub-h">한 명 추가·수정 (전학생 등)</h3>
    <p class="muted small">이미 명단에 있는 학번을 넣으면 이름·동아리를 고쳐요. 이미 로그인한 학생도 바로 반영돼요. 동아리가 없으면 비워두세요.</p>
    <div class="add-row"><input id="r1h" placeholder="학번 (10914 또는 s2610914)" maxlength="30" autocapitalize="off" spellcheck="false"><input id="r1n" placeholder="이름" maxlength="20"><input id="r1c" placeholder="동아리 (없으면 비움)" maxlength="30" list="r1clubs"><button class="secondary" id="r1save">저장</button></div>
    <datalist id="r1clubs">${clubs.map(c => `<option value="${esc(c.name)}">`).join("")}</datalist>
    <p id="r1msg" class="muted small" role="status"></p></section>
  <section class="card"><h2>학부모 확인 비밀번호</h2>
    <p class="pin-fixed">${esc(PARENT_PIN)}</p>
    <p class="muted small">고정 번호예요. 보상은 수령 장소에서 직접 받으므로 번호가 알려져도 문제가 없어요. 학부모 안내문에도 이 번호가 인쇄돼요.</p></section>
  <section class="card"><h2>동아리 (${clubs.length}개)</h2>
    <div class="add-row"><input id="cn" placeholder="동아리명" maxlength="20"><input id="cl" placeholder="위치" maxlength="20"><input id="cf" placeholder="층 (예: 2층)" maxlength="10"><button class="secondary" id="addC">추가</button></div>
    <p id="cMsg" class="error" role="alert"></p>
    ${clubs.map(c => `<div class="row"><span>${esc(c.name)} <span class="muted small">${esc(c.floor)} · ${esc(c.loc)}</span></span><span class="nowrap"><button class="link small" data-go="#/admin/club/${esc(c.id)}/info">수정</button><button class="link small danger-text" data-del="${esc(c.id)}" data-name="${esc(c.name)}">삭제</button></span></div>`).join("")}
  </section>`;
  // 학생 명단 올리기
  Store.rosterCount().then(r => { if ($("rosterN")) $("rosterN").textContent = r.n; }).catch(() => {});
  $("rosterFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    const msg = $("rosterMsg");
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return msg.textContent = "파일이 너무 커요.";
    let text = await f.text();
    if (/\uFFFD/.test(text)) { try { text = new TextDecoder("euc-kr").decode(await f.arrayBuffer()); } catch {} }
    const rows = parseCsv(text.replace(/^\uFEFF/, "")).map(r => r.map(x => x.trim())).filter(r => /^[1-3]\d{4}$/.test(r[0]));
    if (!rows.length) return msg.textContent = "학번(5자리)으로 시작하는 줄이 없어요. 파일 형식을 확인하세요.";
    if (!(await ask(`${rows.length}명의 명단으로 바꿀까요? 기존 명단은 지워져요.`))) return;
    msg.textContent = "올리는 중…";
    try {
      const r = await Store.uploadRoster(rows.map(r => [r[0], r[1] || "", r[2] || ""]));
      if (r.error) return msg.textContent = r.error;
      msg.textContent = `${r.n}명을 올렸어요.${r.bad ? ` 형식이 맞지 않는 ${r.bad}줄은 뺐어요.` : ""}${r.noClub ? ` 동아리 목록에 없는 동아리명이 적힌 학생이 ${r.noClub}명 있어요.` : ""}`;
      $("rosterN").textContent = r.n;
    } catch (err) { handleError(err); }
  });
  // 명단 한 명 추가·수정
  act("r1save", async () => {
    const msg = $("r1msg"); msg.textContent = "";
    const r = await Store.rosterAddOne($("r1h").value, $("r1n").value, $("r1c").value);
    if (r.error) return msg.textContent = r.error;
    msg.textContent = `${r.updated ? "고쳤어요" : "추가했어요"}.${r.club && !r.boothClub ? " (부스가 없는 동아리예요)" : ""}${r.loggedIn ? " 이미 로그인한 학생이라 바로 반영됐어요." : " 이 학생이 로그인하면 이름과 동아리가 자동으로 나와요."}`;
    ["r1h", "r1n", "r1c"].forEach(id => $(id).value = "");
    Store.rosterCount().then(x => { if ($("rosterN")) $("rosterN").textContent = x.n; }).catch(() => {});
  });
  // 일정표 편집
  const F = [["s", 5, "시작 09:30"], ["e", 5, "끝"], ["t", 30, "일정 이름"], ["p", 30, "장소"], ["g1", 30, "1학년 할 일"], ["g2", 30, "2학년 할 일"], ["n", 60, "메모"]];
  let rows = await Store.schedule();
  const readRows = () => { $("schBody").querySelectorAll(".sch-row").forEach((tr, i) => { tr.querySelectorAll("input[data-f]").forEach(inp => { rows[i][inp.dataset.f] = inp.value; }); }); };
  const drawRows = () => {
    $("schBody").innerHTML = rows.map((r, i) => `<div class="sch-row">${F.map(([k, m, ph]) => `<input class="f-${k}" data-f="${k}" maxlength="${m}" placeholder="${esc(ph)}" ${k === "s" || k === "e" ? `inputmode="numeric"` : ""} value="${esc(r[k] || "")}" aria-label="${i + 1}번째 줄 ${esc(ph)}">`).join("")}<button class="link small danger-text f-rm" data-rm="${i}" aria-label="${i + 1}번째 줄 지우기">지우기</button></div>`).join("");
    $("schBody").querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { readRows(); rows.splice(+b.dataset.rm, 1); drawRows(); }));
  };
  drawRows();
  $("schAdd").addEventListener("click", () => { readRows(); if (rows.length >= 20) return $("schMsg").textContent = "일정은 20줄까지예요."; rows.push({ s: "", e: "", t: "", p: "", n: "", g1: "", g2: "" }); drawRows(); });
  act("schSave", async () => {
    readRows(); $("schMsg").textContent = "";
    const r = await Store.setSchedule(rows);
    if (r.error) return $("schMsg").textContent = r.error;
    rows = await Store.schedule(); drawRows(); $("schMsg").textContent = ""; say("일정표를 저장했어요.");
  });
  act("schReset", async () => {
    if (!(await ask("일정표를 처음 기본 일정으로 되돌릴까요?"))) return;
    await Store.setSchedule(null); rows = await Store.schedule(); drawRows();
  });
  act("fsave", async () => {
    const r = await Store.setFestival($("fdate").value, $("fforce").checked);
    $("fmsg").textContent = r.error || "저장했어요."; if (!r.error) setTimeout(render, 600);
  });
  act("saveReq", async () => { const r = await Store.updateRequired($("req").value); $("reqMsg").textContent = r.error || "저장했어요."; });
  act("addC", async () => { const r = await Store.addClub($("cn").value, $("cl").value, $("cf").value); if (r.error) return $("cMsg").textContent = r.error; render(); });
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!(await ask(`'${b.dataset.name}' 동아리를 삭제할까요?\n이 동아리 QR은 더 이상 스탬프가 찍히지 않아요.`))) return;
    try { const r = await Store.removeClub(b.dataset.del); if (r.error) say(r.error); render(); } catch (e) { handleError(e); }
  }));
}

async function aLogs(el) {
  const logs = await Store.logs();
  const warn = /실패|잠금|오류|삭제|취소|초기화/;
  el.innerHTML = `
  <section class="card"><h2>활동 기록 <span class="muted small">(최근 ${logs.length}건)</span></h2>
    <p class="muted small">관리자 로그인, 설정 변경, 대리 기록, 비밀번호 오류 등이 모두 남아요. 빨간 줄은 확인이 필요한 기록이에요.</p>
    <div class="table-wrap"><table class="log"><thead><tr><th>시각</th><th>누가</th><th>무엇을</th><th>내용</th></tr></thead><tbody>
    ${logs.map(l => `<tr class="${warn.test(l.action) ? "warn-row" : ""}"><td>${fmtDate(l.t)}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">기록이 없어요.</td></tr>`}
    </tbody></table></div></section>`;
}

// ---------- 서버 상태 (테스트·축제 당일용, 5초마다 새로고침) ----------
function miniBars(points, key, label) {
  const W = 300, H = 70, n = points.length, max = Math.max(1, ...points.map(p => p[key])), bw = W / n;
  const bars = points.map((p, i) => { const h = Math.round(p[key] / max * (H - 14)); const t = new Date(p.m).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    return `<rect x="${(i * bw + 1).toFixed(1)}" y="${H - h}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(h, p[key] ? 2 : 0)}" rx="1.5"><title>${t} · ${p[key]}</title></rect>`; }).join("");
  return `<figure class="mini"><figcaption>${esc(label)} <span class="muted small">최근 30분, 최고 ${max}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} 최근 30분 분당 그래프"><line x1="0" y1="${H - .5}" x2="${W}" y2="${H - .5}" class="mini-base"></line>${bars}</svg>
    <div class="mini-axis muted small"><span>30분 전</span><span>지금</span></div></figure>`;
}
async function aMonitor(el) {
  const seq = renderSeq, hash = location.hash;
  el.innerHTML = `<section class="card"><h2>서버 상태 <span class="pill" id="mState">확인 중</span></h2>
    <p class="muted small">5초마다 자동으로 새로고침돼요. 이 화면을 켜둔 동안만 확인해요. <span id="mTime"></span></p>
    <div class="stat-grid" id="mCards"></div></section>
    <section class="card"><div class="mini-wrap" id="mCharts"></div></section>
    <section class="card"><h2>최근 30분 확인할 기록</h2><div id="mErr"><p class="muted">없음</p></div></section>`;
  let fails = 0;
  const tick = async () => {
    if (seq !== renderSeq || location.hash !== hash || !document.body.contains(el)) return;
    const t0 = performance.now();
    let d = null;
    try { d = await Store.liveStats(); fails = 0; } catch (e) { if (e && e.code === "denied") return handleError(e); fails++; }
    const ms = Math.round(performance.now() - t0);
    if (seq !== renderSeq || !document.body.contains(el)) return;
    const st = $("mState");
    if (!d) { st.textContent = fails > 1 ? "연결 안 됨" : "응답 없음"; st.className = "pill state-bad"; }
    else {
      const slow = ms > 3000 ? "bad" : ms > 1000 ? "warn" : "good";
      st.textContent = { good: "정상", warn: "느림", bad: "매우 느림" }[slow] + ` · ${ms}ms`; st.className = "pill state-" + slow;
      $("mTime").textContent = "마지막 확인 " + new Date(d.now).toLocaleTimeString("ko-KR");
      const card = (v, l, sub) => `<div class="stat"><b>${v}</b><span>${esc(l)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
      $("mCards").innerHTML = [
        card(d.students, "로그인한 학생", `명단 ${d.roster}명 · 게스트 ${d.guests}`),
        card(d.newLogins5m, "최근 5분 새 로그인", ""),
        card(d.active5m, "최근 5분 스탬프 찍은 학생", ""),
        card(d.stamps, "스탬프 전체", `최근 1분 ${d.stamps1m} · 5분 ${d.stamps5m}`),
        card(d.rewards, "보상 지급", `최근 5분 ${d.rewards5m}`),
        card(d.pinLocked, "보상 화면 잠긴 학생", d.pinLocked ? "대리 기록에서 풀 수 있어요" : ""),
        card(`${d.conns}/${d.maxConns}`, "DB 연결", d.conns / d.maxConns > .8 ? "많음! 지켜보세요" : "여유 있음"),
        card(`${(d.dbBytes / 1048576).toFixed(1)}MB`, "DB 크기", "무료 한도 500MB")
      ].join("");
      $("mCharts").innerHTML = miniBars(d.perMin || [], "s", "분당 스탬프") + miniBars(d.perMin || [], "l", "분당 새 로그인");
      $("mErr").innerHTML = d.recentErrors.length ? d.recentErrors.map(x => `<div class="row"><span>${esc(x.a)} <span class="muted small">${esc(x.d)}</span></span><span class="muted small nowrap">${fmtTime(x.t)}</span></div>`).join("") : `<p class="muted">없음</p>`;
    }
    setTimeout(tick, 5000);
  };
  tick();
}

async function aData(el) {
  el.innerHTML = `
  <section class="card"><h2>시험 기록만 초기화</h2>
    <p>학급 사전 테스트가 끝난 뒤 쓰세요. <b>스탬프와 보상 기록만</b> 지우고, 학생 로그인·명단·동아리·사진·설정은 그대로 둬요. 테스트한 학생은 축제 때 다시 로그인하지 않아도 돼요.</p>
    <label>총괄 핀 다시 입력 <input id="rpw" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
    <p id="rerr" class="error" role="alert"></p>
    <button class="danger" id="rProgress">스탬프·보상 기록만 초기화</button>
  </section>
  <section class="card"><h2>축제 후 개인정보 삭제</h2>
    <p>학교와 약속한 대로 <b>축제 종료 후 일주일 안에</b> 학생 기록을 지워주세요. 지우기 전에 현황 화면에서 결과 파일을 먼저 내려받으세요.</p>
    <label>총괄 핀 다시 입력 <input id="wpw" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
    <label>확인을 위해 <b>삭제</b>라고 입력 <input id="wconfirm" maxlength="4"></label>
    <p id="werr" class="error" role="alert"></p>
    <label class="check"><input type="checkbox" id="wRoster" checked> 학생 명단도 함께 삭제 (축제 후에는 꼭 체크)</label>
    <button class="danger" id="wStudents">학생 기록 삭제 (동아리·사진·설정·일정표는 유지)</button>
    <button class="danger" id="wAll">전체 초기화 (동아리 정보·사진·설정·일정표까지 처음 상태로)</button>
  </section>`;
  act("rProgress", async () => {
    $("rerr").textContent = "";
    if (!(await ask("모든 학생의 스탬프와 보상 기록을 지워요. 로그인과 명단은 남아요. 할까요?"))) return;
    const r = await Store.resetProgress($("rpw").value); $("rpw").value = "";
    if (r.error) return $("rerr").textContent = r.error;
    say(`스탬프 ${r.stamps}개, 보상 ${r.rewards}명 기록을 지웠어요.`); go("#/admin/stats");
  });
  const check = () => { if ($("wconfirm").value.trim() !== "삭제") { $("werr").textContent = "'삭제'라고 입력해주세요."; return false; } return true; };
  act("wStudents", async () => {
    if (!check()) return;
    const r = await Store.wipeStudents($("wpw").value, $("wRoster").checked); $("wpw").value = "";
    if (r.error) return $("werr").textContent = r.error;
    say(`학생 ${r.n}명의 기록을 지웠어요.${$("wRoster") && $("wRoster").checked ? " 명단도 지웠어요." : ""}`); go("#/admin/stats");
  });
  act("wAll", async () => {
    if (!check()) return;
    if (!(await ask("학생 기록, 동아리 수정 내용, 사진, 설정, 일정표, 활동 기록을 모두 지우고 처음 상태로 돌려요. 정말 할까요?"))) return;
    const r = await Store.wipeEverything($("wpw").value); $("wpw").value = "";
    if (r.error) return $("werr").textContent = r.error;
    say("전부 지웠어요. 학생 명단도 지워졌어요."); go("#/admin");
  });
}


// 카카오톡·라인으로 열렸으면 처음 한 번 바깥 브라우저로 자동으로 다시 열기 (안 열리면 로그인 화면 안내가 보임)
try { if ((IN_APP === "kakao" || IN_APP === "line") && !sessionStorage.getItem("qdp-out-tried")) { sessionStorage.setItem("qdp-out-tried", "1"); openOutside(); } } catch {}
render();
