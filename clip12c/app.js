(function(){
"use strict";
const D = JSON.parse(document.getElementById("data").textContent);
D.segments.push({ id:"_kho", part:"Ảnh khác", kind:"kho", t0:0, t1:0, photos:[],
  text:"Ảnh nào Sinh muốn đưa vào clip mà chưa biết đặt ở đoạn nào thì tải lên đây (chọn được nhiều ảnh một lúc) và ghi ảnh đó là gì. Kiên sẽ đưa vào chùm ảnh cuối hoặc đoạn hợp nhất." });
const CFG = window.C12 || {};
const KEY = "clip12c-chon-anh-v2";
const BUCKET = "clip12c";
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mmss = t => { t = Math.max(0, Math.round(t)); return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0"); };
const hhmm = d => d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0");
const groupOf = {}; D.groups.forEach(g => g.ids.forEach(id => groupOf[id] = g.name));
const isUp = x => x.startsWith("UP:");
const isNew = x => x.startsWith("MOI");
const upId = x => x.slice(3);

// ---------- state
const orig = {}; D.segments.forEach(s => orig[s.id] = s.photos.slice());
const S = { segs:{}, ups:{}, news:{}, newSeq:0, who:"Sinh", gnote:"", done:"" };
D.segments.forEach(s => S.segs[s.id] = { photos: s.photos.slice(), note:"" });
let localDirty = {};
try {
  const L = JSON.parse(localStorage.getItem(KEY) || "null");
  if (L && L.segs) {
    for (const id in L.segs) if (S.segs[id]) S.segs[id] = { photos: Array.isArray(L.segs[id].photos) ? L.segs[id].photos : orig[id].slice(), note: L.segs[id].note || "" };
    Object.assign(S.ups, L.ups || {}); Object.assign(S.news, L.news || {});
    S.newSeq = L.newSeq || 0; S.who = L.who || "Sinh"; S.gnote = L.gnote || ""; S.done = L.done || "";
    localDirty = L.dirty || {};
  }
} catch(e) {}

function src(x, large){
  if (isUp(x)) { const u = S.ups[upId(x)]; return u ? CFG.url + "/storage/v1/object/public/" + BUCKET + "/" + u.path : ""; }
  return "anh/" + (large ? "lon" : "nho") + "/" + x + ".jpg";
}
function label(x){
  if (isUp(x)) { const u = S.ups[upId(x)]; return "Ảnh tải lên" + (u && u.descr ? " (" + u.descr.trim() + ")" : ""); }
  if (isNew(x)) { const n = S.news[x]; return "Ảnh mới gửi qua Zalo" + (n && n.desc ? " (" + n.desc.trim() + ")" : ""); }
  return x;
}
const changed = id => JSON.stringify(S.segs[id].photos) !== JSON.stringify(orig[id]) || S.segs[id].note.trim() !== "";

// ---------- backend (Supabase)
let sb = null, online = false;
const dirty = new Set(Object.keys(localDirty));
let generalDirty = !!localDirty.__general;
const upDirty = new Set();
let flushTimer = null, flushing = false, backoff = 0;
const savedNote = {}, savedAt = {};
let savedG = null, savedGAt = null;

function persistLocal(){
  try {
    const d = {}; dirty.forEach(k => d[k] = 1); if (generalDirty) d.__general = 1;
    localStorage.setItem(KEY, JSON.stringify(Object.assign({}, S, { dirty: d })));
  } catch(e) {}
}
function setStatus(kind, text){
  const el = $("#saveState"); el.className = "save-state " + kind; $("#saveText").textContent = text;
}
function scheduleFlush(ms){
  persistLocal();
  if (!sb) { setStatus("", "Đã lưu nháp trên máy này lúc " + hhmm(new Date()) + ". Xong nhớ bấm Sao chép kết quả ở cuối trang."); return; }
  clearTimeout(flushTimer);
  setStatus("busy", "Đang lưu…");
  flushTimer = setTimeout(flush, ms == null ? 700 : ms);
}
async function flush(){
  if (!sb || flushing) return;
  flushing = true;
  try {
    const now = new Date().toISOString();
    if (dirty.size) {
      const ids = [...dirty];
      const rows = ids.map(id => ({ seg_id: id, photos: id === "_xong" ? [] : S.segs[id].photos, note: id === "_xong" ? S.done : S.segs[id].note, updated_by: S.who || "", updated_at: now }));
      const { error } = await sb.from("clip12c_choices").upsert(rows, { onConflict: "seg_id" });
      if (error) throw error;
      const at = new Date();
      rows.forEach(r => { dirty.delete(r.seg_id); savedNote[r.seg_id] = r.note; savedAt[r.seg_id] = at; noteStatus(r.seg_id); });
    }
    if (generalDirty) {
      const gsent = S.gnote || "";
      const { error } = await sb.from("clip12c_general").upsert({ id: 1, who: S.who || "", note: gsent, updated_at: now }, { onConflict: "id" });
      if (error) throw error;
      generalDirty = false; savedG = gsent; savedGAt = new Date(); gStatus();
    }
    for (const id of [...upDirty]) {
      const { error } = await sb.from("clip12c_uploads").update({ descr: (S.ups[id] && S.ups[id].descr) || "" }).eq("id", id);
      if (error) throw error;
      upDirty.delete(id);
    }
    backoff = 0; persistLocal();
    setStatus("ok", "Đã tự lưu lúc " + hhmm(new Date()) + ". Kiên xem được ngay.");
  } catch(e) {
    backoff = Math.min(60000, backoff ? backoff * 2 : 4000);
    setStatus("err", "Chưa lưu được (mạng chập chờn?). Trang sẽ tự thử lại, Sinh cứ làm tiếp.");
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, backoff);
  } finally {
    flushing = false;
    if ((dirty.size || generalDirty || upDirty.size) && !backoff) scheduleFlush(300);
  }
}
async function pull(){
  const [c, u, g] = await Promise.all([
    sb.from("clip12c_choices").select("*"),
    sb.from("clip12c_uploads").select("*"),
    sb.from("clip12c_general").select("*").eq("id", 1)
  ]);
  if (c.error) throw c.error; if (u.error) throw u.error; if (g.error) throw g.error;
  (u.data || []).forEach(r => { S.ups[r.id] = { path: r.path, name: r.name || "", descr: upDirty.has(r.id) && S.ups[r.id] ? S.ups[r.id].descr : (r.descr || "") }; });
  (c.data || []).forEach(r => {
    if (r.seg_id === "_xong") { if (!dirty.has("_xong")) S.done = r.note || ""; return; }
    if (S.segs[r.seg_id] && !dirty.has(r.seg_id)) { S.segs[r.seg_id] = { photos: Array.isArray(r.photos) ? r.photos : [], note: r.note || "" }; savedNote[r.seg_id] = r.note || ""; }
  });
  const gr = (g.data || [])[0];
  if (gr && !generalDirty) { S.who = gr.who || S.who; S.gnote = gr.note || ""; savedG = S.gnote; }
}
async function initBackend(){
  if (!window.supabase || !/^https:\/\//.test(CFG.url || "") || !CFG.key || CFG.key.indexOf("__") === 0) {
    sb = null; offlineMode(); return;
  }
  try {
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: false, autoRefreshToken: false } });
    await pull();
    online = true;
    renderAll(); syncInputs();
    if (dirty.size || generalDirty) scheduleFlush(200);
    else setStatus("ok", "Đã kết nối. Mọi thay đổi sẽ tự lưu.");
  } catch(e) {
    setStatus("err", "Chưa kết nối được máy chủ. Thay đổi vẫn lưu tạm trên máy này và sẽ tự gửi khi kết nối lại.");
    setTimeout(initBackend, 15000);
  }
}
function offlineMode(){
  setStatus("", "Thay đổi được lưu nháp trên máy này. Xong nhớ bấm Sao chép kết quả ở cuối trang.");
  $("#howtoSave").innerHTML = "Trang lưu nháp trên máy này. Làm xong, xuống cuối trang bấm <b>Sao chép kết quả</b> rồi dán vào Zalo gửi Kiên.";
  $("#backup").open = true;
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && sb && online && !dirty.size && !generalDirty && !upDirty.size && !flushing) {
    try { await pull(); renderAll(); syncInputs(); } catch(e) {}
  }
});

function noteStatus(id){
  const el = document.getElementById("nst-" + id); if (!el) return;
  const cur = S.segs[id].note, saved = savedNote[id] == null ? "" : savedNote[id];
  if (!sb) { el.textContent = cur ? "Lưu trên máy này" : ""; el.className = "note-st"; return; }
  if (cur === saved) { el.textContent = savedAt[id] ? "Đã ghi lúc " + hhmm(savedAt[id]) : (cur ? "Đã ghi" : ""); el.className = "note-st ok"; }
  else { el.textContent = "Chưa ghi, bấm Ghi (hoặc dừng gõ vài giây sẽ tự ghi)"; el.className = "note-st warn"; }
}
function gStatus(){
  const el = document.getElementById("gst"); if (!el) return;
  const saved = savedG == null ? "" : savedG;
  if (!sb) { el.textContent = S.gnote ? "Lưu trên máy này" : ""; el.className = "note-st"; return; }
  if (S.gnote === saved) { el.textContent = savedGAt ? "Đã ghi lúc " + hhmm(savedGAt) : (S.gnote ? "Đã ghi" : ""); el.className = "note-st ok"; }
  else { el.textContent = "Chưa ghi, bấm Ghi"; el.className = "note-st warn"; }
}
function saveNow(id){
  dirty.add(id);
  if (!sb) { persistLocal(); savedNote[id] = S.segs[id].note; savedAt[id] = new Date(); noteStatus(id); toast("Đã ghi trên máy này."); return; }
  clearTimeout(flushTimer);
  const el = document.getElementById("nst-" + id); if (el) { el.textContent = "Đang ghi…"; el.className = "note-st"; }
  if (flushing) scheduleFlush(300); else flush();
}

// ---------- recommended counts
function advice(s){
  const dur = s.t1 - s.t0;
  if (s.kind === "kho") return {lo:0, hi:9999, text:"Ảnh Sinh tải thêm"};
  if (s.kind === "memorial") return {lo:1, hi:2, text:"Đoạn tưởng nhớ: ảnh chuyển đen trắng, nên 1–2 ảnh"};
  if (s.kind === "montage") { const n = Math.round(dur/3.7); return {lo:n-4, hi:n+4, text:"Mỗi ảnh khoảng 3,7 giây, nên " + (n-4) + "–" + (n+4) + " ảnh"}; }
  if (s.kind === "interlude") { const n = Math.round(dur/3.6); return {lo:n-1, hi:n+1, text:"Đoạn nhạc chuyển, mỗi ảnh khoảng 3,6 giây"}; }
  const lo = Math.max(1, Math.round(dur/8)), hi = Math.max(lo+1, Math.round(dur/4.5));
  return {lo, hi, text:"Đoạn dài " + Math.round(dur) + " giây, nên " + lo + "–" + hi + " ảnh"};
}

// ---------- render
const parts = [];
D.segments.forEach(s => { let p = parts.find(x => x.name === s.part); if (!p) { p = {name:s.part, ids:[]}; parts.push(p); } p.ids.push(s.id); });
const partAnchor = i => "phan-" + (i+1);
const expanded = {};
const uploading = {};
function renderAll(){
  $("#main").innerHTML = parts.map((p, i) =>
    '<h2 class="part" id="' + partAnchor(i) + '">' + esc(p.name) + '</h2>' +
    p.ids.map(id => '<article class="seg" id="seg-' + id + '" data-id="' + id + '"></article>').join("")
  ).join("");
  D.segments.forEach(s => renderSeg(s.id));
  renderChips(); renderOut(); renderDone();
}
function renderChips(){
  $("#chips").innerHTML = parts.map((p,i) => {
    const n = p.ids.filter(changed).length;
    return '<a href="#' + partAnchor(i) + '">' + esc(p.name.split(" · ")[0]) + (n ? '<span class="n" title="số đoạn đã sửa">' + n + '</span>' : '') + '</a>';
  }).join("") + '<a href="#ket-qua">Báo xong</a>';
}
function acts(i, n){
  return '<div class="acts"><button type="button" data-act="left" data-i="' + i + '" aria-label="Đưa lên trước"' + (i===0?' disabled':'') + '>◀</button>' +
    '<button type="button" class="rm" data-act="rm" data-i="' + i + '" aria-label="Bỏ ảnh">✕</button>' +
    '<button type="button" data-act="right" data-i="' + i + '" aria-label="Đưa ra sau"' + (i===n-1?' disabled':'') + '>▶</button></div>';
}
function tileHTML(x, i, n){
  if (isNew(x)) {
    const desc = (S.news[x] && S.news[x].desc) || "";
    return '<div class="tile new"><div class="ph">Ảnh mới<br>(gửi qua Zalo)</div><span class="ord">' + (i+1) + '</span>' +
      '<input type="text" data-new="' + x + '" value="' + esc(desc) + '" placeholder="Ảnh gì? Ai trong ảnh?" aria-label="Mô tả ảnh mới">' + acts(i, n) + '</div>';
  }
  if (isUp(x)) {
    const u = S.ups[upId(x)] || {};
    return '<div class="tile up"><button class="ph" type="button" data-zoom="' + i + '" aria-label="Xem to ảnh tải lên"><img loading="lazy" src="' + esc(src(x)) + '" alt="Ảnh tải lên"></button>' +
      '<span class="ord">' + (i+1) + '</span><span class="code">Mới</span>' +
      '<input type="text" data-up="' + esc(upId(x)) + '" value="' + esc(u.descr || "") + '" placeholder="Ảnh gì? Ai trong ảnh?" aria-label="Mô tả ảnh tải lên">' + acts(i, n) + '</div>';
  }
  return '<div class="tile"><button class="ph" type="button" data-zoom="' + i + '" aria-label="Xem to ảnh ' + x + '"><img loading="lazy" src="' + src(x) + '" alt="Ảnh ' + x + '"></button>' +
    '<span class="ord">' + (i+1) + '</span><span class="code">' + x + '</span>' + acts(i, n) + '</div>';
}
function renderSeg(id){
  const s = D.segments.find(x => x.id === id), st = S.segs[id], el = $("#seg-" + id);
  if (!el) return;
  const a = advice(s), n = st.photos.length;
  const kho = s.kind === "kho";
  const pill = kho ? '' : n === 0 ? '<span class="pill warn">chưa có ảnh</span>' : (n < a.lo ? '<span class="pill warn">hơi ít, mỗi ảnh sẽ hiện lâu</span>' : (n > a.hi ? '<span class="pill warn">hơi nhiều, ảnh sẽ chuyển nhanh</span>' : '<span class="pill ok">vừa</span>'));
  const long = s.text.length > 260;
  const busy = uploading[id] ? '<div class="tile"><div class="ph" style="aspect-ratio:4/3"></div><div class="spin">Đang tải ' + uploading[id] + '</div></div>' : '';
  el.className = "seg" + (changed(id) ? " changed" : "");
  el.innerHTML =
    '<div class="seg-head">' + (kho ? '<span class="time">Ảnh khác muốn đưa vào clip</span>' : '<span class="time">' + mmss(s.t0) + ' – ' + mmss(s.t1) + '</span><span class="sid">đoạn ' + id + '</span>') + (changed(id) ? '<span class="badge">Đã sửa</span>' : '') + '</div>' +
    '<p class="text' + (long && !expanded[id] ? ' clamp' : '') + '">' + esc(s.text) + '</p>' +
    (long ? '<button class="more" type="button" data-act="more">' + (expanded[id] ? 'Thu gọn' : 'Xem cả đoạn') + '</button>' : '') +
    (kho ? (n ? '<div class="count">Đã tải lên ' + n + ' ảnh</div>' : '') : '<div class="count">' + esc(a.text) + ' · đang có ' + n + ' ' + pill + '</div>') +
    '<div class="tiles">' + st.photos.map((x,i) => tileHTML(x, i, n)).join("") + busy + '</div>' +
    '<div class="btns">' + (kho ? '' : '<button class="btn primary" type="button" data-act="add">+ Thêm ảnh từ kho</button>') +
    '<button class="btn' + (kho ? ' primary' : '') + '" type="button" data-act="upload">+ Tải ảnh lên</button>' +
    (JSON.stringify(st.photos) !== JSON.stringify(orig[id]) ? '<button class="btn ghost" type="button" data-act="reset">Khôi phục như cũ</button>' : '') + '</div>' +
    '<label class="note" for="note-' + id + '">' + (kho ? 'Ghi chú cho các ảnh này' : 'Ghi chú cho đoạn này') + '</label>' +
    '<textarea id="note-' + id + '" data-note="1" placeholder="Ví dụ: ảnh số 2 là thầy Lệ; tên ‘Vững’ đọc chưa đúng…">' + esc(st.note) + '</textarea>' +
    '<div class="note-row"><button class="btn sm" type="button" data-act="savenote">Ghi</button><span class="note-st" id="nst-' + id + '"></span></div>';
  noteStatus(id);
}
function markSeg(id){ dirty.add(id); renderChips(); renderOut(); scheduleFlush(); }

// ---------- segment events
$("#main").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const seg = b.closest(".seg"); if (!seg) return;
  const id = seg.dataset.id, st = S.segs[id];
  if (b.dataset.zoom !== undefined) {
    const list = st.photos.filter(x => !isNew(x));
    openLb(list, st.photos.slice(0, +b.dataset.zoom).filter(x => !isNew(x)).length, "Đoạn " + id); return;
  }
  const act = b.dataset.act, i = +b.dataset.i;
  if (act === "more") { expanded[id] = !expanded[id]; renderSeg(id); return; }
  if (act === "add") { openPicker(id); return; }
  if (act === "upload") { startUpload(id); return; }
  if (act === "savenote") { saveNow(id); return; }
  if (act === "rm") st.photos.splice(i,1);
  else if (act === "left" && i > 0) [st.photos[i-1], st.photos[i]] = [st.photos[i], st.photos[i-1]];
  else if (act === "right" && i < st.photos.length-1) [st.photos[i+1], st.photos[i]] = [st.photos[i], st.photos[i+1]];
  else if (act === "reset") st.photos = orig[id].slice();
  else return;
  renderSeg(id); markSeg(id);
});
$("#main").addEventListener("input", e => {
  const t = e.target, seg = t.closest(".seg"); if (!seg) return;
  const id = seg.dataset.id;
  if (t.dataset.note) { S.segs[id].note = t.value; updateBadge(id); dirty.add(id); renderChips(); renderOut(); noteStatus(id); scheduleFlush(4000); }
  else if (t.dataset.up) { const u = S.ups[t.dataset.up]; if (u) { u.descr = t.value; upDirty.add(t.dataset.up); renderOut(); scheduleFlush(); } }
  else if (t.dataset.new) { S.news[t.dataset.new] = { desc: t.value }; markSeg(id); }
});
function updateBadge(id){
  const seg = $("#seg-" + id); if (!seg) return;
  const ch = changed(id); seg.classList.toggle("changed", ch);
  let b = seg.querySelector(".badge");
  if (ch && !b) { b = document.createElement("span"); b.className = "badge"; b.textContent = "Đã sửa"; seg.querySelector(".seg-head").appendChild(b); }
  else if (!ch && b) b.remove();
}

// ---------- uploads
let uploadFor = null;
function startUpload(id){
  if (!sb || !online) {
    toast("Chưa kết nối được máy chủ nên chưa tải ảnh được. Sinh đợi ít phút rồi tải lại trang và thử lại nhé.");
    return;
  }
  uploadFor = id; $("#fileIn").value = ""; $("#fileIn").click();
}
$("#fileIn").addEventListener("change", async e => {
  const files = [...e.target.files]; const id = uploadFor; uploadFor = null;
  if (!files.length || !id) return;
  let ok = 0;
  for (let k = 0; k < files.length; k++) {
    const f = files[k];
    uploading[id] = (k+1) + "/" + files.length + "…"; renderSeg(id);
    try {
      const ext = ((f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg").slice(0, 5);
      const path = "sinh/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      let up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || "image/jpeg", upsert: false, cacheControl: "3600" });
      if (up.error) { await new Promise(r => setTimeout(r, 1500)); up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || "image/jpeg", upsert: true, cacheControl: "3600" }); }
      if (up.error) throw up.error;
      const ins = await sb.from("clip12c_uploads").insert({ path: path, name: f.name, descr: "" }).select().single();
      if (ins.error) throw ins.error;
      S.ups[ins.data.id] = { path: path, name: f.name, descr: "" };
      S.segs[id].photos.push("UP:" + ins.data.id);
      dirty.add(id); ok++;
    } catch(err) {
      toast("Không tải được ảnh “" + f.name + "” (có thể do mạng). Sinh bấm Tải ảnh lên để thử lại nhé.");
    }
  }
  delete uploading[id]; renderSeg(id); renderChips(); renderOut(); scheduleFlush(100);
  if (ok) {
    toast("Đã tải lên " + ok + " ảnh. Sinh ghi giúp ảnh đó là gì vào ô dưới ảnh nhé.");
    const inp = document.querySelector("#seg-" + id + " .tile.up:last-of-type input"); if (inp) inp.focus();
  }
});

// ---------- picker
let pickFor = null, picked = [];
function usage(){ const u = {}; for (const id in S.segs) S.segs[id].photos.forEach(x => { u[x] = (u[x]||0) + 1; }); return u; }
function pkHTML(x, u){
  const code = isUp(x) ? "Mới" : x;
  return '<div class="pk" data-pk="' + esc(x) + '" role="button" tabindex="0" aria-pressed="false" aria-label="Chọn ảnh ' + esc(code) + '"><img loading="lazy" src="' + esc(src(x)) + '" alt="">' +
    '<span class="code">' + esc(code) + '</span>' + (u[x] ? '<span class="used" title="số đoạn đang dùng">dùng ' + u[x] + '</span>' : '') +
    '<button class="zoom" type="button" data-z="' + esc(x) + '" aria-label="Xem to">⤢</button></div>';
}
function libList(){ return D.groups.flatMap(g => g.ids).concat(Object.keys(S.ups).map(k => "UP:" + k)); }
function openPicker(id){
  pickFor = id; picked = [];
  const u = usage();
  const ups = Object.keys(S.ups).map(k => "UP:" + k);
  $("#pickTitle").textContent = "Thêm ảnh vào đoạn " + id;
  $("#pickBody").innerHTML =
    (ups.length ? '<h4>Ảnh Sinh đã tải lên</h4><div class="pick">' + ups.map(x => pkHTML(x, u)).join("") + '</div>' : '') +
    D.groups.map(g => '<h4>' + esc(g.name) + '</h4><div class="pick">' + g.ids.map(x => pkHTML(x, u)).join("") + '</div>').join("");
  updPickOk();
  $("#picker").hidden = false; document.body.style.overflow = "hidden"; $("#pickBody").scrollTop = 0;
}
function closePicker(){ $("#picker").hidden = true; document.body.style.overflow = ""; pickFor = null; }
function updPickOk(){
  $("#pickOk").textContent = picked.length ? "Thêm " + picked.length + " ảnh" : "Thêm";
  $("#pickOk").disabled = !picked.length;
  document.querySelectorAll(".pk").forEach(el => {
    const k = picked.indexOf(el.dataset.pk);
    el.classList.toggle("sel", k >= 0); el.setAttribute("aria-pressed", k >= 0);
    let no = el.querySelector(".selno");
    if (k >= 0) { if (!no) { no = document.createElement("span"); no.className = "selno"; el.appendChild(no); } no.textContent = k+1; }
    else if (no) no.remove();
  });
}
function togglePick(x){ const k = picked.indexOf(x); if (k >= 0) picked.splice(k,1); else picked.push(x); updPickOk(); }
$("#pickBody").addEventListener("click", e => {
  const z = e.target.closest("[data-z]");
  if (z) { e.stopPropagation(); const all = libList(); openLb(all, all.indexOf(z.dataset.z), "Kho ảnh"); return; }
  const pk = e.target.closest("[data-pk]"); if (pk) togglePick(pk.dataset.pk);
});
$("#pickBody").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.pk) { e.preventDefault(); togglePick(e.target.dataset.pk); } });
$("#pickCancel").onclick = closePicker;
$("#pickOk").onclick = () => { if (!pickFor) return; const id = pickFor; S.segs[id].photos.push(...picked); closePicker(); renderSeg(id); markSeg(id); toast("Đã thêm vào đoạn " + id); };

// ---------- lightbox
let lbList = [], lbI = 0;
function openLb(list, i){ if (!list.length) return; lbList = list; lbI = Math.max(0, Math.min(i, list.length-1)); showLb(); $("#lb").hidden = false; document.body.style.overflow = "hidden"; $("#lbClose").focus(); }
function showLb(){
  const x = lbList[lbI];
  $("#lbImg").src = src(x, true); $("#lbImg").alt = label(x);
  const used = []; for (const id in S.segs) if (S.segs[id].photos.includes(x)) used.push(id);
  const name = isUp(x) ? label(x) : x + " · " + (groupOf[x] || "");
  const file = isUp(x) ? ((S.ups[upId(x)] || {}).name || "") : (D.files[x] || "");
  $("#lbCap").innerHTML = '<b>' + esc(name) + '</b> · ' + (lbI+1) + '/' + lbList.length +
    (used.length ? '<br>Đang dùng ở đoạn: ' + used.join(", ") : '<br>Chưa dùng ở đoạn nào') + (file ? '<br><small>Tên file: ' + esc(file) + '</small>' : '');
  $("#lbPrev").disabled = lbI === 0; $("#lbNext").disabled = lbI === lbList.length-1;
}
function closeLb(){ $("#lb").hidden = true; if ($("#picker").hidden) document.body.style.overflow = ""; }
$("#lbClose").onclick = closeLb;
$("#lbPrev").onclick = () => { if (lbI > 0) { lbI--; showLb(); } };
$("#lbNext").onclick = () => { if (lbI < lbList.length-1) { lbI++; showLb(); } };
document.addEventListener("keydown", e => {
  if (!$("#lb").hidden) { if (e.key === "Escape") closeLb(); if (e.key === "ArrowLeft") $("#lbPrev").click(); if (e.key === "ArrowRight") $("#lbNext").click(); return; }
  if (!$("#picker").hidden && e.key === "Escape") closePicker();
});
let tx = null;
$("#lb").addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, {passive:true});
$("#lb").addEventListener("touchend", e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) (dx > 0 ? $("#lbPrev") : $("#lbNext")).click(); tx = null; });

// ---------- general, done, backup text
function syncInputs(){ $("#who").value = S.who; $("#gnote").value = S.gnote; renderDone(); gStatus(); }
$("#who").addEventListener("input", e => { S.who = e.target.value; generalDirty = true; renderOut(); scheduleFlush(); });
$("#gnote").addEventListener("input", e => { S.gnote = e.target.value; generalDirty = true; renderOut(); gStatus(); scheduleFlush(4000); });
$("#gsave").onclick = () => { generalDirty = true; if (!sb) { persistLocal(); savedG = S.gnote; savedGAt = new Date(); gStatus(); toast("Đã ghi trên máy này."); return; } clearTimeout(flushTimer); flushing ? scheduleFlush(300) : flush(); };
function renderDone(){ $("#doneMsg").textContent = S.done ? "Đã báo xong: " + S.done + ". Sửa thêm vẫn được, trang vẫn tự lưu." : ""; }
$("#doneBtn").onclick = () => {
  const d = new Date(); S.done = (S.who || "Sinh") + " lúc " + hhmm(d) + " ngày " + d.getDate() + "/" + (d.getMonth()+1);
  dirty.add("_xong"); renderDone(); scheduleFlush(100);
  toast(sb ? "Cảm ơn Sinh! Kiên sẽ thấy ngay." : "Cảm ơn Sinh! Trang chưa kết nối được máy chủ, nhớ bấm Sao chép kết quả rồi dán vào Zalo gửi Kiên.");
};
function resultText(){
  const L = ["GÓP Ý CLIP 12C – từ " + (S.who || "Sinh")];
  const ch = D.segments.filter(s => changed(s.id)), keep = D.segments.filter(s => !changed(s.id));
  if (ch.length) {
    L.push("", "ĐOẠN ĐÃ SỬA:");
    ch.forEach(s => {
      const st = S.segs[s.id];
      L.push("• " + (s.kind === "kho" ? "Ảnh khác" : s.id + " (" + mmss(s.t0) + "–" + mmss(s.t1) + ")") + ": " + (st.photos.length ? st.photos.map(label).join(", ") : "(bỏ hết ảnh)"));
      if (st.note.trim()) L.push("   Ghi chú: " + st.note.trim().replace(/\s*\n\s*/g, " / "));
    });
  } else L.push("", "Chưa sửa đoạn nào.");
  if (keep.length) L.push("", "GIỮ NGUYÊN: " + keep.filter(s => s.kind !== "kho").map(s => s.id).join(", "));
  if (S.gnote.trim()) L.push("", "GHI CHÚ CHUNG: " + S.gnote.trim());
  return L.join("\n");
}
function renderOut(){ $("#out").value = resultText(); }
$("#copyBtn").onclick = async () => {
  const t = resultText(); $("#out").value = t;
  try { await navigator.clipboard.writeText(t); toast("Đã sao chép. Mở Zalo và dán vào tin nhắn gửi Kiên."); }
  catch(e) { const o = $("#out"); o.focus(); o.select(); try { document.execCommand("copy"); toast("Đã sao chép. Mở Zalo và dán vào tin nhắn gửi Kiên."); } catch(_) { toast("Hãy giữ tay vào ô bên dưới, chọn tất cả rồi sao chép."); } }
};
let toastT = null;
function toast(m){ const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3800); }
window.addEventListener("beforeunload", e => { if (sb && (dirty.size || generalDirty || upDirty.size)) { flush(); } });

$("#dur").textContent = mmss(D.total).replace(":", " phút ") + " giây";
syncInputs(); renderAll();
initBackend();
})();
