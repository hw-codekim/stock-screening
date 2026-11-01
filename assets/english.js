// 영어 스크립트 페이지 - data/english.json(일차별 문장 [영어, 한글]) 을 그린다. 주소 끝 #day3 처럼 일차 지정 가능.
(async function () {
    const body = document.getElementById("en-body");
    const tabs = document.getElementById("en-tabs");
    let data;
    try {
        const res = await fetch("data/english.json?t=" + Date.now());
        data = await res.json();
    } catch (e) {
        body.innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }
    const days = (data.days || []).slice().sort((a, b) => a.day - b.day);
    if (!days.length) { body.innerHTML = '<p class="placeholder">아직 등록된 스크립트가 없습니다.</p>'; return; }

    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    function render(dayNo) {
        const d = days.find(x => x.day === dayNo) || days[days.length - 1];
        tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.day === d.day));
        let html = `<div class="en-card"><h2>Day ${d.day}</h2>`;
        (d.paragraphs || []).forEach(p => {
            html += '<div class="en-para">';
            p.forEach(s => {
                html += `<div class="en-sent"><div class="en">${esc(s.en)}</div><div class="ko">${esc(s.ko)}</div></div>`;
            });
            html += "</div>";
        });
        html += "</div>";
        if (d.expressions && d.expressions.length) {
            html += '<div class="en-card"><h3>핵심 표현</h3><table class="en-exp">';
            d.expressions.forEach(([en, ko]) => { html += `<tr><td>${esc(en)}</td><td>${esc(ko)}</td></tr>`; });
            html += "</table></div>";
        }
        body.innerHTML = html;
        history.replaceState(null, "", "#day" + d.day);
    }

    days.forEach(d => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Day " + d.day;
        b.dataset.day = d.day;
        b.addEventListener("click", () => render(d.day));
        tabs.appendChild(b);
    });

    // 가리기 토글 - 가린 문장은 눌러서 하나씩 보기
    const hideKo = document.getElementById("en-hide-ko");
    const hideEn = document.getElementById("en-hide-en");
    const apply = () => {
        body.classList.toggle("hide-ko", hideKo.checked);
        body.classList.toggle("hide-en", hideEn.checked);
        body.querySelectorAll(".shown").forEach(el => el.classList.remove("shown"));
    };
    hideKo.addEventListener("change", apply);
    hideEn.addEventListener("change", apply);
    body.addEventListener("click", e => {
        const el = e.target.closest(".en-sent .en, .en-sent .ko");
        if (el) el.classList.toggle("shown");
    });

    const m = location.hash.match(/^#day(\d+)$/);
    render(m ? +m[1] : days[days.length - 1].day);
})();
