// ── 포맷 헬퍼 ──────────────────────────────────────
function fmtEok(v) {
    if (v == null) return "-";
    return v.toLocaleString() + "억";
}
function fmtYoy(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + Math.round(v) + "%";
}
function fmtPct1(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function yoyColor(v) {
    if (v == null) return "#888";
    return v >= 0 ? "#B4342A" : "#2F5FA3";
}
function fmtMktcap(v) {
    if (v == null) return "-";
    return (v / 10000).toFixed(2) + "조";
}
function fmtPrice(v) {
    if (v == null) return "-";
    return v.toLocaleString();
}
function fmtIndexValue(v) {
    if (v == null) return "-";
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// 52주 신저~신고 구간에서 현재 지수가 몇 %쯤 위치하는지(0=신저, 100=신고) - 50을 기준으로 색 구분
function positionColor(v) {
    if (v == null) return "#888";
    return v >= 50 ? "#B4342A" : "#2F5FA3";
}
// ADR(상승/하락 종목수 비율) - 100%를 기준으로 색 구분
function adrColor(v) {
    if (v == null) return "#888";
    return v >= 100 ? "#B4342A" : "#2F5FA3";
}
// 중분류가 "대분류_세부명"처럼 앞에 상위 분류를 접두어로 달고 있으면(예: 반도체_PCB),
// 같은 대분류 그룹 안에서는 중복 정보라 잘리기 쉬우므로 접두어를 떼고 세부명만 보여준다.
// 중분류 데이터 중 "게임_KOSDAQ"/"게임_KOSPI"처럼 실제 업종이 아니라
// 시장명을 세부명 자리에 그대로 넣어둔 경우가 있음(sector_info 데이터 이슈).
// 이런 경우는 접두어를 떼면 "KOSDAQ"만 남아 의미가 없으므로, 대분류 이름을 그대로 보여준다.
const MID_PSEUDO_SUFFIXES = new Set(["KOSPI", "KOSDAQ"]);
function stripMidPrefix(mid) {
    if (!mid || !mid.includes("_")) return mid;
    const [prefix, ...rest] = mid.split("_");
    const suffix = rest.join("_");
    if (MID_PSEUDO_SUFFIXES.has(suffix)) return prefix;
    return suffix;
}
// 데이터 기준 시간대(KST)로 "오늘" 날짜를 구한다. list.json의 report_date도
// 서버(KST)에서 생성되므로, 브라우저 로컬 시간대와 무관하게 이 기준으로 비교해야
// "하루 지나면 하이라이트가 사라진다"는 조건이 정확히 맞아떨어진다.
function todayKST() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
const TODAY_KST = todayKST();

// ── 상태 ──────────────────────────────────────────
let listData = null;         // list.json 원본
let reportedItems = [];      // 이번 분기 발표 기업 (평탄화된 목록)
let unreportedItems = [];    // 이번 분기 미발표 기업 (평탄화된 목록)
let rowEls = [];             // 현재 렌더링된 .sr-row 목록 (필터 반영 후)
let activeIndex = -1;
const chartInstances = {};

function activeItems() {
    const includeUnreported = document.getElementById("unreported-toggle").checked;
    return includeUnreported ? reportedItems.concat(unreportedItems) : reportedItems;
}

// 대분류 그룹 안에서 다시 중분류(섹터 컬럼)별로 묶어 인접하게 정렬하고, 같은 중분류 안에서는 시총 내림차순.
// 소제목 없이 정렬 순서로만 묶어서 보여준다.
function groupBySector(items) {
    const largeMap = {};
    items.forEach(s => {
        (largeMap[s.sector_large] = largeMap[s.sector_large] || []).push(s);
    });

    const sectors = Object.keys(largeMap).map(large => {
        const midMap = {};
        largeMap[large].forEach(s => {
            (midMap[s.sector_mid] = midMap[s.sector_mid] || []).push(s);
        });
        const midGroups = Object.keys(midMap).map(mid => {
            const midItems = midMap[mid].slice().sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
            const total = midItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
            return { items: midItems, total };
        });
        midGroups.sort((a, b) => b.total - a.total);
        const sortedItems = midGroups.flatMap(g => g.items);
        const total = midGroups.reduce((sum, g) => sum + g.total, 0);
        return { sector: large, items: sortedItems, total };
    });
    sectors.sort((a, b) => b.total - a.total);
    return sectors;
}

// ── 방문자 카운터 (GoatCounter) ────────────────────
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

// ── 목록 로드 & 렌더 ────────────────────────────────
async function loadList() {
    const listBody = document.getElementById("list-body");
    try {
        const res = await fetch("data/list.json");
        listData = await res.json();
    } catch (e) {
        listBody.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    reportedItems   = listData.items || [];
    unreportedItems = listData.unreported_items || [];

    document.getElementById("summary-line").innerHTML =
        `<span class="summary-datetime">[${listData.generated_at}]</span> ${listData.quarter_label} 실적 발표 기업 ${listData.total_count}개`;

    if (listData.base_date) {
        const [, bm, bd] = listData.base_date.split("-");
        document.getElementById("chg-header").textContent = `${Number(bm)}/${Number(bd)}일 이후`;
    }
    if (listData.latest_date) {
        const [, lm, ld] = listData.latest_date.split("-");
        document.getElementById("daychg-header").textContent = `${Number(lm)}/${Number(ld)}일등락`;
    }

    renderIndexSummary(listData.index_summary || []);

    populateLargeFilter();
    populateMidFilter();
    applyFilter();
}

// ── 코스피/코스닥 지수 요약 박스 ─────────────────────
function renderIndexSummary(indexRows) {
    const tbody = document.getElementById("index-summary-body");
    if (!indexRows.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="index-loading">지수 데이터를 불러오지 못했습니다.</td></tr>';
        return;
    }

    const nameMap = { KOSPI: "코스피", KOSDAQ: "코스닥" };
    tbody.innerHTML = indexRows.map(r => `
        <tr>
            <td class="index-name">${nameMap[r.market] || r.market}</td>
            <td>${fmtIndexValue(r.index_value)}<br><span style="color:${yoyColor(r.change_rate)};">${fmtPct1(r.change_rate)}</span></td>
            <td style="color:${yoyColor(r.w1)};">${fmtPct1(r.w1)}</td>
            <td style="color:${yoyColor(r.m1)};">${fmtPct1(r.m1)}</td>
            <td style="color:${yoyColor(r.m3)};">${fmtPct1(r.m3)}</td>
            <td style="color:${yoyColor(r.ytd)};">${fmtPct1(r.ytd)}</td>
            <td>${fmtIndexValue(r.high_52w)}</td>
            <td>${fmtIndexValue(r.low_52w)}</td>
            <td style="color:${positionColor(r.position_52w)};">${r.position_52w != null ? r.position_52w.toFixed(1) + "%" : "-"}</td>
            <td style="color:${yoyColor(r.mdd)};">${fmtPct1(r.mdd)}</td>
            <td style="color:${adrColor(r.adr)};">${r.adr != null ? r.adr.toFixed(1) + "%" : "-"}</td>
            <td style="color:#B4342A;">${r.up_count ?? "-"}</td>
            <td style="color:#888;">${r.flat_count ?? "-"}</td>
            <td style="color:#2F5FA3;">${r.down_count ?? "-"}</td>
        </tr>
    `).join("");
}

function populateLargeFilter() {
    const sel = document.getElementById("large-filter");
    const prev = sel.value;
    sel.innerHTML = '<option value="">전체 대분류</option>';
    groupBySector(activeItems()).forEach(g => {
        const count = g.items.length;
        const opt = document.createElement("option");
        opt.value = g.sector;
        opt.textContent = `${g.sector} (${count})`;
        sel.appendChild(opt);
    });
    sel.value = prev;
}

// 대분류 선택에 따라 중분류 옵션을 다시 구성 (없으면 전체 종목 기준)
function populateMidFilter() {
    const largeVal = document.getElementById("large-filter").value;
    const midSel = document.getElementById("mid-filter");
    midSel.innerHTML = '<option value="">전체 중분류</option>';

    const counts = {};
    activeItems()
        .filter(s => !largeVal || s.sector_large === largeVal)
        .forEach(s => { counts[s.sector_mid] = (counts[s.sector_mid] || 0) + 1; });

    Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .forEach(mid => {
            const opt = document.createElement("option");
            opt.value = mid;
            opt.textContent = `${stripMidPrefix(mid)} (${counts[mid]})`;
            midSel.appendChild(opt);
        });
}

function renderList(sectors) {
    const listBody = document.getElementById("list-body");

    if (!sectors.length) {
        listBody.innerHTML = '<p class="placeholder">조건에 맞는 종목이 없습니다.</p>';
        rowEls = [];
        return;
    }

    listBody.innerHTML = sectors.map(g => `
        ${g.sector != null ? `<div class="sr-sector-group-title">${g.sector} (${g.items.length})</div>` : ""}
        ${g.items.map((s, i) => `
        <div class="sr-row${s.report_date === TODAY_KST ? " sr-row-today" : ""}" data-code="${s.code}" data-name="${s.name}">
            <span class="sr-arrow">▶</span>
            <span class="sr-name">${i + 1}. ${s.name}${s.report_date === TODAY_KST ? '<span class="new-badge">NEW</span>' : ""}</span>
            <span class="sr-sector" data-label="섹터" title="${s.sector_mid}">${stripMidPrefix(s.sector_mid)}</span>
            <span class="sr-market" data-label="시장">${s.market || "-"}</span>
            <span class="sr-mktcap" data-label="시총">${fmtMktcap(s.mktcap)}</span>
            <span class="sr-num" data-label="매출">${fmtEok(s.revenue)}</span>
            <span class="sr-yoy" data-label="매출YoY" style="color:${yoyColor(s.revenue_yoy)};">${fmtYoy(s.revenue_yoy)}</span>
            <span class="sr-num" data-label="영업이익">${fmtEok(s.op_income)}</span>
            <span class="sr-yoy" data-label="영업이익YoY" style="color:${yoyColor(s.op_income_yoy)};">${fmtYoy(s.op_income_yoy)}</span>
            <span class="sr-opm" data-label="OPM">${s.opm != null ? s.opm.toFixed(1) + "%" : "-"}</span>
            <span class="sr-price" data-label="현재가">${fmtPrice(s.current_price)}</span>
            <span class="sr-daychg" data-label="최근등락" style="color:${yoyColor(s.day_change_rate)};">${fmtPct1(s.day_change_rate)}</span>
            <span class="sr-chg" data-label="7/30이후" style="color:${yoyColor(s.price_change)};">${fmtPct1(s.price_change)}</span>
            <span class="sr-mdd" data-label="MDD">${s.mdd != null ? s.mdd.toFixed(1) + "%" : "-"}</span>
        </div>
        <div class="sr-detail" id="sr-detail-${s.code}" style="display:none;"></div>
        `).join("")}
    `).join("");

    rowEls = Array.from(listBody.querySelectorAll(".sr-row"));
    rowEls.forEach(row => row.addEventListener("click", () => selectRow(row)));
    activeIndex = -1;
}

// ── 빠른 필터 ─────────────────────────────────────
const QUICK_FILTER_PREDICATES = {
    newtoday: s => s.report_date === TODAY_KST,
    op100:   s => s.op_income_yoy != null && s.op_income_yoy >= 100,
    opgtrev: s => s.op_income_yoy != null && s.revenue_yoy != null && s.op_income_yoy > s.revenue_yoy,
    opm10:   s => s.opm != null && s.opm >= 10,
    opm20:   s => s.opm != null && s.opm >= 20,
    mdd10:   s => s.mdd != null && s.mdd >= -10,
    price50: s => s.price_change != null && s.price_change >= 50,
};

// ── 필터 ──────────────────────────────────────────
function applyFilter() {
    if (!listData) return;
    // 리스트가 다시 그려지기 전에 펼쳐진 카드가 있으면 차트부터 정리 (재렌더링 후 DOM만 사라지고
    // 차트 인스턴스는 메모리에 남아있는 걸 방지). 활성 행은 최대 1개라 인덱스로 바로 찾는다.
    if (activeIndex !== -1 && rowEls[activeIndex]) {
        disposeRowCharts(rowEls[activeIndex].dataset.code);
    }

    const marketVal = document.getElementById("market-filter").value;
    const largeVal  = document.getElementById("large-filter").value;
    const midVal    = document.getElementById("mid-filter").value;
    const quickVal  = document.getElementById("quick-filter").value;
    const query     = document.getElementById("stock-search").value.trim().toLowerCase();

    let filteredItems = activeItems().filter(s =>
        (!marketVal || s.market === marketVal) &&
        (!largeVal || s.sector_large === largeVal) &&
        (!midVal || s.sector_mid === midVal) &&
        (!query || s.name.toLowerCase().includes(query) || s.code.includes(query))
    );

    if (QUICK_FILTER_PREDICATES[quickVal]) {
        filteredItems = filteredItems.filter(QUICK_FILTER_PREDICATES[quickVal]);
    }

    // 컬럼 정렬이 켜져 있으면 대분류 그룹핑 없이 전체를 그 기준으로 한 줄로 정렬해서 보여주고,
    // 꺼져 있으면 기존처럼 대분류 > 중분류 > 시총순 그룹 구조로 보여준다.
    if (sortField) {
        renderList([{ sector: null, items: sortItems(filteredItems, sortField, sortDir) }]);
    } else {
        renderList(groupBySector(filteredItems));
    }
}

// ── 컬럼 정렬 ─────────────────────────────────────
const TEXT_SORT_FIELDS = new Set(["name", "sector_mid", "market"]);
let sortField = null;
let sortDir = null; // "asc" | "desc"

function sortItems(items, field, dir) {
    const mult = dir === "asc" ? 1 : -1;
    return items.slice().sort((a, b) => {
        const av = a[field], bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;  // null은 정렬 방향과 무관하게 항상 맨 뒤
        if (bv == null) return -1;
        if (typeof av === "string") return av.localeCompare(bv) * mult;
        return (av - bv) * mult;
    });
}

function updateSortHeaderUI() {
    document.querySelectorAll(".sr-header .sortable").forEach(el => {
        el.classList.remove("sort-active", "sort-asc", "sort-desc");
        if (el.dataset.sort === sortField) {
            el.classList.add("sort-active", sortDir === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

function onSortHeaderClick(e) {
    const field = e.currentTarget.dataset.sort;
    const defaultDir = TEXT_SORT_FIELDS.has(field) ? "asc" : "desc";
    const oppositeDir = defaultDir === "asc" ? "desc" : "asc";

    if (sortField !== field) {
        sortField = field;
        sortDir = defaultDir;
    } else if (sortDir === defaultDir) {
        sortDir = oppositeDir;
    } else {
        sortField = null;
        sortDir = null;
    }

    updateSortHeaderUI();
    applyFilter();
}

function onLargeFilterChange() {
    populateMidFilter();
    applyFilter();
}

function onUnreportedToggleChange() {
    document.getElementById("list-body").classList.toggle(
        "unreported-noclick", document.getElementById("unreported-toggle").checked
    );
    populateLargeFilter();
    populateMidFilter();
    applyFilter();
}

// ── 카드 펼치기 / 차트 로드 ─────────────────────────
// 아코디언 구조상 한 번에 하나만 열려 있으므로, 닫히는 카드의 차트 인스턴스는 즉시 정리해서
// 여러 종목을 계속 눌러봐도 누적된 차트가 쌓여 느려지지 않게 한다.
function disposeRowCharts(code) {
    const opmId   = `chart-opm-${code}`;
    const priceId = `chart-price-${code}`;
    const opmChart = chartInstances[opmId];
    if (opmChart) { opmChart.destroy(); delete chartInstances[opmId]; }
    const priceChart = chartInstances[priceId];
    if (priceChart) { priceChart.dispose(); delete chartInstances[priceId]; }
    const detail = document.getElementById(`sr-detail-${code}`);
    if (detail) {
        delete detail.dataset.loaded;
        delete detail.dataset.loadToken;
    }
}

// 차트 영역(canvas/echarts 컨테이너)은 실제로 펼칠 때만 DOM에 생성한다.
// 2500개가 넘는 행 전체에 미리 깔아두면 빈 컨테이너만으로도 문서 전체 노드 수가
// 크게 늘어나 echarts.init() 등이 강제로 유발하는 레이아웃 계산 비용이 커진다.
function detailMarkup(code, name) {
    return `
        <div class="screen-chart-status">차트 불러오는 중...</div>
        <div class="screen-chart-wrap">
            <div class="screen-chart-row">
                <div class="graph-wrap">
                    <div class="graph-title">${name} · 매출/OPM</div>
                    <canvas id="chart-opm-${code}"></canvas>
                </div>
                <div class="graph-wrap">
                    <div class="graph-title">${name} · 주가</div>
                    <div id="chart-price-${code}" class="price-chart-container"></div>
                </div>
            </div>
        </div>
    `;
}

function isMobileView() {
    return window.innerWidth <= 700;
}

// 아코디언은 한 번에 하나만 열리므로, 매번 전체 행을 훑지 않고
// "닫히는 행 1개 + 열리는 행 1개"만 건드린다 (행이 수천 개일 때 클릭이 느려지는 것 방지)
function openRow(index) {
    if (!rowEls.length) return;
    // 미발표 기업 포함 체크 시에는 행이 2500개를 넘어가면서 차트를 여는 비용이 커져
    // 눈에 띄게 느려진다. 이 모드에서는 아예 클릭 동작을 막고 목록만 보여준다.
    if (document.getElementById("unreported-toggle").checked) return;
    index = Math.max(0, Math.min(rowEls.length - 1, index));
    if (index === activeIndex) return;

    if (activeIndex !== -1 && rowEls[activeIndex]) {
        const prevRow = rowEls[activeIndex];
        disposeRowCharts(prevRow.dataset.code);
        prevRow.classList.remove("active");
        const prevDetail = document.getElementById(`sr-detail-${prevRow.dataset.code}`);
        if (prevDetail) prevDetail.style.display = "none";
        const prevArrow = prevRow.querySelector(".sr-arrow");
        if (prevArrow) prevArrow.textContent = "▶";
    }

    const row    = rowEls[index];
    const detail = document.getElementById(`sr-detail-${row.dataset.code}`);
    row.classList.add("active");
    if (detail) {
        detail.style.display = "block";
        if (!detail.dataset.built) {
            detail.dataset.built = "1";
            detail.innerHTML = detailMarkup(row.dataset.code, row.dataset.name);
            detail.dataset.loaded = "1";
            loadStockCharts(row.dataset.code, detail);
        } else if (!detail.dataset.loaded) {
            detail.dataset.loaded = "1";
            loadStockCharts(row.dataset.code, detail);
        }
    }
    const arrow = row.querySelector(".sr-arrow");
    if (arrow) arrow.textContent = "▼";

    activeIndex = index;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
}

function selectRow(rowEl) {
    const idx = rowEls.indexOf(rowEl);
    if (idx === activeIndex) {
        rowEl.classList.remove("active");
        document.getElementById(`sr-detail-${rowEl.dataset.code}`).style.display = "none";
        rowEl.querySelector(".sr-arrow").textContent = "▶";
        disposeRowCharts(rowEl.dataset.code);
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

const smallScale = { ticks: { maxRotation: 90, minRotation: 90, font: { size: 9 } } };
let loadCounter = 0;

async function loadStockCharts(code, detail) {
    const myToken = ++loadCounter;
    detail.dataset.loadToken = myToken;

    const statusEl = detail.querySelector(".screen-chart-status");
    const wrapEl   = detail.querySelector(".screen-chart-wrap");

    try {
        const res = await fetch(`data/stocks/${code}.json`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        if (detail.dataset.loadToken != myToken) return; // 그 사이 카드가 닫혔거나 다시 열림 - 폐기

        statusEl.style.display = "none";
        wrapEl.style.display   = "block";

        if (data.financial) {
            const d = data.financial;
            const opmCanvas = document.getElementById(`chart-opm-${code}`);
            chartInstances[opmCanvas.id] = new Chart(opmCanvas, {
                data: {
                    labels: d.quarters,
                    datasets: [
                        { type: "bar",  label: "매출 (억원)", data: d.revenue, backgroundColor: "rgba(74,144,217,0.7)", yAxisID: "y",  order: 2 },
                        {
                            type: "line", label: "OPM (%)", data: d.opm, yAxisID: "y2", order: 1,
                            borderWidth: 2, pointRadius: 3,
                            borderColor: "#B4342A", backgroundColor: "#B4342A",
                        },
                        {
                            type: "line", label: "0", data: d.quarters.map(() => 0), yAxisID: "y2", order: 3,
                            borderColor: "#2F5FA3", borderWidth: 1, borderDash: [], pointRadius: 0, fill: false,
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: {
                            position: "top", labels: {
                                boxWidth: 10, font: { size: 10 },
                                filter: item => item.text !== "0"
                            }
                        }
                    },
                    scales: {
                        x: smallScale,
                        y:  { position: "left",  title: { display: true, text: "매출(억)", font: { size: 10 } } },
                        y2: { position: "right", title: { display: true, text: "OPM(%)", font: { size: 10 } }, grid: { drawOnChartArea: false } }
                    }
                }
            });
        }

        if (data.price && data.price.dates && data.price.dates.length) {
            const p = data.price;
            const candleData = p.dates.map((_, i) => [p.open[i], p.close[i], p.low[i], p.high[i]]);
            const volColors  = p.dates.map((_, i) =>
                p.close[i] >= (i > 0 ? p.close[i - 1] : p.close[i]) ? "rgba(180,52,42,0.6)" : "rgba(46,95,163,0.6)"
            );

            const lastClose = p.close[p.close.length - 1];
            let maxHighIdx = 0;
            p.high.forEach((v, i) => { if (v > p.high[maxHighIdx]) maxHighIdx = i; });
            const maxHigh = p.high[maxHighIdx];

            const tooltipFormatter = (params) => {
                if (!params || !params.length) return "";
                const idx = params[0].dataIndex;
                const close = p.close[idx];
                const prevClose = idx > 0 ? p.close[idx - 1] : close;
                const changeRate = prevClose ? (close - prevClose) / prevClose * 100 : 0;
                const color = changeRate >= 0 ? "#B4342A" : "#2E5FA3";
                return `${p.dates[idx]}<br/>` +
                    `종가: ${close.toLocaleString()}<br/>` +
                    `등락률: <span style="color:${color};font-weight:600;">${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(2)}%</span><br/>` +
                    `거래량: ${(p.volume[idx] || 0).toLocaleString()}`;
            };

            // 모바일에서는 캔들+거래량+MA+데이터줌까지 다 보여주면 좁은 화면에 짓눌려서
            // 봉이 찌그러지거나 축이 겹치는 문제가 있었음 - 종가 라인 하나로 단순화해서 보여준다.
            const mobileOption = {
                animation: false,
                grid: { left: 45, right: 15, top: 20, bottom: 36 },
                tooltip: { trigger: "axis", textStyle: { fontSize: 11 }, formatter: tooltipFormatter },
                dataZoom: [{ type: "inside", start: 60, end: 100 }],
                xAxis: {
                    type: "category", data: p.dates, boundaryGap: false,
                    axisLabel: { fontSize: 9, formatter: v => v.slice(5).replace("-", "/") },
                },
                yAxis: { scale: true, axisLabel: { fontSize: 9, formatter: v => v.toLocaleString() } },
                series: [{
                    name: "종가", type: "line", data: p.close,
                    smooth: true, symbol: "none",
                    lineStyle: { color: "#B4342A", width: 2 },
                    areaStyle: { color: "rgba(180,52,42,0.08)" },
                }],
            };

            const desktopOption = {
                animation: false,
                grid: [
                    { left: 15, right: 55, top: "16%", bottom: "26%" },
                    { left: 15, right: 55, top: "78%", bottom: "6%" },
                ],
                tooltip: { trigger: "axis", axisPointer: { type: "cross" }, textStyle: { fontSize: 11 }, formatter: tooltipFormatter },
                dataZoom: [
                    { type: "inside", xAxisIndex: [0, 1], start: 60, end: 100 },
                ],
                xAxis: [
                    { type: "category", data: p.dates, gridIndex: 0, boundaryGap: true, axisLabel: { show: false }, splitLine: { show: false } },
                    {
                        type: "category", data: p.dates, gridIndex: 1, boundaryGap: true,
                        axisLabel: { fontSize: 9, formatter: v => v.slice(5).replace("-", "/") },
                        splitLine: { show: false },
                    },
                ],
                yAxis: [
                    { scale: true, gridIndex: 0, position: "right", axisLabel: { fontSize: 9, formatter: v => v.toLocaleString() }, splitLine: { lineStyle: { color: "#f5f7fa" } } },
                    { scale: true, gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
                ],
                legend: {
                    top: 0, left: "center",
                    textStyle: { fontSize: 10 },
                    itemWidth: 14, itemHeight: 8,
                    data: [
                        { name: "MA20", icon: "line", textStyle: { color: "#29B6F6" } },
                        { name: "MA50", icon: "line", textStyle: { color: "#F5A623" } },
                    ],
                },
                series: [
                    {
                        name: "종가", type: "candlestick", xAxisIndex: 0, yAxisIndex: 0, data: candleData,
                        itemStyle: { color: "#B4342A", color0: "#2E5FA3", borderColor: "#B4342A", borderColor0: "#2E5FA3" },
                        markLine: {
                            symbol: "none",
                            silent: true,
                            data: [{
                                yAxis: lastClose,
                                label: { show: false },
                                lineStyle: { color: "#A9843F", type: "dashed", width: 1.4 },
                            }],
                        },
                        markPoint: {
                            symbol: "none",
                            label: {
                                show: true,
                                formatter: () => maxHigh.toLocaleString(),
                                position: "top",
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#B4342A",
                            },
                            data: [{ name: "최고점", coord: [maxHighIdx, maxHigh] }],
                        },
                    },
                    {
                        name: "MA20", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: p.ma20,
                        smooth: true, symbol: "none", showSymbol: false,
                        lineStyle: { color: "#29B6F6", width: 1.5 },
                    },
                    {
                        name: "MA50", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: p.ma50,
                        smooth: true, symbol: "none", showSymbol: false,
                        lineStyle: { color: "#F5A623", width: 1.5 },
                    },
                    {
                        name: "거래량", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: p.volume,
                        itemStyle: { color: (pr) => volColors[pr.dataIndex] },
                    },
                ],
            };

            const priceDiv = document.getElementById(`chart-price-${code}`);
            setTimeout(() => {
            if (detail.dataset.loadToken != myToken) return; // 그 사이 카드가 닫혔거나 다시 열림 - 폐기
            const priceChart = echarts.init(priceDiv);
            chartInstances[priceDiv.id] = priceChart;
            priceChart.setOption(isMobileView() ? mobileOption : desktopOption);
            priceChart.resize();
            }, 0);
        }
    } catch (e) {
        statusEl.textContent = "차트 데이터를 불러올 수 없습니다.";
    }
}

// ── 초기화 ────────────────────────────────────────
document.getElementById("market-filter").addEventListener("change", applyFilter);
document.getElementById("large-filter").addEventListener("change", onLargeFilterChange);
document.getElementById("mid-filter").addEventListener("change", applyFilter);
document.getElementById("quick-filter").addEventListener("change", applyFilter);
document.getElementById("stock-search").addEventListener("input", applyFilter);
document.getElementById("unreported-toggle").addEventListener("change", onUnreportedToggleChange);
document.querySelectorAll(".sr-header .sortable").forEach(el => el.addEventListener("click", onSortHeaderClick));

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadList();
loadVisitorCount();
