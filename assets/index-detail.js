// 지수 분석 — data/index_detail.json (collector/export_index_detail.py)
// 코스피/코스닥/나스닥 탭 하나씩: 구분 통계 → 캔들·거래량 차트 → 최근 30거래일 표 (선택 탭은 기기에 기억)
const ID_KIND = {
    vuu: { label: "거래량↑ 상승", cls: "k-vuu" },
    vud: { label: "거래량↑ 하락", cls: "k-vud" },
    vdu: { label: "거래량↓ 상승", cls: "k-vdu" },
    vdd: { label: "거래량↓ 하락", cls: "k-vdd" },
};
const ID_MA_COLORS = { 10: "#E8A33D", 20: "#8E44AD", 50: "#27AE60", 150: "#2E86C1", 200: "#14151A" };
let idChart = null;

async function idLoad() {
    const body = document.getElementById("id-body");
    let data;
    try {
        const res = await fetch("data/index_detail.json?t=" + Date.now());
        data = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }
    const genEl = document.getElementById("id-generated-at");
    if (genEl) genEl.textContent = data.generated_at ? `기준: ${data.generated_at}` : "";

    const keys = Object.keys(data.indices || {});
    let cur = keys[0];
    try { const saved = localStorage.getItem("idTab"); if (keys.includes(saved)) cur = saved; } catch (e) {}

    const tabs = document.getElementById("id-tabs");
    tabs.innerHTML = keys.map(k => `<button data-key="${k}">${data.indices[k].label}</button>`).join("");
    const show = k => {
        tabs.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.key === k));
        try {
            idRender(body, data, k);
        } catch (e) {
            body.innerHTML = '<p class="placeholder">화면을 그리지 못했습니다. 새로고침 해 주세요.</p>';
            console.error(e);
        }
        try { localStorage.setItem("idTab", k); } catch (e) {}
    };
    tabs.onclick = ev => { const k = ev.target.dataset && ev.target.dataset.key; if (k) show(k); };
    show(cur);
    window.addEventListener("resize", () => idChart && idChart.resize());
}

function idRender(body, data, key) {
    const u = data.indices[key];
    const mas = data.ma_list || [10, 20, 50, 150, 200];
    const t0 = u.table[0];
    body.innerHTML = `
        <div class="id-latest">
            <span class="d">${t0.date.slice(5).replace("-", "/")}</span>
            <span class="v">${idNum(t0.close)}</span>
            <span class="${idCls(t0.chg_pct)}">${idSign(t0.chg)} (${idSign(t0.chg_pct)}%)</span>
            <span>고저폭 <b>${t0.range_pct != null ? t0.range_pct.toFixed(2) : "-"}%</b></span>
            <span>거래량 <b class="${idCls(t0.vol_chg)}">${t0.vol_chg != null ? idSign(t0.vol_chg) + "%" : "-"}</b></span>
            ${t0.kind ? `<span class="id-kind ${ID_KIND[t0.kind].cls}">${ID_KIND[t0.kind].label}</span>` : ""}
        </div>
        ${idStats(u.stats)}
        <div class="id-chart" id="id-chart"></div>
        <div class="id-wrap">
            <table class="id-table">
                <thead><tr>
                    <th>날짜</th><th>지수</th><th>등락폭</th><th>등락률</th><th>고저폭</th>
                    ${mas.map((n, i) => `<th class="${i === 0 ? "sep" : ""}">${n}일선</th>`).join("")}
                    <th class="sep">거래량</th><th>거래량<br>증가율</th>${u.has_value ? "<th>거래대금</th>" : ""}<th class="sep">구분</th>
                </tr></thead>
                <tbody>
                    ${u.table.map(r => `
                    <tr>
                        <td>${r.date.slice(5).replace("-", "/")}</td>
                        <td class="b">${idNum(r.close)}</td>
                        <td class="${idCls(r.chg)}">${r.chg != null ? idSign(r.chg) : "-"}</td>
                        <td class="${idCls(r.chg_pct)} b">${r.chg_pct != null ? idSign(r.chg_pct) + "%" : "-"}</td>
                        <td>${r.range_pct != null ? r.range_pct.toFixed(2) + "%" : "-"}</td>
                        ${mas.map((n, i) => idMa(r.close, r.ma[n], i === 0 ? "sep" : "")).join("")}
                        <td class="sep">${idVol(r.volume)}</td>
                        <td class="${idCls(r.vol_chg)}">${r.vol_chg != null ? idSign(r.vol_chg) + "%" : "-"}</td>
                        ${u.has_value ? `<td>${idValue(r.value)}</td>` : ""}
                        <td class="sep">${r.kind ? `<span class="id-kind ${ID_KIND[r.kind].cls}">${ID_KIND[r.kind].label}</span>` : "-"}</td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
    idDrawChart(u, mas);
}

// 구분 통계 — 30일·250일, 구분별 날 수·평균 등락률·평균 고저폭
function idStats(st) {
    const row = (k) => {
        const a = st.d30[k], b = st.d250[k];
        const cell = x => x.n ? `<b>${x.n}일</b> <span class="${idCls(x.chg)}">${idSign(x.chg)}%</span> <small>고저 ${x.range.toFixed(2)}%</small>` : "-";
        return `<tr><td><span class="id-kind ${ID_KIND[k].cls}">${ID_KIND[k].label}</span></td><td>${cell(a)}</td><td>${cell(b)}</td></tr>`;
    };
    return `
        <div class="id-stats">
            <table>
                <thead><tr><th>구분</th><th>최근 30일</th><th>최근 250일</th></tr></thead>
                <tbody>${["vuu", "vud", "vdu", "vdd"].map(row).join("")}</tbody>
            </table>
            <p>날 수 · 평균 등락률 · 평균 고저폭</p>
        </div>`;
}

function idDrawChart(u, mas) {
    if (idChart) { idChart.dispose(); idChart = null; }
    const el = document.getElementById("id-chart");
    if (!el || typeof echarts === "undefined") return;
    idChart = echarts.init(el);
    const c = u.chart;
    const dates = c.map(b => b.date.slice(5).replace("-", "/"));
    const up = "#C0392B", down = "#2E5FA3";
    const narrow = window.innerWidth <= 700;
    idChart.setOption({
        animation: false,
        legend: { data: mas.map(n => `${n}일`), top: 0, textStyle: { fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
        tooltip: {
            trigger: "axis", axisPointer: { type: "cross" }, confine: true, textStyle: { fontSize: 12 },
            formatter: ps => {
                const i = ps[0].dataIndex, b = c[i], p = i ? c[i - 1] : null;
                const pct = p ? (b.close / p.close - 1) * 100 : null;
                return `${b.date}<br>시 ${idNum(b.open)} 고 ${idNum(b.high)}<br>저 ${idNum(b.low)} 종 ${idNum(b.close)}`
                    + (pct != null ? ` (${idSign(pct)}%)` : "") + `<br>거래량 ${idVol(b.volume)}`;
            },
        },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: [
            { left: narrow ? 46 : 60, right: 12, top: 28, height: "58%" },
            { left: narrow ? 46 : 60, right: 12, top: "74%", height: "18%" },
        ],
        xAxis: [
            { type: "category", data: dates, boundaryGap: true, axisLabel: { show: false }, axisTick: { show: false } },
            { type: "category", data: dates, gridIndex: 1, boundaryGap: true, axisLabel: { fontSize: 10 } },
        ],
        yAxis: [
            { scale: true, splitLine: { lineStyle: { color: "#F0F1F3" } }, axisLabel: { fontSize: 10 } },
            { gridIndex: 1, splitNumber: 2, axisLabel: { fontSize: 10, formatter: v => idVolShort(v) }, splitLine: { show: false } },
        ],
        dataZoom: [{ type: "inside", xAxisIndex: [0, 1], start: narrow ? 50 : 0, end: 100 }],
        series: [
            {
                name: "일봉", type: "candlestick", data: c.map(b => [b.open, b.close, b.low, b.high]),
                itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
            },
            ...mas.map(n => ({
                name: `${n}일`, type: "line", data: c.map(b => b.ma[n]), showSymbol: false, smooth: false,
                lineStyle: { width: n >= 150 ? 1.6 : 1.1, color: ID_MA_COLORS[n] }, itemStyle: { color: ID_MA_COLORS[n] },
            })),
            {
                name: "거래량", type: "bar", xAxisIndex: 1, yAxisIndex: 1,
                data: c.map((b, i) => ({
                    value: b.volume,
                    itemStyle: { color: (b.close >= (i ? c[i - 1].close : b.open)) ? "rgba(192,57,43,0.6)" : "rgba(46,95,163,0.6)" },
                })),
            },
        ],
    });
}

function idMa(close, ma, cls) {
    if (ma == null) return `<td class="na ${cls}">-</td>`;
    const gap = (close / ma - 1) * 100;
    return `<td class="ma ${cls}">${idNum(ma)}<small class="${idCls(gap)}">${idSign(gap)}%</small></td>`;
}

function idNum(v) { return v == null ? "-" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function idSign(v) { return v == null ? "-" : (v > 0 ? "+" : "") + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function idCls(v) { return v > 0 ? "up" : v < 0 ? "down" : ""; }
function idVol(v) { return v == null ? "-" : v >= 1e8 ? (v / 1e8).toFixed(2) + "억주" : (v / 1e4).toFixed(0) + "만주"; }
function idVolShort(v) { return v >= 1e8 ? (v / 1e8).toFixed(0) + "억" : v >= 1e4 ? (v / 1e4).toFixed(0) + "만" : v; }
function idValue(v) { return v == null ? "-" : v >= 1e12 ? (v / 1e12).toFixed(1) + "조" : (v / 1e8).toFixed(0) + "억"; }

const idScrollTopBtn = document.getElementById("scroll-top-btn");
if (idScrollTopBtn) {
    idScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => idScrollTopBtn.classList.toggle("visible", window.scrollY > 400));
}

idLoad();
