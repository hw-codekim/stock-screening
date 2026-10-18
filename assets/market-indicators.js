// 시장지표 — data/market_indicators.json (collector/export_market_indicators.py)
// 맨 위 = 지표별 점수 요약(국장/미장), 아래 = 지표마다 국장 | 미장 그래프(지표 선 + 회색 지수 선) + 분위별 이후 수익률
// 점수 0~100: 그날까지의 과거 값 중 백분위를 책 해석 방향으로 맞춘 값 → 높을수록 강세 쪽. 나중에 골라 합칠 수 있게 모두 같은 기준
const MI_RANGES = [["6M", 182], ["1Y", 365], ["3Y", 1095], ["전체", 0]];
const MI_COLORS = ["#B4342A", "#2E86C1", "#E8A33D", "#27AE60"];
const MI_FAINT = "#C5CCD8";
let miRange = "1Y";
let miCharts = [];
let miData = null;

async function miLoad() {
    const body = document.getElementById("mi-body");
    try {
        const res = await fetch("data/market_indicators.json?t=" + Date.now());
        miData = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }
    const gen = document.getElementById("mi-generated-at");
    if (gen) gen.textContent = miData.generated_at ? `기준: ${miData.generated_at}` : "";
    try { const r = localStorage.getItem("miRange"); if (MI_RANGES.some(x => x[0] === r)) miRange = r; } catch (e) {}

    const rangeEl = document.getElementById("mi-range");
    rangeEl.innerHTML = MI_RANGES.map(([k]) => `<button data-r="${k}">${k}</button>`).join("");
    rangeEl.onclick = ev => {
        const r = ev.target.dataset && ev.target.dataset.r;
        if (!r) return;
        miRange = r;
        try { localStorage.setItem("miRange", r); } catch (e) {}
        miRender();
    };
    miRender();
    window.addEventListener("resize", () => miCharts.forEach(c => c.resize()));
}

function miScoreCls(s) { return s == null ? "" : s >= 70 ? "bull" : s <= 30 ? "bear" : "mid"; }
function miBadge(side) {
    if (!side || side.score == null) return "";
    return `<span class="mi-score ${miScoreCls(side.score)}" title="0~100, 높을수록 강세 쪽">${side.score}</span>`;
}
function miSigned(v) { return v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

function miSummary(panels) {
    const cell = s => {
        if (!s || s.empty || s.score == null) return `<td class="na">-</td><td class="na"></td>`;
        const sp = s.stats && s.stats.spread20;
        // 책 해석이 맞는 방향(dir 기준)으로 5분위-1분위 차이가 나면 ✔
        const ok = sp == null ? "" : (sp * s.dir > 0 ? "✔" : "✗");
        return `<td>${miBadge(s)}</td><td class="sp ${sp == null ? "" : sp * s.dir > 0 ? "ok" : "ng"}">${ok} ${miSigned(sp)}</td>`;
    };
    return `
        <div class="mi-sum">
            <table>
                <thead>
                    <tr><th rowspan="2">지표</th><th colspan="2">국장</th><th colspan="2">미장</th></tr>
                    <tr><th>점수</th><th>검증</th><th>점수</th><th>검증</th></tr>
                </thead>
                <tbody>
                    ${panels.map(p => `<tr><td class="nm"><a href="#sec-${p.key}">${p.title}</a></td>${cell(p.kr)}${cell(p.us)}</tr>`).join("")}
                </tbody>
            </table>
            <p>점수 = 지금 값이 과거 이력 중 어디쯤인지(백분위)를 책 해석 방향으로 맞춘 0~100. <b class="bull">70↑</b> 강세 쪽 · <b class="bear">30↓</b> 약세 쪽.
               검증 = 대표 선이 가장 높은 5분위와 가장 낮은 1분위의 이후 20거래일 지수 수익률 차이. ✔ = 책 해석 방향과 같음, ✗ = 반대(이 데이터에선 해석이 안 맞음).
               과거 통계일 뿐 매매 신호가 아님</p>
        </div>`;
}

function miRender() {
    document.querySelectorAll("#mi-range button").forEach(b => b.classList.toggle("active", b.dataset.r === miRange));
    const body = document.getElementById("mi-body");
    miCharts.forEach(c => c.dispose());
    miCharts = [];
    const panels = miData.panels || [];
    const intra = miData.intraday || {};
    body.innerHTML = miOscHtml(miData.osc) + miSummary(panels) + panels.map((p, i) => `
        <section class="mi-sec" id="sec-${p.key}">
            <h2>${p.title}</h2>
            <p class="desc">${p.desc || ""}</p>
            ${p.read ? `<p class="read">책 해석: ${p.read}</p>` : ""}
            <div class="mi-grid">
                ${["kr", "us"].map(m => miCardHtml(`d-${i}-${m}`, m === "kr" ? "국장" : "미장", p[m])).join("")}
            </div>
        </section>`).join("") + `
        <section class="mi-sec" id="sec-intraday">
            <h2>⑥ 시간대별 지수 · 거래량 (오늘 vs 전 거래일 같은 시각)</h2>
            <p class="desc">위 = 전일 종가 대비 등락률, 아래 = 장 시작부터 누적 거래대금(국장)·거래량(미장). 빨간 선 = 최근 거래일, 점선 = 그 전 거래일. 국장 10분봉 · 미장 5분봉(미국 동부 시각)</p>
            <p class="read">책 해석: 같은 시각 누적 거래가 전날보다 많은데 지수가 약하면 큰손 매도(분산), 거래가 늘면서 오르면 매수세 유입 · 점수 없음(하루 단위 비교)</p>
            <div class="mi-grid">
                ${["kr", "us"].flatMap(m => (intra[m] || []).map((x, j) => miIntraCardHtml(`i-${m}-${j}`, m === "kr" ? "국장" : "미장", x))).join("")}
            </div>
        </section>`;

    const days = MI_RANGES.find(x => x[0] === miRange)[1];
    const from = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : "0000";
    panels.forEach((p, i) => ["kr", "us"].forEach(m => {
        if (p[m] && p[m].lines) miDaily(`d-${i}-${m}`, p[m], from, p, m);
    }));
    ["kr", "us"].forEach(m => (intra[m] || []).forEach((x, j) => miIntra(`i-${m}-${j}`, x)));
    ["kr", "us"].forEach(m => {
        const o = (miData.osc || {})[m];
        if (o && o.lines) miDaily(`osc-${m}`, { ...o, refs: [{ y: 70, label: "강세 70" }, { y: 30, label: "약세 30" }] }, from, { step: false }, m);
    });
}

// ── 종합 오실레이터 (맨 위) ─────────────────────────
function miZone(v) { return v == null ? ["-", ""] : v >= 70 ? ["강세", "bull"] : v <= 30 ? ["약세", "bear"] : v >= 55 ? ["중립·강세 쪽", "mid"] : v <= 45 ? ["중립·약세 쪽", "mid"] : ["중립", "mid"]; }

function miOscHtml(osc) {
    if (!osc) return "";
    const card = m => {
        const o = osc[m];
        const mk = m === "kr" ? "국장" : "미장";
        if (!o || !o.lines) return `<div class="mi-card"><div class="hd">${mk}</div><div class="mi-empty">데이터 없음</div></div>`;
        const [zl, zc] = miZone(o.value);
        return `<div class="mi-card osc">
            <div class="osc-hd">
                <span class="mk">${mk} 오실레이터</span>
                <span class="big ${zc}">${o.value ?? "-"}</span>
                <span class="zone ${zc}">${zl}</span>
                <small>5일 평균 · 오늘 ${o.today ?? "-"} · ${o.date.slice(2).replace(/-/g, "/")}</small>
            </div>
            <div class="mi-chart" id="osc-${m}"></div>
            <div class="osc-comp">${o.components.map(c => `<a href="#sec-${c.key}" class="mi-score ${miScoreCls(c.score)}" title="${c.title}">${c.title.replace(/^[①-⑫]\s*/, "")} ${c.score}</a>`).join("")}</div>
            ${miStatsHtml(o.stats, m).replace("대표 선 분위", "오실레이터 분위")}
        </div>`;
    };
    return `
        <section class="mi-sec mi-osc">
            <h2>종합 오실레이터</h2>
            <p class="desc">아래 지표들의 점수(0~100, 책 해석 방향 기준 — 높을수록 강세 쪽)를 시장별로 같은 비중으로 평균한 값의 5일 평균.
               지표마다 이력 시작이 달라(2010년~ / 2022년~ / 2024년~) 그날 점수가 있는 지표만 평균한다(최소 4개). 발표가 늦는 지표는 직전 점수를 5거래일까지 이어 쓴다.
               70↑ 강세 · 30↓ 약세 · 그 사이 중립. 아래 칩 = 지금 구성 지표별 점수(누르면 해당 그래프로)</p>
            <div class="mi-grid">${card("kr")}${card("us")}</div>
        </section>`;
}

function miLastTxt(side) {
    const i = side.dates.length - 1;
    const l = side.lines.find(x => x.name === side.main) || side.lines.find(x => !x.faint);
    const v = l ? l.values[i] : null;
    return `${l ? l.name : ""} <b>${v == null ? "-" : (+v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${side.unit || ""}</b> · ${side.dates[i].slice(2).replace(/-/g, "/")}`;
}

function miStatsHtml(st, mkt) {
    if (!st || !st.buckets) return "";
    const c = (r, up) => r == null ? "-" : `<span class="${r > 0 ? "up" : r < 0 ? "down" : ""}">${miSigned(r)}</span><small>${up != null ? up.toFixed(0) + "%↑" : ""}</small>`;
    return `<details class="mi-st"><summary>분위별 이후 ${mkt === "kr" ? "코스피" : "S&P500"} 수익률 (${st.from.slice(0, 7)}~, ${st.n}일)</summary>
        <table><thead><tr><th>대표 선 분위</th><th>구간</th><th>5일 뒤</th><th>20일 뒤</th></tr></thead><tbody>
        ${st.buckets.map(b => `<tr class="${b.q === st.last_q ? "now" : ""}"><td>${b.q}분위${b.q === 1 ? " 낮음" : b.q === 5 ? " 높음" : ""}${b.q === st.last_q ? " ←지금" : ""}</td>
            <td>${(+b.lo).toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${(+b.hi).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>${c(b.r5, b.up5)}</td><td>${c(b.r20, b.up20)}</td></tr>`).join("")}
        <tr><td>전체 평균</td><td></td><td>${c(st.base.r5)}</td><td>${c(st.base.r20)}</td></tr>
        </tbody></table></details>`;
}

function miCardHtml(id, mkt, side) {
    if (!side || side.empty || !side.lines) {
        return `<div class="mi-card"><div class="hd">${mkt}</div><div class="mi-empty">${(side && side.empty) || "데이터 없음"}</div></div>`;
    }
    return `<div class="mi-card"><div class="hd"><span>${mkt} ${miBadge(side)}</span><small>${miLastTxt(side)}</small></div>
        <div class="mi-chart" id="${id}"></div>${miStatsHtml(side.stats, id.endsWith("kr") ? "kr" : "us")}</div>`;
}

function miDaily(id, side, from, p, mkt) {
    const el = document.getElementById(id);
    if (!el) return;
    const k0 = side.dates.findIndex(d => d >= from);
    if (k0 < 0) { el.outerHTML = '<div class="mi-empty">이 기간 데이터 없음</div>'; return; }
    const x = side.dates.slice(k0);
    let ci = 0;
    // 기준선: 지표 공통(p.ref) + 시장별(side.refs, 이름표 포함)
    const refs = [...(p.ref != null ? [{ y: p.ref }] : []), ...(side.refs || [])];
    const series = side.lines.map((l, k) => {
        const color = l.faint ? MI_FAINT : MI_COLORS[ci++ % MI_COLORS.length];
        return {
            name: l.name, type: "line", data: l.values.slice(k0), connectNulls: true, symbol: "none",
            step: p.step ? "end" : false, lineStyle: { width: l.faint ? 1 : 1.7, color }, itemStyle: { color },
            ...(k === 0 && refs.length ? { markLine: { silent: true, symbol: "none", lineStyle: { color: "#999", type: "dashed" },
                data: refs.map(r => ({ yAxis: r.y, label: r.label ? { show: true, formatter: r.label, position: "insideEndTop", fontSize: 10, color: "#666" } : { show: false } })) } } : {}),
        };
    });
    series.push({ name: mkt === "kr" ? "코스피" : "S&P500", type: "line", yAxisIndex: 1, data: side.index.slice(k0), connectNulls: true, symbol: "none",
                  lineStyle: { width: 1.2, color: "#14151A" }, itemStyle: { color: "#14151A" }, z: 1 });
    const c = echarts.init(el);
    c.setOption({
        animation: false,
        tooltip: { trigger: "axis", valueFormatter: v => v == null ? "-" : (+v).toLocaleString(undefined, { maximumFractionDigits: 3 }) },
        legend: { top: 0, itemWidth: 14, textStyle: { fontSize: 10 } },
        grid: { left: 44, right: 50, top: 30, bottom: 26 },
        xAxis: { type: "category", data: x, axisLabel: { fontSize: 10, formatter: d => d.slice(2, 7).replace("-", "/") } },
        yAxis: [
            { type: "value", scale: true, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: "#F0F1F3" } } },
            { type: "value", scale: true, position: "right", splitLine: { show: false }, axisLabel: { fontSize: 9, color: "#14151A" } },
        ],
        dataZoom: [{ type: "inside" }],
        series,
    });
    miCharts.push(c);
}

function miIntraSummary(x) {
    const [a, b] = x.days.length === 2 ? [x.days[1], x.days[0]] : [x.days[0], null];
    if (!a || !b) return "";
    const t = a.t[a.t.length - 1];
    const k = b.t.indexOf(t);
    if (k < 0) return "";
    const r = (a.cum[a.cum.length - 1] / b.cum[k] - 1) * 100;
    return `${t} 기준 ${x.vol_label} 전일 대비 <b class="${r >= 0 ? "up" : "down"}">${r >= 0 ? "+" : ""}${r.toFixed(1)}%</b>`;
}

function miIntraCardHtml(id, mkt, x) {
    if (!x.days || !x.days.length) return `<div class="mi-card"><div class="hd">${mkt} ${x.label}</div><div class="mi-empty">데이터 없음</div></div>`;
    return `<div class="mi-card"><div class="hd"><span>${mkt} ${x.label}</span><small>${miIntraSummary(x)}</small></div>
        <div class="mi-chart tall" id="${id}"></div></div>`;
}

function miIntra(id, x) {
    const el = document.getElementById(id);
    if (!el) return;
    const times = [...new Set(x.days.flatMap(d => d.t))].sort();
    const big = Math.max(...x.days.flatMap(d => d.cum));
    const div = big >= 1e12 ? [1e12, "조"] : big >= 1e8 ? [1e8, "억"] : [1, ""];
    const series = [];
    x.days.forEach((d, k) => {
        const latest = k === x.days.length - 1;
        const color = latest ? "#B4342A" : "#14315C";
        const style = { width: latest ? 2 : 1.4, color, type: latest ? "solid" : "dashed" };
        const pm = {}, cm = {};
        d.t.forEach((t, j) => { pm[t] = d.pct[j]; cm[t] = d.cum[j] / div[0]; });
        const nm = d.date.slice(5).replace("-", "/");
        series.push({ name: nm, type: "line", data: times.map(t => pm[t] ?? null), symbol: "none", lineStyle: style, itemStyle: { color } });
        series.push({ name: nm, type: "line", xAxisIndex: 1, yAxisIndex: 1, data: times.map(t => cm[t] == null ? null : +cm[t].toFixed(2)), symbol: "none", lineStyle: style, itemStyle: { color } });
    });
    const c = echarts.init(el);
    c.setOption({
        animation: false,
        tooltip: { trigger: "axis" },
        legend: { top: 0, itemWidth: 14, textStyle: { fontSize: 10 }, data: x.days.map(d => d.date.slice(5).replace("-", "/")) },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: [{ left: 50, right: 14, top: 28, height: "42%" }, { left: 50, right: 14, top: "62%", bottom: 24 }],
        xAxis: [
            { type: "category", data: times, axisLabel: { show: false } },
            { type: "category", data: times, gridIndex: 1, axisLabel: { fontSize: 10 } },
        ],
        yAxis: [
            { type: "value", scale: true, name: "%", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: "#F0F1F3" } } },
            { type: "value", gridIndex: 1, name: x.vol_label + (div[1] ? `(${div[1]})` : ""), nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: "#F0F1F3" } } },
        ],
        series,
    });
    miCharts.push(c);
}

const miScrollTopBtn = document.getElementById("scroll-top-btn");
if (miScrollTopBtn) {
    miScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => miScrollTopBtn.classList.toggle("visible", window.scrollY > 400));
}

miLoad();
