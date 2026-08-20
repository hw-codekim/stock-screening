let cfData = null;
let openCode = null;
let marginChart = null;
let fcfChart = null;
let rowEls = [];
let activeIndex = -1;

// ── 포맷 헬퍼 ────────────────────────────────────────
function fmtWonEok(v) {
    if (v == null) return "-";
    return Math.round(v / 1e8).toLocaleString() + "억";
}
// 목록 컬럼이 많아 폭이 좁으므로 억 단위 콤마 표기 대신 조/억 단위로 짧게 줄여서 가로 스크롤을 피한다
function fmtWonCompact(v) {
    if (v == null) return "-";
    const abs = Math.abs(v);
    if (abs >= 1e12) return (v / 1e12).toFixed(1) + "조";
    if (abs >= 1e8) return Math.round(v / 1e8).toLocaleString() + "억";
    return Math.round(v / 1e4).toLocaleString() + "만";
}
function fmtPct(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtMktcap(v) {
    if (v == null) return "-";
    return (v / 10000).toFixed(2) + "조";
}
const MID_PSEUDO_SUFFIXES = new Set(["KOSPI", "KOSDAQ"]);
function stripMidPrefix(mid) {
    if (!mid || !mid.includes("_")) return mid;
    const [prefix, ...rest] = mid.split("_");
    const suffix = rest.join("_");
    if (MID_PSEUDO_SUFFIXES.has(suffix)) return prefix;
    return suffix;
}

// ── 방문자 카운터 (GoatCounter) ────────────────────
async function loadVisitorCount() {
    const el = document.getElementById("visitor-count");
    if (!el) return;
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

// ── 로드 ────────────────────────────────────────────
async function loadCashflow() {
    try {
        const res = await fetch("data/cashflow.json");
        cfData = await res.json();
    } catch (e) {
        document.getElementById("cf-candidates").innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    const latestLabel = cfData.items[0] && cfData.items[0].latest ? cfData.items[0].latest.label : "";
    document.getElementById("summary-line").innerHTML =
        `<span class="summary-datetime">[${cfData.generated_at}]</span> 총 ${cfData.items.length}개 종목 · 목록은 ${latestLabel} 스냅샷 기준`;

    populateLargeFilter();
    populateMidFilter();
    renderCandidates();
}

// ── 대분류/중분류 필터 ───────────────────────────────
function populateLargeFilter() {
    const sel = document.getElementById("large-filter");
    const prev = sel.value;
    const counts = {};
    cfData.items.forEach(s => { counts[s.sector_large] = (counts[s.sector_large] || 0) + 1; });

    sel.innerHTML = '<option value="">전체 대분류</option>';
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(large => {
        const opt = document.createElement("option");
        opt.value = large;
        opt.textContent = `${large} (${counts[large]})`;
        sel.appendChild(opt);
    });
    sel.value = prev;
}

function populateMidFilter() {
    const largeVal = document.getElementById("large-filter").value;
    const midSel = document.getElementById("mid-filter");
    const prev = midSel.value;

    const counts = {};
    cfData.items
        .filter(s => !largeVal || s.sector_large === largeVal)
        .forEach(s => { counts[s.sector_mid] = (counts[s.sector_mid] || 0) + 1; });

    midSel.innerHTML = '<option value="">전체 중분류</option>';
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(mid => {
        const opt = document.createElement("option");
        opt.value = mid;
        opt.textContent = `${stripMidPrefix(mid)} (${counts[mid]})`;
        midSel.appendChild(opt);
    });
    midSel.value = [...midSel.options].some(o => o.value === prev) ? prev : "";
}

function onLargeFilterChange() {
    populateMidFilter();
    renderCandidates();
}

// 대분류(섹터) 그룹으로 묶고, 그룹은 시가총액 합계 내림차순, 그룹 안에서는 종목 시가총액 내림차순
function groupBySector(items) {
    const map = {};
    items.forEach(s => { (map[s.sector_large] = map[s.sector_large] || []).push(s); });

    const groups = Object.keys(map).map(sector => {
        const groupItems = map[sector].slice().sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
        const total = groupItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
        return { sector, items: groupItems, total };
    });
    groups.sort((a, b) => b.total - a.total);
    return groups;
}

// ── 후보 목록 (클릭한 종목 바로 아래에 표+차트 아코디언으로 펼침) ──
// 종목 수가 350개뿐이라(q2.html의 2500개+와 달리) 별도 상한 없이 다 보여준다 -
// .sr-row에 이미 content-visibility:auto가 적용돼 있어 전부 그려도 스크롤 성능엔 문제없음
function renderCandidates() {
    if (!cfData) return;
    const largeVal = document.getElementById("large-filter").value;
    const midVal   = document.getElementById("mid-filter").value;
    const query    = document.getElementById("stock-search").value.trim().toLowerCase();

    const filtered = cfData.items.filter(s =>
        (!largeVal || s.sector_large === largeVal) &&
        (!midVal || s.sector_mid === midVal) &&
        (!query || s.name.toLowerCase().includes(query) || s.code.includes(query))
    );

    const wrap = document.getElementById("cf-candidates");
    if (!filtered.length) {
        wrap.innerHTML = '<p class="cf-cand-empty">조건에 맞는 종목이 없습니다.</p>';
        return;
    }

    const shownGroups = groupBySector(filtered);

    const rowHtml = (s) => {
        const l = s.latest || {};
        return `
    <div class="sr-row cf-l-row${s.code === openCode ? " active" : ""}" data-code="${s.code}">
        <span class="sr-arrow">${s.code === openCode ? "▼" : "▶"}</span>
        <span class="sr-name">${s.name}</span>
        <span class="cf-l-sector" data-label="섹터" title="${s.sector_mid}">${stripMidPrefix(s.sector_mid)}</span>
        <span class="cf-l-mktcap" data-label="시가총액">${fmtMktcap(s.mktcap)}</span>
        <span class="cf-l-num" data-label="매출">${fmtWonCompact(l.revenue)}</span>
        <span class="cf-l-num" data-label="매출원가">${fmtWonCompact(l.cogs)}</span>
        <span class="cf-l-pct" data-label="매출원가율">${fmtPct(l.cogs_ratio)}</span>
        <span class="cf-l-num" data-label="판관비">${fmtWonCompact(l.sga)}</span>
        <span class="cf-l-pct" data-label="판관비율">${fmtPct(l.sga_ratio)}</span>
        <span class="cf-l-num" data-label="영업이익">${fmtWonCompact(l.op_income)}</span>
        <span class="cf-l-pct" data-label="OPM" style="color:${(l.opm||0) >= 0 ? '#B4342A' : '#2F5FA3'}">${fmtPct(l.opm)}</span>
        <span class="cf-l-num" data-label="영업현금흐름">${fmtWonCompact(l.cfo)}</span>
        <span class="cf-l-num" data-label="CAPEX">${fmtWonCompact(l.capex)}</span>
        <span class="cf-l-num" data-label="FCF">${fmtWonCompact(l.fcf)}</span>
    </div>
    <div class="sr-detail" id="cf-detail-${s.code}" style="display:${s.code === openCode ? "block" : "none"};"></div>
    `;
    };

    wrap.innerHTML = `
        <div class="sr-header cf-l-row">
            <span class="sr-arrow"></span>
            <span class="sr-name">종목명</span>
            <span class="cf-l-sector">섹터</span>
            <span class="cf-l-mktcap">시가총액</span>
            <span class="cf-l-num">매출</span>
            <span class="cf-l-num">매출원가</span>
            <span class="cf-l-pct">매출원가율</span>
            <span class="cf-l-num">판관비</span>
            <span class="cf-l-pct">판관비율</span>
            <span class="cf-l-num">영업이익</span>
            <span class="cf-l-pct">OPM</span>
            <span class="cf-l-num">영업현금흐름</span>
            <span class="cf-l-num">CAPEX</span>
            <span class="cf-l-num">FCF</span>
        </div>
        ${shownGroups.map(g => `
        <div class="sr-sector-group-title">${g.sector} (${g.items.length})</div>
        ${g.items.map(rowHtml).join("")}
        `).join("")}
    `;

    rowEls = Array.from(wrap.querySelectorAll(".sr-row"));
    rowEls.forEach(row => row.addEventListener("click", () => selectRow(row)));

    // 필터가 바뀌어도 열려 있던 종목이 새 목록에 남아있으면 그대로 펼친 채 유지,
    // 목록에서 빠졌으면(필터링됨) 닫힌 상태로 초기화한다.
    const newIndex = openCode ? rowEls.findIndex(row => row.dataset.code === openCode) : -1;
    if (newIndex !== -1) {
        activeIndex = newIndex;
        buildDetail(openCode);
    } else {
        openCode = null;
        activeIndex = -1;
    }
}

// ── 종목 펼치기/접기 (클릭 + 키보드 방향키 공용) ─────
function closeRow(row) {
    row.classList.remove("active");
    const arrow = row.querySelector(".sr-arrow");
    if (arrow) arrow.textContent = "▶";
    const detail = document.getElementById(`cf-detail-${row.dataset.code}`);
    if (detail) detail.style.display = "none";
    if (marginChart) { marginChart.destroy(); marginChart = null; }
    if (fcfChart)    { fcfChart.destroy();    fcfChart    = null; }
}

function openRow(index) {
    if (!rowEls.length) return;
    index = Math.max(0, Math.min(rowEls.length - 1, index));
    if (index === activeIndex) return;

    if (activeIndex !== -1 && rowEls[activeIndex]) {
        closeRow(rowEls[activeIndex]);
    }

    const row = rowEls[index];
    openCode = row.dataset.code;
    activeIndex = index;
    row.classList.add("active");
    const arrow = row.querySelector(".sr-arrow");
    if (arrow) arrow.textContent = "▼";
    const detail = document.getElementById(`cf-detail-${openCode}`);
    if (detail) detail.style.display = "block";
    buildDetail(openCode);
    row.scrollIntoView({ block: "center", behavior: "smooth" });
}

function selectRow(row) {
    const idx = rowEls.indexOf(row);
    if (idx === activeIndex) {
        closeRow(row);
        openCode = null;
        activeIndex = -1;
    } else {
        openRow(idx);
    }
}

document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    if (!rowEls.length) return;

    e.preventDefault();
    if (activeIndex === -1) {
        openRow(0);
    } else if (e.key === "ArrowDown") {
        openRow(activeIndex + 1);
    } else {
        openRow(activeIndex - 1);
    }
});

// ── 종목 상세(표+차트) - 클릭한 행 바로 아래 sr-detail 안에 렌더 ──
function buildDetail(code) {
    const item = cfData.items.find(s => s.code === code);
    const detail = document.getElementById(`cf-detail-${code}`);
    if (!item || !detail) return;

    detail.innerHTML = `
        <div class="list-wrap cf-table-wrap">
            <div class="sr-header cf-row">
                <span class="cf-name">종목명</span>
                <span class="cf-mktcap">시가총액</span>
                <span class="cf-q">분기</span>
                <span class="cf-num">매출</span>
                <span class="cf-pct-cogs">매출원가율</span>
                <span class="cf-pct">판관비율</span>
                <span class="cf-num">영업이익</span>
                <span class="cf-pct">OPM</span>
                <span class="cf-num">영업현금흐름</span>
                <span class="cf-pct">영업현금흐름률</span>
                <span class="cf-num">CAPEX</span>
                <span class="cf-num">FCF</span>
            </div>
            <div>
                ${item.quarters.map(q => `
                <div class="cf-row cf-data-row">
                    <span class="cf-name">${item.name}</span>
                    <span class="cf-mktcap">${fmtMktcap(item.mktcap)}</span>
                    <span class="cf-q">${q.label}</span>
                    <span class="cf-num">${fmtWonEok(q.revenue)}</span>
                    <span class="cf-pct-cogs">${fmtPct(q.cogs_ratio)}</span>
                    <span class="cf-pct">${fmtPct(q.sga_ratio)}</span>
                    <span class="cf-num">${fmtWonEok(q.op_income)}</span>
                    <span class="cf-pct" style="color:${q.opm >= 0 ? '#B4342A' : '#2F5FA3'}">${fmtPct(q.opm)}</span>
                    <span class="cf-num">${fmtWonEok(q.cfo)}</span>
                    <span class="cf-pct" style="color:${q.ocf_margin >= 0 ? '#B4342A' : '#2F5FA3'}">${fmtPct(q.ocf_margin)}</span>
                    <span class="cf-num">${fmtWonEok(q.capex)}</span>
                    <span class="cf-num">${fmtWonEok(q.fcf)}</span>
                </div>
                `).join("")}
            </div>
        </div>
        <div class="screen-chart-row cf-chart-row">
            <div class="graph-wrap">
                <div class="graph-title">OPM · 영업현금흐름률 (%)</div>
                <canvas id="cf-chart-margin-${code}"></canvas>
            </div>
            <div class="graph-wrap">
                <div class="graph-title">FCF(막대) · CAPEX(선) (억원)</div>
                <canvas id="cf-chart-fcf-${code}"></canvas>
            </div>
        </div>
    `;

    renderCharts(item, `cf-chart-margin-${code}`, `cf-chart-fcf-${code}`);
}

const smallScale = { ticks: { maxRotation: 0, minRotation: 0, font: { size: 10 } } };

function renderCharts(item, marginCanvasId, fcfCanvasId) {
    const labels    = item.quarters.map(q => q.label);
    const opmData   = item.quarters.map(q => q.opm);
    const ocfData   = item.quarters.map(q => q.ocf_margin);
    const fcfData   = item.quarters.map(q => q.fcf != null ? Math.round(q.fcf / 1e8) : null);
    const capexData = item.quarters.map(q => q.capex != null ? Math.round(q.capex / 1e8) : null);

    marginChart = new Chart(document.getElementById(marginCanvasId), {
        type: "line",
        data: {
            labels,
            datasets: [
                { label: "OPM (%)", data: opmData, borderColor: "#14315C", backgroundColor: "#14315C", borderWidth: 2, pointRadius: 3 },
                { label: "영업현금흐름률 (%)", data: ocfData, borderColor: "#A9843F", backgroundColor: "#A9843F", borderWidth: 2, pointRadius: 3 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: { x: smallScale, y: { title: { display: true, text: "%", font: { size: 10 } } } },
        },
    });

    fcfChart = new Chart(document.getElementById(fcfCanvasId), {
        data: {
            labels,
            datasets: [
                { type: "bar", label: "FCF (억원)", data: fcfData, yAxisID: "y", order: 2,
                  backgroundColor: fcfData.map(v => v >= 0 ? "rgba(180,52,42,0.7)" : "rgba(46,95,163,0.7)") },
                { type: "line", label: "CAPEX (억원)", data: capexData, yAxisID: "y", order: 1,
                  borderColor: "#F5A623", backgroundColor: "#F5A623", borderWidth: 2, pointRadius: 3 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: { x: smallScale, y: { title: { display: true, text: "억원", font: { size: 10 } } } },
        },
    });
}

// ── 이벤트 바인딩 ────────────────────────────────────
document.getElementById("large-filter").addEventListener("change", onLargeFilterChange);
document.getElementById("mid-filter").addEventListener("change", renderCandidates);
document.getElementById("stock-search").addEventListener("input", renderCandidates);

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadVisitorCount();
loadCashflow();
