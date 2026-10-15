// 이평선 위 종목수 — data/ma_breadth.json (collector/export_ma_breadth.py)
async function mbLoad() {
    const body = document.getElementById("mb-body");
    let data;
    try {
        const res = await fetch("data/ma_breadth.json?t=" + Date.now());
        data = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }
    const genEl = document.getElementById("mb-generated-at");
    if (genEl) genEl.textContent = data.generated_at ? `기준: ${data.generated_at}` : "";

    const mas = data.ma_list || [10, 20, 50, 150, 200];
    const unis = Object.values(data.universes || {});
    body.innerHTML = unis.map(u => `
        <div class="wr-section">
            <div class="wr-section-title">${u.label}<span class="wr-section-count">${u.count}개 종목 · ${u.rows.length}거래일</span></div>
            <div class="wr-table-wrap">
                <table class="wr-table mb-table">
                    <thead><tr>
                        <th>날짜</th><th>${u.label.startsWith("코스피") ? "코스피" : "코스닥"}</th><th>등락</th>
                        ${mas.map((n, i) => `<th class="${i === 0 ? "mb-sep" : ""}">${n}일선 위</th>`).join("")}
                        <th class="mb-sep">200일선 아래</th><th>200일 미만 상장</th><th class="mb-sep">합계</th>
                    </tr></thead>
                    <tbody>
                        ${u.rows.map(r => `
                        <tr>
                            <td class="mb-date">${r.date.slice(5).replace("-", "/")}</td>
                            <td>${r.index_close != null ? r.index_close.toLocaleString(undefined, {maximumFractionDigits: 2}) : "-"}</td>
                            ${mbChg(r.index_chg)}
                            ${mas.map((n, i) => mbCell(r.above[n], r.total, false, i === 0)).join("")}
                            ${mbCell(r.below200, r.total, true, true)}
                            <td class="na">${r.short || "-"}</td>
                            <td class="mb-sep">${r.total}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>`).join("");
}

function mbChg(p) {
    if (p === null || p === undefined) return '<td class="na">-</td>';
    const cls = p > 0 ? "up" : p < 0 ? "down" : "";
    return `<td class="${cls}">${p > 0 ? "+" : ""}${p.toFixed(2)}%</td>`;
}

// 비율이 높을수록 진하게: 이평선 위는 빨강(상승), 200일선 아래는 파랑(하락)
function mbCell(n, base, below, sep) {
    if (!base) return `<td class="na${sep ? " mb-sep" : ""}">-</td>`;
    const pct = n / base * 100;
    // 칸끼리 중복이 없어(합계 = 대상 종목 수) 비율이 클수록 진하게. 이평선 위 칸은 빨강, 200일선 아래는 파랑
    const a = Math.min(0.55, pct / (below ? 100 : 40) * 0.55);
    const rgb = below ? "46,95,163" : "192,57,43";
    const bg = a > 0.04 ? `background: rgba(${rgb},${a.toFixed(2)});` : "";
    return `<td class="mb-cell${sep ? " mb-sep" : ""}" style="${bg}">${n}<span class="mb-pct">${pct.toFixed(0)}%</span></td>`;
}

const mbScrollTopBtn = document.getElementById("scroll-top-btn");
if (mbScrollTopBtn) {
    mbScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => mbScrollTopBtn.classList.toggle("visible", window.scrollY > 400));
}

mbLoad();
