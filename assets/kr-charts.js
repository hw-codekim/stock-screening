let KC_DATA = null;
const KC_CHART_INSTANCES = new Map(); // code -> echarts instance

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

    const sections = [
        { key: "kospi200", title: "코스피200" },
        { key: "kosdaq150", title: "코스닥150" },
    ];

    body.innerHTML = sections.map(sec => {
        const items = (KC_DATA[sec.key] || []).slice().sort((a, b) => b.mktcap - a.mktcap);
        return `
        <div class="kc-sector">
            <div class="kc-sector-title">${sec.title}<span class="kc-sector-count">${items.length}개</span></div>
            <div class="kc-grid">
                ${items.map(it => `
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
                    <div class="kc-chart" id="kc-chart-${it.code}" data-code="${it.code}"></div>
                </div>
                `).join("")}
            </div>
        </div>`;
    }).join("");

    kcSetupLazyRender();
}

function kcFindItem(code) {
    for (const key of ["kospi200", "kosdaq150"]) {
        const found = (KC_DATA[key] || []).find(it => it.code === code);
        if (found) return found;
    }
    return null;
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
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'cross' }, textStyle: { fontSize: 11 },
            formatter: (params) => {
                const idx = params[0].dataIndex;
                const close = closes[idx];
                const prevClose = idx > 0 ? closes[idx - 1] : close;
                const changeRate = prevClose ? (close - prevClose) / prevClose * 100 : 0;
                const changeColor = changeRate >= 0 ? '#B4342A' : '#2E5FA3';
                const changeSign = changeRate >= 0 ? '+' : '';
                const ma50v = ma50[idx], ma150v = ma150[idx];
                return `
                    <div style="font-weight:600;margin-bottom:4px;">${dates[idx]}</div>
                    <div>현재가: ${close.toLocaleString()}</div>
                    <div>등락률: <span style="color:${changeColor};">${changeSign}${changeRate.toFixed(2)}%</span></div>
                    <div>거래량: ${vols[idx].toLocaleString()}</div>
                    <div>MA50: ${ma50v != null ? ma50v.toLocaleString() : '-'}</div>
                    <div>MA150: ${ma150v != null ? ma150v.toLocaleString() : '-'}</div>
                `;
            },
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [
            { left: 2, right: 4, top: 16, bottom: '27%' },
            { left: 2, right: 4, top: '75%', bottom: 2 },
        ],
        xAxis: [
            { type: 'category', data: dates, gridIndex: 0, boundaryGap: true,
              show: false },
            { type: 'category', data: dates, gridIndex: 1,
              show: false },
        ],
        yAxis: [
            { scale: true, gridIndex: 0, show: false },
            { scale: true, gridIndex: 1, show: false },
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
                markPoint: {
                    symbol: 'circle', symbolSize: 4,
                    itemStyle: { color: closes[closes.length - 1] >= (closes.length > 1 ? closes[closes.length - 2] : closes[closes.length - 1]) ? '#C0392B' : '#2E5FA3' },
                    label: {
                        show: true, position: 'top', distance: 6,
                        formatter: () => closes[closes.length - 1].toLocaleString(),
                        color: closes[closes.length - 1] >= (closes.length > 1 ? closes[closes.length - 2] : closes[closes.length - 1]) ? '#C0392B' : '#2E5FA3',
                        fontSize: 10, fontWeight: 600,
                        backgroundColor: 'rgba(255,255,255,0.85)',
                    },
                    data: [{ coord: [candleData.length - 1, closes[closes.length - 1]] }],
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
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                kcRenderChart(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '200px 0px' });
    containers.forEach(el => observer.observe(el));
}

const kcScrollTopBtn = document.getElementById("scroll-top-btn");
if (kcScrollTopBtn) {
    kcScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
        kcScrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    });
}

kcLoad();
