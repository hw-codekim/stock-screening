// ── 포맷 헬퍼 ──────────────────────────────────────
function fmtEok(v) {
    if (v == null) return "-";
    return v.toLocaleString() + "억";
}
function fmtYoy(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + v + "%";
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
// 중분류가 "대분류_세부명"처럼 앞에 상위 분류를 접두어로 달고 있으면(예: 반도체_PCB),
// 같은 대분류 그룹 안에서는 중복 정보라 잘리기 쉬우므로 접두어를 떼고 세부명만 보여준다.
function stripMidPrefix(mid) {
    if (!mid || !mid.includes("_")) return mid;
    return mid.split("_").slice(1).join("_");
}

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

// 대분류 > 종목(시총 내림차순) 구조로 묶기 (섹터 컬럼에는 중분류를 그대로 표시)
function groupBySector(items) {
    const largeMap = {};
    items.forEach(s => {
        (largeMap[s.sector_large] = largeMap[s.sector_large] || []).push(s);
    });

    const sectors = Object.keys(largeMap).map(large => {
        const sortedItems = largeMap[large].slice().sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
        const total = sortedItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
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

    populateLargeFilter();
    populateMidFilter();
    applyFilter();
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
        <div class="sr-sector-group-title">${g.sector} (${g.items.length})</div>
        ${g.items.map((s, i) => `
        <div class="sr-row" data-code="${s.code}">
            <span class="sr-arrow">▶</span>
            <span class="sr-name">${i + 1}. ${s.name} <span style="color:#aaa;font-weight:400;">${s.code}</span></span>
            <span class="sr-sector" data-label="섹터" title="${s.sector_mid}">${stripMidPrefix(s.sector_mid)}</span>
            <span class="sr-market" data-label="시장">${s.market || "-"}</span>
            <span class="sr-mktcap" data-label="시총">${fmtMktcap(s.mktcap)}</span>
            <span class="sr-num" data-label="매출">${fmtEok(s.revenue)}</span>
            <span class="sr-yoy" data-label="매출YoY" style="color:${yoyColor(s.revenue_yoy)};">${fmtYoy(s.revenue_yoy)}</span>
            <span class="sr-num" data-label="영업이익">${fmtEok(s.op_income)}</span>
            <span class="sr-yoy" data-label="영업이익YoY" style="color:${yoyColor(s.op_income_yoy)};">${fmtYoy(s.op_income_yoy)}</span>
            <span class="sr-opm" data-label="OPM">${s.opm != null ? s.opm + "%" : "-"}</span>
            <span class="sr-price" data-label="현재가">${fmtPrice(s.current_price)}</span>
            <span class="sr-daychg" data-label="최근등락" style="color:${yoyColor(s.day_change_rate)};">${fmtYoy(s.day_change_rate)}</span>
            <span class="sr-chg" data-label="7/30이후" style="color:${yoyColor(s.price_change)};">${fmtYoy(s.price_change)}</span>
            <span class="sr-mdd" data-label="MDD">${s.mdd != null ? s.mdd + "%" : "-"}</span>
        </div>
        <div class="sr-detail" id="sr-detail-${s.code}" style="display:none;">
            <div class="screen-chart-status">차트 불러오는 중...</div>
            <div class="screen-chart-wrap">
                <div class="screen-chart-row">
                    <div class="graph-wrap"><canvas id="chart-opm-${s.code}"></canvas></div>
                    <div class="graph-wrap"><div id="chart-price-${s.code}" style="height:260px;"></div></div>
                </div>
            </div>
        </div>
        `).join("")}
    `).join("");

    rowEls = Array.from(listBody.querySelectorAll(".sr-row"));
    rowEls.forEach(row => row.addEventListener("click", () => selectRow(row)));
    activeIndex = -1;
}

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
    const query     = document.getElementById("stock-search").value.trim().toLowerCase();

    const filteredItems = activeItems().filter(s =>
        (!marketVal || s.market === marketVal) &&
        (!largeVal || s.sector_large === largeVal) &&
        (!midVal || s.sector_mid === midVal) &&
        (!query || s.name.toLowerCase().includes(query) || s.code.includes(query))
    );

    renderList(groupBySector(filteredItems));
}

function onLargeFilterChange() {
    populateMidFilter();
    applyFilter();
}

function onUnreportedToggleChange() {
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

// 아코디언은 한 번에 하나만 열리므로, 매번 전체 행을 훑지 않고
// "닫히는 행 1개 + 열리는 행 1개"만 건드린다 (행이 수천 개일 때 클릭이 느려지는 것 방지)
function openRow(index) {
    if (!rowEls.length) return;
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
        if (!detail.dataset.loaded) {
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
                        { type: "line", label: "OPM (%)",    data: d.opm,     borderColor: "#B4342A", backgroundColor: "#B4342A", borderWidth: 2, pointRadius: 3, yAxisID: "y2", order: 1 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } } },
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

            const priceDiv = document.getElementById(`chart-price-${code}`);
            setTimeout(() => {
            if (detail.dataset.loadToken != myToken) return; // 그 사이 카드가 닫혔거나 다시 열림 - 폐기
            const priceChart = echarts.init(priceDiv);
            chartInstances[priceDiv.id] = priceChart;
            priceChart.setOption({
                animation: false,
                grid: [
                    { left: 15, right: 55, top: "16%", bottom: "26%" },
                    { left: 15, right: 55, top: "78%", bottom: "6%" },
                ],
                tooltip: {
                    trigger: "axis",
                    axisPointer: { type: "cross" },
                    textStyle: { fontSize: 11 },
                    formatter: (params) => {
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
                    },
                },
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
            });
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
document.getElementById("stock-search").addEventListener("input", applyFilter);
document.getElementById("unreported-toggle").addEventListener("change", onUnreportedToggleChange);

loadList();
loadVisitorCount();
