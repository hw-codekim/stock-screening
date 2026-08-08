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

// ── 상태 ──────────────────────────────────────────
let listData = null;       // list.json 원본
let rowEls = [];           // 현재 렌더링된 .sr-row 목록 (필터 반영 후)
let activeIndex = -1;
const chartInstances = {};

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

    document.getElementById("summary-line").textContent =
        `[${listData.generated_at}] ${listData.quarter_label} 실적 발표 기업 ${listData.total_count}개`;

    populateLargeFilter(listData.sectors);
    populateMidFilter();
    renderList(listData.sectors);
}

function populateLargeFilter(sectors) {
    const sel = document.getElementById("large-filter");
    sectors
        .slice()
        .sort((a, b) => b.items.length - a.items.length)
        .forEach(g => {
            const opt = document.createElement("option");
            opt.value = g.sector;
            opt.textContent = `${g.sector} (${g.items.length})`;
            sel.appendChild(opt);
        });
}

// 대분류 선택에 따라 중분류 옵션을 다시 구성 (없으면 전체 종목 기준)
function populateMidFilter() {
    const largeVal = document.getElementById("large-filter").value;
    const midSel = document.getElementById("mid-filter");
    midSel.innerHTML = '<option value="">전체 중분류</option>';

    const counts = {};
    listData.sectors
        .filter(g => !largeVal || g.sector === largeVal)
        .forEach(g => g.items.forEach(s => {
            counts[s.sector_mid] = (counts[s.sector_mid] || 0) + 1;
        }));

    Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .forEach(mid => {
            const opt = document.createElement("option");
            opt.value = mid;
            opt.textContent = `${mid} (${counts[mid]})`;
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
            <span class="sr-source" style="color:${s.source === "정기공시" ? "#2F6B4F" : "#888"};">${s.source}</span>
            <span class="sr-sector">${s.sector_large}</span>
            <span class="sr-mktcap">${fmtMktcap(s.mktcap)}</span>
            <span class="sr-num">${fmtEok(s.revenue)}</span>
            <span class="sr-yoy" style="color:${yoyColor(s.revenue_yoy)};">${fmtYoy(s.revenue_yoy)}</span>
            <span class="sr-num">${fmtEok(s.op_income)}</span>
            <span class="sr-yoy" style="color:${yoyColor(s.op_income_yoy)};">${fmtYoy(s.op_income_yoy)}</span>
            <span class="sr-opm">${s.opm ?? "-"}%</span>
            <span class="sr-chg" style="color:${yoyColor(s.price_change)};">${fmtYoy(s.price_change)}</span>
            <span class="sr-mdd">${s.mdd ?? "-"}%</span>
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
    const largeVal = document.getElementById("large-filter").value;
    const midVal   = document.getElementById("mid-filter").value;
    const query    = document.getElementById("stock-search").value.trim().toLowerCase();

    const filtered = listData.sectors
        .filter(g => !largeVal || g.sector === largeVal)
        .map(g => ({
            sector: g.sector,
            items: g.items.filter(s =>
                (!midVal || s.sector_mid === midVal) &&
                (!query || s.name.toLowerCase().includes(query) || s.code.includes(query))
            ),
        }))
        .filter(g => g.items.length > 0);

    renderList(filtered);
}

function onLargeFilterChange() {
    populateMidFilter();
    applyFilter();
}

// ── 카드 펼치기 / 차트 로드 ─────────────────────────
function openRow(index) {
    if (!rowEls.length) return;
    index = Math.max(0, Math.min(rowEls.length - 1, index));

    rowEls.forEach((row, i) => {
        const detail = document.getElementById(`sr-detail-${row.dataset.code}`);
        const arrow  = row.querySelector(".sr-arrow");
        if (i === index) {
            row.classList.add("active");
            detail.style.display = "block";
            arrow.textContent = "▼";
            if (!detail.dataset.loaded) {
                detail.dataset.loaded = "1";
                loadStockCharts(row.dataset.code, detail);
            }
        } else {
            row.classList.remove("active");
            detail.style.display = "none";
            arrow.textContent = "▶";
        }
    });

    activeIndex = index;
    rowEls[index].scrollIntoView({ block: "center", behavior: "smooth" });
}

function selectRow(rowEl) {
    const idx = rowEls.indexOf(rowEl);
    if (idx === activeIndex) {
        rowEl.classList.remove("active");
        document.getElementById(`sr-detail-${rowEl.dataset.code}`).style.display = "none";
        rowEl.querySelector(".sr-arrow").textContent = "▶";
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

async function loadStockCharts(code, detail) {
    const statusEl = detail.querySelector(".screen-chart-status");
    const wrapEl   = detail.querySelector(".screen-chart-wrap");

    try {
        const res = await fetch(`data/stocks/${code}.json`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();

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
                    responsive: true, maintainAspectRatio: false,
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
            const priceChart = echarts.init(priceDiv);
            chartInstances[priceDiv.id] = priceChart;
            priceChart.setOption({
                grid: [
                    { left: 55, right: 15, top: "16%", bottom: "32%" },
                    { left: 55, right: 15, top: "72%", bottom: "6%" },
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
                xAxis: [
                    { type: "category", data: p.dates, gridIndex: 0, axisLabel: { show: false }, splitLine: { show: false } },
                    { type: "category", data: p.dates, gridIndex: 1, axisLabel: { fontSize: 8, rotate: 90 }, splitLine: { show: false } },
                ],
                yAxis: [
                    { scale: true, gridIndex: 0, axisLabel: { fontSize: 9, formatter: v => v.toLocaleString() }, splitLine: { lineStyle: { color: "#f5f7fa" } } },
                    { scale: true, gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
                ],
                legend: {
                    top: 0, left: "center",
                    textStyle: { fontSize: 10 },
                    data: ["종가", "MA20", "MA50"],
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
                                label: {
                                    formatter: "현재 " + lastClose.toLocaleString(),
                                    color: "#fff", backgroundColor: "#A9843F",
                                    padding: [3, 8], borderRadius: 10, fontSize: 10,
                                    fontWeight: 600, position: "end",
                                },
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
            requestAnimationFrame(() => priceChart.resize());
        }
    } catch (e) {
        statusEl.textContent = "차트 데이터를 불러올 수 없습니다.";
    }
}

// ── 초기화 ────────────────────────────────────────
document.getElementById("large-filter").addEventListener("change", onLargeFilterChange);
document.getElementById("mid-filter").addEventListener("change", applyFilter);
document.getElementById("stock-search").addEventListener("input", applyFilter);

loadList();
loadVisitorCount();
