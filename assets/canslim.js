// 캔슬림 페이지 — data/canslim.json (stock_price/collector/canslim_screen.py 가 매 영업일 생성)
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const won = v => v == null ? "-" : Math.round(v).toLocaleString();
const pct = (v, d = 0) => v == null ? "-" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const cls = v => v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "";
const eok = v => v >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${Math.round(v).toLocaleString()}억`;
const mkName = m => m === "KOSPI" ? "코스피" : "코스닥";
const KIND_STAGE = { forming: "형성 중", breakout: "돌파", passed: "돌파 지남" };

function capText(r) {
    if (r.cap_up == null) return "";
    return `<div class="cs-cap ${r.cap_good ? "good" : ""}">지수 상승일 ${r.cap_up.toFixed(2)}배 · 하락일 ${r.cap_down.toFixed(2)}배${r.cap_good ? " ✔" : ""}</div>`;
}

// 매수 자리 판정: 형성 중 = 피벗 돌파 대기 / 돌파 = 거래량·추격 한도 확인
function verdict(p) {
    if (p.stage === "forming") return ["wait", `매수가 ${won(p.pivot)} 돌파 + 거래량 ${won(p.vol_need)}주↑ 시 매수`];
    const volOk = (p.bo_vol ?? 0) >= 1.4, inChase = p.close <= p.chase;
    if (volOk && inChase) return ["ok", `매수 가능 구간 — 시초가 ${won(p.chase)} 이하`];
    if (!inChase) return ["wait", "추격 금지 — 매수가 근처 되돌림 대기"];
    return ["wait", "거래량 미달 — 거래량 붙는 날 또는 되돌림 대기"];
}

function chartSvg(r) {
    const c = r.chart, n = c.c.length;
    const W = 360, PH = 150, VH = 40, PR = 58;
    const step = (W - PR) / n;
    const p = r.primary != null ? r.pats[r.primary] : null;
    const lines = [];
    if (p) {
        lines.push([p.pivot, "piv", `매수 ${won(p.pivot)}`], [p.chase, "chase", `+5% ${won(p.chase)}`], [p.stop, "stop", `손절 ${won(p.stop)}`]);
    } else if (["right", "rim"].includes(r.stage.stage)) {
        const hmax = Math.max(...c.h);
        if (r.stage.left_high <= hmax * 1.25) lines.push([r.stage.left_high, "piv", `좌측고점 ${won(r.stage.left_high)}`]);
        if (r.stage.watch <= hmax * 1.25) lines.push([r.stage.watch, "chase", `85% ${won(r.stage.watch)}`]);
    }
    let hi = Math.max(...c.h, ...lines.map(l => l[0])), lo = Math.min(...c.l, ...lines.map(l => l[0]));
    const pad = (hi - lo) * 0.04; hi += pad; lo -= pad;
    const y = v => 6 + (hi - v) / (hi - lo) * (PH - 12);
    const vmax = Math.max(...c.v) || 1;
    const out = [`<svg class="cs-ch" viewBox="0 0 ${W} ${PH + VH + 14}" role="img" aria-label="${esc(r.name)} 3개월 차트">`];
    if (p && p.shade) {   // 손잡이·쉬는 구간 (차트 안 인덱스, 끝이 null이면 오늘까지)
        const s = Math.max(p.shade[0], 0), e = Math.min(p.shade[1] == null ? n - 1 : p.shade[1], n - 1);
        if (s <= e) out.push(`<rect class="hz" x="${(s * step).toFixed(1)}" y="0" width="${((e - s + 1) * step).toFixed(1)}" height="${PH}"/>`);
    }
    for (let i = 0; i < n; i++) {
        const cx = i * step + step / 2, up = c.c[i] >= c.o[i], k = up ? "up" : "dn";
        out.push(`<line class="${k}" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(c.h[i]).toFixed(1)}" y2="${y(c.l[i]).toFixed(1)}"/>`);
        const t = y(Math.max(c.o[i], c.c[i])), b = y(Math.min(c.o[i], c.c[i]));
        out.push(`<rect class="${k}b" x="${(cx - step * 0.35).toFixed(1)}" y="${t.toFixed(1)}" width="${(step * 0.7).toFixed(1)}" height="${Math.max(b - t, 0.8).toFixed(1)}"/>`);
        const vh = c.v[i] / vmax * (VH - 4);
        out.push(`<rect class="${k}v" x="${(cx - step * 0.35).toFixed(1)}" y="${(PH + 8 + VH - 4 - vh).toFixed(1)}" width="${(step * 0.7).toFixed(1)}" height="${vh.toFixed(1)}"/>`);
    }
    const ma = c.ma50.map((v, i) => v == null ? null : `${(i * step + step / 2).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean);
    if (ma.length > 1) out.push(`<polyline class="ma" points="${ma.join(" ")}"/>`);
    if (p && p.marks) for (const [i, lab] of p.marks) {
        if (i < 0 || i >= n) continue;
        const v = lab === "M" ? c.h[i] : c.l[i];
        out.push(`<text class="tpiv" x="${(i * step + step / 2).toFixed(1)}" y="${(y(v) + (lab === "M" ? -4 : 12)).toFixed(1)}" text-anchor="middle">${lab}</text>`);
    }
    for (const [v, k, lab] of lines) {
        out.push(`<line class="l${k}" x1="0" x2="${W - PR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="t${k}" x="${W - PR + 3}" y="${(y(v) + 4).toFixed(1)}">${lab}</text>`);
    }
    out.push(`<text class="ax" x="0" y="${PH + VH + 12}">${c.d[0]}</text><text class="ax" x="${W - PR}" y="${PH + VH + 12}" text-anchor="end">${c.d[n - 1]}</text>`);
    out.push("</svg>");
    return out.join("");
}

function card(r) {
    const b = (k, ok) => `<span class="cs-b ${ok ? "on" : ""}">${k}</span>`;
    const a = r.a;
    const aTxt = a.has_cons ? `26E ${pct(a.g26)} · 27E ${pct(a.g27)}` : `4분기합 ${pct(a.g_ttm)}`;
    const pats = r.pats.filter(p => p.stage !== "passed")
        .map(p => `<div class="pat"><b>${p.kind} ${KIND_STAGE[p.stage]}${p.bo_date ? " " + p.bo_date.slice(5).replace("-", "/") : ""}</b> · ${esc(p.desc)}</div>`).join("");
    const warn = [r.stage.depth_note, r.stage.v_shape ? "V자 급반등" : "", a.note].filter(Boolean).map(esc).join(" · ");
    return `<div class="cs-card">
        <div class="top"><span class="nm">${esc(r.name)}</span><span class="meta">${mkName(r.market)} · ${eok(r.cap)} · ${esc(r.sm)}</span></div>
        <div class="cs-badges">${b("C", r.c.ok)}${b("A", r.a.ok)}${b("L", r.l.ok)}${b("N", r.n.ok)}${b("S", r.s.ok)}${b("I", r.i.ok)}</div>
        ${capText(r)}
        <div class="cs-kv">
            <div><small>분기 영업이익</small><span class="${cls(r.c.op_yoy)}">${pct(r.c.op_yoy)}</span>${r.c.accel ? " ↑" : ""}</div>
            <div><small>연간 성장</small>${aTxt}</div>
            <div><small>RS · ROE</small>${r.l.rs ?? "-"} · ${a.roe != null ? a.roe.toFixed(0) + "%" : "-"}</div>
        </div>
        <span class="cs-stage ${r.stage.stage}">${esc(r.stage.label)}</span>
        <span class="mut"> 좌측고점 ${won(r.stage.left_high)} · 현재 ${(r.stage.ratio * 100).toFixed(0)}%</span>
        ${warn ? `<div class="cs-warn">⚠ ${warn}</div>` : ""}
        ${chartSvg(r)}
        ${pats}
    </div>`;
}

function buyRows(data) {
    const rows = [];
    for (const r of data.passed) for (const p of r.pats) if (p.stage === "forming" || p.stage === "breakout") rows.push([r, p]);
    if (!rows.length) return `<div class="cs-empty">지금 형성 중이거나 막 돌파한 패턴이 없습니다. 아래 카드의 좌측고점 85%(감시선)를 넘은 뒤 눌림을 기다립니다.</div>`;
    rows.sort((x, y) => (verdict(y[1])[0] === "ok") - (verdict(x[1])[0] === "ok"));
    return rows.map(([r, p]) => {
        const [k, txt] = verdict(p);
        return `<div class="cs-buy">
            <div class="h"><b>${esc(r.name)}</b><span class="mut">${p.kind} ${KIND_STAGE[p.stage]}${p.bo_date ? " " + p.bo_date.slice(5).replace("-", "/") : ""}</span></div>
            <div class="px"><div><small>매수가</small><strong>${won(p.pivot)}</strong></div><div><small>추격 한도</small><strong>${won(p.chase)}</strong></div><div><small>손절</small><strong>${won(p.stop)}</strong></div></div>
            <div>종가 ${won(p.close)} <span class="${cls(p.dist)}">(${pct(p.dist, 1)})</span>${p.bo_vol != null ? ` · 돌파일 거래량 ${p.bo_vol.toFixed(1)}배` : ""}</div>
            <div class="verdict ${k}">➡ ${txt}</div>
            ${capText(r)}
        </div>`;
    }).join("");
}

async function csLoad() {
    let data;
    try {
        data = await (await fetch("data/canslim.json", { cache: "no-cache" })).json();
    } catch (e) {
        $("cs-buy").innerHTML = '<p class="placeholder">데이터를 불러오지 못했습니다.</p>';
        return;
    }
    $("cs-generated-at").textContent = `기준일 ${data.price_date} · 갱신 ${data.generated_at}`;
    $("cs-market").innerHTML = data.market.map(m => `<div class="cs-mk">
            <div class="t"><span class="cs-dot ${m.light}"></span>${mkName(m.market)} ${esc(m.label)}</div>
            <div class="s">${m.close.toLocaleString()} <span class="${cls(m.ret)}">${pct(m.ret, 2)}</span></div>
            <div class="s">50일선 ${m.above50 ? "위" : "아래"} · 200일선 ${m.above200 ? "위" : "아래"} · 분산일 ${m.dd}</div>
            <div class="s">팔로우스루 ${m.ftd ? m.ftd.slice(5).replace("-", "/") : "없음"}</div>
        </div>`).join("") + (data.breadth ? `<div class="cs-mk"><div class="t">시장 폭</div>
            <div class="s">신고가 ${data.breadth.nh} · 신저가 ${data.breadth.nl}</div><div class="s">10일 평균 순신고가 ${data.breadth.net10 > 0 ? "+" : ""}${data.breadth.net10}</div></div>` : "");
    const f = data.funnel;
    $("cs-funnel").innerHTML = [["유니버스", data.universe], ["C", f.c], ["A", f.a], ["L", f.l], ["C+A", f.ca], ["C+A+L", f.cal]]
        .map(([k, v]) => `<div class="cs-fn"><b>${v}</b><span>${k}</span></div>`).join("");
    $("cs-buy").innerHTML = buyRows(data);
    $("cs-pass-n").textContent = `${data.passed.length}종목`;
    $("cs-cards").innerHTML = data.passed.map(card).join("");
    $("cs-near-n").textContent = `${data.near.length}종목`;
    $("cs-near").innerHTML = data.near.map(r => `<div class="cs-nr">
            <div><b>${esc(r.name)}</b> <span class="mut">${mkName(r.market)} · ${esc(r.sm)}</span></div><div class="f">${r.fail} 탈락</div>
            <div class="mut">분기 OP ${pct(r.op_yoy)} · 26E ${pct(r.g26)} · ROE ${r.roe != null ? r.roe.toFixed(0) + "%" : "-"} · RS ${r.rs ?? "-"}</div>
            <div class="${r.cap_good ? "pos" : "mut"}">${r.cap_up != null ? `${r.cap_up.toFixed(1)} / ${r.cap_down.toFixed(1)}${r.cap_good ? " ✔" : ""}` : ""}</div>
        </div>`).join("");
}

const topBtn = $("scroll-top-btn");
window.addEventListener("scroll", () => topBtn.classList.toggle("visible", window.scrollY > 400));
topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
csLoad();
