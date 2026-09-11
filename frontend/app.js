// promo-margin-planner v2 — reads tb_ctkm_margin_base via /api/products, renders the drill-down grid
// (Sport ▸ Loại ▸ Nhóm ▸ Tên ▸ mã·màu), 4 promo channels with live %CK/%LN. Promo starts empty (not persisted).
const $ = (id) => document.getElementById(id);
const NCOL = 26;               // non-frozen columns (group-row colspan)
let DATA = [];
let M = { m1: "m1", m2: "m2", next: "T+1" };
const collapsed = new Set();
let allOpen = true;

const vnd = (n) => (n === null || n === undefined || n === "" ? "" : Math.round(n).toLocaleString("vi-VN"));
const pct = (m) => (m === null || m === undefined || isNaN(m) ? "" : (m * 100).toFixed(1) + "%");
const gm = (p, c) => (p && p > 0 && c != null ? (p - c) / p : null);
const ck = (p, ny) => (p && ny > 0 ? 1 - p / ny : null);
const band = (v) => (v == null ? "—" : v < 100 ? "<100" : v < 500 ? "100–499" : "≥500");
// availability lens: low stock = red, plenty = green
const bandCls = (v) => (v == null ? "" : v < 100 ? "b-bad" : v < 500 ? "b-warn" : "b-good");
// price display with '.' thousands (vi-VN); store raw number
const fmtP = (v) => (v === "" || v == null ? "" : Number(v).toLocaleString("vi-VN"));
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
function setHeaders() {
  $("h-r2").textContent = "Lẻ " + M.m2; $("h-r1").textContent = "Lẻ " + M.m1; $("h-re").textContent = "Lẻ " + M.next;
  $("h-w1").textContent = "Buôn " + M.m2; $("h-w0").textContent = "Buôn " + M.m1; $("h-we").textContent = "Buôn " + M.next;
  $("campaign").textContent = "CTKM " + M.next;
}

function gmc(p, c, chn) { const m = gm(p, c); return `<td class="gm ${m === null ? "" : m >= 0 ? "pos" : "neg"}" data-gm="${chn}">${pct(m)}</td>`; }
function ckc(p, ny, chn) { return `<td class="ck" data-ck="${chn}">${pct(ck(p, ny))}</td>`; }

function leafRow(d) {
  const rr = 1 + (parseFloat($("f-r-retail").value) || 0) / 100;
  const wr = 1 + (parseFloat($("f-r-whole").value) || 0) / 100;
  const rowcp = d.cp != null ? d.cp : (parseFloat($("f-cp").value) || 0); // Phí sàn % — default = CP toolbar
  const est_r = Math.round((d.r1 || 0) * rr), est_w = Math.round((d.w1 || 0) * wr);
  const fee = d.promo.ecom ? d.promo.ecom * rowcp / 100 : 0;
  const after = d.promo.ecom && d.promo.ecom > 0 ? (d.promo.ecom - d.cogs - fee) / d.promo.ecom : null;
  return `<tr class="leaf" data-i="${d._i}">
   <td class="frz t">${d.img ? `<img class="thumb" src="${d.img}" loading="lazy" onerror="this.style.display='none'">` : ""}<b>${d.color || "—"}</b> <span class="code">${d.code}</span></td>
   <td>${d.inv ?? ""}</td><td class="t band ${bandCls(d.inv)}">${band(d.inv)}</td><td>${d.age == null ? '<span class="muted">—</span>' : (+d.age).toFixed(0)}</td>
   <td>${d.r2 || ""}</td><td>${d.r1 || ""}</td><td>${est_r || ""}</td>
   <td>${d.w2 || ""}</td><td>${d.w1 || ""}</td><td>${est_w || ""}</td>
   <td>${vnd(d.ny)}</td><td>${vnd(d.cogs)}</td>
   <td class="promo"><input class="inp" data-ch="web" value="${fmtP(d.promo.web)}"></td>${ckc(d.promo.web, d.ny, "web")}${gmc(d.promo.web, d.cogs, "web")}
   <td class="promo"><input class="inp" data-ch="ecom" value="${fmtP(d.promo.ecom)}"></td>${ckc(d.promo.ecom, d.ny, "ecom")}${gmc(d.promo.ecom, d.cogs, "ecom")}<td class="promo"><input class="inp" data-cp="1" value="${rowcp}" title="Phí sàn % — mặc định = CP Sàn+QC"></td><td class="gm ${after === null ? "" : after >= 0 ? "pos" : "neg"}" data-gm="ecomAfter">${pct(after)}</td>
   <td class="promo"><input class="inp" data-ch="dl1" value="${fmtP(d.promo.dl1)}"></td>${ckc(d.promo.dl1, d.ny, "dl1")}${gmc(d.promo.dl1, d.cogs, "dl1")}
   <td class="promo"><input class="inp" data-ch="dl2" value="${fmtP(d.promo.dl2)}"></td>${ckc(d.promo.dl2, d.ny, "dl2")}${gmc(d.promo.dl2, d.cogs, "dl2")}
   <td class="t"><input class="inp note-inp" data-note="1" value="${d.note}" placeholder="ghi chú…"></td>
  </tr>`;
}
function groupRow(level, label, key, cnt) {
  const car = collapsed.has(key) ? "▸" : "▾";
  return `<tr class="grp-row"><td class="frz t">
     <span class="caret lv${level}" data-key="${key}">${car}</span><span class="lv${level}" style="padding-left:0">${label || "(—)"}</span>
     <span class="muted" style="font-weight:400"> · ${cnt}</span></td><td colspan="${NCOL}"></td></tr>`;
}
const LEVELS = ["sport", "type", "group", "product"];
function render() {
  const fs = $("f-sport").value, st = $("f-stock").value, q = $("f-search").value.trim().toLowerCase();
  let rows = DATA.filter((d) => {
    const sold = (d.r1 || 0) + (d.r2 || 0) + (d.w1 || 0) + (d.w2 || 0);
    if (fs && d.sport !== fs) return false;
    if (st === "instock" && !(d.inv > 0)) return false;
    if (st === "sold" && sold === 0) return false;
    if (q && !((d.code || "").toLowerCase().includes(q) || (d.product || "").toLowerCase().includes(q))) return false;
    return true;
  });
  rows.sort((a, b) => (a.sport + a.type + a.group + a.product + a.code).localeCompare(b.sport + b.type + b.group + b.product + b.code));
  const cnt = {};
  rows.forEach((d) => { pathsOf(d).forEach((k) => (cnt[k] = (cnt[k] || 0) + 1)); });
  let html = "", last = ["", "", "", ""], shown = 0;
  rows.forEach((d) => {
    const path = pathsOf(d);
    for (let lv = 0; lv < 4; lv++) {
      if (path[lv] !== last[lv]) {
        last[lv] = path[lv]; for (let k = lv + 1; k < 4; k++) last[k] = "";
        if (!path.slice(0, lv).some((a) => collapsed.has(a))) html += groupRow(lv, d[LEVELS[lv]], path[lv], cnt[path[lv]]);
      }
    }
    if (!path.some((a) => collapsed.has(a))) { html += leafRow(d); shown++; }
  });
  $("body").innerHTML = html;
  $("count").innerHTML = `<b>${shown}</b> mã·màu · kỳ CTKM <b>${M.next}</b> · số bán ${M.m2}→${M.m1}`;
}
function pathsOf(d) {
  const a = d.sport, b = a + "|" + d.type, c = b + "|" + d.group, e = c + "|" + d.product;
  return [a, b, c, e];
}

$("body").addEventListener("click", (e) => {
  const c = e.target.closest(".caret"); if (!c) return;
  const k = c.dataset.key; collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); render();
});
$("body").addEventListener("input", (e) => {
  const t = e.target; if (t.tagName !== "INPUT") return;
  const tr = t.closest("tr"), d = DATA[+tr.dataset.i];
  if (t.dataset.note !== undefined) { d.note = t.value; saveDraft(); return; }
  if (t.dataset.cp !== undefined) { d.cp = parseFloat(t.value); if (isNaN(d.cp)) d.cp = 0; recomputeEcomAfter(tr, d); saveDraft(); return; }
  const chn = t.dataset.ch; d.promo[chn] = formatInput(t); // reformat with '.' + store raw number
  const ckCell = tr.querySelector(`[data-ck="${chn}"]`); if (ckCell) ckCell.textContent = pct(ck(d.promo[chn], d.ny));
  const gmCell = tr.querySelector(`[data-gm="${chn}"]`);
  if (gmCell) { const m = gm(d.promo[chn], d.cogs); gmCell.textContent = pct(m); gmCell.className = "gm " + (m === null ? "" : m >= 0 ? "pos" : "neg"); gmCell.setAttribute("data-gm", chn); }
  if (chn === "ecom") recomputeEcomAfter(tr, d);
  saveDraft();
});
function recomputeEcomAfter(tr, d) {
  const rowcp = d.cp != null ? d.cp : (parseFloat($("f-cp").value) || 0);
  const p = d.promo.ecom, fee = p ? p * rowcp / 100 : 0;
  const a = p && p > 0 ? (p - d.cogs - fee) / p : null, cell = tr.querySelector('[data-gm="ecomAfter"]');
  if (cell) { cell.textContent = pct(a); cell.className = "gm " + (a === null ? "" : a >= 0 ? "pos" : "neg"); cell.setAttribute("data-gm", "ecomAfter"); }
}
["f-sport", "f-stock", "f-search", "f-r-retail", "f-r-whole"].forEach((id) => $(id).addEventListener("input", render));
// changing the global CP resets every row's Phí sàn to that new default
$("f-cp").addEventListener("input", () => { DATA.forEach((d) => delete d.cp); render(); });
$("refresh").addEventListener("click", () => { if (confirm("Refresh sẽ tải lại số liệu hệ thống và XÓA giá CTKM đã nhập (nháp). Tiếp tục?")) { try { localStorage.removeItem(draftKey()); } catch (e) {} load(false); } });
$("expand").addEventListener("click", () => {
  allOpen = !allOpen; collapsed.clear();
  if (!allOpen) [...new Set(DATA.map((d) => d.sport))].forEach((s) => collapsed.add(s));
  render();
});

// ===== draft (localStorage) + named versions (per campaign month) =====
const draftKey = () => "ctkm.draft." + M.next;
const verKey = () => "ctkm.versions." + M.next;
const LSget = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const nowStr = () => new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
let currentVer = null;

function collectInputs() {                 // only the planner's inputs are saved
  const m = {};
  DATA.forEach((d) => {
    const p = d.promo;
    const has = [p.web, p.ecom, p.dl1, p.dl2].some((x) => x !== "" && x != null) || d.note || d.cp != null;
    if (has) m[d.code] = { web: p.web, ecom: p.ecom, dl1: p.dl1, dl2: p.dl2, note: d.note || "", cp: d.cp ?? null };
  });
  return m;
}
function applyInputs(m) {
  DATA.forEach((d) => {
    const v = m[d.code];
    if (v) { d.promo = { web: v.web ?? "", ecom: v.ecom ?? "", dl1: v.dl1 ?? "", dl2: v.dl2 ?? "" }; d.note = v.note || ""; if (v.cp != null) d.cp = v.cp; else delete d.cp; }
    else { d.promo = { web: "", ecom: "", dl1: "", dl2: "" }; d.note = ""; delete d.cp; }
  });
}
function applyDraft() { const m = LSget(draftKey()); if (m) { applyInputs(m); $("autotxt").textContent = "Khôi phục nháp · " + nowStr(); } }
function saveDraft() { LSset(draftKey(), collectInputs()); $("autotxt").textContent = "Nháp đã lưu · " + nowStr(); }

const getVersions = () => LSget(verKey()) || [];
const setVersions = (v) => LSset(verKey(), v);
function refreshVersionUI() { $("vcount").textContent = getVersions().length; $("panel-camp").textContent = "CTKM " + M.next; if (!$("panel").hidden) renderVersions(); }
function renderVersions() {
  const vs = getVersions();
  $("vlist").innerHTML = vs.length ? vs.slice().reverse().map((v) => `
    <div class="vrow ${v.id === currentVer ? "cur" : ""}">
      <div><div class="vn">${v.name}</div><div class="vt">${v.time} · ${Object.keys(v.inputs).length} mã</div></div>
      <div class="sp2"></div>
      <button class="mini open" data-open="${v.id}">Mở</button>
      <button class="mini del" data-del="${v.id}">Xoá</button>
    </div>`).join("") : '<div class="emptyv">Chưa có phiên bản nào. Nhập giá rồi bấm "Lưu phiên bản".</div>';
}
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1800); }

$("btn-ver").addEventListener("click", () => { const p = $("panel"); p.hidden = !p.hidden; if (!p.hidden) renderVersions(); });
$("vlist").addEventListener("click", (e) => {
  const o = e.target.dataset.open, dl = e.target.dataset.del;
  if (o) { const v = getVersions().find((x) => x.id === o); applyInputs(JSON.parse(JSON.stringify(v.inputs))); currentVer = o; saveDraft(); render(); renderVersions(); toast("Đã mở phiên bản: " + v.name); }
  if (dl) { setVersions(getVersions().filter((x) => x.id !== dl)); if (currentVer === dl) currentVer = null; refreshVersionUI(); toast("Đã xoá phiên bản"); }
});
$("btn-save").addEventListener("click", () => { $("modal").hidden = false; $("vname").value = ""; setTimeout(() => $("vname").focus(), 50); });
$("m-cancel").addEventListener("click", () => ($("modal").hidden = true));
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("modal").hidden = true; });
$("m-ok").addEventListener("click", () => {
  const name = $("vname").value.trim() || ("Phiên bản " + nowStr());
  const vs = getVersions(); const id = "v" + Date.now();
  vs.push({ id, name, time: nowStr(), inputs: collectInputs() });
  setVersions(vs); currentVer = id; $("modal").hidden = true; refreshVersionUI(); toast('Đã lưu phiên bản "' + name + '"');
});

async function load(restore = true) {
  $("count").textContent = "Đang tải…";
  try {
    const res = await fetch("/api/products?limit=10000");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    M.m1 = j.months.month_m1 || "m1"; M.m2 = j.months.month_m2 || "m2"; M.next = nextMonth(M.m1);
    setHeaders();
    DATA = j.rows.map((r, i) => ({
      _i: i,
      sport: r.sport_desc || "(chưa rõ bộ môn)", type: r.product_type || "(chưa phân loại)",
      group: r.group_product || "(chưa rõ nhóm)", product: r.product_desc || "(chưa rõ tên)",
      code: r.code, color: r.color, sizes: r.sizes_in_stock, img: r.image_src,
      inv: r.instock, age: r.months_since_receipt, ny: r.list_price, cogs: r.cogs,
      r2: r.sold_retail_m2, r1: r.sold_retail_m1, w2: r.sold_wholesale_m2, w1: r.sold_wholesale_m1,
      promo: { web: "", ecom: "", dl1: "", dl2: "" }, note: "",
    }));
    const sel = $("f-sport"), cur = sel.value;
    const sports = [...new Set(DATA.map((d) => d.sport))].sort();
    sel.innerHTML = '<option value="">Tất cả</option>' + sports.map((s) => `<option>${s}</option>`).join("");
    sel.value = cur;
    if (restore) applyDraft(); else currentVer = null;
    refreshVersionUI();
    render();
  } catch (e) {
    $("count").textContent = "Lỗi tải dữ liệu: " + e.message;
  }
}
load(true);
