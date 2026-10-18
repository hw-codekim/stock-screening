// 옵션 PCR — data/option_pcr.json (collector/export_option_pcr.py)
// 시리즈 탭(코스피200 / CBOE 전체·개별주식·지수·SPX): 요약 카드 → PCR·지수 차트 → 분위별 이후 수익률 → 최근 30일 표
const OP_RANGES = [["3M", 63], ["1Y", 250], ["3Y", 750], ["전체", 0]];
let opChart = null;
let opRange = "1Y";

async function opLoad() {
    const body = document.getElementById("op-body");
    let data;
    try {
        const res = await fetch("data/option_pcr.json?t=" + Date.now());
        data = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }
    const genEl = document.getElementById("op-generated-at");
    if (genEl) genEl.textContent = data.generated_at ? `기준: ${data.generated_at}` : "";

    const series = data.series || {};
    const keys = ["KR_K200", "US_TOTAL", "US_EQUITY", "US_INDEX", "US_SPX"];
    const labels = { KR_K200: "코스피200", US_TOTAL: "CBOE 전체", US_EQUITY: "개별주식", US_INDEX: "지수옵션", US_SPX: "SPX" };
    let cur = series.KR_K200 ? "KR_K200" : "US_TOTAL";
    try {
        const saved = localStorage.getItem("opTab"); if (keys.includes(saved)) cur = saved;
        const r = localStorage.getItem("opRange"); if (OP_RANGES.some(x => x[0] === r)) opRange = r;
    } catch (e) {}

    const tabs = document.getElementById("op-tabs");
    tabs.innerHTML = keys.map(k => `<button data-key="${k}">${labels[k]}</button>`).join("");
    const show = k => {
        tabs.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.key === k));
        try {
            if (series[k]) opRender(body, series[k]);
            else body.innerHTML = `<div class="op-empty">코스피200 옵션 데이터는 아직 준비 중입니다.<br>KRX Open API 이용 승인 후 매 영업일 자동으로 채워집니다.</div>`;
        } catch (e) {
            body.innerHTML = '<p class="placeholder">화면을 그리지 못했습니다. 새로고침 해 주세요.</p>';
            console.error(e);
        }
        try { localStorage.setItem("opTab", k); } catch (e) {}
    };
    tabs.onclick = ev => { const k = ev.target.dataset && ev.target.dataset.key; if (k) show(k); };
    show(cur);
    window.addEventListener("resize", () => opChart && opChart.resize());
}

function opRatio(p, c) { return p != null && c ? p / c : null; }
function opMa(arr, n) {
    return arr.map((_, i) => {
        if (i + 1 < n) return null;
        let s = 0, k = 0;
        for (let j = i - n + 1; j <= i; j++) if (arr[j] != null) { s += arr[j]; k++; }
        return k === n ? s / n : null;
    });
}

function opRender(body, s) {
    const n = s.dates.length;
    const vol = s.dates.map((_, i) => opRatio(s.pv[i], s.cv[i]));
    const oi = s.dates.map((_, i) => opRatio(s.po[i], s.co[i]));
    const val = s.dates.map((_, i) => opRatio(s.pval[i], s.cval[i]));
    const hasVal = val.some(v => v != null);
    const ma5 = opMa(vol, 5), ma20 = opMa(vol, 20);
    const st = s.stats || {};
    const L = n - 1;

    const pctTxt = st.last_pct != null ? `백분위 ${st.last_pct.toFixed(0)}% · ${st.last_q}분위` : "";
    const heat = st.last_q === 5 ? "hot" : st.last_q === 1 ? "cool" : "";
    body.innerHTML = `
        <div class="id-latest"><span class="d">${s.dates[L].slice(2).replace(/-/g, "/")}</span>
            <span>${s.label} · 지수 ${s.index_label} <b>${opNum(s.close[L])}</b></span></div>
        <div class="op-cards">
            ${opCard("거래량 PCR", opFix(vol[L]), `콜 ${opCnt(s.cv[L])} · 풋 ${opCnt(s.pv[L])}`)}
            ${opCard("5일 평균", opFix(ma5[L]), pctTxt, heat)}
            ${opCard("20일 평균", opFix(ma20[L]), "")}
            ${opCard("미결제 PCR", opFix(oi[L]), `콜 ${opCnt(s.co[L])} · 풋 ${opCnt(s.po[L])}`)}
            ${hasVal ? opCard("거래대금 PCR", opFix(val[L]), "") : ""}
        </div>
        <div class="op-range" id="op-range">${OP_RANGES.map(([k]) => `<button data-r="${k}" class="${k === opRange ? "active" : ""}">${k}</button>`).join("")}</div>
        <div class="op-chart" id="op-chart"></div>
        ${opStats(st, s.index_label)}
        <div class="id-wrap">
            <table class="id-table">
                <thead><tr>
                    <th>날짜</th><th>${s.index_label}</th><th class="sep">콜<br>거래량</th><th>풋<br>거래량</th><th>거래량<br>PCR</th><th>5일<br>평균</th>
                    <th class="sep">미결제<br>PCR</th>${hasVal ? "<th>거래대금<br>PCR</th>" : ""}
                </tr></thead>
                <tbody>
                    ${Array.from({ length: Math.min(30, n) }, (_, k) => L - k).map(i => `
                    <tr>
                        <td>${s.dates[i].slice(2).replace(/-/g, "/")}</td>
                        <td>${opNum(s.close[i])}</td>
                        <td class="sep">${opCnt(s.cv[i])}</td>
                        <td>${opCnt(s.pv[i])}</td>
                        <td class="b">${opFix(vol[i])}</td>
                        <td>${opFix(ma5[i])}</td>
                        <td class="sep">${opFix(oi[i])}</td>
                        ${hasVal ? `<td>${opFix(val[i])}</td>` : ""}
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;

    document.getElementById("op-range").onclick = ev => {
        const r = ev.target.dataset && ev.target.dataset.r;
        if (!r) return;
        opRange = r;
        try { localStorage.setItem("opRange", r); } catch (e) {}
        opRender(body, s);
    };

    const days = OP_RANGES.find(x => x[0] === opRange)[1];
    const from = days ? Math.max(0, n - days) : 0;
    const cut = a => a.slice(from).map(v => v == null ? null : +v.toFixed(3));
    if (opChart) opChart.dispose();
    opChart = echarts.init(document.getElementById("op-chart"));
    const narrow = window.innerWidth < 700;
    opChart.setOption({
        animation: false,
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        legend: { top: 0, textStyle: { fontSize: narrow ? 10 : 12 } },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: [{ left: 48, right: 56, top: 34, height: "50%" }, { left: 48, right: 56, top: "70%", height: "22%" }],
        xAxis: [
            { type: "category", data: s.dates.slice(from), axisLabel: { show: false } },
            { type: "category", data: s.dates.slice(from), gridIndex: 1, axisLabel: { fontSize: 10 } },
        ],
        yAxis: [
            { type: "value", name: "PCR", scale: true, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
            { type: "value", name: s.index_label, scale: true, position: "right", splitLine: { show: false }, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
            { type: "value", name: "미결제", scale: true, gridIndex: 1, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
        ],
        dataZoom: [{ type: "inside", xAxisIndex: [0, 1] }],
        series: [
            { name: "거래량 PCR", type: "line", data: cut(vol), symbol: "none", lineStyle: { width: 1, color: "#C5CCD8" }, itemStyle: { color: "#C5CCD8" } },
            { name: "5일 평균", type: "line", data: cut(ma5), symbol: "none", lineStyle: { width: 1.6, color: "#B4342A" }, itemStyle: { color: "#B4342A" } },
            { name: "20일 평균", type: "line", data: cut(ma20), symbol: "none", lineStyle: { width: 1.6, color: "#E8A33D" }, itemStyle: { color: "#E8A33D" } },
            { name: s.index_label, type: "line", yAxisIndex: 1, data: s.close.slice(from), symbol: "none", lineStyle: { width: 1.4, color: "#14315C" }, itemStyle: { color: "#14315C" } },
            { name: "미결제 PCR", type: "line", xAxisIndex: 1, yAxisIndex: 2, data: cut(oi), symbol: "none", lineStyle: { width: 1.4, color: "#2E86C1" }, itemStyle: { color: "#2E86C1" } },
        ],
    });
}

function opCard(l, v, sub, cls) {
    return `<div class="op-card ${cls || ""}"><div class="l">${l}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
}

function opStats(st, idxLabel) {
    if (!st || !st.buckets) return "";
    const cell = (r, up) => r == null ? "-" : `<span class="${r > 0 ? "up" : r < 0 ? "down" : ""}">${r > 0 ? "+" : ""}${r.toFixed(2)}%</span><small>${up != null ? up.toFixed(0) + "%↑" : ""}</small>`;
    return `
        <div class="id-stats op-stats">
            <table>
                <thead><tr><th>PCR 5일 평균 분위</th><th>구간</th><th>일수</th><th>이후 5일 ${idxLabel}</th><th>이후 20일</th></tr></thead>
                <tbody>
                    ${st.buckets.map(b => `
                    <tr class="${b.q === st.last_q ? "now" : ""}">
                        <td>${b.q}분위${b.q === 1 ? " (낙관)" : b.q === 5 ? " (공포)" : ""}${b.q === st.last_q ? " ← 지금" : ""}</td>
                        <td>${b.lo.toFixed(2)} ~ ${b.hi.toFixed(2)}</td>
                        <td>${b.n}</td>
                        <td>${cell(b.r5, b.up5)}</td>
                        <td>${cell(b.r20, b.up20)}</td>
                    </tr>`).join("")}
                    <tr><td>전체 평균</td><td></td><td></td><td>${cell(st.base.r5)}</td><td>${cell(st.base.r20)}</td></tr>
                </tbody>
            </table>
            <p>${st.from} ~ ${st.to} · 수익률 옆 %↑ = 그 기간 뒤 지수가 오른 날의 비율 · 과거 통계일 뿐 매매 신호가 아님</p>
        </div>`;
}

function opFix(v) { return v == null ? "-" : v.toFixed(2); }
function opNum(v) { return v == null ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function opCnt(v) { return v == null ? "-" : v >= 1e8 ? (v / 1e8).toFixed(2) + "억" : v >= 1e6 ? (v / 1e4).toFixed(0) + "만" : v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : v.toLocaleString(); }

const opScrollTopBtn = document.getElementById("scroll-top-btn");
if (opScrollTopBtn) {
    opScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => opScrollTopBtn.classList.toggle("visible", window.scrollY > 400));
}

opLoad();
