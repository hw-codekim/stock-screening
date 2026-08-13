let fwData = null;
let fwSort = { key: "mktcap", dir: "desc" };

function fwFmtMktcap(v) { return v == null ? "-" : v.toLocaleString() + "억"; }
function fwFmtNum(v) { return v == null ? "-" : Math.round(v).toLocaleString(); }
function fwFmtPct1(v) { return v == null ? "-" : v.toFixed(1) + "%"; }
function fwFmtPct(v) { return v == null ? "-" : v.toFixed(2) + "%"; }
function fwFmtPer(v) { return v == null ? "-" : v.toFixed(2) + "배"; }
function fwFmtSigned(v, unit) { return v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(2) + unit; }
function fwOpmStyle(v) {
    if (v == null) return "";
    if (v < 0) return "color:#2E5FA3;font-weight:600;";
    if (v <= 10) return "";
    if (v <= 20) return "color:#B4342A;";
    return "color:#B4342A;font-weight:600;";
}
function fwYoyStyle(v) {
    if (v == null) return "";
    return v >= 0 ? "color:#B4342A;" : "color:#2E5FA3;";
}
function fwMddStyle(v) {
    if (v == null) return "";
    return v >= -20 ? "color:#2F6B4F;font-weight:600;" : "";
}
function fwShortPeriod(po) {
    const [y, m] = po.period.split("/");
    return `${y.slice(2)}.${m}${po.is_estimate ? "E" : ""}`;
}
function fwShortYear(po) {
    return `${po.period.split("/")[0]}${po.is_estimate ? "E" : ""}`;
}

const FW_METRIC_LABEL = { revenue: "매출액", op_income: "영업이익", net_income: "순이익", eps: "EPS" };
const FW_METRIC_QKEY   = { revenue: "quarter_revenue", op_income: "quarter_op_income", net_income: "quarter_net_income", eps: "quarter_eps" };
const FW_METRIC_AKEY   = { revenue: "annual_revenue",  op_income: "annual_op_income",  net_income: "annual_net_income",  eps: "annual_eps" };

async function loadForward() {
    try {
        const res = await fetch("data/forward.json", { cache: "no-store" });
        fwData = await res.json();
    } catch (e) {
        document.getElementById("fw-count-line").textContent = "데이터 로드 오류: " + e.message;
        return;
    }

    document.getElementById("fw-generated-at").textContent = `업데이트: ${fwData.generated_at}`;

    populateSectorFilter();
    renderRankings();
    renderForwardTable();

    document.getElementById("fw-market-filter").addEventListener("change", renderForwardTable);
    document.getElementById("fw-large-filter").addEventListener("change", () => { populateMidFilter(); renderForwardTable(); });
    document.getElementById("fw-mid-filter").addEventListener("change", renderForwardTable);
    document.getElementById("fw-metric-filter").addEventListener("change", renderForwardTable);
    document.getElementById("fw-stock-search").addEventListener("input", renderForwardTable);
    document.getElementById("fw-csv-btn").addEventListener("click", exportForwardCsv);
}

function populateSectorFilter() {
    const sel = document.getElementById("fw-large-filter");
    (fwData.sectors || []).forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.large;
        opt.textContent = s.large;
        sel.appendChild(opt);
    });
}

function populateMidFilter() {
    const large = document.getElementById("fw-large-filter").value;
    const midSel = document.getElementById("fw-mid-filter");
    midSel.innerHTML = '<option value="">전체 중분류</option>';
    const entry = (fwData.sectors || []).find(s => s.large === large);
    if (!entry) return;
    entry.mids.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        midSel.appendChild(opt);
    });
}

function getFilteredSortedRows() {
    const market = document.getElementById("fw-market-filter").value;
    const large  = document.getElementById("fw-large-filter").value;
    const mid    = document.getElementById("fw-mid-filter").value;
    const query  = document.getElementById("fw-stock-search").value.trim().toLowerCase();

    let rows = (fwData.rows || []).filter(r => {
        if (market && r.market !== market) return false;
        if (large && r.sector_large !== large) return false;
        if (mid && r.sector_mid !== mid) return false;
        if (query && !(r.name.toLowerCase().includes(query) || r.code.includes(query))) return false;
        return true;
    });

    const aEstLen = (fwData.annual_estimate_periods || []).length;
    const keyFns = {
        mktcap: r => r.mktcap,
        per0:   r => aEstLen > 0 ? r.per[0] : null,
        per1:   r => aEstLen > 1 ? r.per[1] : null,
        yoy0:   r => aEstLen > 0 ? r.yoy[0] : null,
        yoy1:   r => aEstLen > 1 ? r.yoy[1] : null,
        mdd:    r => r.mdd,
        dvr:    r => r.dvr,
    };
    const fn = keyFns[fwSort.key] || keyFns.mktcap;
    rows.sort((a, b) => {
        const va = fn(a), vb = fn(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return fwSort.dir === "asc" ? va - vb : vb - va;
    });
    return rows;
}

function setSort(key) {
    if (fwSort.key === key) {
        fwSort.dir = fwSort.dir === "desc" ? "asc" : "desc";
    } else {
        fwSort = { key, dir: "desc" };
    }
    renderForwardTable();
}

function renderForwardTable() {
    const metric = document.getElementById("fw-metric-filter").value;
    const metricLabel = FW_METRIC_LABEL[metric];
    const qKey = FW_METRIC_QKEY[metric];
    const aKey = FW_METRIC_AKEY[metric];

    const qPeriods = fwData.quarter_periods || [];
    const aPeriods = fwData.annual_periods || [];
    const aEst     = fwData.annual_estimate_periods || [];

    const rows = getFilteredSortedRows();
    document.getElementById("fw-count-line").textContent = `${rows.length}개 종목`;

    const gb = 'class="fw-group-border"';
    const sortCls = k => `fw-th-sortable${fwSort.key === k ? " sort-active " + (fwSort.dir === "asc" ? "sort-asc" : "sort-desc") : ""}`;

    const thead = document.getElementById("fw-thead");
    thead.innerHTML = `
        <tr>
            <th rowspan="2" class="fw-name-th">종목</th>
            <th rowspan="2" class="fw-sector-cell">섹터</th>
            <th rowspan="2" class="${sortCls("mktcap")}" onclick="setSort('mktcap')">시가총액</th>
            ${qPeriods.length ? `<th colspan="${qPeriods.length}" class="fw-group-border">${metricLabel} (분기,억)</th>` : ""}
            ${qPeriods.length ? `<th colspan="${qPeriods.length}" class="fw-group-border">OPM (분기,%)</th>` : ""}
            ${aPeriods.length ? `<th colspan="${aPeriods.length}" class="fw-group-border">${metricLabel} (연간,억)</th>` : ""}
            ${aEst.length ? `<th colspan="${aEst.length}" class="fw-group-border">PER(배)</th>` : ""}
            ${aEst.length ? `<th colspan="${aEst.length}" class="fw-group-border">OPM(%)</th>` : ""}
            ${aEst.length ? `<th colspan="${aEst.length}" class="fw-group-border">영업이익YOY(%)</th>` : ""}
            <th rowspan="2" class="${sortCls("mdd")} fw-group-border" onclick="setSort('mdd')">MDD</th>
            <th rowspan="2" class="${sortCls("dvr")}" onclick="setSort('dvr')">배당</th>
        </tr>
        <tr>
            ${qPeriods.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortPeriod(p)}</th>`).join("")}
            ${qPeriods.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortPeriod(p)}</th>`).join("")}
            ${aPeriods.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortYear(p)}</th>`).join("")}
            ${aEst.map((p, i) => `<th class="${sortCls("per" + i)}${i === 0 ? " fw-group-border" : ""}" onclick="setSort('per${i}')">${fwShortYear(p)}</th>`).join("")}
            ${aEst.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortYear(p)}</th>`).join("")}
            ${aEst.map((p, i) => `<th class="${sortCls("yoy" + i)}${i === 0 ? " fw-group-border" : ""}" onclick="setSort('yoy${i}')">${fwShortYear(p)}</th>`).join("")}
        </tr>
    `;

    const tbody = document.getElementById("fw-tbody");
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;color:#aaa;padding:20px;">데이터 없음</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const qVals = r[qKey] || [];
        const qOpm  = r.quarter_opm || [];
        const aVals = r[aKey] || [];
        const status = r.quarter_report_status || [];
        return `
        <tr>
            <td class="fw-name-cell">${r.name}<span class="fw-code">${r.code}</span></td>
            <td class="fw-sector-cell">${r.sector_mid || "-"}</td>
            <td>${fwFmtMktcap(r.mktcap)}</td>
            ${qVals.map((v, i) => `<td class="${i === 0 ? "fw-group-border " : ""}${status[i] === "P" ? "fw-prelim" : ""}">${fwFmtNum(v)}</td>`).join("")}
            ${qOpm.map((v, i) => `<td class="${i === 0 ? "fw-group-border " : ""}${status[i] === "P" ? "fw-prelim " : ""}" style="${fwOpmStyle(v)}">${fwFmtPct1(v)}</td>`).join("")}
            ${aVals.map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}">${fwFmtNum(v)}</td>`).join("")}
            ${(r.per || []).map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}">${fwFmtPer(v)}</td>`).join("")}
            ${(r.opm || []).map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}" style="${fwOpmStyle(v)}">${fwFmtPct1(v)}</td>`).join("")}
            ${(r.yoy || []).map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}" style="${fwYoyStyle(v)}">${fwFmtSigned(v, "%")}</td>`).join("")}
            <td class="fw-group-border" style="${fwMddStyle(r.mdd)}">${fwFmtPct(r.mdd)}</td>
            <td>${fwFmtPct1(r.dvr)}</td>
        </tr>`;
    }).join("");
}

function exportForwardCsv() {
    const metric = document.getElementById("fw-metric-filter").value;
    const metricLabel = FW_METRIC_LABEL[metric];
    const qKey = FW_METRIC_QKEY[metric];
    const aKey = FW_METRIC_AKEY[metric];
    const qPeriods = fwData.quarter_periods || [];
    const aPeriods = fwData.annual_periods || [];
    const aEst     = fwData.annual_estimate_periods || [];

    const rows = getFilteredSortedRows();
    if (!rows.length) { alert("내보낼 종목이 없습니다."); return; }

    const header = [
        "종목명", "종목코드", "시장", "섹터중분류", "시가총액(억)",
        ...qPeriods.map(p => `${metricLabel}(분기) ${fwShortPeriod(p)}`),
        ...qPeriods.map(p => `OPM(분기) ${fwShortPeriod(p)}`),
        ...aPeriods.map(p => `${metricLabel}(연간) ${fwShortYear(p)}`),
        ...aEst.map(p => `PER ${fwShortYear(p)}`),
        ...aEst.map(p => `OPM ${fwShortYear(p)}`),
        ...aEst.map(p => `영업이익YOY ${fwShortYear(p)}`),
        "MDD", "배당",
    ];
    const raw = v => v == null ? "" : v;
    const lines = [header];
    rows.forEach(r => {
        lines.push([
            r.name, r.code, r.market, r.sector_mid || "", raw(r.mktcap),
            ...(r[qKey] || []).map(raw),
            ...(r.quarter_opm || []).map(raw),
            ...(r[aKey] || []).map(raw),
            ...(r.per || []).map(raw),
            ...(r.opm || []).map(raw),
            ...(r.yoy || []).map(raw),
            raw(r.mdd), raw(r.dvr),
        ]);
    });
    const csv = lines.map(row => row.map(cell => {
        const s = String(cell ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\r\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const todayStr = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `포워드실적_${todayStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function fwRenderRankRows(elId, items, formatter) {
    const el = document.getElementById(elId);
    if (!items || !items.length) {
        el.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:12px;">데이터 없음</td></tr>';
        return;
    }
    el.innerHTML = items.map((it, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td style="text-align:left;">${it.name}<span class="fw-code">${it.code}</span></td>
            <td>${formatter(it.value)}</td>
            <td>${fwFmtMktcap(it.mktcap)}</td>
        </tr>
    `).join("");
}

function renderRankings() {
    const r = fwData.rankings || {};
    fwRenderRankRows("fw-rank-per",    r.per,     v => v != null ? v.toFixed(2) + "배" : "-");
    fwRenderRankRows("fw-rank-fwdper", r.fwd_per, v => v != null ? v.toFixed(2) + "배" : "-");
    fwRenderRankRows("fw-rank-pbr",    r.pbr,     v => v != null ? v.toFixed(2) + "배" : "-");
    fwRenderRankRows("fw-rank-dvr",    r.dvr,     v => v != null ? v.toFixed(2) + "%" : "-");
}

// ── 방문자 카운터 / 맨 위로 스크롤 - common.js와 동일 로직 ──
async function loadVisitorCount() {
    const el = document.getElementById("visitor-count");
    try {
        const res = await fetch("https://stock-screening.goatcounter.com/counter/TOTAL.json");
        if (!res.ok) throw new Error("no data");
        const json = await res.json();
        const digits = (json.count || "").replace(/[^0-9]/g, "");
        el.textContent = digits ? Number(digits).toLocaleString() : "0";
    } catch (e) {
        el.textContent = "-";
    }
}

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadForward();
loadVisitorCount();
