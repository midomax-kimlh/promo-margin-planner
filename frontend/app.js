// CTKM Margin Planner v3 — reads tb_ctkm_margin_base via /api/products.
// Drill-down (Bộ môn ▸ Loại ▸ Nhóm ▸ Tên ▸ mã·màu); 4 channels (Web+SR/Ecom/ĐL1/ĐL2) with
// sold/estimate + prev-month rev/%CK, gifts (LN trừ vốn quà), aged-stock band, 3 notes, add/delete rows.
const $ = (id) => document.getElementById(id);
let DATA = [], SKU_COGS = {}, PLAN = new Set(), BYCODE = {};
let M = { m1: "m1", m2: "m2", next: "T+1" };
const collapsed = new Set();
let allOpen = true, currentVer = null;

const CH = [
  { key: "websr", gr: "f-gr-websr", tint: "web",  name: "Web + Showroom", ecom: false },
  { key: "ecom",  gr: "f-gr-ecom",  tint: "ecom", name: "Ecom (sàn)",     ecom: true  },
  { key: "dl1",   gr: "f-gr-dl1",   tint: "dl1",  name: "Đại lý cấp 1",   ecom: false },
  { key: "dl2",   gr: "f-gr-dl2",   tint: "dl2",  name: "Đại lý cấp 2",   ecom: false },
];
const shareCols = () => [
  ["Size còn", "t"], ["Tồn", "data"], ["Tồn kho lâu năm", "calc", "theo Số tháng: <6·6–12·12–24·>24"],
  ["Số tháng", "data"], ["Giá niêm yết", "data"], ["Giá vốn", "data"],
];
const chCols = (ecom) => [
  ["DS " + M.m1, "data"], ["SL " + M.m1, "data"],
  ["Giá sau giảm tb " + M.m1, "calc", "= DS ÷ SL"], ["CK " + M.m1, "data"],
  ["Ước tính " + M.next, "calc", "= SL " + M.m1 + " × (1+GR)"],
  ["Giá sau giảm", "input"], ["CK", "calc", "= 1 − Giá ÷ Niêm yết"],
  ...(ecom ? [["Phí sàn %", "input"]] : []),
  ["Quà: SKU", "input"], ["Quà: SL", "input"], ["Quà: Giá vốn", "calc", "= Vốn SKU quà × Quà SL"],
  ["%LN", "calc", "= (DS − Vốn − Quà) ÷ DS"],
  ...(ecom ? [["%LN−CP", "calc", "= %LN − Phí sàn %"]] : []),
  ["DS ước tính", "calc", "= Giá × Ước tính SL"],
  ["Lợi nhuận ước tính", "calc", ecom ? "= DS × %LN−CP" : "= DS × %LN"],
];
const NCOL = 6 + CH.reduce((a, c) => a + chCols(c.ecom).length, 0) + 3;

const vnd = (n) => (n === null || n === undefined || n === "" || isNaN(n) ? "" : Math.round(n).toLocaleString("vi-VN"));
const pct = (m) => (m === null || m === undefined || isNaN(m) ? "" : (m * 100).toFixed(1) + "%");
const fmtP = (v) => (v === "" || v == null ? "" : Number(v).toLocaleString("vi-VN"));
const dash = '<span class="muted">—</span>';
function agedBand(mo) {
  if (mo == null) return ["—", ""];
  if (mo < 6) return ["dưới 6th", "b-fresh"];
  if (mo < 12) return ["6th–1năm", "b-mid"];
  if (mo < 24) return ["1–2năm", "b-old"];
  return ["trên 2năm", "b-dead"];
}
function formatInput(el) {
  const digitsBefore = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
  const raw = el.value.replace(/\D/g, "");
  el.value = raw ? Number(raw).toLocaleString("vi-VN") : "";
  let pos = 0, d = 0;
  while (pos < el.value.length && d < digitsBefore) { const c = el.value.charCodeAt(pos); if (c >= 48 && c <= 57) d++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch (e) {}
  return raw ? Number(raw) : "";
}
function nextMonth(ym) {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return "T+1";
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const cpDefault = () => parseFloat($("f-cp").value) || 0;
function blankPromo() {
  const o = {};
  CH.forEach((c) => (o[c.key] = { price: "", phi: c.ecom ? cpDefault() : null, giftCode: "", giftSl: "" }));
  return o;
}

// ---- compute one channel ----
function compute(d, ch) {
  const p = d.promo[ch.key];
  const gr = (parseFloat($(ch.gr).value) || 0) / 100;
  const sold = d.sold[ch.key];
  const est = sold != null ? Math.round(sold * (1 + gr)) : null;
  const price = p.price || 0;
  const ckv = price && d.ny > 0 ? 1 - price / d.ny : null;
  const giftTot = (SKU_COGS[p.giftCode] || 0) * (p.giftSl || 0);  // p.giftCode giữ SKU (mặt hàng+màu+size)
  const ds = est != null ? est * price : null;
  let ln, lnCp = null, profit = null;
  if (ds && ds > 0) {                                  // có SL ước tính → theo doanh số (đã trừ quà)
    const gross = ds - est * (d.cogs || 0) - giftTot;
    ln = gross / ds;
    const fee = ch.ecom ? ds * (p.phi || 0) / 100 : 0;
    lnCp = ch.ecom ? (gross - fee) / ds : null;
    profit = ch.ecom ? gross - fee : gross;
  } else {                                             // chưa có SL → biên đơn vị để %LN vẫn hiện
    ln = price > 0 ? (price - (d.cogs || 0)) / price : null;
    lnCp = ch.ecom && price > 0 ? ln - (p.phi || 0) / 100 : null;
  }
  return { est, ckv, giftTot, ds, ln, lnCp, profit };
}
const gmc = (v) => "gm " + (v == null ? "" : v >= 0 ? "pos" : "neg");

function chLeaf(d, ch) {
  const k = ch.key, t = ch.tint, p = d.promo[k];
  const sold = d.sold[k], rev = d.rev[k], ck1 = d.ckm1[k];
  const { est, ckv, giftTot, ds, ln, lnCp, profit } = compute(d, ch);
  let s = "";
  const avgP = (sold && rev != null) ? rev / sold : null;   // Giá sau giảm tb = DS ÷ SL
  s += `<td class="g-${t} sep-${t}">${rev != null ? vnd(rev) : dash}</td>`;   // DS (doanh số)
  s += `<td class="g-${t}">${sold != null ? sold : dash}</td>`;              // SL (số lượng)
  s += `<td class="g-${t} calc">${avgP != null ? vnd(avgP) : dash}</td>`;    // Giá sau giảm tb
  s += `<td class="g-${t} calc">${ck1 != null ? pct(ck1) : dash}</td>`;      // CK
  s += `<td class="g-${t}" data-ch="${k}" data-c="est">${est != null ? `<b>${est}</b>` : "—"}</td>`;
  s += `<td class="g-${t}"><input class="inp" data-ch="${k}" data-c="price" value="${fmtP(p.price)}"></td>`;
  s += `<td class="g-${t} calc" data-ch="${k}" data-c="ck">${pct(ckv)}</td>`;
  if (ch.ecom) s += `<td class="g-${t}"><input class="inp pct" data-ch="${k}" data-c="phi" value="${p.phi ?? ""}"></td>`;
  s += `<td class="g-${t}"><input class="inp giftinp" list="giftlist" data-ch="${k}" data-c="giftCode" value="${p.giftCode || ""}" placeholder="SKU quà" style="width:90px"></td>`;
  s += `<td class="g-${t}"><input class="inp pct" data-ch="${k}" data-c="giftSl" value="${p.giftSl || ""}"></td>`;
  s += `<td class="g-${t} calc" data-ch="${k}" data-c="giftcost">${giftTot ? vnd(giftTot) : ""}</td>`;
  s += `<td class="${gmc(ln)}" data-ch="${k}" data-c="ln">${pct(ln)}</td>`;
  if (ch.ecom) s += `<td class="${gmc(lnCp)}" data-ch="${k}" data-c="lncp">${pct(lnCp)}</td>`;
  s += `<td class="g-${t} calc" data-ch="${k}" data-c="ds">${vnd(ds)}</td>`;
  s += `<td class="${gmc(profit)}" data-ch="${k}" data-c="profit">${vnd(profit)}</td>`;
  return s;
}
function leafRow(d) {
  const [bl, bc] = agedBand(d.age);
  let s = `<tr class="leaf" data-i="${d._i}">`;
  s += `<td class="frz t"><div class="prod">${d.img ? `<img class="thumb" src="${d.img}" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="thumb"></span>`}` +
       `<span class="pname"><span class="nm">${d.color || d.product || "—"}</span><span class="code">${d.code}</span></span>` +
       `<span class="rowdel" data-del="${d.code}" title="Xóa dòng khỏi kế hoạch">✕</span></div></td>`;
  s += `<td class="g-share t sizes">${d.sizes || "—"}</td>`;
  s += `<td class="g-share">${d.inv ?? ""}</td>`;
  s += `<td class="g-share">${bl === "—" ? dash : `<span class="band ${bc}">${bl}</span>`}</td>`;
  s += `<td class="g-share muted">${d.age == null ? "—" : (+d.age).toFixed(0)}</td>`;
  s += `<td class="g-share">${vnd(d.ny)}</td>`;
  s += `<td class="g-share">${vnd(d.cogs)}</td>`;
  CH.forEach((ch) => (s += chLeaf(d, ch)));
  s += `<td class="g-note t sep-note"><input class="note-inp" data-note="buon" value="${d.notes.buon || ""}" placeholder="note buôn…"></td>`;
  s += `<td class="g-note t"><input class="note-inp" data-note="le" value="${d.notes.le || ""}" placeholder="note lẻ…"></td>`;
  s += `<td class="g-note t"><input class="note-inp" data-note="chung" value="${d.notes.chung || ""}" placeholder="note chung…"></td>`;
  return s + "</tr>";
}
function groupRow(level, label, key, cnt) {
  const car = collapsed.has(key) ? "▸" : "▾";
  return `<tr class="grp-row"><td class="frz t"><span class="caret lv${level}" data-key="${key}">${car}</span>` +
    `<span class="lv${level}" style="padding-left:0">${label || "(—)"}</span>` +
    `<span class="muted" style="font-weight:400"> · ${cnt}</span></td><td colspan="${NCOL}"></td></tr>`;
}

// ---- headers ----
function buildHeaders() {
  const grp = $("grpRow"), sub = $("subRow"); grp.innerHTML = ""; sub.innerHTML = "";
  grp.insertAdjacentHTML("beforeend", `<th class="frz t">SẢN PHẨM</th>`);
  grp.insertAdjacentHTML("beforeend", `<th class="share" colspan="6" style="background:var(--brand-d);color:#fff">TỒN KHO · GIÁ VỐN</th>`);
  CH.forEach((c) => grp.insertAdjacentHTML("beforeend", `<th class="${c.tint} sep-${c.tint}" colspan="${chCols(c.ecom).length}">${c.name}</th>`));
  grp.insertAdjacentHTML("beforeend", `<th class="note sep-note" colspan="3">GHI CHÚ</th>`);
  sub.insertAdjacentHTML("beforeend", `<th class="frz t">Bộ môn ▸ Nhóm ▸ Tên ▸ Mã·Màu</th>`);
  const cap = (cc) => cc[2] ? `<div class="f">${cc[2]}</div>` : (cc[1] === "input" ? `<div class="f in">✎ nhập</div>` : (cc[1] === "data" ? `<div class="f">DWH</div>` : ""));
  shareCols().forEach((sc) => sub.insertAdjacentHTML("beforeend", `<th class="g-share">${sc[0]}${cap(sc)}</th>`));
  CH.forEach((c) => chCols(c.ecom).forEach((cc, i) => sub.insertAdjacentHTML("beforeend", `<th class="g-${c.tint} ${i === 0 ? "sep-" + c.tint : ""}">${cc[0]}${cap(cc)}</th>`)));
  sub.insertAdjacentHTML("beforeend", `<th class="g-note t sep-note">Note bán buôn</th><th class="g-note t">Note bán lẻ</th><th class="g-note t">Note chung</th>`);
}

// ---- render ----
const LEVELS = ["sport", "group", "product"];   // "Loại" (product_type = "02. giày") bỏ: trùng nghĩa với "Nhóm" (giày)
const totalSold = (d) => CH.reduce((a, c) => a + (d.sold[c.key] || 0), 0);
function pathsOf(d) {
  const a = d.sport, b = a + "|" + d.group, c = b + "|" + d.product;
  return [a, b, c];
}
function render() {
  const fs = $("f-sport").value, st = $("f-stock").value, q = $("f-search").value.trim().toLowerCase();
  let rows = DATA.filter((d) => PLAN.has(d.code) && (() => {
    if (fs && d.sport !== fs) return false;
    if (st === "instock" && !(d.inv > 0)) return false;
    if (st === "sold" && totalSold(d) === 0) return false;
    if (q && !((d.code || "").toLowerCase().includes(q) || (d.product || "").toLowerCase().includes(q))) return false;
    return true;
  })());
  rows.sort((a, b) => (a.sport + a.type + a.group + a.product + a.code).localeCompare(b.sport + b.type + b.group + b.product + b.code));
  const cnt = {};
  rows.forEach((d) => pathsOf(d).forEach((k) => (cnt[k] = (cnt[k] || 0) + 1)));
  let html = "", last = ["", "", ""], shown = 0;
  rows.forEach((d) => {
    const path = pathsOf(d);
    for (let lv = 0; lv < 3; lv++) {
      if (path[lv] !== last[lv]) {
        last[lv] = path[lv]; for (let k = lv + 1; k < 3; k++) last[k] = "";
        if (!path.slice(0, lv).some((a) => collapsed.has(a))) html += groupRow(lv, d[LEVELS[lv]], path[lv], cnt[path[lv]]);
      }
    }
    if (!path.some((a) => collapsed.has(a))) { html += leafRow(d); shown++; }
  });
  $("body").innerHTML = html;
  $("count").innerHTML = `<b>${shown}</b> mã·màu trong kế hoạch · kỳ CTKM <b>${M.next}</b> · số bán tháng ${M.m1}`;
}
function recalc(tr, d, ch) {
  const { est, ckv, giftTot, ds, ln, lnCp, profit } = compute(d, ch); const k = ch.key;
  const q = (c) => tr.querySelector(`[data-ch="${k}"][data-c="${c}"]`);
  if (q("est")) q("est").innerHTML = est != null ? `<b>${est}</b>` : "—";
  if (q("ck")) q("ck").textContent = pct(ckv);
  if (q("giftcost")) q("giftcost").textContent = giftTot ? vnd(giftTot) : "";
  gmset(q("ln"), ln, pct(ln));
  if (ch.ecom) gmset(q("lncp"), lnCp, pct(lnCp));
  if (q("ds")) q("ds").textContent = vnd(ds);
  gmset(q("profit"), profit, vnd(profit));
}
function gmset(el, v, txt) { if (!el) return; el.textContent = txt; el.classList.remove("pos", "neg"); if (v != null) el.classList.add(v >= 0 ? "pos" : "neg"); }

// ---- events ----
$("body").addEventListener("click", (e) => {
  const del = e.target.dataset.del;
  if (del) { PLAN.delete(del); sendItem(BYCODE[del], 0); render(); toast("Đã xóa dòng " + del); return; }
  const c = e.target.closest(".caret"); if (!c) return;
  const k = c.dataset.key; collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); render();
});
$("body").addEventListener("input", (e) => {
  const t = e.target; if (t.tagName !== "INPUT") return;
  const tr = t.closest("tr"), d = DATA[+tr.dataset.i];
  if (t.dataset.note) { d.notes[t.dataset.note] = t.value; scheduleSend(d); return; }
  const k = t.dataset.ch, c = t.dataset.c, p = d.promo[k], ch = CH.find((x) => x.key === k);
  if (c === "price") p.price = formatInput(t);
  else if (c === "phi") { p.phi = parseFloat(t.value); if (isNaN(p.phi)) p.phi = 0; }
  else if (c === "giftCode") p.giftCode = t.value.trim();
  else if (c === "giftSl") p.giftSl = parseFloat(t.value) || 0;
  recalc(tr, d, ch); scheduleSend(d);
});
["f-sport", "f-stock", "f-search", "f-gr-websr", "f-gr-ecom", "f-gr-dl1", "f-gr-dl2"].forEach((id) => $(id).addEventListener("input", render));
$("f-cp").addEventListener("input", () => { const v = cpDefault(); DATA.forEach((d) => (d.promo.ecom.phi = v)); render(); });  // CP = mặc định client; phí sàn từng dòng khi sửa mới ghi chung
$("refresh").addEventListener("click", () => { if (confirm("Tải lại số liệu mới nhất từ hệ thống?")) load(); });
$("expand").addEventListener("click", () => {
  allOpen = !allOpen; collapsed.clear();
  if (!allOpen) [...new Set(DATA.filter((d) => PLAN.has(d.code)).map((d) => d.sport))].forEach((s) => collapsed.add(s));
  render();
});

// ---- add / delete rows (plan membership) ----
$("btn-addrow").addEventListener("click", () => { $("addmodal").hidden = false; $("addsearch").value = ""; renderAddList(""); setTimeout(() => $("addsearch").focus(), 50); });
$("add-cancel").addEventListener("click", () => ($("addmodal").hidden = true));
$("addmodal").addEventListener("click", (e) => { if (e.target.id === "addmodal") $("addmodal").hidden = true; });
$("addsearch").addEventListener("input", (e) => renderAddList(e.target.value));
function renderAddList(q) {
  q = q.trim().toLowerCase();
  const items = DATA.filter((d) => !PLAN.has(d.code) && (!q || (d.code || "").toLowerCase().includes(q) || (d.product || "").toLowerCase().includes(q))).slice(0, 60);
  $("addlist").innerHTML = items.length
    ? items.map((d) => `<div class="addrow-item" data-add="${d.code}"><span class="pname"><span class="nm">${d.product || "—"} · ${d.color || ""}</span><span class="cd">Mã hàng: ${d.code}</span></span><span class="plus">＋</span></div>`).join("")
    : '<div class="emptyv">Không tìm thấy mã phù hợp (hoặc đã có trong kế hoạch).</div>';
}
$("addlist").addEventListener("click", (e) => {
  const it = e.target.closest("[data-add]"); if (!it) return;
  const code = it.dataset.add; PLAN.add(code); sendItem(BYCODE[code], 1); render(); renderAddList($("addsearch").value); toast("Đã thêm " + code);
});

// ---- shared plan via API + realtime WebSocket ----
let VERS = [], WS = null, sendTimers = {}, wsReady = false;
const enc = encodeURIComponent;
const nowStr = () => new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
const promoOf = (d) => { const o = {}; CH.forEach((c) => { const p = d.promo[c.key]; o[c.key] = { price: p.price, phi: p.phi, giftCode: p.giftCode, giftSl: p.giftSl }; }); return o; };
const itemMsg = (d, inPlan) => ({ type: "item", code: d.code, in_plan: inPlan != null ? inPlan : (PLAN.has(d.code) ? 1 : 0), promo: promoOf(d), notes: { ...d.notes } });
function sendNow(d, inPlan) { if (d && WS && WS.readyState === 1) { WS.send(JSON.stringify(itemMsg(d, inPlan))); $("autotxt").textContent = "Đã lưu (chung) · " + nowStr(); } }
function sendItem(d, inPlan) { sendNow(d, inPlan); }                                  // membership change: gửi ngay
function scheduleSend(d) { clearTimeout(sendTimers[d.code]); sendTimers[d.code] = setTimeout(() => sendNow(d, PLAN.has(d.code) ? 1 : 0), 400); } // sửa ô: debounce

function applyItemToData(d, promo, notes, inPlan) {
  d.promo = blankPromo();
  if (promo) CH.forEach((c) => { if (promo[c.key]) Object.assign(d.promo[c.key], promo[c.key]); });
  d.notes = { buon: "", le: "", chung: "", ...(notes || {}) };
  if (inPlan) PLAN.add(d.code); else PLAN.delete(d.code);
}
async function refreshItem(code) {                                                     // B ĐỌC mã vừa đổi TỪ DB (không tin gói đẩy)
  const d = BYCODE[code]; if (!d) return;
  const wasIn = PLAN.has(code);
  try {
    const r = await fetch(`/api/plan/item?campaign=${enc(M.next)}&code=${enc(code)}`);
    const j = await r.json();
    if (j.item) applyItemToData(d, j.item.promo, j.item.notes, j.item.in_plan);
    else applyItemToData(d, null, null, 0);
  } catch (e) { return; }
  if (wasIn !== PLAN.has(code)) { render(); return; }                                  // đổi thành viên → render lại toàn bộ
  const tr = $("body").querySelector(`tr.leaf[data-i="${d._i}"]`);
  if (tr && !tr.contains(document.activeElement)) tr.outerHTML = leafRow(d);           // cập nhật dòng (trừ khi đang gõ tại đây)
}
function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  WS = new WebSocket(`${proto}://${location.host}/ws?campaign=${enc(M.next)}`);
  WS.onopen = () => { if (wsReady) { loadPlanState().then(render); loadVersions(); } wsReady = true; };  // kết nối lại → đồng bộ full từ DB (bù gói lỡ)
  WS.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === "changed") refreshItem(m.code);                                      // tín hiệu → ĐỌC mã đó từ DB
    else if (m.type === "versions") loadVersions();
    else if (m.type === "reload") loadPlanState().then(render); };
  WS.onclose = () => setTimeout(connectWS, 2000);                                       // tự kết nối lại
}
async function loadPlanState() {
  const r = await fetch(`/api/plan?campaign=${enc(M.next)}`); const j = await r.json();
  PLAN = new Set();
  DATA.forEach((d) => { d.promo = blankPromo(); d.notes = { buon: "", le: "", chung: "" }; });
  (j.items || []).forEach((it) => { const d = BYCODE[it.code]; if (d) applyItemToData(d, it.promo, it.notes, it.in_plan); });
}

// ---- versions (DB, dùng chung) ----
async function loadVersions() {
  try { const r = await fetch(`/api/versions?campaign=${enc(M.next)}`); VERS = (await r.json()).versions || []; } catch (e) { VERS = []; }
  $("vcount").textContent = VERS.length; $("panel-camp").textContent = "CTKM " + M.next;
  if (!$("panel").hidden) renderVersions();
}
function renderVersions() {
  $("vlist").innerHTML = VERS.length ? VERS.map((v) => `
    <div class="vrow">
      <div><div class="vn">${v.name}</div><div class="vt">${String(v.created_at || "").replace("T", " ").slice(0, 16)}${v.created_by ? " · " + v.created_by : ""}</div></div>
      <div class="sp2"></div>
      <button class="mini open" data-open="${v.id}">Mở</button>
      <button class="mini del" data-del="${v.id}">Xoá</button>
    </div>`).join("") : '<div class="emptyv">Chưa có phiên bản nào. Nhập giá rồi bấm "Lưu phiên bản".</div>';
}
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1800); }

$("btn-ver").addEventListener("click", () => { const p = $("panel"); p.hidden = !p.hidden; if (!p.hidden) renderVersions(); });
$("vlist").addEventListener("click", async (e) => {
  const o = e.target.dataset.open, dl = e.target.dataset.del;
  if (o) { await fetch(`/api/versions/${o}/restore`, { method: "POST" }); toast("Đang mở phiên bản…"); }   // server broadcast 'reload'
  if (dl) { if (confirm("Xoá phiên bản này?")) { await fetch(`/api/versions/${dl}`, { method: "DELETE" }); toast("Đã xoá phiên bản"); } }
});
$("btn-save").addEventListener("click", () => { $("modal").hidden = false; $("vname").value = ""; setTimeout(() => $("vname").focus(), 50); });
$("m-cancel").addEventListener("click", () => ($("modal").hidden = true));
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("modal").hidden = true; });
$("m-ok").addEventListener("click", async () => {
  const name = $("vname").value.trim() || ("Phiên bản " + nowStr());
  $("modal").hidden = true;
  await fetch("/api/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign: M.next, name }) });
  toast('Đã lưu phiên bản "' + name + '"');   // server broadcast 'versions' → loadVersions
});

function buildGiftList(rows) {   // gift picker at SKU grain (mặt hàng + màu + size)
  let dl = document.getElementById("giftlist");
  if (!dl) { dl = document.createElement("datalist"); dl.id = "giftlist"; document.body.appendChild(dl); }
  dl.innerHTML = rows.map((r) => `<option value="${r.sku}">${(r.ic_desc || "").slice(0, 50)}</option>`).join("");
}

async function load() {
  $("count").textContent = "Đang tải…";
  try {
    const res = await fetch("/api/products?limit=10000");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    M.m1 = j.months.month_m1 || "m1"; M.m2 = j.months.month_m2 || "m2"; M.next = nextMonth(M.m1);
    $("campaign").textContent = "CTKM " + M.next;
    DATA = j.rows.map((r, i) => ({
      _i: i,
      sport: r.sport_desc || "(chưa rõ bộ môn)", type: r.product_type || "(chưa phân loại)",
      group: r.group_product || "(chưa rõ nhóm)", product: r.product_desc || "(chưa rõ tên)",
      code: r.code, color: r.color, sizes: r.sizes_in_stock, img: r.image_src,
      inv: r.instock, age: r.months_since_receipt, ny: r.list_price, cogs: r.cogs,
      inctkm: r.in_ctkm === 1 || r.in_ctkm === true,
      sold: { websr: r.sold_websr_m1, ecom: r.sold_ecom_m1, dl1: r.sold_dl1_m1, dl2: r.sold_dl2_m1 },
      rev:  { websr: r.rev_websr_m1,  ecom: r.rev_ecom_m1,  dl1: r.rev_dl1_m1,  dl2: r.rev_dl2_m1  },
      ckm1: { websr: r.ck_websr_m1,   ecom: r.ck_ecom_m1,   dl1: r.ck_dl1_m1,   dl2: r.ck_dl2_m1   },
      promo: null, notes: { buon: "", le: "", chung: "" },
    }));
    DATA.forEach((d) => (d.promo = blankPromo()));
    BYCODE = {}; DATA.forEach((d) => (BYCODE[d.code] = d));
    try {
      const sres = await fetch("/api/skus");
      const sj = sres.ok ? await sres.json() : { rows: [] };
      SKU_COGS = {}; sj.rows.forEach((r) => { if (r.cogs != null) SKU_COGS[r.sku] = r.cogs; });
      buildGiftList(sj.rows);
    } catch (e) { buildGiftList([]); }
    buildHeaders();
    const sel = $("f-sport"), cur = sel.value, sports = [...new Set(DATA.map((d) => d.sport))].sort();
    sel.innerHTML = '<option value="">Tất cả</option>' + sports.map((s) => `<option>${s}</option>`).join(""); sel.value = cur;
    await loadPlanState();
    await loadVersions();
    render();
    if (!WS) connectWS();
  } catch (e) {
    $("count").textContent = "Lỗi tải dữ liệu: " + e.message;
  }
}
load();
