// 대만월매출 - data/tw_revenue.json (collector/export_tw_revenue.py, 출처 MOPS)
// 섹터별: 요약표(최근월 매출·MoM·YoY·누적 YoY) + 기업별 카드(좌 월매출 막대+YoY 선 / 우 MoM 막대)
let trData = null;
const trCharts = [];

function trFmtRev(v) {
    // 천 NTD → 억 NTD
    if (v == null) return "-";
    const e = v / 100000;
    return e >= 100 ? Math.round(e).toLocaleString() : e.toFixed(1);
}
function trPct(v, digits = 1) {
    if (v == null) return '<span class="tr-na">-</span>';
    const cls = v > 0 ? "tr-up" : v < 0 ? "tr-down" : "";
    return `<span class="${cls}">${v > 0 ? "+" : ""}${v.toFixed(digits)}%</span>`;
}
function trMonthLabel(ym) { return `${ym.slice(2, 4)}.${ym.slice(5)}`; }
function trEsc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

async function trLoad() {
    try {
        const res = await fetch("data/tw_revenue.json", { cache: "no-store" });
        trData = await res.json();
    } catch (e) {
        document.getElementById("tr-count-line").textContent = "데이터 로드 오류: " + e.message;
        return;
    }
    document.getElementById("tr-generated-at").textContent =
        `최근월 ${trData.latest_month} · 업데이트 ${trData.generated_at}`;

    const sel = document.getElementById("tr-sector-filter");
    trData.sectors.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.name;
        opt.textContent = `${s.name} (${s.companies.length})`;
        sel.appendChild(opt);
    });
    sel.addEventListener("change", trRender);
    document.getElementById("tr-search").addEventListener("input", trRender);
    window.addEventListener("resize", () => trCharts.forEach(c => c.resize()));
    trRender();
}

function trMatches(c, q) {
    if (!q) return true;
    return [c.code, c.name_en, c.name_zh, c.desc, c.peer].some(x => String(x || "").toLowerCase().includes(q));
}

function trRender() {
    trCharts.splice(0).forEach(c => c.dispose());
    const sector = document.getElementById("tr-sector-filter").value;
    const q = document.getElementById("tr-search").value.trim().toLowerCase();
    const last = trData.months.length - 1;

    const sections = trData.sectors
        .filter(s => !sector || s.name === sector)
        .map(s => ({ name: s.name, companies: s.companies.filter(c => trMatches(c, q)) }))
        .filter(s => s.companies.length);

    const total = sections.reduce((n, s) => n + s.companies.length, 0);
    const reported = sections.reduce((n, s) => n + s.companies.filter(c => c.rev[last] != null).length, 0);
    document.getElementById("tr-count-line").textContent =
        `${total}개 기업 · ${trMonthLabel(trData.latest_month)} 공시 ${reported}개`;

    const body = document.getElementById("tr-body");
    if (!sections.length) {
        body.innerHTML = '<p class="placeholder">해당 기업 없음</p>';
        return;
    }
    const curLabel = trMonthLabel(trData.latest_month);
    body.innerHTML = sections.map((s, si) => `
        <section class="tr-sector">
            <h2 class="tr-sector-title">${trEsc(s.name)}<span class="tr-sector-count">${s.companies.length}개</span></h2>
            <div class="tr-table-wrap">
                <table class="tr-table">
                    <thead><tr>
                        <th class="tr-left">기업</th><th class="tr-left">사업</th><th class="tr-left">국내 Peer</th>
                        <th>${curLabel} 매출</th><th>MoM</th><th>YoY</th><th>누적 YoY</th><th>3개월 YoY</th>
                    </tr></thead>
                    <tbody>${s.companies.map(c => trRow(c, last)).join("")}</tbody>
                </table>
            </div>
            ${s.companies.map((c, ci) => trCard(c, last, `tr-${si}-${ci}`)).join("")}
        </section>`).join("");

    // 차트는 화면에 들어올 때 그린다(기업 50여 개 × 2개)
    const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            io.unobserve(en.target);
            const [si, ci] = en.target.dataset.idx.split("-").map(Number);
            trDrawCharts(sections[si].companies[ci], en.target);
        });
    }, { rootMargin: "300px" });
    body.querySelectorAll(".tr-card").forEach(el => io.observe(el));
}

// 최근 3개월 합산 YoY: (최근 3개월 매출 합 / 그 전년 같은 3개월 합) - 1. 전년 매출은 rev / (1+yoy) 로 역산.
function trYoy3m(c, last) {
    let cur = 0, prev = 0;
    for (let i = last - 2; i <= last; i++) {
        const r = c.rev[i], y = c.yoy[i];
        if (r == null || y == null || y <= -100) return null;
        cur += r;
        prev += r / (1 + y / 100);
    }
    return prev > 0 ? (cur / prev - 1) * 100 : null;
}

function trNameHtml(c) {
    const name = trEsc(c.name_en);
    return c.url ? `<a href="${trEsc(c.url)}" target="_blank" rel="noopener" title="회사 홈페이지">${name}</a>` : name;
}

function trRow(c, last) {
    return `<tr>
        <td class="tr-left tr-name">${trNameHtml(c)}<span class="tr-zh">${trEsc(c.name_zh)} ${c.code}</span></td>
        <td class="tr-left tr-desc">${trEsc(c.desc)}</td>
        <td class="tr-left tr-desc">${trEsc(c.peer) || "-"}</td>
        <td>${trFmtRev(c.rev[last])}</td>
        <td>${trPct(c.mom[last])}</td>
        <td>${trPct(c.yoy[last])}</td>
        <td>${trPct(c.cum_yoy)}</td>
        <td>${trPct(trYoy3m(c, last))}</td>
    </tr>`;
}

function trCard(c, last, id) {
    const has = c.rev[last] != null;
    const stat = has
        ? `${trMonthLabel(trData.latest_month)} <b>${trFmtRev(c.rev[last])}억 NTD</b> · MoM ${trPct(c.mom[last])} · YoY ${trPct(c.yoy[last])}`
        : `${trMonthLabel(trData.latest_month)} 미공시`;
    return `<div class="tr-card" data-idx="${id.slice(3)}">
        <div class="tr-card-head">
            <span class="tr-card-name">${trNameHtml(c)}</span>
            <span class="tr-card-meta">${trEsc(c.name_zh)} ${c.code} · ${trEsc(c.desc)}${c.peer ? " · 국내 Peer " + trEsc(c.peer) : ""}</span>
            <span class="tr-card-stat">${stat}</span>
        </div>
        <div class="tr-charts">
            <div class="tr-chart tr-chart-rev"></div>
            <div class="tr-chart tr-chart-mom"></div>
        </div>
    </div>`;
}

function trDrawCharts(c, card) {
    const months = trData.months.map(trMonthLabel);
    const curYear = trData.latest_month.slice(0, 4);
    const revE = c.rev.map(v => (v == null ? null : +(v / 100000).toFixed(2)));
    const opt = { devicePixelRatio: window.devicePixelRatio || 1 };
    const axisLabel = { fontSize: 10, color: "#7a869a" };
    const split = { show: true, lineStyle: { color: "#E7EBF1" } };

    const rev = echarts.init(card.querySelector(".tr-chart-rev"), null, opt);
    rev.setOption({
        animation: false,
        title: { text: "월매출 (억 NTD) · YoY", left: 6, top: 4, textStyle: { fontSize: 11, fontWeight: 600, color: "#14213D" } },
        grid: { left: 46, right: 44, top: 30, bottom: 24 },
        tooltip: {
            trigger: "axis",
            formatter: ps => {
                const i = ps[0].dataIndex;
                const y = c.yoy[i], m = c.mom[i];
                return `${trData.months[i]}<br>매출 <b>${trFmtRev(c.rev[i])}</b>억 NTD` +
                    `<br>YoY ${y == null ? "-" : (y > 0 ? "+" : "") + y.toFixed(1) + "%"}` +
                    `<br>MoM ${m == null ? "-" : (m > 0 ? "+" : "") + m.toFixed(1) + "%"}`;
            },
        },
        xAxis: { type: "category", data: months, axisLabel: { ...axisLabel, interval: 2 }, axisTick: { show: false } },
        yAxis: [
            { type: "value", axisLabel, splitLine: split, scale: false },
            { type: "value", axisLabel: { ...axisLabel, formatter: "{value}%" }, splitLine: { show: false } },
        ],
        series: [
            {
                type: "bar", name: "월매출", data: revE, barMaxWidth: 14,
                itemStyle: { color: p => (trData.months[p.dataIndex].startsWith(curYear) ? "#14315C" : "#A9B8CF") },
            },
            {
                type: "line", name: "YoY", yAxisIndex: 1, data: c.yoy, symbol: "circle", symbolSize: 3,
                connectNulls: false, lineStyle: { color: "#D9822B", width: 1.5 }, itemStyle: { color: "#D9822B" },
            },
        ],
    });

    const mom = echarts.init(card.querySelector(".tr-chart-mom"), null, opt);
    mom.setOption({
        animation: false,
        title: { text: "MoM (%)", left: 6, top: 4, textStyle: { fontSize: 11, fontWeight: 600, color: "#14213D" } },
        grid: { left: 40, right: 10, top: 30, bottom: 24 },
        tooltip: {
            trigger: "axis",
            formatter: ps => {
                const i = ps[0].dataIndex, m = c.mom[i];
                return `${trData.months[i]}<br>MoM ${m == null ? "-" : (m > 0 ? "+" : "") + m.toFixed(1) + "%"}`;
            },
        },
        xAxis: { type: "category", data: months, axisLabel: { ...axisLabel, interval: 2 }, axisTick: { show: false } },
        yAxis: { type: "value", axisLabel: { ...axisLabel, formatter: "{value}%" }, splitLine: split },
        series: [{
            type: "bar", data: c.mom, barMaxWidth: 12,
            itemStyle: { color: p => (p.value >= 0 ? "#B4342A" : "#2E5FA3") },
        }],
    });
    trCharts.push(rev, mom);
}

const trScrollTopBtn = document.getElementById("scroll-top-btn");
if (trScrollTopBtn) {
    trScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
        trScrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    });
}

trLoad();
