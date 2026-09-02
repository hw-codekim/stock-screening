let KC_DATA = null;
const KC_CHART_INSTANCES = new Map(); // code -> echarts instance
let KC_LAZY_OBSERVER = null;

async function kcLoad() {
    const body = document.getElementById("kc-body");
    try {
        const res = await fetch("data/kr_charts.json");
        KC_DATA = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    const genEl = document.getElementById("kc-generated-at");
    if (genEl) genEl.textContent = KC_DATA.generated_at ? `기준: ${KC_DATA.generated_at}` : "";

    document.getElementById("kc-large-filter").addEventListener("change", () => {
        kcPopulateMidFilter();
        kcRender();
    });
    document.getElementById("kc-mid-filter").addEventListener("change", kcRender);
    document.getElementById("kc-market-filter").addEventListener("change", () => {
        kcPopulateLargeFilter();
        kcPopulateMidFilter();
        kcRender();
    });
    document.getElementById("kc-search").addEventListener("input", kcRender);

    kcPopulateLargeFilter();
    kcPopulateMidFilter();
    kcRender();
}

// ── 필터링 helpers ──────────────────────────────────
function kcMarketFiltered() {
    const marketVal = document.getElementById("kc-market-filter").value;
    return (KC_DATA.items || []).filter(it => !marketVal || it.market === marketVal);
}

function kcPopulateLargeFilter() {
    const sel = document.getElementById("kc-large-filter");
    const prev = sel.value;
    const counts = {};
    kcMarketFiltered().forEach(it => { counts[it.sector_large] = (counts[it.sector_large] || 0) + 1; });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    sel.innerHTML = '<option value="">전체 대분류</option>' +
        sorted.map(s => `<option value="${s}">${s} (${counts[s]})</option>`).join("");
    sel.value = sorted.includes(prev) ? prev : "";
}

function kcPopulateMidFilter() {
    const largeVal = document.getElementById("kc-large-filter").value;
    const sel = document.getElementById("kc-mid-filter");
    const prev = sel.value;
    const counts = {};
    kcMarketFiltered()
        .filter(it => !largeVal || it.sector_large === largeVal)
        .forEach(it => { counts[it.sector_mid] = (counts[it.sector_mid] || 0) + 1; });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    sel.innerHTML = '<option value="">전체 중분류</option>' +
        sorted.map(s => `<option value="${s}">${s} (${counts[s]})</option>`).join("");
    sel.value = sorted.includes(prev) ? prev : "";
}

function kcFilteredItems() {
    const marketVal = document.getElementById("kc-market-filter").value;
    const largeVal  = document.getElementById("kc-large-filter").value;
    const midVal    = document.getElementById("kc-mid-filter").value;
    const q         = document.getElementById("kc-search").value.trim().toLowerCase();
    return (KC_DATA.items || []).filter(it =>
        (!marketVal || it.market === marketVal) &&
        (!largeVal || it.sector_large === largeVal) &&
        (!midVal || it.sector_mid === midVal) &&
        (!q || it.name.toLowerCase().includes(q) || it.code.includes(q))
    );
}

// 대분류별로 묶어서 대분류 합산 시총 내림차순.
// 대분류 안에서는 다시 중분류별로 묶어 중분류 합산 시총 내림차순으로 인접 정렬,
// 같은 중분류 안에서는 종목 시총 내림차순.
function kcGroupBySector(items) {
    const largeMap = {};
    items.forEach(it => { (largeMap[it.sector_large] = largeMap[it.sector_large] || []).push(it); });

    const groups = Object.keys(largeMap).map(sector => {
        const midMap = {};
        largeMap[sector].forEach(it => { (midMap[it.sector_mid] = midMap[it.sector_mid] || []).push(it); });

        const midGroups = Object.keys(midMap).map(mid => {
            const midItems = midMap[mid].slice().sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
            const total = midItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
            return { mid, items: midItems, total };
        });
        midGroups.sort((a, b) => b.total - a.total);

        const sortedItems = midGroups.flatMap(g => g.items);
        const total = midGroups.reduce((sum, g) => sum + g.total, 0);
        return { sector, items: sortedItems, total };
    });
    groups.sort((a, b) => b.total - a.total);
    return groups;
}

// ── 렌더 ────────────────────────────────────────────
function kcRender() {
    const body = document.getElementById("kc-body");

    if (KC_LAZY_OBSERVER) { KC_LAZY_OBSERVER.disconnect(); KC_LAZY_OBSERVER = null; }
    KC_CHART_INSTANCES.forEach(chart => chart.dispose());
    KC_CHART_INSTANCES.clear();

    const items = kcFilteredItems();
    document.getElementById("kc-count-line").textContent = `${items.length}개 종목`;

    if (items.length === 0) {
        body.innerHTML = '<p class="placeholder">조건에 맞는 종목이 없습니다.</p>';
        return;
    }

    const groups = kcGroupBySector(items);

    body.innerHTML = groups.map(g => `
        <div class="kc-sector">
            <div class="kc-sector-title">${g.sector}<span class="kc-sector-count">${g.items.length}개</span></div>
            <div class="kc-grid">
                ${g.items.map(it => `
                <div class="kc-card">
                    <div class="kc-card-label">
                        <span class="kc-card-left">
                            <span class="kc-card-name">${it.name}</span>
                            <span class="kc-mini-legend">
                                <i class="kc-legend-dot" style="background:#9B59B6;"></i>50
                                <i class="kc-legend-dot" style="background:#27ae60;"></i>150
                            </span>
                        </span>
                        <span class="kc-card-mktcap">시총 ${Math.round(it.mktcap).toLocaleString()}억</span>
                    </div>
                    <div class="kc-card-sub">
                        <span class="kc-card-mid">${it.sector_mid}</span>
                        <span class="kc-card-market">${it.market === "KOSPI" ? "코스피" : "코스닥"}</span>
                    </div>
                    <div class="kc-card-price">${kcLastPriceText(it)}</div>
                    <div class="kc-chart" id="kc-chart-${it.code}" data-code="${it.code}"></div>
                </div>
                `).join("")}
            </div>
        </div>`
    ).join("");

    kcSetupLazyRender();
}

function kcLastPriceText(item) {
    if (!item.ohlcv || item.ohlcv.length === 0) return '-';
    const last = item.ohlcv[item.ohlcv.length - 1];
    const prev = item.ohlcv.length > 1 ? item.ohlcv[item.ohlcv.length - 2] : last;
    const [y, m, d] = last[0].split('-').map(Number);
    const close = last[4];
    const prevClose = prev[4];
    const pct = prevClose ? (close - prevClose) / prevClose * 100 : 0;
    const sign = pct >= 0 ? '+' : '';
    const color = pct >= 0 ? '#B4342A' : '#2E5FA3';
    return `${m}/${d}일 <span style="color:${color};font-weight:600;">${close.toLocaleString()}원(${sign}${pct.toFixed(1)}%)</span>`;
}

function kcFindItem(code) {
    return (KC_DATA.items || []).find(it => it.code === code) || null;
}

function kcRenderChart(container) {
    const code = container.dataset.code;
    if (KC_CHART_INSTANCES.has(code)) return;
    const item = kcFindItem(code);
    if (!item || !item.ohlcv || item.ohlcv.length === 0) {
        container.innerHTML = '<p style="color:#aaa;font-size:12px;padding:10px;text-align:center;">데이터 없음</p>';
        return;
    }

    const dates  = item.ohlcv.map(b => b[0]);
    const opens  = item.ohlcv.map(b => b[1]);
    const highs  = item.ohlcv.map(b => b[2]);
    const lows   = item.ohlcv.map(b => b[3]);
    const closes = item.ohlcv.map(b => b[4]);
    const vols   = item.ohlcv.map(b => b[5]);
    const ma50   = item.ohlcv.map(b => b[6]);
    const ma150  = item.ohlcv.map(b => b[7]);

    const candleData = dates.map((_, i) => [opens[i], closes[i], lows[i], highs[i]]);
    const volColors = dates.map((_, i) =>
        closes[i] >= (i > 0 ? closes[i - 1] : closes[i]) ? 'rgba(180,52,42,0.65)' : 'rgba(46,95,163,0.65)'
    );

    const chart = echarts.init(container, null, { devicePixelRatio: window.devicePixelRatio || 1 });
    chart.setOption({
        animation: false,
        backgroundColor: '#ffffff',
        tooltip: { show: false },
        grid: [
            { left: 6, right: 6, top: 16, bottom: '27%' },
            { left: 6, right: 6, top: '75%', bottom: 2 },
        ],
        xAxis: [
            { type: 'category', data: dates, gridIndex: 0, boundaryGap: true,
              axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
              splitLine: { show: true, lineStyle: { color: '#EFF2F6' } } },
            { type: 'category', data: dates, gridIndex: 1,
              axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
              splitLine: { show: true, lineStyle: { color: '#EFF2F6' } } },
        ],
        yAxis: [
            { scale: true, gridIndex: 0,
              axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
              splitLine: { show: true, lineStyle: { color: '#E7EBF1' } } },
            { scale: true, gridIndex: 1,
              axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
              splitLine: { show: false } },
        ],
        series: [
            {
                type: 'candlestick', name: '주가',
                xAxisIndex: 0, yAxisIndex: 0,
                data: candleData,
                barWidth: '70%',
                itemStyle: {
                    color: '#C0392B', color0: '#2E5FA3',
                    borderColor: '#C0392B', borderColor0: '#2E5FA3',
                    borderWidth: 1.1,
                },
            },
            {
                type: 'line', name: 'MA50', xAxisIndex: 0, yAxisIndex: 0,
                data: ma50, smooth: true, symbol: 'none', showSymbol: false,
                lineStyle: { color: '#9B59B6', width: 1.2 },
            },
            {
                type: 'line', name: 'MA150', xAxisIndex: 0, yAxisIndex: 0,
                data: ma150, smooth: true, symbol: 'none', showSymbol: false,
                lineStyle: { color: '#27ae60', width: 1.2 },
            },
            {
                type: 'bar', name: '거래량',
                xAxisIndex: 1, yAxisIndex: 1,
                data: vols,
                itemStyle: { color: (params) => volColors[params.dataIndex] },
            },
        ],
    });

    KC_CHART_INSTANCES.set(code, chart);
}

function kcSetupLazyRender() {
    const containers = document.querySelectorAll('.kc-chart');
    if (!('IntersectionObserver' in window)) {
        containers.forEach(kcRenderChart);
        return;
    }
    KC_LAZY_OBSERVER = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                kcRenderChart(entry.target);
                KC_LAZY_OBSERVER.unobserve(entry.target);
            }
        });
    }, { rootMargin: '200px 0px' });
    containers.forEach(el => KC_LAZY_OBSERVER.observe(el));
}

const kcScrollTopBtn = document.getElementById("scroll-top-btn");
if (kcScrollTopBtn) {
    kcScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
        kcScrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    });
}

kcLoad();
