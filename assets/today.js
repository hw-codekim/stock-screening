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
// 네이버 투자자별매매동향 원 데이터는 이미 억원 단위 - 그대로 표시 (로컬 Daily 요약 페이지와 동일)
function tFmtEok(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + v.toLocaleString() + "억";
}
// 거래대금은 원 단위 raw 값 - 억원으로 환산해서 표시
function tFmtTradeValue(v) {
    if (v == null) return "-";
    return Math.round(v / 1e8).toLocaleString() + "억";
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

    document.getElementById("index-cards-date").textContent = `[ ${shortDate(data.date)} ]`;

    renderIndices(data.indices);
    renderIndexSummary(data.index_summary);
    renderInvestorFlow(data.investor_net_buy);
    renderStockCards("upper-limit-cards", data.upper_limit);
    renderStockCards("bullish-cards", data.bullish_alignment);
    renderStockCards("low-mdd-cards", data.low_mdd);
    renderDaily5Top10(data.top_mktcap);
    renderDaily5TradeValue(data.top_trade_value);
    renderDaily5Sectors(data.top_sectors, data.top_sectors_rate);
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
            <div class="flow-value ${dir}">${tFmtEok(it.net_buy)}</div>
        </div>`;
    }).join("");
}

// ── 상한가 / 정배열 - 카드 렌더 ───────────────────────
function renderStockCards(elId, rows) {
    const el = document.getElementById(elId);
    if (!rows || !rows.length) { el.innerHTML = '<p class="today-empty">해당 종목 없음</p>'; return; }
    el.innerHTML = rows.map(r => `
        <div class="stock-card">
            <div class="sc-head">
                <span class="sc-name" title="${r.name}">${r.name}</span>
                <span class="sc-change" style="color:${tColor(r.change_rate)};">${tFmtPct(r.change_rate)}</span>
            </div>
            <div class="sc-meta">
                <span>${tFmtPrice(r.close_price)}원</span>
                <span>${tFmtMktcap(r.mktcap)}</span>
            </div>
        </div>
    `).join("");
}

// 날짜 문자열("2026-08-13") -> "8/13" 형태로 축약
function shortDate(d) {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
}

// ── 코스피/코스닥 시가총액 TOP10 - 최근 5거래일 일자별 등락률 표 ──
function renderDaily5Top10(topMktcap) {
    if (!topMktcap) return;
    const dates = topMktcap.dates || [];
    const buildTable = (rows) => {
        if (!rows || !rows.length) return '<p class="today-empty">데이터 없음</p>';
        const header = `<tr><th>종목명</th>${dates.map(d => `<th>${shortDate(d)}</th>`).join("")}</tr>`;
        const body = rows.map(r => `
            <tr>
                <td class="name-cell">${r.name}</td>
                ${r.daily.map(v => `<td style="color:${tColor(v)};">${tFmtPct(v)}</td>`).join("")}
            </tr>
        `).join("");
        return `<table class="today-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;
    };
    document.getElementById("kospi-top10-wrap").innerHTML = buildTable(topMktcap.kospi);
    document.getElementById("kosdaq-top10-wrap").innerHTML = buildTable(topMktcap.kosdaq);
}

// ── 코스피/코스닥 거래대금 TOP20 - 최근 5거래일 일자별 등락률 표 ──
function renderDaily5TradeValue(topTradeValue) {
    if (!topTradeValue) return;
    const dates = topTradeValue.dates || [];
    const buildTable = (rows) => {
        if (!rows || !rows.length) return '<p class="today-empty">데이터 없음</p>';
        const header = `<tr><th>종목명</th><th>거래대금</th>${dates.map(d => `<th>${shortDate(d)}</th>`).join("")}</tr>`;
        const body = rows.map(r => `
            <tr>
                <td class="name-cell">${r.name}</td>
                <td>${tFmtTradeValue(r.trade_value)}</td>
                ${r.daily.map(v => `<td style="color:${tColor(v)};">${tFmtPct(v)}</td>`).join("")}
            </tr>
        `).join("");
        return `<table class="today-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;
    };
    document.getElementById("kospi-tradevalue-wrap").innerHTML = buildTable(topTradeValue.kospi);
    document.getElementById("kosdaq-tradevalue-wrap").innerHTML = buildTable(topTradeValue.kosdaq);
}

// ── 섹터 시가총액 TOP10 / 섹터 수익률 TOP10 - 최근 5거래일 일자별 평균등락률 표 ──
function renderDaily5Sectors(topSectors, topSectorsRate) {
    if (topSectors) {
        const dates = topSectors.dates || [];
        const items = topSectors.items || [];
        const wrap = document.getElementById("sector-mktcap-wrap");
        if (!items.length) {
            wrap.innerHTML = '<p class="today-empty">데이터 없음</p>';
        } else {
            const header = `<tr><th>섹터</th>${dates.map(d => `<th>${shortDate(d)}</th>`).join("")}</tr>`;
            const body = items.map(r => `
                <tr>
                    <td class="name-cell">${r.sector}</td>
                    ${r.daily.map(v => `<td style="color:${tColor(v)};">${tFmtPct(v)}</td>`).join("")}
                </tr>
            `).join("");
            wrap.innerHTML = `<table class="today-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;
        }
    }

    if (topSectorsRate) {
        const dates = topSectorsRate.dates || [];
        const items = topSectorsRate.items || [];
        const wrap = document.getElementById("sector-rate-wrap");
        if (!items.length) {
            wrap.innerHTML = '<p class="today-empty">데이터 없음</p>';
        } else {
            const header = `<tr><th>섹터</th>${dates.map(d => `<th>${shortDate(d)}</th>`).join("")}</tr>`;
            const body = items.map(r => `
                <tr>
                    <td class="name-cell">${r.sector}</td>
                    ${r.daily.map(v => `<td style="color:${tColor(v)};">${tFmtPct(v)}</td>`).join("")}
                </tr>
            `).join("");
            wrap.innerHTML = `<table class="today-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;
        }
    }
}

// ── 시장 심리·유동성 지표 (5개 라인 차트) ─────────────
// 우리 로컬 Daily 요약 페이지(templates/daily_summary.html loadSentimentCharts)와
// 색상/타이틀/마지막값 강조 로직을 동일하게 맞춘다.
function fmtNum(v) {
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function renderSentimentCharts(sentiment) {
    if (!sentiment || !sentiment.dates || !sentiment.dates.length) return;

    const specs = [
        { field: "usd_krw",          containerId: "sent-usd_krw",          color: "#B4342A", unit: "원" },
        { field: "wti",              containerId: "sent-wti",              color: "#F5A623", unit: "$" },
        { field: "customer_deposit", containerId: "sent-customer_deposit", color: "#14315C", unit: "억원" },
        { field: "credit_balance",   containerId: "sent-credit_balance",   color: "#9B59B6", unit: "억원" },
        { field: "us10y_yield",      containerId: "sent-us10y_yield",      color: "#2F6B4F", unit: "%" },
    ];

    specs.forEach(spec => {
        const container = document.getElementById(spec.containerId);
        if (!container) return;

        const series = sentiment[spec.field];
        let lastValue = null, lastIdx = -1;
        for (let i = series.length - 1; i >= 0; i--) {
            if (series[i] != null) { lastValue = series[i]; lastIdx = i; break; }
        }
        let prevValue = null;
        for (let i = lastIdx - 1; i >= 0; i--) {
            if (series[i] != null) { prevValue = series[i]; break; }
        }

        let pct = null;
        if (lastValue != null && prevValue != null && prevValue !== 0) {
            pct = (lastValue - prevValue) / prevValue * 100;
        }
        const signColor = pct == null ? spec.color : (pct >= 0 ? "#B4342A" : "#2E5FA3");

        const titleEl = document.getElementById("sent-title-" + spec.field);
        if (titleEl && lastValue != null) {
            const baseLabel = titleEl.textContent.trim();
            let changeHtml = "";
            if (pct != null) {
                const sign = pct >= 0 ? "+" : "";
                changeHtml = `, <span style="color:${signColor};">${sign}${pct.toFixed(2)}%</span>`;
            }
            titleEl.innerHTML = `${baseLabel} <span style="font-weight:400;">(${sentiment.dates[lastIdx]}: <span style="color:${signColor};">${fmtNum(lastValue)}${spec.unit}</span>${changeHtml})</span>`;
        }

        const chart = echarts.init(container);
        chart.setOption({
            animation: false,
            tooltip: {
                trigger: "axis",
                valueFormatter: v => v == null ? "-" : fmtNum(v) + spec.unit,
            },
            grid: { left: 60, right: 20, top: 26, bottom: 24 },
            xAxis: {
                type: "category", data: sentiment.dates,
                axisLabel: { color: "#888", fontSize: 9 },
            },
            yAxis: {
                type: "value", scale: true,
                axisLabel: { color: "#888", fontSize: 9, formatter: v => fmtNum(v) },
                splitLine: { lineStyle: { color: "#E1E9F3", type: "dashed" } },
            },
            series: [{
                type: "line", data: series,
                smooth: false, symbol: "none", connectNulls: true,
                lineStyle: { color: spec.color, width: 1.6 },
                areaStyle: { color: spec.color, opacity: 0.08 },
                markPoint: lastValue == null ? undefined : {
                    symbol: "circle", symbolSize: 6,
                    itemStyle: { color: signColor, borderColor: "#fff", borderWidth: 1 },
                    label: {
                        show: true,
                        formatter: () => fmtNum(lastValue) + spec.unit,
                        color: signColor, fontSize: 9, fontWeight: 600,
                        position: (prevValue == null || lastValue >= prevValue) ? "top" : "bottom",
                        distance: 8,
                    },
                    data: [{ coord: [lastIdx, lastValue] }],
                },
            }],
        });
        window.addEventListener("resize", () => chart.resize());
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
