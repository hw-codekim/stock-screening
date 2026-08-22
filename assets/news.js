let newsData = null;

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

function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderNews() {
    const wrap = document.getElementById("news-body");
    const items = newsData.items;

    if (!items.length) {
        wrap.innerHTML = '<p class="news-cand-empty">표시할 뉴스가 없습니다.</p>';
        return;
    }

    const header = `<tr><th>날짜</th><th>제목</th><th>출처</th></tr>`;
    const body = items.map(it => {
        const isForeign = it.region === "해외";
        const regionCls = isForeign ? "foreign" : "domestic";
        const titleKo = isForeign && it.title_ko ? `<span class="news-title-ko">${escapeHtml(it.title_ko)}</span>` : "";
        return `
        <tr>
            <td class="news-date">${escapeHtml(it.date || "-")}</td>
            <td class="news-title"><a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>${titleKo}</td>
            <td class="news-source">${escapeHtml(it.source || "-")}<span class="news-region ${regionCls}">${it.region || "-"}</span></td>
        </tr>`;
    }).join("");

    wrap.innerHTML = `<table class="news-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;
}

async function loadNews() {
    try {
        const res = await fetch("data/telegram_news.json");
        newsData = await res.json();
    } catch (e) {
        document.getElementById("news-body").innerHTML = '<p class="news-cand-empty">데이터를 불러오지 못했습니다.</p>';
        return;
    }

    document.getElementById("summary-line").innerHTML =
        `<span class="summary-datetime">[${newsData.generated_at}]</span> 총 ${newsData.items.length}건`;

    renderNews();
}

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadVisitorCount();
loadNews();
