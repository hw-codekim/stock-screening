// ── 공용 상단 메뉴 (상위 메뉴 → 하위 메뉴 2단) ─────────────────
// 페이지마다 <nav class="site-nav"></nav> 바로 뒤에 이 스크립트를 넣는다.
// 메뉴를 추가·이동할 때는 아래 NAV_GROUPS 만 고치면 모든 페이지(종목분석 개별 페이지 포함)에 반영된다.
(function () {
    // href 만 있는 상위 메뉴(TODAY)는 하위 메뉴 없이 바로 그 페이지로 간다.
    // 종목분석(analysis.html)은 2026-10-18 사용자 요청으로 메뉴에서 뺐다(페이지 파일은 그대로).
    const NAV_GROUPS = [
        { name: "TODAY", href: "index.html", pages: [["index.html", "TODAY"]] },
        { name: "실적", pages: [
            ["q2.html", "분기실적"],
            ["forward.html", "포워드실적"],
            ["cashflow.html", "현금흐름"],
        ] },
        { name: "차트", pages: [
            ["us-charts.html", "미장"],
            ["kr-charts.html", "국장"],
            ["commodities.html", "원자재"],
        ] },
        { name: "종목서칭", pages: [
            ["buy-candidates.html", "매수후보"],
            ["canslim.html", "캔슬림"],
            ["weekly-returns.html", "주별등락률"],
        ] },
        { name: "지수", pages: [
            ["index-detail.html", "지수분석"],
            ["ma-breadth.html", "이평선"],
            ["market-indicators.html", "시장지표"],
            ["option-pcr.html", "옵션PCR"],
        ] },
        { name: "기타", pages: [
            ["tw-revenue.html", "대만월매출"],
        ] },
    ];

    const me = document.currentScript;
    const base = me ? me.getAttribute("src").replace(/assets\/nav\.js.*$/, "") : "";
    const path = location.pathname;
    let current = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    if (/\/analysis\/[^/]+\.html$/.test(path)) current = "analysis.html";   // 종목분석 개별 페이지

    const activeGroup = NAV_GROUPS.findIndex(g => g.pages.some(p => p[0] === current));   // -1 = 메뉴에 없는 페이지

    const css = `
.site-nav.gnav { display: block; gap: 0; margin-top: 8px; overflow: visible; max-width: 100%; min-width: 0; }
.gnav-top, .gnav-sub { display: flex; align-items: center; flex-wrap: nowrap; overflow-x: auto;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.gnav-top::-webkit-scrollbar, .gnav-sub::-webkit-scrollbar { display: none; }
.gnav-top { gap: 6px; }
.gnav-top button { font: inherit; font-size: 0.95rem; font-weight: 700; color: #9FB3D1; background: transparent;
    border: 1px solid transparent; border-radius: 6px; padding: 4px 14px; cursor: pointer; white-space: nowrap; flex: 0 0 auto; }
.gnav-top button:hover { color: #fff; }
.gnav-top button.on { color: #fff; background: rgba(91,155,255,0.18); border-color: rgba(91,155,255,0.55); }
.gnav-top button.here::after { content: ""; display: inline-block; width: 5px; height: 5px; border-radius: 50%;
    background: #5B9BFF; margin-left: 6px; vertical-align: middle; }
.gnav-sub { gap: 24px; margin-top: 6px; padding-left: 4px; }
.site-nav.gnav .gnav-sub a { font-size: 0.92rem; font-weight: 600; padding-bottom: 6px; flex: 0 0 auto; white-space: nowrap;
    text-decoration: none; border-bottom: 2px solid transparent; }
.site-nav.gnav .gnav-sub a, .site-nav.gnav .gnav-sub a:link, .site-nav.gnav .gnav-sub a:visited { color: #9FB3D1; }
.site-nav.gnav .gnav-sub a:hover { color: #fff; }
.site-nav.gnav .gnav-sub a.active { color: #fff; font-weight: 700; border-bottom-color: #5B9BFF; }
@media (max-width: 640px) {
    .gnav-top button { font-size: 0.86rem; padding: 3px 10px; }
    .gnav-sub { gap: 16px; }
    .site-nav.gnav .gnav-sub a { font-size: 0.85rem; }
}`;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    const nav = (me && me.previousElementSibling && me.previousElementSibling.matches("nav.site-nav"))
        ? me.previousElementSibling : document.querySelector("nav.site-nav");
    if (!nav) return;
    nav.classList.add("gnav");
    nav.innerHTML = "";
    const top = document.createElement("div");
    top.className = "gnav-top";
    const sub = document.createElement("div");
    sub.className = "gnav-sub";
    nav.append(top, sub);

    const here = activeGroup;
    function render(gi) {
        top.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === gi));
        sub.innerHTML = "";
        const g = NAV_GROUPS[gi];
        sub.style.display = (!g || g.href) ? "none" : "";          // TODAY·메뉴 밖 페이지는 하위 줄 없음
        if (!g || g.href) return;
        g.pages.forEach(([href, label]) => {
            const a = document.createElement("a");
            a.href = base + href;
            a.textContent = label;
            if (href === current) a.className = "active";
            sub.appendChild(a);
        });
    }
    NAV_GROUPS.forEach((g, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = g.name;
        if (i === here) b.classList.add("here");
        b.addEventListener("click", () => g.href ? (location.href = base + g.href) : render(i));
        top.appendChild(b);
    });
    render(activeGroup);
})();

// 상단 사이트 헤더(sticky, top:0)의 실제 높이를 --site-header-h로 노출 - 표 헤더(.sr-header 등)를
// top:0으로 고정하면 사이트 헤더 뒤에 가려지므로 그 바로 아래에 붙이기 위함. 메뉴 줄바꿈으로 높이가 바뀌어도 따라감
(function () {
    const h = document.querySelector(".site-header");
    if (!h) return;
    const set = () => document.documentElement.style.setProperty("--site-header-h", h.offsetHeight + "px");
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(h);
    else window.addEventListener("resize", set);
})();
