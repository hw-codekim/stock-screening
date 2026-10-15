// 이평선 위 종목수 — data/ma_breadth.json (collector/export_ma_breadth.py)
// 태블릿 이하에서는 코스피200/코스닥150 탭으로 하나씩 보여 준다(선택은 기기에 기억)
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
    try {
        mbRender(body, data);
    } catch (e) {
        body.innerHTML = '<p class="placeholder">표를 그리지 못했습니다. 새로고침 해 주세요.</p>';
        console.error(e);
    }
}

function mbRender(body, data) {
    const mas = data.ma_list || [10, 20, 50, 150, 200];
    const keys = Object.keys(data.universes || {});
    let cur = keys[0];
    try { const saved = localStorage.getItem("mbTab"); if (keys.includes(saved)) cur = saved; } catch (e) {}

    body.innerHTML = keys.map(k => {
        const u = data.universes[k];
        // 업종 표(반도체·배터리)는 지수 종가가 없어 종가 열을 빼고, 등락 = 대상 종목 동일가중 평균
        const sector = u.kind === "sector";
        const idx = u.index_label || (u.label.startsWith("코스피") ? "코스피" : "코스닥");
        const r0 = u.rows[0];
        const s50 = r0 ? r0.above[10] + r0.above[20] + r0.above[50] : 0;
        return `
        <div class="mb-section${k === cur ? "" : " mb-off"}" data-key="${k}">
            <div class="mb-title">${u.label}<span class="mb-count">${u.count}종목 · ${u.rows.length}거래일</span></div>
            ${r0 ? `<div class="mb-latest">
                <span>${r0.date.slice(5).replace("-", "/")}</span>
                <span>10일 위 <b>${r0.above[10]}</b></span>
                <span>50일 합계 <b>${s50}</b> (${(s50 / r0.total * 100).toFixed(1)}%)</span>
                <span>200일 아래 <b>${r0.below200}</b></span>
            </div>` : ""}
            <div class="mb-wrap">
                <table class="mb-table">
                    <thead><tr>
                        <th>날짜</th>${sector ? "" : `<th class="m-hide">${idx}</th>`}<th${sector ? ' title="대상 종목 동일가중 평균"' : ""}>${sector ? "평균<br>등락" : "등락"}</th>
                        ${mas.map((n, i) => `<th class="${i === 0 ? "sep" : ""}">${n}일<br>위</th>`).join("")}
                        <th class="sep">200일<br>아래</th><th>신규</th><th class="sep m-hide">합계</th>
                        <th class="sep2" title="10·20·50일 칸의 합">50일<br>합계</th>
                    </tr></thead>
                    <tbody>
                        ${u.rows.map(r => `
                        <tr>
                            <td>${r.date.slice(5).replace("-", "/")}</td>
                            ${sector ? "" : `<td class="m-hide">${r.index_close != null ? r.index_close.toLocaleString(undefined, {maximumFractionDigits: 2}) : "-"}</td>`}
                            ${mbChg(r.index_chg)}
                            ${mas.map((n, i) => mbCell(r.above[n], r.total, false, i === 0 ? "sep" : "")).join("")}
                            ${mbCell(r.below200, r.total, true, "sep")}
                            <td class="na">${r.short || "-"}</td>
                            <td class="sep m-hide">${r.total}</td>
                            ${mbA50(r.above[10] + r.above[20] + r.above[50], r.total)}
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join("");

    const tabs = document.getElementById("mb-tabs");
    tabs.innerHTML = keys.map(k => `<button data-key="${k}" class="${k === cur ? "active" : ""}">${data.universes[k].label}</button>`).join("");
    tabs.onclick = ev => {
        const k = ev.target.dataset && ev.target.dataset.key;
        if (!k) return;
        tabs.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.key === k));
        body.querySelectorAll(".mb-section").forEach(s => s.classList.toggle("mb-off", s.dataset.key !== k));
        try { localStorage.setItem("mbTab", k); } catch (e) {}
    };
}

function mbChg(p) {
    if (p === null || p === undefined) return '<td class="na">-</td>';
    const cls = p > 0 ? "up" : p < 0 ? "down" : "";
    return `<td class="${cls}">${p > 0 ? "+" : ""}${p.toFixed(2)}%</td>`;
}

// 칸끼리 중복이 없어(합계 = 대상 종목 수) 비율이 클수록 진하게. 이평선 위 칸은 빨강, 200일선 아래는 파랑
function mbCell(n, total, below, cls) {
    if (!total) return `<td class="na ${cls}">-</td>`;
    const pct = n / total * 100;
    const a = Math.min(0.55, pct / (below ? 100 : 40) * 0.55);
    const rgb = below ? "46,95,163" : "192,57,43";
    const bg = a > 0.04 ? `background: rgba(${rgb},${a.toFixed(2)});` : "";
    return `<td class="c ${cls}" style="${bg}"><b>${n}</b><small>${pct.toFixed(0)}%</small></td>`;
}

// 10·20·50일 칸의 합과 합계 대비 비율 — 50% 기준으로 위면 빨강, 아래면 파랑
function mbA50(n, total) {
    if (!total) return '<td class="na sep2">-</td>';
    const pct = n / total * 100;
    const a = Math.min(0.55, Math.abs(pct - 50) / 50 * 0.55);
    const rgb = pct >= 50 ? "192,57,43" : "46,95,163";
    return `<td class="c a50 sep2" style="background: rgba(${rgb},${a.toFixed(2)});"><b>${n}</b><small>${pct.toFixed(1)}%</small></td>`;
}

const mbScrollTopBtn = document.getElementById("scroll-top-btn");
if (mbScrollTopBtn) {
    mbScrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => mbScrollTopBtn.classList.toggle("visible", window.scrollY > 400));
}

mbLoad();
