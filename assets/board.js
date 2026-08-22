// 배포 후 여기에 Cloudflare Worker URL을 넣어야 실제로 동작함 (cloudflare/board-worker/README.md 참고)
const BOARD_API = "";

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

function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "-";
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderPosts(posts) {
    const wrap = document.getElementById("board-list");
    if (!posts.length) {
        wrap.innerHTML = '<p class="board-empty">아직 등록된 글이 없습니다. 첫 글을 남겨보세요!</p>';
        return;
    }
    wrap.innerHTML = posts.map(p => `
        <div class="board-post">
            <div class="board-post-head">
                <span class="board-post-name">${escapeHtml(p.name)}</span>
                <span class="board-post-date">${fmtDate(p.created_at)}</span>
            </div>
            <div class="board-post-message">${escapeHtml(p.message)}</div>
        </div>
    `).join("");
}

async function loadPosts() {
    if (!BOARD_API) {
        document.getElementById("board-list").innerHTML =
            '<p class="board-empty">게시판 서버가 아직 연결되지 않았습니다.</p>';
        document.getElementById("summary-line").textContent = "연결 대기 중";
        return;
    }
    try {
        const res = await fetch(`${BOARD_API}/posts`);
        const posts = await res.json();
        document.getElementById("summary-line").textContent = `총 ${posts.length}건`;
        renderPosts(posts);
    } catch (e) {
        document.getElementById("board-list").innerHTML = '<p class="board-empty">글 목록을 불러오지 못했습니다.</p>';
    }
}

function toggleForm(show) {
    document.getElementById("board-form").hidden = !show;
    if (show) document.getElementById("board-name").focus();
}

async function submitPost() {
    const name = document.getElementById("board-name").value.trim();
    const message = document.getElementById("board-message").value.trim();
    const website = document.getElementById("board-website").value;

    if (!name || !message) {
        alert("이름과 내용을 모두 입력해 주세요.");
        return;
    }
    if (!BOARD_API) {
        alert("게시판 서버가 아직 연결되지 않았습니다.");
        return;
    }

    const btn = document.getElementById("board-submit-btn");
    btn.disabled = true;
    try {
        const res = await fetch(`${BOARD_API}/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, message, website }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "등록 실패");

        document.getElementById("board-name").value = "";
        document.getElementById("board-message").value = "";
        toggleForm(false);
        loadPosts();
    } catch (e) {
        alert("등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
        btn.disabled = false;
    }
}

document.getElementById("board-write-btn").addEventListener("click", () => toggleForm(true));
document.getElementById("board-cancel-btn").addEventListener("click", () => toggleForm(false));
document.getElementById("board-submit-btn").addEventListener("click", submitPost);

const scrollTopBtn = document.getElementById("scroll-top-btn");
scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
});

loadVisitorCount();
loadPosts();
