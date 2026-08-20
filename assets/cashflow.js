let cfData = null;
let selectedCode = null;
let marginChart = null;
let fcfChart = null;

// ── 포맷 헬퍼 ────────────────────────────────────────
function fmtWonEok(v) {
    if (v == null) return "-";
    return Math.round(v / 1e8).toLocaleString() + "억";
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

    document.getElementById("summary-line").innerHTML =
        `<span class="summary-datetime">[${cfData.generated_at}]</span> 총 ${cfData.items.length}개 종목`;

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

// ── 후보 목록 ────────────────────────────────────────
const CANDIDATE_LIMIT = 50;

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

    const shown = filtered.slice(0, CANDIDATE_LIMIT);
    wrap.innerHTML = `
        <div class="sr-header">
            <span class="sr-arrow"></span>
            <span class="sr-name">종목명</span>
            <span class="sr-sector">섹터</span>
            <span class="sr-market">시장</span>
            <span class="sr-mktcap">시가총액</span>
        </div>
        ${shown.map(s => `
        <div class="sr-row${s.code === selectedCode ? " active" : ""}" data-code="${s.code}">
            <span class="sr-arrow">▶</span>
            <span class="sr-name">${s.name}</span>
            <span class="sr-sector" title="${s.sector_mid}">${stripMidPrefix(s.sector_mid)}</span>
            <span class="sr-market">${s.market}</span>
            <span class="sr-mktcap">${fmtMktcap(s.mktcap)}</span>
        </div>
        `).join("")}
        ${filtered.length > CANDIDATE_LIMIT
            ? `<p class="cf-cand-empty">${filtered.length}개 중 ${CANDIDATE_LIMIT}개만 표시 - 검색어를 좁혀보세요.</p>`
            : ""}
    `;

    wrap.querySelectorAll(".sr-row").forEach(row => {
        row.addEventListener("click", () => selectStock(row.dataset.code));
    });
}

// ── 종목 선택 → 상세(표+차트) ────────────────────────
function selectStock(code) {
    const item = cfData.items.find(s => s.code === code);
    if (!item) return;
    selectedCode = code;
    renderCandidates();

    const detail = document.getElementById("cf-detail");
    detail.style.display = "block";
    document.getElementById("cf-detail-title").textContent =
        `${item.name} (${item.code}) · ${item.market} · ${stripMidPrefix(item.sector_mid)}`;

    const tbody = document.getElementById("cf-table-body");
    tbody.innerHTML = item.quarters.map(q => `
        <div class="cf-row">
            <span class="cf-name">${item.name}</span>
            <span class="cf-mktcap">${fmtMktcap(item.mktcap)}</span>
            <span class="cf-q">${q.label}</span>
            <span class="cf-num">${fmtWonEok(q.revenue)}</span>
            <span class="cf-num">${fmtWonEok(q.op_income)}</span>
            <span class="cf-pct" style="color:${q.opm >= 0 ? '#B4342A' : '#2F5FA3'}">${fmtPct(q.opm)}</span>
            <span class="cf-num">${fmtWonEok(q.cfo)}</span>
            <span class="cf-pct" style="color:${q.ocf_margin >= 0 ? '#B4342A' : '#2F5FA3'}">${fmtPct(q.ocf_margin)}</span>
            <span class="cf-num">${fmtWonEok(q.capex)}</span>
            <span class="cf-num">${fmtWonEok(q.fcf)}</span>
        </div>
    `).join("");

    renderCharts(item);
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const smallScale = { ticks: { maxRotation: 0, minRotation: 0, font: { size: 10 } } };

function renderCharts(item) {
    const labels     = item.quarters.map(q => q.label);
    const opmData    = item.quarters.map(q => q.opm);
    const ocfData    = item.quarters.map(q => q.ocf_margin);
    const fcfData    = item.quarters.map(q => q.fcf != null ? Math.round(q.fcf / 1e8) : null);
    const capexData  = item.quarters.map(q => q.capex != null ? Math.round(q.capex / 1e8) : null);

    if (marginChart) marginChart.destroy();
    if (fcfChart) fcfChart.destroy();

    marginChart = new Chart(document.getElementById("cf-chart-margin"), {
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

    fcfChart = new Chart(document.getElementById("cf-chart-fcf"), {
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
