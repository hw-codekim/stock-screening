// ── 포맷 헬퍼 ──────────────────────────────────────
function tFmtPct(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function tColor(v) {
    if (v == null) return "#888";
    return v >= 0 ? "#B4342A" : "#2F5FA3";
}
function tFmtPrice(v) {
    if (v == null) return "-";
    return v.toLocaleString();
}
function tFmtMktcap(v) {
    if (v == null) return "-";
    return (v / 10000).toFixed(2) + "조";
}
// 네이버 투자자별매매동향 원 데이터 단위는 백만원 -> 억원으로 변환
function tFmtEokFromMillion(v) {
    if (v == null) return "-";
    const eok = v / 100;
    return (eok >= 0 ? "+" : "") + eok.toLocaleString(undefined, { maximumFractionDigits: 0 }) + "억";
}

const MAJOR_INVESTOR_TYPES = new Set(["개인", "외국인", "기관계"]);

async function loadToday() {
    let data;
    try {
        const res = await fetch("data/daily.json");
        if (!res.ok) throw new Error("not found");
        data = await res.json();
    } catch (e) {
        document.getElementById("today-body").innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    document.getElementById("today-updated").innerHTML =
        `<strong>[${data.date}]</strong> 기준 · ${data.generated_at} 생성`;

    renderIndices(data.indices);
    renderIndexSummary(data.index_summary);
    renderInvestorFlow(data.investor_net_buy);
    renderSimpleTable("upper-limit-body", data.upper_limit, upperLimitRow, 4);
    renderSimpleTable("low-mdd-body", data.low_mdd, mddRow, 5);
    renderSimpleTable("bullish-body", data.bullish_alignment, bullishRow, 4);
    renderTop10(data.top_mktcap);
    renderSectorTables(data.top_sectors, data.top_sectors_rate);
    renderSentimentCharts(data.market_sentiment);
}

// ── 주요 지수 카드 ─────────────────────────────────
function renderIndices(rows) {
    const el = document.getElementById("index-cards");
    if (!rows || !rows.length) { el.innerHTML = '<p class="today-empty">데이터 없음</p>'; return; }
    el.innerHTML = rows.map(r => `
        <div class="index-card">
            <div class="idx-name">${r.market_name}</div>
            <div class="idx-value">${r.index_value != null ? r.index_value.toLocaleString(undefined, {maximumFractionDigits:2}) : "-"}</div>
            <div class="idx-change" style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</div>
        </div>
    `).join("");
}

// ── 코스피/코스닥 지수 요약 표 (기존 2Q26 페이지에서 이동) ──
function renderIndexSummary(rows) {
    const tbody = document.getElementById("index-summary-body");
    if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="index-loading">지수 데이터를 불러오지 못했습니다.</td></tr>';
        return;
    }
    const nameMap = { KOSPI: "코스피", KOSDAQ: "코스닥" };
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td class="index-name">${nameMap[r.market] || r.market}</td>
            <td>${r.index_value != null ? r.index_value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : "-"}<br><span style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</span></td>
            <td style="color:${tColor(r.w1)};">${tFmtPct(r.w1)}</td>
            <td style="color:${tColor(r.m1)};">${tFmtPct(r.m1)}</td>
            <td style="color:${tColor(r.m3)};">${tFmtPct(r.m3)}</td>
            <td style="color:${tColor(r.ytd)};">${tFmtPct(r.ytd)}</td>
            <td>${r.high_52w != null ? r.high_52w.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : "-"}</td>
            <td>${r.low_52w != null ? r.low_52w.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : "-"}</td>
            <td style="color:${r.position_52w != null && r.position_52w >= 50 ? '#B4342A' : '#2F5FA3'};">${r.position_52w != null ? r.position_52w.toFixed(1) + "%" : "-"}</td>
            <td style="color:${tColor(r.mdd)};">${tFmtPct(r.mdd)}</td>
            <td style="color:${r.adr != null && r.adr >= 100 ? '#B4342A' : '#2F5FA3'};">${r.adr != null ? r.adr.toFixed(1) + "%" : "-"}</td>
            <td style="color:#B4342A;">${r.up_count ?? "-"}</td>
            <td style="color:#888;">${r.flat_count ?? "-"}</td>
            <td style="color:#2F5FA3;">${r.down_count ?? "-"}</td>
        </tr>
    `).join("");
}

// ── 수급 (개인/외국인/기관계 + 세부) ─────────────────
function renderInvestorFlow(flow) {
    const el = document.getElementById("flow-grid");
    if (!flow || !flow.items || !flow.items.length) { el.innerHTML = '<p class="today-empty">데이터 없음</p>'; return; }
    el.innerHTML = flow.items.map(it => {
        const major = MAJOR_INVESTOR_TYPES.has(it.investor_type);
        const dir = it.net_buy >= 0 ? "up" : "down";
        return `
        <div class="flow-item ${major ? "major" : "sub"}">
            <div class="flow-label">${it.investor_type}</div>
            <div class="flow-value ${dir}">${tFmtEokFromMillion(it.net_buy)}</div>
        </div>`;
    }).join("");
}

// ── 상한가 / MDD / 정배열 공통 테이블 렌더 ────────────
function renderSimpleTable(elId, rows, rowFn, colCount) {
    const tbody = document.getElementById(elId);
    if (!rows || !rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="today-empty">해당 종목 없음</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(rowFn).join("");
}
function upperLimitRow(r) {
    return `<tr>
        <td class="name-cell">${r.name}</td>
        <td>${tFmtPrice(r.close_price)}</td>
        <td style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</td>
        <td>${tFmtMktcap(r.mktcap)}</td>
    </tr>`;
}
function mddRow(r) {
    return `<tr>
        <td class="name-cell">${r.name}</td>
        <td>${tFmtPrice(r.close_price)}</td>
        <td style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</td>
        <td>${tFmtMktcap(r.mktcap)}</td>
        <td style="color:${tColor(r.mdd)};">${tFmtPct(r.mdd)}</td>
    </tr>`;
}
function bullishRow(r) {
    return `<tr>
        <td class="name-cell">${r.name}</td>
        <td>${tFmtPrice(r.close_price)}</td>
        <td style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</td>
        <td>${tFmtMktcap(r.mktcap)}</td>
    </tr>`;
}

// ── 코스피/코스닥 TOP10 (당일등락 + 최근5일등락) ──────
function renderTop10(topMktcap) {
    const fill = (elId, rows) => {
        const tbody = document.getElementById(elId);
        if (!rows || !rows.length) { tbody.innerHTML = '<tr><td colspan="3" class="today-empty">데이터 없음</td></tr>'; return; }
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td class="name-cell">${r.name}</td>
                <td style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</td>
                <td style="color:${tColor(r.change_rate_5d)};">${tFmtPct(r.change_rate_5d)}</td>
            </tr>
        `).join("");
    };
    fill("kospi-top10-body", topMktcap && topMktcap.kospi);
    fill("kosdaq-top10-body", topMktcap && topMktcap.kosdaq);
}

// ── 섹터 시가총액 TOP10(당일+5일 평균) / 섹터 수익률 TOP10 ──
function renderSectorTables(topSectors, topSectorsRate) {
    const mktcapBody = document.getElementById("sector-mktcap-body");
    if (!topSectors || !topSectors.length) {
        mktcapBody.innerHTML = '<tr><td colspan="4" class="today-empty">데이터 없음</td></tr>';
    } else {
        mktcapBody.innerHTML = topSectors.map(r => `
            <tr>
                <td class="name-cell">${r.sector}</td>
                <td>${tFmtMktcap(r.total_mktcap)}</td>
                <td style="color:${tColor(r.avg_change_rate)};">${tFmtPct(r.avg_change_rate)}</td>
                <td style="color:${tColor(r.avg_change_rate_5d)};">${tFmtPct(r.avg_change_rate_5d)}</td>
            </tr>
        `).join("");
    }

    const rateBody = document.getElementById("sector-rate-body");
    if (!topSectorsRate || !topSectorsRate.length) {
        rateBody.innerHTML = '<tr><td colspan="3" class="today-empty">데이터 없음</td></tr>';
    } else {
        rateBody.innerHTML = topSectorsRate.map(r => `
            <tr>
                <td class="name-cell">${r.sector}</td>
                <td>${r.stock_count}개</td>
                <td style="color:${tColor(r.avg_change_rate)};">${tFmtPct(r.avg_change_rate)}</td>
            </tr>
        `).join("");
    }
}

// ── 시장 심리·유동성 지표 (5개 라인 차트) ─────────────
const SENTIMENT_CHARTS = [
    { key: "customer_deposit", title: "고객예탁금" },
    { key: "credit_balance",   title: "신용잔고" },
    { key: "usd_krw",          title: "원/달러 환율" },
    { key: "wti",              title: "WTI 유가" },
    { key: "us10y_yield",      title: "미국채 10년물 금리" },
];

function renderSentimentCharts(sentiment) {
    const grid = document.getElementById("sentiment-grid");
    if (!sentiment || !sentiment.dates || !sentiment.dates.length) {
        grid.innerHTML = '<p class="today-empty">데이터 없음</p>';
        return;
    }
    grid.innerHTML = SENTIMENT_CHARTS.map(c => `
        <div>
            <div class="sentiment-chart-title">${c.title}</div>
            <div class="sentiment-chart" id="sent-chart-${c.key}"></div>
        </div>
    `).join("");

    SENTIMENT_CHARTS.forEach(c => {
        const el = document.getElementById(`sent-chart-${c.key}`);
        const chart = echarts.init(el);
        chart.setOption({
            animation: false,
            grid: { left: 50, right: 15, top: 10, bottom: 30 },
            tooltip: { trigger: "axis" },
            xAxis: { type: "category", data: sentiment.dates, axisLabel: { fontSize: 9 } },
            yAxis: { type: "value", scale: true, axisLabel: { fontSize: 9 } },
            series: [{
                type: "line", data: sentiment[c.key], showSymbol: false,
                lineStyle: { color: "#2F5FA3", width: 1.5 },
                areaStyle: { color: "rgba(47,95,163,0.08)" },
            }],
        });
    });
}

// ── 방문자 카운터 (GoatCounter) - common.js와 동일 로직 ──
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

// ── 맨 위로 스크롤 버튼 - common.js와 동일 로직 ─────────
const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadToday();
loadVisitorCount();
