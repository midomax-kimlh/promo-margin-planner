// Baseline: fetch a slice of tb_ctkm_margin_base and render it. Editable grid + live %GM come later.
const COLUMNS = [
  { key: "code", label: "Mã", left: true },
  { key: "product_desc", label: "Tên hàng", left: true },
  { key: "color", label: "Màu", left: true },
  { key: "instock", label: "Tồn" },
  { key: "sizes_in_stock", label: "Size còn", left: true },
  { key: "months_since_receipt", label: "Số tháng" },
  { key: "list_price", label: "Giá niêm yết" },
  { key: "cogs", label: "Giá vốn" },
  { key: "sold_retail_m2", label: "Bán lẻ (m2)" },
  { key: "sold_retail_m1", label: "Bán lẻ (m1)" },
  { key: "sold_wholesale_m2", label: "Bán buôn (m2)" },
  { key: "sold_wholesale_m1", label: "Bán buôn (m1)" },
];

const fmt = (v) =>
  v === null || v === undefined ? "" : typeof v === "number" ? v.toLocaleString("vi-VN") : v;

async function load() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("/api/products?limit=200");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    // month labels drive the "m1/m2" headers (e.g. "Bán lẻ · 2026-08")
    const m1 = data.months.month_m1 || "m1";
    const m2 = data.months.month_m2 || "m2";
    const cols = COLUMNS.map((c) => ({
      ...c,
      label: c.label.replace("(m1)", "· " + m1).replace("(m2)", "· " + m2),
    }));

    document.querySelector("#grid thead").innerHTML =
      "<tr>" + cols.map((c) => `<th class="${c.left ? "t" : ""}">${c.label}</th>`).join("") + "</tr>";
    document.querySelector("#grid tbody").innerHTML = data.rows
      .map(
        (r) =>
          "<tr>" +
          cols.map((c) => `<td class="${c.left ? "t" : ""}">${fmt(r[c.key])}</td>`).join("") +
          "</tr>"
      )
      .join("");

    status.textContent = `${data.count} sản phẩm · kỳ ${m2} → ${m1}`;
  } catch (e) {
    status.textContent = "Lỗi tải dữ liệu: " + e.message;
  }
}

load();
