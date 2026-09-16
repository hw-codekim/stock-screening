let BC_DATA = null;
const BC_CHART_INSTANCES = new Map(); // code -> echarts instance
let BC_LAZY_OBSERVER = null;

async function bcLoad() {
    const body = document.getElementById("bc-body");
    try {
        const res = await fetch("data/buy_candidates.json");
        BC_DATA = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    document.getElementById("bc-market-filter").addEventListener("change", () => {
        bcPopulateLargeFilter();
        bcRender();
    });
    document.getElementById("bc-cond-filter").addEventListener("change", bcRender);
    document.getElementById("bc-large-filter").addEventListener("change", bcRender);
    document.getElementById("bc-search").addEventListener("input", bcRender);

    bcPopulateCondFilter();
    bcPopulateLargeFilter();
    bcRender();
}

// ── 필터링 helpers ──────────────────────────────────
function bcMarketFiltered() {
    const marketVal = document.getElementById("bc-market-filter").value;
    return (BC_DATA.items || []).filter(it => !marketVal || it.market === marketVal);
}

function bcPopulateCondFilter() {
    const sel = document.getElementById("bc-cond-filter");
    const conditions = BC_DATA.conditions || {};
    const counts = {};
    (BC_DATA.items || []).forEach(it => (it.matched || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
    const nums = Object.keys(conditions).sort((a, b) => Number(a) - Number(b));
    sel.innerHTML = '<option value="">전체 조건</option>' +
        nums.map(n => `<option value="${n}">${n}. ${conditions[n]} (${counts[n] || 0})</option>`).join("");
}

function bcPopulateLargeFilter() {
    const sel = document.getElementById("bc-large-filter");
    const prev = sel.value;
    const counts = {};
    bcMarketFiltered().forEach(it => { counts[it.sector_large] = (counts[it.sector_large] || 0) + 1; });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    sel.innerHTML = '<option value="">전체 대분류</option>' +
        sorted.map(s => `<option value="${s}">${s} (${counts[s]})</option>`).join("");
    sel.value = sorted.includes(prev) ? prev : "";
}

function bcFilteredItems() {
    const marketVal = document.getElementById("bc-market-filter").value;
    const condVal   = document.getElementById("bc-cond-filter").value;
    const largeVal  = document.getElementById("bc-large-filter").value;
    const q         = document.getElementById("bc-search").value.trim().toLowerCase();
    return (BC_DATA.items || []).filter(it =>
        (!marketVal || it.market === marketVal) &&
        (!condVal || (it.matched || []).includes(Number(condVal))) &&
        (!largeVal || it.sector_large === largeVal) &&
        (!q || it.name.toLowerCase().includes(q) || it.code.includes(q))
    );
}

// 대분류별로 묶어 대분류 합산 시총 내림차순, 대분류 안에서는 종목 시총 내림차순
function bcGroupBySector(items) {
    const largeMap = {};
    items.forEach(it => { (largeMap[it.sector_large] = largeMap[it.sector_large] || []).push(it); });

    const groups = Object.keys(largeMap).map(sector => {
        const sortedItems = largeMap[sector].slice().sort((a, b) => (b.mktcap || 0) - (a.mktcap || 0));
        const total = sortedItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
        return { sector, items: sortedItems, total };
    });
    groups.sort((a, b) => b.total - a.total);
    return groups;
}

// ── 렌더 ────────────────────────────────────────────
function bcRender() {
    const body = document.getElementById("bc-body");

    if (BC_LAZY_OBSERVER) { BC_LAZY_OBSERVER.disconnect(); BC_LAZY_OBSERVER = null; }
    BC_CHART_INSTANCES.forEach(chart => chart.dispose());
    BC_CHART_INSTANCES.clear();

    const items = bcFilteredItems();
    const genText = BC_DATA.generated_at ? ` · 기준: ${BC_DATA.generated_at}` : "";
    document.getElementById("bc-count-line").textContent = `${items.length}개 종목${genText}`;

    if (items.length === 0) {
        body.innerHTML = '<p class="placeholder">조건에 맞는 종목이 없습니다.</p>';
        return;
    }

    const groups = bcGroupBySector(items);
    const conditions = BC_DATA.conditions || {};

    body.innerHTML = groups.map(g => `
        <div class="bc-sector">
            <div class="bc-sector-title">${g.sector}<span class="bc-sector-count">${g.items.length}개</span></div>
            <div class="bc-grid">
                ${g.items.map(it => `
                <div class="bc-card">
                    <div class="bc-card-label">
                        <span class="bc-card-left">
                            <span class="bc-card-name">${it.name}</span>
                            <span class="bc-mini-legend">
                                <i class="bc-legend-dot" style="background:#9B59B6;"></i>50
                                <i class="bc-legend-dot" style="background:#27ae60;"></i>150
                            </span>
                        </span>
                        <span class="bc-card-mktcap">시총 ${Math.round(it.mktcap).toLocaleString()}억</span>
                    </div>
                    <div class="bc-card-sub">
                        <span class="bc-card-mid">${it.sector_mid}</span>
                        <span class="bc-card-market">${it.market === "코스피" ? "코스피" : it.market === "코스닥" ? "코스닥" : it.market}</span>
                    </div>
                    <div class="bc-badges">
                        ${(it.matched || []).map(c => `<span class="bc-badge bc-badge-${c}" title="${conditions[c] || ''}">${c}. ${conditions[c] || ''}</span>`).join("")}
                    </div>
                    <div class="bc-card-price">${bcLastPriceText(it)}</div>
                    <div class="bc-chart" id="bc-chart-${it.code}" data-code="${it.code}"></div>
                    ${bcNewsHtml(it)}
                </div>
                `).join("")}
            </div>
        </div>`
    ).join("");

    bcSetupLazyRender();
}

function bcNewsHtml(item) {
    const news = item.news || [];
    if (news.length === 0) {
        return '<div class="bc-news"><div class="bc-news-title">관련 뉴스</div><div class="bc-news-empty">뉴스 없음</div></div>';
    }
    return `
        <div class="bc-news">
            <div class="bc-news-title">관련 뉴스</div>
            ${news.map(n => `
                <a class="bc-news-item" href="${n.url}" target="_blank" rel="noopener" title="${n.title}">
                    <span class="bc-news-meta">${n.date ? n.date.slice(5, 16) : ''}</span>${n.title}
                </a>
            `).join("")}
        </div>`;
}

function bcLastPriceText(item) {
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

function bcFindItem(code) {
    return (BC_DATA.items || []).find(it => it.code === code) || null;
}

function bcRenderChart(container) {
    const code = container.dataset.code;
    if (BC_CHART_INSTANCES.has(code)) return;
    const item = bcFindItem(code);
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

    BC_CHART_INSTANCES.set(code, chart);
}

function bcSetupLazyRender() {
    const containers = document.querySelectorAll('.bc-chart');
    if (!('IntersectionObserver' in window)) {
        containers.forEach(bcRenderChart);
        return;
    }
    BC_LAZY_OBSERVER = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                bcRenderChart(entry.target);
                BC_LAZY_OBSERVER.unobserve(entry.target);
            }
        });
    }, { rootMargin: '200px 0px' });
    containers.forEach(el => BC_LAZY_OBSERVER.observe(el));
}

const bcScrollTopBtn = document.getElementById("scroll-top-btn");
if (bcScrollTopBtn) {
    bcScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
        bcScrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    });
}

bcLoad();
