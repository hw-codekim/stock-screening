async function loadCharts() {
    const body = document.getElementById("uc-body");
    let sectors;
    try {
        const res = await fetch("data/finviz_charts.json");
        sectors = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    body.innerHTML = sectors.map(s => `
        <div class="uc-sector">
            <div class="uc-sector-title">${s.sector}</div>
            <div class="uc-grid">
                ${s.tickers.map(t => `
                <div class="uc-card">
                    <div class="uc-card-label">${t.label} (${t.ticker})</div>
                    <img src="https://charts2.finviz.com/chart.ashx?t=${t.ticker}" loading="lazy" alt="${t.label}">
                </div>
                `).join("")}
            </div>
        </div>
    `).join("");
}

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadCharts();
