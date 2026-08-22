let tvData = null;
let tvExpandedSectors = new Set();

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
function tvFmtRatio(v) {
    if (v == null) return "-";
    return v.toFixed(2) + "%";
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
// 거래대금이 전일대비 500%(6배) 이상 급등한 날인지
function tvIsSurge(daily, i) {
    if (i === 0) return false;
    const prevTv = daily[i - 1] && daily[i - 1].trade_value;
    const curTv  = daily[i] && daily[i].trade_value;
    return !!(prevTv && curTv && curTv >= prevTv * 6);
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
    renderSectorSummary();
    renderTable();
}

// ── 대분류/중분류별 거래대금비율 = (그날 소속 전종목 거래대금 합) / (소속 전종목 시총 합, 억원->원 환산) x100
function renderSectorSummary() {
    const dates = tvData.dates;
    const map = {};
    tvData.items.forEach(s => {
        if (!map[s.sector_large]) {
            map[s.sector_large] = {
                sector: s.sector_large,
                tvSum:     dates.map(() => 0),
                mktcapSum: dates.map(() => 0),
                mids: {},
            };
        }
        const g = map[s.sector_large];
        if (!g.mids[s.sector_mid]) {
            g.mids[s.sector_mid] = {
                mid: s.sector_mid,
                tvSum:     dates.map(() => 0),
                mktcapSum: dates.map(() => 0),
            };
        }
        const m = g.mids[s.sector_mid];
        s.daily.forEach((d, i) => {
            const tv = (d && d.trade_value) || 0;
            const mc = (d && d.mktcap) || 0;
            g.tvSum[i]     += tv;
            g.mktcapSum[i] += mc;
            m.tvSum[i]     += tv;
            m.mktcapSum[i] += mc;
        });
    });

    // 정렬 기준: 최신일 시총 합 내림차순
    const latestIdx = dates.length - 1;
    const groups = Object.values(map).sort((a, b) => b.mktcapSum[latestIdx] - a.mktcapSum[latestIdx]);

    // 거래대금비율이 전일대비 50% 이상 급등한 날을 노란색으로 표시
    const ratioCells = (tvSum, mktcapSum) => {
        const ratios = tvSum.map((v, i) => {
            const mktcapWon = mktcapSum[i] * 1e8; // mktcap 필드는 억원 단위
            return mktcapWon ? v / mktcapWon * 100 : null;
        });
        return ratios.map((r, i) => {
            const prev = i > 0 ? ratios[i - 1] : null;
            const surge = prev != null && prev > 0 && r != null && r >= prev * 1.5;
            const cls = surge ? "tv-ratio tv-surge" : "tv-ratio";
            return `<td class="${cls}">${tvFmtRatio(r)}</td>`;
        }).join("");
    };

    const header = `<tr><th>대분류</th>${dates.map(d => `<th>${tvShortDate(d)}</th>`).join("")}</tr>`;
    const body = groups.map(g => {
        const expanded = tvExpandedSectors.has(g.sector);
        const mainRow = `
        <tr class="tv-group-row${expanded ? " expanded" : ""}">
            <td class="tv-sector-name" data-sector="${g.sector}"><span class="tv-caret">${expanded ? "▾" : "▸"}</span>${g.sector}</td>
            ${ratioCells(g.tvSum, g.mktcapSum)}
        </tr>`;
        if (!expanded) return mainRow;
        const mids = Object.values(g.mids).sort((a, b) => b.mktcapSum[latestIdx] - a.mktcapSum[latestIdx]);
        const midRows = mids.map(m => `
        <tr class="tv-mid-row">
            <td class="tv-mid-name" data-sector="${g.sector}" data-mid="${m.mid}">${tvStripMidPrefix(m.mid)}</td>
            ${ratioCells(m.tvSum, m.mktcapSum)}
        </tr>`).join("");
        return mainRow + midRows;
    }).join("");

    const wrap = document.getElementById("tv-sector-summary");
    wrap.innerHTML = `<table class="tv-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;

    wrap.querySelectorAll(".tv-sector-name").forEach(td => {
        td.addEventListener("click", () => {
            const sector = td.dataset.sector;
            if (tvExpandedSectors.has(sector)) tvExpandedSectors.delete(sector);
            else tvExpandedSectors.add(sector);
            renderSectorSummary();
        });
    });
    wrap.querySelectorAll(".tv-mid-name").forEach(td => {
        td.addEventListener("click", () => {
            document.getElementById("large-filter").value = td.dataset.sector;
            populateMidFilter();
            document.getElementById("mid-filter").value = td.dataset.mid;
            renderTable();
            document.getElementById("tv-body").scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
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

    const wrap = document.getElementById("tv-body");
    if (!largeVal && !midVal && !query) {
        wrap.innerHTML = '<p class="placeholder">대분류를 클릭하거나 조건을 선택한 후 검색 버튼을 눌러 주세요.</p>';
        return;
    }

    const filtered = tvData.items.filter(s =>
        (!largeVal || s.sector_large === largeVal) &&
        (!midVal || s.sector_mid === midVal) &&
        (!query || s.name.toLowerCase().includes(query) || s.code.includes(query))
    );

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
            ${s.daily.map((d, i) => {
                const rate = d && d.change_rate;
                const surge = tvIsSurge(s.daily, i);
                return `
                <td${surge ? ' class="tv-surge"' : ""}>
                    <span class="tv-value">${tvFmtTradeValue(d && d.trade_value)}</span>
                    <span class="tv-pct" style="color:${tvColor(rate)};">(${tvFmtPct(rate)})</span>
                </td>
            `;
            }).join("")}
        </tr>
        `).join("")}
    `).join("");

    wrap.innerHTML = `<table class="tv-table"><thead>${header}</thead><tbody>${bodyRows}</tbody></table>`;
}

// ── 이벤트 바인딩 ────────────────────────────────────
document.getElementById("large-filter").addEventListener("change", onLargeFilterChange);
document.getElementById("tv-search-btn").addEventListener("click", renderTable);
document.getElementById("stock-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") renderTable();
});

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadVisitorCount();
loadTradeValue();
