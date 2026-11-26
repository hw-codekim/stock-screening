// ETF 차트: 액티브 ETF(맨 위) + 섹터별 대표 ETF(국장·미장), 국장은 상장좌수 변화·구성종목 비중 변화 표, 최근 6개월 캔들 + 10·50일선 + 거래량
// 데이터: data/etf_charts.json (collector/export_etf_charts.py) · 스타일은 kr-charts.css 재사용
let EC_DATA = null;
const EC_CHART_INSTANCES = new Map(); // key -> echarts instance
let EC_LAZY_OBSERVER = null;

async function ecLoad() {
    const body = document.getElementById("kc-body");
    try {
        const res = await fetch("data/etf_charts.json");
        EC_DATA = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    const genEl = document.getElementById("kc-generated-at");
    if (genEl) genEl.textContent = EC_DATA.generated_at ? `기준: ${EC_DATA.generated_at}` : "";

    document.getElementById("kc-market-filter").addEventListener("change", () => { ecPopulateSectorFilter(); ecRender(); });
    document.getElementById("kc-large-filter").addEventListener("change", ecRender);
    document.getElementById("kc-search").addEventListener("input", ecRender);

    ecPopulateSectorFilter();
    ecRender();
}

function ecFilteredGroups() {
    const marketVal = document.getElementById("kc-market-filter").value;
    const sectorVal = document.getElementById("kc-large-filter").value;
    const q = document.getElementById("kc-search").value.trim().toLowerCase();
    return (EC_DATA.groups || [])
        .filter(g => !sectorVal || g.sector === sectorVal)
        .map(g => ({
            sector: g.sector,
            items: g.items.filter(it =>
                (!marketVal || it.market === marketVal) &&
                (!q || it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q))
            ),
        }))
        .filter(g => g.items.length > 0);
}

function ecPopulateSectorFilter() {
    const marketVal = document.getElementById("kc-market-filter").value;
    const sel = document.getElementById("kc-large-filter");
    const prev = sel.value;
    const opts = (EC_DATA.groups || [])
        .map(g => ({ sector: g.sector, n: g.items.filter(it => !marketVal || it.market === marketVal).length }))
        .filter(o => o.n > 0);
    sel.innerHTML = '<option value="">전체 섹터</option>' +
        opts.map(o => `<option value="${o.sector}">${o.sector} (${o.n})</option>`).join("");
    sel.value = opts.some(o => o.sector === prev) ? prev : "";
}

function ecKey(sector, it) { return `${sector}|${it.code}`; }

function ecRender() {
    const body = document.getElementById("kc-body");
    if (EC_LAZY_OBSERVER) { EC_LAZY_OBSERVER.disconnect(); EC_LAZY_OBSERVER = null; }
    EC_CHART_INSTANCES.forEach(chart => chart.dispose());
    EC_CHART_INSTANCES.clear();

    const groups = ecFilteredGroups();
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    document.getElementById("kc-count-line").textContent = `${groups.length}개 섹터 · ${total}개 ETF`;

    if (total === 0) {
        body.innerHTML = '<p class="placeholder">조건에 맞는 ETF가 없습니다.</p>';
        return;
    }

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
                                <i class="kc-legend-dot" style="background:#E67E22;"></i>10
                                <i class="kc-legend-dot" style="background:#9B59B6;"></i>50
                            </span>
                        </span>
                        <span class="kc-card-mktcap">${it.market === "US" ? "미장" : "국장"}</span>
                    </div>
                    <div class="kc-card-sub">
                        <span class="kc-card-mid">${it.code}</span>
                        <span class="kc-card-market">${ecPeriodReturnText(it)}</span>
                    </div>
                    <div class="kc-card-price">${ecLastPriceText(it)}</div>
                    <div class="kc-chart" data-key="${ecKey(g.sector, it)}"></div>
                    ${ecUnitsHtml(it)}
                    ${ecHoldingsHtml(it)}
                </div>
                `).join("")}
            </div>
        </div>`
    ).join("");

    ecSetupLazyRender();
}

// 액티브 ETF 구성종목 비중 + 1일·1주·1개월 전 대비 증감(%p)
function ecDeltaCell(v) {
    if (v === null || v === undefined) return '<td class="ec-h-d">-</td>';
    if (Math.abs(v) < 0.005) return '<td class="ec-h-d">0.00</td>';
    const color = v > 0 ? '#B4342A' : '#2E5FA3';
    return `<td class="ec-h-d" style="color:${color};">${v > 0 ? '+' : ''}${v.toFixed(2)}</td>`;
}

function ecShortDate(d) {
    if (!d) return '';
    const [, m, dd] = d.split('-').map(Number);
    return `${m}/${dd}`;
}

// 상장좌수·순자산 + 1일·1주·1개월 전 대비 좌수 증감률 (좌수↑ = 설정, 돈이 들어옴)
function ecFmtUnits(u) {
    if (u >= 1e8) return `${(u / 1e8).toFixed(2)}억좌`;
    if (u >= 1e4) return `${Math.round(u / 1e4).toLocaleString()}만좌`;
    return `${u.toLocaleString()}좌`;
}

function ecUnitsHtml(it) {
    const u = it.units;
    if (!u) return '';
    const c = u.chg || {};
    const cell = (k, label) => {
        const v = c[k];
        if (v === undefined || v === null) return `<span class="ec-u-c">${label} <i>-</i></span>`;
        const color = v > 0 ? '#B4342A' : (v < 0 ? '#2E5FA3' : '#999');
        return `<span class="ec-u-c" title="${(u.cmp || {})[k] || ''} 대비">${label} <b style="color:${color};">${v > 0 ? '+' : ''}${v.toFixed(1)}%</b></span>`;
    };
    const na = u.net_asset ? ` · 순자산 ${Number(u.net_asset).toLocaleString()}억` : '';
    return `
        <div class="ec-units">
            <div class="ec-u-top">상장좌수 <b>${ecFmtUnits(u.units)}</b>${na}</div>
            <div class="ec-u-chg">좌수 ${cell('d1', '1일')}${cell('w1', '1주')}${cell('m1', '1개월')}</div>
        </div>`;
}

function ecHoldingsHtml(it) {
    const h = it.holdings;
    if (!h || !h.top || h.top.length === 0) return '';
    const c = h.cmp || {};
    const rows = h.top.map(r => `
        <tr><td class="ec-h-n" title="${r.name}">${r.name}</td><td class="ec-h-w">${r.w.toFixed(2)}</td>
        ${ecDeltaCell(r.d1)}${ecDeltaCell(r.w1)}${ecDeltaCell(r.m1)}</tr>`).join("");
    const chip = (arr, cls) => arr.map(x => `<span class="ec-h-chip ${cls}">${x.name} ${x.w.toFixed(1)}</span>`).join("");
    const moves = (h.added && h.added.length) || (h.removed && h.removed.length)
        ? `<div class="ec-h-moves">
              ${h.added && h.added.length ? `<div><b>1주 신규</b> ${chip(h.added, 'ec-h-add')}</div>` : ''}
              ${h.removed && h.removed.length ? `<div><b>1주 제외</b> ${chip(h.removed, 'ec-h-rm')}</div>` : ''}
           </div>` : '';
    return `
        <div class="ec-holdings">
            <div class="ec-h-title">구성종목 비중 <span>${ecShortDate(h.date)} 기준 · 증감 %p</span></div>
            <table class="ec-h-table">
                <thead><tr><th>종목</th><th>비중</th>
                    <th title="${c.d1 || ''}">1일</th><th title="${c.w1 || ''}">1주</th><th title="${c.m1 || ''}">1개월</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${moves}
        </div>`;
}

function ecFmtPrice(v, market) {
    return market === "US"
        ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `${Math.round(v).toLocaleString()}원`;
}

function ecLastPriceText(it) {
    if (!it.ohlcv || it.ohlcv.length === 0) return '-';
    const last = it.ohlcv[it.ohlcv.length - 1];
    const prev = it.ohlcv.length > 1 ? it.ohlcv[it.ohlcv.length - 2] : last;
    const [, m, d] = last[0].split('-').map(Number);
    const pct = prev[4] ? (last[4] - prev[4]) / prev[4] * 100 : 0;
    const color = pct >= 0 ? '#B4342A' : '#2E5FA3';
    return `${m}/${d}일 <span style="color:${color};font-weight:600;">${ecFmtPrice(last[4], it.market)}(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)</span>`;
}

// 6개월 등락률
function ecPeriodReturnText(it) {
    if (!it.ohlcv || it.ohlcv.length < 2) return '';
    const first = it.ohlcv[0][4], last = it.ohlcv[it.ohlcv.length - 1][4];
    const pct = first ? (last - first) / first * 100 : 0;
    const color = pct >= 0 ? '#B4342A' : '#2E5FA3';
    return `6개월 <span style="color:${color};font-weight:600;">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>`;
}

function ecFindItem(key) {
    const [sector, code] = key.split('|');
    const g = (EC_DATA.groups || []).find(g => g.sector === sector);
    return g ? g.items.find(it => it.code === code) || null : null;
}

function ecRenderChart(container) {
    const key = container.dataset.key;
    if (EC_CHART_INSTANCES.has(key)) return;
    const item = ecFindItem(key);
    if (!item || !item.ohlcv || item.ohlcv.length === 0) {
        container.innerHTML = '<p style="color:#aaa;font-size:12px;padding:10px;text-align:center;">데이터 없음</p>';
        return;
    }

    const bars = item.ohlcv;
    const dates = bars.map(b => b[0]);
    const closes = bars.map(b => b[4]);
    const candleData = bars.map(b => [b[1], b[4], b[3], b[2]]);
    const vols = bars.map(b => b[5]);
    const volColors = bars.map((b, i) =>
        b[4] >= (i > 0 ? closes[i - 1] : b[4]) ? 'rgba(180,52,42,0.65)' : 'rgba(46,95,163,0.65)'
    );
    const axisOff = { axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } };

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
            { type: 'category', data: dates, gridIndex: 0, boundaryGap: true, ...axisOff,
              splitLine: { show: true, lineStyle: { color: '#EFF2F6' } } },
            { type: 'category', data: dates, gridIndex: 1, ...axisOff,
              splitLine: { show: true, lineStyle: { color: '#EFF2F6' } } },
        ],
        yAxis: [
            { scale: true, gridIndex: 0, ...axisOff, splitLine: { show: true, lineStyle: { color: '#E7EBF1' } } },
            { scale: true, gridIndex: 1, ...axisOff, splitLine: { show: false } },
        ],
        series: [
            { type: 'candlestick', name: '가격', xAxisIndex: 0, yAxisIndex: 0, data: candleData, barWidth: '70%',
              itemStyle: { color: '#C0392B', color0: '#2E5FA3', borderColor: '#C0392B', borderColor0: '#2E5FA3', borderWidth: 1.1 } },
            { type: 'line', name: 'MA10', xAxisIndex: 0, yAxisIndex: 0, data: bars.map(b => b[6]),
              smooth: true, symbol: 'none', showSymbol: false, lineStyle: { color: '#E67E22', width: 1.2 } },
            { type: 'line', name: 'MA50', xAxisIndex: 0, yAxisIndex: 0, data: bars.map(b => b[7]),
              smooth: true, symbol: 'none', showSymbol: false, lineStyle: { color: '#9B59B6', width: 1.2 } },
            { type: 'bar', name: '거래량', xAxisIndex: 1, yAxisIndex: 1, data: vols,
              itemStyle: { color: (p) => volColors[p.dataIndex] } },
        ],
    });
    EC_CHART_INSTANCES.set(key, chart);
}

function ecSetupLazyRender() {
    const containers = document.querySelectorAll('.kc-chart');
    if (!('IntersectionObserver' in window)) {
        containers.forEach(ecRenderChart);
        return;
    }
    EC_LAZY_OBSERVER = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                ecRenderChart(entry.target);
                EC_LAZY_OBSERVER.unobserve(entry.target);
            }
        });
    }, { rootMargin: '200px 0px' });
    containers.forEach(el => EC_LAZY_OBSERVER.observe(el));
}

const ecScrollTopBtn = document.getElementById("scroll-top-btn");
if (ecScrollTopBtn) {
    ecScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
        ecScrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    });
}

ecLoad();
