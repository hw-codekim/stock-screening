let fwData = null;
let fwSort = null; // null이면 대분류로 묶어서 표시, 값이 있으면 헤더 클릭으로 전체를 그 컬럼 기준 정렬

function fwFmtMktcap(v) { return v == null ? "-" : (v / 10000).toFixed(2) + "조"; }
function fwFmtNum(v) { return v == null ? "-" : Math.round(v).toLocaleString(); }
function fwFmtPct1(v) { return v == null ? "-" : v.toFixed(1) + "%"; }
function fwFmtPct(v) { return v == null ? "-" : Math.round(v) + "%"; }
function fwFmtPer(v) { return v == null ? "-" : v.toFixed(1) + "배"; }
function fwFmtSigned(v, unit) { return v == null ? "-" : (v >= 0 ? "+" : "") + Math.round(v) + unit; }

// 중분류가 "대분류_세부명"처럼 접두어를 달고 있으면(예: 반도체_후공정장비) 대분류 그룹 안에서는
// 중복 정보라 접두어를 떼고 세부명만 보여준다. (q2.html의 stripMidPrefix와 동일 로직)
const MID_PSEUDO_SUFFIXES = new Set(["KOSPI", "KOSDAQ"]);
function fwStripMidPrefix(mid) {
    if (!mid || !mid.includes("_")) return mid;
    const [prefix, ...rest] = mid.split("_");
    const suffix = rest.join("_");
    if (MID_PSEUDO_SUFFIXES.has(suffix)) return prefix;
    return suffix;
}
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
    document.getElementById("fw-quick-filter").addEventListener("change", renderForwardTable);
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
        opt.textContent = fwStripMidPrefix(m);
        midSel.appendChild(opt);
    });
}

// "최근분기" 기준 필터는 항상 백엔드가 고정한 REFERENCE_QUARTER(26.06) 기준으로 판단한다.
// 분기가 늘어나도(예: 26.09E 추가) quarter_opm 배열의 마지막 값을 쓰면 기준이 조용히 밀리므로,
// ref_quarter_*/prev_quarter_opm 같은 고정 필드를 쓴다 (stock_rank_service.py에서 계산).
// null(데이터 없음)인 종목은 해당 조건을 판단할 수 없으므로 필터에서 제외한다.
const FW_QUICK_FILTER_PREDICATES = {
    opm_qoq5: r => {
        if (r.ref_quarter_opm == null || r.prev_quarter_opm == null) return false;
        return r.ref_quarter_opm - r.prev_quarter_opm >= 5;
    },
    opm_yoy5: r => {
        if (r.ref_quarter_opm == null || r.prior_yr_q_opm == null) return false;
        return r.ref_quarter_opm - r.prior_yr_q_opm >= 5;
    },
    opm20: r => r.ref_quarter_opm != null && r.ref_quarter_opm >= 20,
    rev_yoy50: r => {
        if (r.ref_quarter_revenue == null || !r.prior_yr_q_revenue) return false;
        return (r.ref_quarter_revenue - r.prior_yr_q_revenue) / r.prior_yr_q_revenue * 100 >= 50;
    },
    per26_10: r => (r.per || [])[0] != null && r.per[0] > 0 && r.per[0] <= 10,
    per27_10: r => (r.per || [])[1] != null && r.per[1] > 0 && r.per[1] <= 10,
    div4:     r => r.dvr != null && r.dvr >= 4,
    // 매주 금요일 fnguide 컨센서스 갱신 시 직전 수집 대비 상향된 종목(현재 선택된 지표 기준).
    rev_up26: r => {
        const m = document.getElementById("fw-metric-filter").value;
        const v = (r.revision_values || [])[0];
        return v && v[m] != null && v[m] > 0;
    },
    rev_up27: r => {
        const m = document.getElementById("fw-metric-filter").value;
        const v = (r.revision_values || [])[1];
        return v && v[m] != null && v[m] > 0;
    },
};

function getFilteredRows() {
    const market = document.getElementById("fw-market-filter").value;
    const large  = document.getElementById("fw-large-filter").value;
    const mid    = document.getElementById("fw-mid-filter").value;
    const query  = document.getElementById("fw-stock-search").value.trim().toLowerCase();
    const quick  = document.getElementById("fw-quick-filter").value;
    const quickFn = FW_QUICK_FILTER_PREDICATES[quick];

    return (fwData.rows || []).filter(r => {
        if (market && r.market !== market) return false;
        if (large && r.sector_large !== large) return false;
        if (mid && r.sector_mid !== mid) return false;
        if (query && !r.name.toLowerCase().includes(query)) return false;
        if (quickFn && !quickFn(r)) return false;
        return true;
    });
}

// 대분류 > 중분류(합계 시총 내림차순) > 종목(시총 내림차순)으로 묶는다.
// 2Q26실적 페이지(common.js groupBySector)와 동일한 방식 - 같은 중분류 종목끼리 인접하게 정렬.
function groupByLarge(rows) {
    const largeMap = {};
    rows.forEach(r => {
        const key = r.sector_large || "미분류";
        (largeMap[key] = largeMap[key] || []).push(r);
    });

    const groups = Object.keys(largeMap).map(large => {
        const midMap = {};
        largeMap[large].forEach(r => {
            const midKey = r.sector_mid || "미분류";
            (midMap[midKey] = midMap[midKey] || []).push(r);
        });
        const midGroups = Object.keys(midMap).map(mid => {
            const midItems = midMap[mid].slice().sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
            const total = midItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
            return { items: midItems, total };
        });
        midGroups.sort((a, b) => b.total - a.total);
        const items = midGroups.flatMap(g => g.items);
        const total = midGroups.reduce((sum, g) => sum + g.total, 0);
        return { large, items, total };
    });
    groups.sort((a, b) => b.total - a.total);
    return groups;
}

const SORT_KEY_FNS = {
    mktcap: r => r.mktcap,
    per0:   r => (r.per || [])[0],
    per1:   r => (r.per || [])[1],
    opm0:   r => (r.opm || [])[0],
    opm1:   r => (r.opm || [])[1],
    yoy0:   r => (r.yoy || [])[0],
    yoy1:   r => (r.yoy || [])[1],
    mdd:    r => r.mdd,
    dvr:    r => r.dvr,
};

function sortRows(rows, key, dir) {
    const fn = SORT_KEY_FNS[key] || SORT_KEY_FNS.mktcap;
    const sorted = rows.slice().sort((a, b) => {
        const va = fn(a), vb = fn(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return dir === "asc" ? va - vb : vb - va;
    });
    return sorted;
}

function setSort(key) {
    if (fwSort && fwSort.key === key) {
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

    let rows = getFilteredRows();
    rows.forEach(r => {
        r._qArr = r[qKey] || [];
        r._aArr = r[aKey] || [];
    });

    document.getElementById("fw-count-line").textContent = `${rows.length}개 종목`;

    const sortCls = k => `fw-th-sortable${fwSort && fwSort.key === k ? " sort-active " + (fwSort.dir === "asc" ? "sort-asc" : "sort-desc") : ""}`;
    const sortAttr = k => `class="${sortCls(k)}" onclick="setSort('${k}')"`;
    const y26 = aEst[0] ? fwShortYear(aEst[0]) : "26E";
    const y27 = aEst[1] ? fwShortYear(aEst[1]) : "27E";

    const colCount = 3 + qPeriods.length * 2 + aPeriods.length + 8;

    const thead = document.getElementById("fw-thead");
    thead.innerHTML = `
        <tr>
            <th rowspan="2" class="fw-name-th">종목</th>
            <th rowspan="2" class="fw-sector-cell">섹터</th>
            <th rowspan="2" ${sortAttr("mktcap")}>시총</th>
            ${qPeriods.length ? `<th colspan="${qPeriods.length}" class="fw-group-border">${metricLabel}(분기,억)</th>` : ""}
            ${qPeriods.length ? `<th colspan="${qPeriods.length}" class="fw-group-border">OPM(분기,%)</th>` : ""}
            ${aPeriods.length ? `<th colspan="${aPeriods.length}" class="fw-group-border">${metricLabel}(연간,억)</th>` : ""}
            <th colspan="2" class="fw-group-border">PER(배)</th>
            <th colspan="2" class="fw-group-border">OPM(%)</th>
            <th colspan="2" class="fw-group-border">YoY(%)</th>
            <th rowspan="2" class="fw-group-border">MDD</th>
            <th rowspan="2" class="fw-group-border">배당</th>
        </tr>
        <tr>
            ${qPeriods.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortPeriod(p)}</th>`).join("")}
            ${qPeriods.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortPeriod(p)}</th>`).join("")}
            ${aPeriods.map((p, i) => `<th class="${i === 0 ? "fw-group-border" : ""}">${fwShortYear(p)}</th>`).join("")}
            <th ${sortAttr("per0")} class="fw-group-border">${y26}</th>
            <th ${sortAttr("per1")}>${y27}</th>
            <th ${sortAttr("opm0")} class="fw-group-border">${y26}</th>
            <th ${sortAttr("opm1")}>${y27}</th>
            <th ${sortAttr("yoy0")} class="fw-group-border">${y26}</th>
            <th ${sortAttr("yoy1")}>${y27}</th>
        </tr>
    `;

    const tbody = document.getElementById("fw-tbody");
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;color:#aaa;padding:20px;">데이터 없음</td></tr>`;
        return;
    }

    const rowHtml = r => {
        const qArr = r._qArr, aArr = r._aArr, qOpm = r.quarter_opm || [];
        return `
        <tr>
            <td class="fw-name-cell">${r.name}</td>
            <td class="fw-sector-cell">${fwStripMidPrefix(r.sector_mid) || "-"}</td>
            <td>${fwFmtMktcap(r.mktcap)}</td>
            ${qArr.map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}">${fwFmtNum(v)}</td>`).join("")}
            ${qOpm.map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}" style="${fwOpmStyle(v)}">${fwFmtPct1(v)}</td>`).join("")}
            ${aArr.map((v, i) => `<td class="${i === 0 ? "fw-group-border" : ""}">${fwFmtNum(v)}</td>`).join("")}
            <td class="fw-group-border">${fwFmtPer((r.per || [])[0])}</td>
            <td>${fwFmtPer((r.per || [])[1])}</td>
            <td class="fw-group-border" style="${fwOpmStyle((r.opm || [])[0])}">${fwFmtPct1((r.opm || [])[0])}</td>
            <td style="${fwOpmStyle((r.opm || [])[1])}">${fwFmtPct1((r.opm || [])[1])}</td>
            <td class="fw-group-border" style="${fwYoyStyle((r.yoy || [])[0])}">${fwFmtSigned((r.yoy || [])[0], "%")}</td>
            <td style="${fwYoyStyle((r.yoy || [])[1])}">${fwFmtSigned((r.yoy || [])[1], "%")}</td>
            <td class="fw-group-border" style="${fwMddStyle(r.mdd)}">${fwFmtPct(r.mdd)}</td>
            <td class="fw-group-border">${fwFmtPct1(r.dvr)}</td>
        </tr>`;
    };

    if (fwSort) {
        tbody.innerHTML = sortRows(rows, fwSort.key, fwSort.dir).map(rowHtml).join("");
    } else {
        const groups = groupByLarge(rows);
        tbody.innerHTML = groups.map(g => `
            <tr class="fw-group-title-row"><td colspan="${colCount}">${g.large} (${g.items.length})</td></tr>
            ${g.items.map(rowHtml).join("")}
        `).join("");
    }
}

function exportForwardCsv() {
    const metric = document.getElementById("fw-metric-filter").value;
    const metricLabel = FW_METRIC_LABEL[metric];
    const qKey = FW_METRIC_QKEY[metric];
    const aKey = FW_METRIC_AKEY[metric];
    const qPeriods = fwData.quarter_periods || [];
    const aPeriods = fwData.annual_periods || [];
    const aEst     = fwData.annual_estimate_periods || [];

    let rows = getFilteredRows();
    if (!rows.length) { alert("내보낼 종목이 없습니다."); return; }
    rows.forEach(r => { r._qArr = r[qKey] || []; r._aArr = r[aKey] || []; });
    if (fwSort) rows = sortRows(rows, fwSort.key, fwSort.dir);

    const header = [
        "종목명", "시장", "대분류", "섹터중분류", "시가총액(억)",
        ...qPeriods.map(p => `${metricLabel}(분기) ${fwShortPeriod(p)}`),
        ...qPeriods.map(p => `OPM(분기) ${fwShortPeriod(p)}`),
        ...aPeriods.map(p => `${metricLabel}(연간) ${fwShortYear(p)}`),
        `PER${aEst[0] ? fwShortYear(aEst[0]) : "26E"}`, `PER${aEst[1] ? fwShortYear(aEst[1]) : "27E"}`,
        `OPM${aEst[0] ? fwShortYear(aEst[0]) : "26E"}`, `OPM${aEst[1] ? fwShortYear(aEst[1]) : "27E"}`,
        `영업이익YoY${aEst[0] ? fwShortYear(aEst[0]) : "26E"}`, `영업이익YoY${aEst[1] ? fwShortYear(aEst[1]) : "27E"}`,
        "MDD", "배당",
    ];
    const raw = v => v == null ? "" : v;
    const lines = [header];
    rows.forEach(r => {
        const qArr = r._qArr, aArr = r._aArr;
        lines.push([
            r.name, r.market, r.sector_large || "", r.sector_mid || "", raw(r.mktcap),
            ...qArr.map(raw),
            ...(r.quarter_opm || []).map(raw),
            ...aArr.map(raw),
            raw((r.per || [])[0]), raw((r.per || [])[1]),
            raw((r.opm || [])[0]), raw((r.opm || [])[1]),
            raw((r.yoy || [])[0]), raw((r.yoy || [])[1]),
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
            <td style="text-align:left;">${it.name}</td>
            <td>${formatter(it.value)}</td>
            <td>${fwFmtMktcap(it.mktcap)}</td>
        </tr>
    `).join("");
}

function renderRankings() {
    const r = fwData.rankings || {};
    fwRenderRankRows("fw-rank-per",    r.per,     v => v != null ? v.toFixed(1) + "배" : "-");
    fwRenderRankRows("fw-rank-fwdper", r.fwd_per, v => v != null ? v.toFixed(1) + "배" : "-");
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
