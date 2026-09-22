async function wrLoad() {
    const body = document.getElementById("wr-body");
    let data;
    try {
        const res = await fetch("data/weekly_returns.json");
        data = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    const genEl = document.getElementById("wr-generated-at");
    if (genEl) genEl.textContent = data.generated_at ? `기준: ${data.generated_at}` : "";

    const items = data.items || [];
    const weeks = data.weeks || [];
    document.getElementById("wr-count-line").textContent = `${items.length}개 종목 · ${weeks.length}개 주`;

    if (items.length === 0) {
        body.innerHTML = '<p class="placeholder">데이터가 없습니다.</p>';
        return;
    }

    // 서버에서 이미 대분류→중분류→시총 내림차순으로 정렬해 보냈으므로,
    // 대분류가 바뀌는 지점마다 새 섹션을 시작하면 된다(재정렬 불필요).
    const sections = [];
    for (const it of items) {
        const last = sections[sections.length - 1];
        if (!last || last.sector !== it.sector_large) {
            sections.push({ sector: it.sector_large, items: [] });
        }
        sections[sections.length - 1].items.push(it);
    }

    const weekHead = weeks.map(w => `<th>${w.label}</th>`).join("");

    body.innerHTML = sections.map(sec => `
        <div class="wr-section">
            <div class="wr-section-title">${sec.sector}<span class="wr-section-count">${sec.items.length}개</span></div>
            <div class="wr-table-wrap">
                <table class="wr-table">
                    <thead><tr>
                        <th>종목명</th><th>시장</th><th>중분류</th><th>시총(억)</th><th>YTD</th>${weekHead}
                    </tr></thead>
                    <tbody>
                        ${sec.items.map(it => `
                        <tr>
                            <td>${it.name}<span class="wr-code">${it.code}</span></td>
                            <td>${it.market}</td>
                            <td>${it.sector_mid}</td>
                            <td>${Math.round(it.mktcap).toLocaleString()}</td>
                            ${wrCell(it.ytd)}
                            ${it.rets.map(wrCell).join("")}
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>`
    ).join("");
}

function wrCell(pct) {
    if (pct === null || pct === undefined) return '<td class="na">-</td>';
    const cls = pct > 0 ? "up" : pct < 0 ? "down" : "";
    const sign = pct > 0 ? "+" : "";
    return `<td class="${cls}">${sign}${pct.toFixed(1)}%</td>`;
}

const wrScrollTopBtn = document.getElementById("scroll-top-btn");
if (wrScrollTopBtn) {
    wrScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
        wrScrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    });
}

wrLoad();
