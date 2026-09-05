async function loadCommodities() {
    const body = document.getElementById("cm-body");
    let categories;
    try {
        const res = await fetch("data/commodities.json");
        categories = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    if (!categories || categories.length === 0) {
        body.innerHTML = '<p class="placeholder">목록 등록 예정입니다.</p>';
        return;
    }

    body.innerHTML = categories.map(c => `
        <div class="uc-sector">
            <div class="uc-sector-title">${c.category}</div>
            <div class="uc-grid">
                ${c.items.map(it => `
                <div class="uc-card">
                    <div class="uc-card-label">${it.label}</div>
                    <img src="https://www.100ppi.com/graph/?w=550&h=332&c=p&id=${it.id}&state=Korean" loading="lazy" alt="${it.label}">
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

loadCommodities();
