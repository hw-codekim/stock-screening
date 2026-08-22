let tvData = null;

// ── 포맷 헬퍼 ────────────────────────────────────────
function tvFmtTradeValue(v) {
    if (v == null) return "-";
    return Math.round(v / 1e8).toLocaleString() + "억";
}
function tvFmtPct(v) {
    if (v == null) return "-";
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function tvColor(v) {
    if (v == null) return "#888";
    return v >= 0 ? "#B4342A" : "#2F5FA3";
}
function tvFmtMktcap(v) {
    if (v == null) return "-";
    return (v / 10000).toFixed(2) + "조";
}
const TV_MID_PSEUDO_SUFFIXES = new Set(["KOSPI", "KOSDAQ"]);
function tvStripMidPrefix(mid) {
    if (!mid || !mid.includes("_")) return mid;
    const [prefix, ...rest] = mid.split("_");
    const suffix = rest.join("_");
    if (TV_MID_PSEUDO_SUFFIXES.has(suffix)) return prefix;
    return suffix;
}
function tvShortDate(d) {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
}

// ── 방문자 카운터 (GoatCounter) ────────────────────
async function loadVisitorCount() {
    const el = document.getElementById("visitor-count");
    if (!el) return;
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

// ── 로드 ────────────────────────────────────────────
async function loadTradeValue() {
    try {
        const res = await fetch("data/trade_value.json");
        tvData = await res.json();
    } catch (e) {
        document.getElementById("tv-body").innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    document.getElementById("summary-line").innerHTML =
        `<span class="summary-datetime">[${tvData.generated_at}]</span> 총 ${tvData.items.length}개 종목 · 최근 ${tvData.dates.length}거래일`;

    populateLargeFilter();
    populateMidFilter();
    renderTable();
}

// ── 대분류/중분류 필터 ───────────────────────────────
function populateLargeFilter() {
    const sel = document.getElementById("large-filter");
    const prev = sel.value;
    const counts = {};
    tvData.items.forEach(s => { counts[s.sector_large] = (counts[s.sector_large] || 0) + 1; });

    sel.innerHTML = '<option value="">전체 대분류</option>';
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(large => {
        const opt = document.createElement("option");
        opt.value = large;
        opt.textContent = `${large} (${counts[large]})`;
        sel.appendChild(opt);
    });
    sel.value = prev;
}

function populateMidFilter() {
    const largeVal = document.getElementById("large-filter").value;
    const midSel = document.getElementById("mid-filter");
    const prev = midSel.value;

    const counts = {};
    tvData.items
        .filter(s => !largeVal || s.sector_large === largeVal)
        .forEach(s => { counts[s.sector_mid] = (counts[s.sector_mid] || 0) + 1; });

    midSel.innerHTML = '<option value="">전체 중분류</option>';
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(mid => {
        const opt = document.createElement("option");
        opt.value = mid;
        opt.textContent = `${tvStripMidPrefix(mid)} (${counts[mid]})`;
        midSel.appendChild(opt);
    });
    midSel.value = [...midSel.options].some(o => o.value === prev) ? prev : "";
}

function onLargeFilterChange() {
    populateMidFilter();
    renderTable();
}

// 대분류(섹터) 그룹으로 묶고, 그룹은 시가총액 합계 내림차순, 그룹 안에서는 최신일 거래대금 내림차순
function groupBySector(items, latestIdx) {
    const map = {};
    items.forEach(s => { (map[s.sector_large] = map[s.sector_large] || []).push(s); });

    const groups = Object.keys(map).map(sector => {
        const groupItems = map[sector].slice().sort((a, b) => {
            const av = (a.daily[latestIdx] && a.daily[latestIdx].trade_value) || 0;
            const bv = (b.daily[latestIdx] && b.daily[latestIdx].trade_value) || 0;
            return bv - av;
        });
        const total = groupItems.reduce((sum, it) => sum + (it.mktcap || 0), 0);
        return { sector, items: groupItems, total };
    });
    groups.sort((a, b) => b.total - a.total);
    return groups;
}

// ── 표 렌더 ──────────────────────────────────────────
function renderTable() {
    if (!tvData) return;
    const largeVal = document.getElementById("large-filter").value;
    const midVal   = document.getElementById("mid-filter").value;
    const query    = document.getElementById("stock-search").value.trim().toLowerCase();
    const dates    = tvData.dates;
    const latestIdx = dates.length - 1;

    const filtered = tvData.items.filter(s =>
        (!largeVal || s.sector_large === largeVal) &&
        (!midVal || s.sector_mid === midVal) &&
        (!query || s.name.toLowerCase().includes(query) || s.code.includes(query))
    );

    const wrap = document.getElementById("tv-body");
    if (!filtered.length) {
        wrap.innerHTML = '<p class="tv-cand-empty">조건에 맞는 종목이 없습니다.</p>';
        return;
    }

    const groups = groupBySector(filtered, latestIdx);
    const numCols = 3 + dates.length;

    const header = `<tr>
        <th>종목명</th><th>섹터</th><th>시총</th>
        ${dates.map(d => `<th>${tvShortDate(d)}</th>`).join("")}
    </tr>`;

    const bodyRows = groups.map(g => `
        <tr class="tv-sector-row"><td colspan="${numCols}">${g.sector} (${g.items.length})</td></tr>
        ${g.items.map(s => `
        <tr>
            <td class="tv-name" title="${s.name}">${s.name}</td>
            <td class="tv-sector" title="${s.sector_mid}">${tvStripMidPrefix(s.sector_mid)}</td>
            <td class="tv-mktcap">${tvFmtMktcap(s.mktcap)}</td>
            ${s.daily.map(d => `
                <td>
                    <span class="tv-value">${tvFmtTradeValue(d && d.trade_value)}</span>
                    <span class="tv-pct" style="color:${tvColor(d && d.change_rate)};">(${tvFmtPct(d && d.change_rate)})</span>
                </td>
            `).join("")}
        </tr>
        `).join("")}
    `).join("");

    wrap.innerHTML = `<table class="tv-table"><thead>${header}</thead><tbody>${bodyRows}</tbody></table>`;
}

// ── 이벤트 바인딩 ────────────────────────────────────
document.getElementById("large-filter").addEventListener("change", onLargeFilterChange);
document.getElementById("mid-filter").addEventListener("change", renderTable);
document.getElementById("stock-search").addEventListener("input", renderTable);

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadVisitorCount();
loadTradeValue();
