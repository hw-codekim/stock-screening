// ── CHART 페이지 ─────────────────────────────────────
// 로컬 stock_price 프로젝트의 /chart 페이지를 정적 데이터(data/stocks/{code}.json,
// data/universe.json, data/name_index.json, data/daily.json) 기반으로 이식.
// 추세선 그리기/기록 삭제는 별도 Cloudflare Worker(ANNOTATIONS_API)가 있어야 동작한다.

const ANNOTATIONS_API = ''; // TODO: Worker 배포 후 URL 채우기 (예: 'https://stock-chart-annotations.xxx.workers.dev')

const LIST_LABELS = {
    upper_limit:       '상한가',
    bullish_alignment: '정배열 종목',
    low_mdd:           '52주 고점대비 MDD -10% 이내',
};

let nameIndex = {};      // { "삼성전자": "005930", ... }
let myChart = null;
let chartData = null;    // 현재 종목의 price 원본 (1년치)
let currentCode = null;
let currentName = null;
let currentPeriod = '6M';
let adjustedMode = false;
let annotations = [];
let drawMode = false;
let pendingLineStart = null;

let universeList  = [];   // 현재 활성 목록 (기본: 코스피200+코스닥150 / 필터모드: 해당 종목만)
let universeTab    = 'kospi';
let universeIndex  = -1;
let filterMode      = null; // null | 'upper_limit' | 'bullish_alignment' | 'low_mdd'

function fmtNum(v) {
    if (v == null) return '-';
    return v.toLocaleString();
}
function fmtRate(v) {
    if (v == null) return '-';
    return (v >= 0 ? '+' : '') + v + '%';
}
function colorRate(v) {
    if (v == null) return '#888';
    return v >= 0 ? '#B4342A' : '#2E5FA3';
}

// ── 종목명 → 코드 인덱스 ────────────────────────────
async function loadNameIndex() {
    try {
        const res = await fetch('data/name_index.json');
        nameIndex = await res.json();
    } catch (e) {
        nameIndex = {};
    }
}

function resolveCode(name) {
    if (nameIndex[name]) return nameIndex[name];
    const target = name.trim().toLowerCase();
    const hit = Object.keys(nameIndex).find(n => n.toLowerCase() === target);
    return hit ? nameIndex[hit] : null;
}

// ── 목록(유니버스 / 필터된 종목) ─────────────────────
async function loadList() {
    const params = new URLSearchParams(window.location.search);
    filterMode = params.get('list');

    if (filterMode && LIST_LABELS[filterMode]) {
        await loadFilteredList(filterMode);
    } else {
        filterMode = null;
        await loadUniverse();
    }
}

async function loadUniverse() {
    document.getElementById('uni-tabs').style.display = 'flex';
    document.getElementById('universe-back').style.display = 'none';
    try {
        const res  = await fetch('data/universe.json');
        const data = await res.json();
        universeList = [
            ...(data.kospi200  || []).map(s => ({ ...s, market: 'kospi' })),
            ...(data.kosdaq150 || []).map(s => ({ ...s, market: 'kosdaq' })),
        ];
        document.getElementById('universe-title').textContent = '📋 코스피200 · 코스닥150 (시총 상위)';
        document.getElementById('universe-count').textContent =
            `코스피 ${data.kospi200?.length || 0} · 코스닥 ${data.kosdaq150?.length || 0}`;
        renderUniverseTab();
    } catch (e) {
        document.getElementById('universe-count').textContent = '오류';
    }
}

async function loadFilteredList(key) {
    document.getElementById('uni-tabs').style.display = 'none';
    document.getElementById('universe-back').style.display = 'inline';
    document.getElementById('universe-list-wrap').style.display = 'block';
    try {
        const res  = await fetch('data/daily.json');
        const data = await res.json();
        const rows = data[key] || [];
        universeList = rows.map(s => ({ ...s, market: 'filtered' }));
        universeTab = 'filtered';
        document.getElementById('universe-title').textContent = `📋 ${LIST_LABELS[key]}`;
        document.getElementById('universe-count').textContent = `총 ${universeList.length}개`;
        renderUniverseTab();
        if (universeList.length) goToUniverseIndex(0);
    } catch (e) {
        document.getElementById('universe-count').textContent = '오류';
    }
}

function toggleUniverseList() {
    const wrap = document.getElementById('universe-list-wrap');
    if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}

function switchUniverseTab(tab) {
    universeTab = tab;
    renderUniverseTab();
}

function renderUniverseTab() {
    const listEl = document.getElementById('universe-list');
    if (!listEl) return;

    if (filterMode) {
        renderUniverseItems(listEl, universeList.map((s, idx) => ({ ...s, idx })));
        return;
    }

    const kospiTab  = document.getElementById('uni-tab-kospi');
    const kosdaqTab = document.getElementById('uni-tab-kosdaq');
    if (kospiTab)  kospiTab.classList.toggle('active', universeTab === 'kospi');
    if (kosdaqTab) kosdaqTab.classList.toggle('active', universeTab === 'kosdaq');

    const items = universeList
        .map((s, idx) => ({ ...s, idx }))
        .filter(s => s.market === universeTab);
    renderUniverseItems(listEl, items);
}

function renderUniverseItems(listEl, items) {
    if (items.length === 0) {
        listEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
        return;
    }
    listEl.innerHTML = items.map((s, rank) => `
        <div class="mdd-item ${s.idx === universeIndex ? 'current' : ''}" onclick="goToUniverseIndex(${s.idx})">
            <div class="mdd-item-row1">
                <span class="mdd-item-name">${rank + 1}. ${s.name}</span>
                <span class="mdd-item-price">${(s.close_price || 0).toLocaleString()}원</span>
            </div>
            <div class="mdd-item-row2">
                <span class="mdd-item-mktcap">${((s.mktcap || 0) / 10000).toFixed(2)}조</span>
                ${s.change_rate != null ? `<span class="mdd-item-mdd" style="color:${colorRate(s.change_rate)}">${fmtRate(s.change_rate)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function goToUniverseIndex(idx) {
    if (idx < 0 || idx >= universeList.length) return;
    const item = universeList[idx];
    document.getElementById('stockNameInput').value = item.name;
    searchChart();
}

function nextStock() { goToUniverseIndex(universeIndex + 1); }
function prevStock() { goToUniverseIndex(universeIndex - 1); }

document.addEventListener('keydown', (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowDown' || e.key === 'n') { e.preventDefault(); nextStock(); }
    else if (e.key === 'ArrowUp' || e.key === 'p') { e.preventDefault(); prevStock(); }
});

// ── 차트 검색 ──────────────────────────────────────
function searchIndex(name) {
    document.getElementById('stockNameInput').value = name;
    searchChart();
}

async function searchChart() {
    const name      = document.getElementById('stockNameInput').value.trim();
    const resultDiv = document.getElementById('chart-result');

    if (!name) { resultDiv.innerHTML = '<p class="error">종목명을 입력해주세요.</p>'; return; }

    const code = resolveCode(name);
    if (!code) {
        resultDiv.innerHTML = '<p class="error">종목을 찾을 수 없습니다.</p>';
        return;
    }

    if (myChart) { myChart.dispose(); myChart = null; }
    resultDiv.innerHTML = '<p class="loading">불러오는 중...</p>';

    try {
        const res = await fetch(`data/stocks/${code}.json`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();

        if (!data.price || !data.price.dates || !data.price.dates.length) {
            resultDiv.innerHTML = '<p class="error">차트 데이터가 없습니다.</p>';
            return;
        }

        chartData     = data.price;
        currentCode   = data.code;
        currentName   = (data.info && data.info.name) || name;
        currentPeriod = '6M';
        adjustedMode = false;
        drawMode = false; pendingLineStart = null;

        universeIndex = universeList.findIndex(u => u.code === currentCode);
        if (universeIndex >= 0 && !filterMode) universeTab = universeList[universeIndex].market;
        renderUniverseTab();

        renderInfo(data.info, currentName, currentCode);
        await loadAnnotations(currentCode);
        renderChart(chartData, currentPeriod);

    } catch (e) {
        resultDiv.innerHTML = `<p class="error">불러오기 실패: ${e.message}</p>`;
    }
}

// ── 종목 정보 박스 ─────────────────────────────────
function renderInfo(info, name, code) {
    const resultDiv = document.getElementById('chart-result');
    info = info || {};
    const chgColor  = (info.change_price || 0) >= 0 ? '#B4342A' : '#2E5FA3';
    const chgSign   = (info.change_price || 0) >= 0 ? '+' : '';
    const ytdColor  = colorRate(info.ytd);

    resultDiv.innerHTML = `
        <div class="stock-info-box">
            <div class="stock-info-header">
                <span class="stock-name">${info.name || name}</span>
                <span class="stock-code">${info.code || code}</span>
                <span class="stock-date">${info.date || ''} 기준</span>
            </div>
            <div class="stock-info-grid">
                <div class="info-item"><div class="info-label">종가</div><div class="info-val">${fmtNum(info.close_price)}원</div></div>
                <div class="info-item"><div class="info-label">전일대비</div><div class="info-val" style="color:${chgColor}">${chgSign}${fmtNum(info.change_price)} (${chgSign}${info.change_rate ?? '-'}%)</div></div>
                <div class="info-item"><div class="info-label">시가총액</div><div class="info-val">${fmtNum(info.mktcap)}억</div></div>
                <div class="info-item"><div class="info-label">거래량</div><div class="info-val">${fmtNum(info.volume)}</div></div>
                <div class="info-item"><div class="info-label">거래대금</div><div class="info-val">${fmtNum(info.trade_amount)}억</div></div>
                <div class="info-item"><div class="info-label">외국인 지분율</div><div class="info-val">${info.foreign_ratio ?? '-'}%</div></div>
                <div class="info-item"><div class="info-label">52주 MDD</div><div class="info-val" style="color:#2E5FA3">${info.mdd ?? '-'}%</div></div>
                <div class="info-item"><div class="info-label">YTD 수익률</div><div class="info-val" style="color:${ytdColor}">${fmtRate(info.ytd)}</div></div>
                <div class="info-item"><div class="info-label">추정 PER</div><div class="info-val">${info.fwd_per ?? '-'}배</div></div>
            </div>
        </div>

        <div class="period-btns">
            <button class="period-btn" onclick="changePeriod('1M', this)">1개월</button>
            <button class="period-btn" onclick="changePeriod('3M', this)">3개월</button>
            <button class="period-btn active" onclick="changePeriod('6M', this)">6개월</button>
            <button class="period-btn" onclick="changePeriod('1Y', this)">1년</button>
        </div>

        <div class="anno-toolbar">
            <button id="draw-line-btn" class="anno-btn" onclick="toggleDrawMode()" ${ANNOTATIONS_API ? '' : 'disabled title="준비 중"'}>✏️ 선 긋기</button>
            <button id="anno-list-btn" class="anno-btn" onclick="toggleAnnoList()">📋 기록 (<span id="anno-count">0</span>)</button>
            <button id="save-image-btn" class="anno-btn" onclick="saveChartImage()">💾 이미지 저장</button>
            <button id="adjust-btn" class="anno-btn" onclick="toggleAdjusted()">📐 수정주가</button>
            <span id="anno-status" class="anno-status"></span>
        </div>
        <div id="anno-list-panel" class="anno-list-panel" style="display:none;"></div>

        <div class="graph-wrap">
            <div id="echart-container"></div>
        </div>
    `;
}

// ── 어노테이션 모드 토글 ────────────────────────────
function toggleDrawMode() {
    if (!ANNOTATIONS_API) return;
    drawMode = !drawMode;
    pendingLineStart = null;
    updateModeButtons();
}
function saveChartImage() {
    if (!myChart) return;
    const dataUrl = myChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
    const a = document.createElement('a');
    const fname = (currentName || 'chart') + '_' + (currentCode || '') + '_' + currentPeriod + '.png';
    a.href = dataUrl;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
function updateModeButtons() {
    const lineBtn = document.getElementById('draw-line-btn');
    const status  = document.getElementById('anno-status');
    const container = document.getElementById('echart-container');
    if (lineBtn) lineBtn.classList.toggle('active', drawMode);
    if (container) container.style.cursor = drawMode ? 'crosshair' : 'default';
    if (status) status.textContent = drawMode ? (pendingLineStart ? '끝점을 클릭하세요' : '시작점을 클릭하세요') : '';
}
function toggleAnnoList() {
    const panel = document.getElementById('anno-list-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ── 어노테이션 저장/조회/삭제 (Cloudflare Worker) ────────
function getAuthToken() {
    let token = localStorage.getItem('chartAnnoToken');
    if (!token) {
        token = prompt('편집 암호를 입력하세요') || '';
        if (token) localStorage.setItem('chartAnnoToken', token);
    }
    return token;
}

async function loadAnnotations(code) {
    annotations = [];
    if (!ANNOTATIONS_API) { renderAnnoList(); return; }
    try {
        const res = await fetch(`${ANNOTATIONS_API}/annotations/${code}`);
        annotations = await res.json();
    } catch (e) {
        annotations = [];
    }
    renderAnnoList();
}

async function finalizeLine(p1, p2) {
    if (!ANNOTATIONS_API) return;
    const memo = prompt('메모 (선택, 비워도 됩니다)') || '';
    const res  = await fetch(`${ANNOTATIONS_API}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getAuthToken() },
        body: JSON.stringify({ code: currentCode, type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, memo })
    });
    const data = await res.json();
    if (data.success) {
        await loadAnnotations(currentCode);
        renderChart(chartData, currentPeriod);
    } else if (data.error === 'unauthorized') {
        localStorage.removeItem('chartAnnoToken');
        alert('암호가 올바르지 않습니다. 다시 시도해주세요.');
    }
}

async function deleteAnnotation(id) {
    if (!ANNOTATIONS_API) return;
    if (!confirm('삭제할까요?')) return;
    await fetch(`${ANNOTATIONS_API}/annotations/${id}?code=${encodeURIComponent(currentCode)}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': getAuthToken() },
    });
    await loadAnnotations(currentCode);
    renderChart(chartData, currentPeriod);
}

function renderAnnoList() {
    const countEl = document.getElementById('anno-count');
    if (countEl) countEl.textContent = annotations.length;

    const panel = document.getElementById('anno-list-panel');
    if (!panel) return;

    if (annotations.length === 0) {
        panel.innerHTML = '<p class="placeholder">저장된 기록이 없습니다.</p>';
        return;
    }

    const sorted = [...annotations].sort((a, b) => (b.x1 || '').localeCompare(a.x1 || ''));
    panel.innerHTML = sorted.map(a => `
        <div class="anno-item">
            <div class="anno-item-main">
                <span class="anno-item-type">📏 추세선</span>
                <span class="anno-item-detail">${a.x1} → ${a.x2} (${a.y1.toLocaleString()} → ${a.y2.toLocaleString()})</span>
                ${a.memo ? `<span class="anno-item-memo">${a.memo}</span>` : ''}
            </div>
            <button class="anno-item-del" onclick="deleteAnnotation('${a.id}')">삭제</button>
        </div>
    `).join('');
}

// ── 어노테이션 → markLine 변환 ─────────────────────────
function buildAnnotationExtras(fd) {
    const dateSet = new Set(fd.dates);
    const lines = annotations.filter(a => a.type === 'line' && dateSet.has(a.x1) && dateSet.has(a.x2));
    const lastIdx = fd.dates.length - 1;

    const highs = fd.high.filter(v => v != null);
    const lows  = fd.low.filter(v => v != null);
    const yMax  = highs.length ? Math.max(...highs) : Infinity;
    const yMin  = lows.length  ? Math.min(...lows)  : -Infinity;

    function extendTo(i1, y1, slope, dirSign, maxDelta) {
        if (maxDelta <= 0) return { idx: i1, y: y1 };
        if (slope === 0) return { idx: i1 + dirSign * maxDelta, y: y1 };
        const yAtEdge = y1 + slope * dirSign * maxDelta;
        let delta = maxDelta;
        if (yAtEdge > yMax)      delta = Math.min(maxDelta, (yMax - y1) / (slope * dirSign));
        else if (yAtEdge < yMin) delta = Math.min(maxDelta, (yMin - y1) / (slope * dirSign));
        delta = Math.max(0, delta);
        return { idx: i1 + dirSign * delta, y: y1 + slope * dirSign * delta };
    }

    const lineData = lines.map(a => {
        const i1 = fd.dates.indexOf(a.x1);
        const i2 = fd.dates.indexOf(a.x2);
        if (i1 === i2 || lastIdx <= 0) {
            return [
                { coord: [a.x1, a.y1], symbol: 'none', lineStyle: { color: '#333', width: 2, type: 'solid' } },
                { coord: [a.x2, a.y2], symbol: 'none' },
            ];
        }
        const slope = (a.y2 - a.y1) / (i2 - i1);
        const left  = extendTo(i1, a.y1, slope, -1, i1);
        const right = extendTo(i1, a.y1, slope, 1, lastIdx - i1);
        const leftIdx  = Math.round(Math.max(0, Math.min(lastIdx, left.idx)));
        const rightIdx = Math.round(Math.max(0, Math.min(lastIdx, right.idx)));
        return [
            { coord: [fd.dates[leftIdx], left.y], symbol: 'none', lineStyle: { color: '#333', width: 2, type: 'solid' } },
            { coord: [fd.dates[rightIdx], right.y], symbol: 'none' },
        ];
    });

    return { lineData };
}

// ── 수정주가 ──────────────────────────────────────
function rollingMean(arr, window) {
    const out = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
        if (i < window - 1) continue;
        let sum = 0, ok = true;
        for (let j = i - window + 1; j <= i; j++) {
            if (arr[j] == null) { ok = false; break; }
            sum += arr[j];
        }
        out[i] = ok ? Math.round(sum / window) : null;
    }
    return out;
}

function computeAdjustedSeries(d) {
    const n = d.dates.length;
    const open  = [...d.open];
    const high  = [...d.high];
    const low   = [...d.low];
    const close = [...d.close];

    let factor = 1;
    for (let i = n - 1; i >= 1; i--) {
        const prevClose = d.close[i - 1];
        const curClose  = d.close[i];
        if (prevClose != null && curClose != null && prevClose > 0) {
            const ratio = curClose / prevClose;
            if (ratio < 0.6 || ratio > 1.6) factor *= ratio;
        }
        if (factor !== 1) {
            if (open[i - 1]  != null) open[i - 1]  = Math.round(open[i - 1]  * factor);
            if (high[i - 1]  != null) high[i - 1]  = Math.round(high[i - 1]  * factor);
            if (low[i - 1]   != null) low[i - 1]   = Math.round(low[i - 1]   * factor);
            if (close[i - 1] != null) close[i - 1] = Math.round(close[i - 1] * factor);
        }
    }

    return {
        ...d, open, high, low, close,
        ma20:  rollingMean(close, 20),
        ma50:  rollingMean(close, 50),
        ma150: rollingMean(close, 150),
    };
}

function toggleAdjusted() {
    adjustedMode = !adjustedMode;
    const btn = document.getElementById('adjust-btn');
    if (btn) btn.classList.toggle('active', adjustedMode);
    if (chartData) renderChart(chartData, currentPeriod);
}

// ── 기간 필터 ──────────────────────────────────────
function filterByPeriod(d, period) {
    const last = new Date(d.dates[d.dates.length - 1]);
    let from   = new Date(last);
    if      (period === '1M') from.setMonth(from.getMonth() - 1);
    else if (period === '3M') from.setMonth(from.getMonth() - 3);
    else if (period === '6M') from.setMonth(from.getMonth() - 6);
    else                      from.setFullYear(from.getFullYear() - 1);

    const fromStr = from.toISOString().split('T')[0];
    const idx     = d.dates.findIndex(dt => dt >= fromStr);
    const start   = idx >= 0 ? idx : 0;

    return {
        dates:  d.dates.slice(start),
        open:   d.open.slice(start),
        high:   d.high.slice(start),
        low:    d.low.slice(start),
        close:  d.close.slice(start),
        volume: d.volume.slice(start),
        ma20:   d.ma20.slice(start),
        ma50:   d.ma50.slice(start),
        ma150:  (d.ma150 || []).slice(start),
        supply: (d.supply || []).slice(start),
    };
}

function changePeriod(period, el) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    currentPeriod = period;
    if (chartData) renderChart(chartData, period);
}

// ── ECharts 렌더링 ─────────────────────────────────
function renderChart(d, period) {
    const base = adjustedMode ? computeAdjustedSeries(d) : d;
    const fd = filterByPeriod(base, period);

    const container = document.getElementById('echart-container');
    if (!container) return;

    if (myChart) myChart.dispose();
    myChart = echarts.init(container, null, { renderer: 'canvas' });

    const candleData = fd.dates.map((_, i) => [fd.open[i], fd.close[i], fd.low[i], fd.high[i]]);
    const volColors = fd.dates.map((_, i) =>
        fd.close[i] >= (i > 0 ? fd.close[i - 1] : fd.close[i]) ? 'rgba(227,73,72,0.55)' : 'rgba(42,120,214,0.55)'
    );
    const rangePct = fd.dates.map((_, i) => {
        const h = fd.high[i], l = fd.low[i];
        return (h == null || l == null || !l) ? null : Math.round((h - l) / l * 1000) / 10;
    });
    const supplyColors = (fd.supply || []).map(v =>
        v == null ? 'rgba(0,0,0,0)' : (v >= 0 ? 'rgba(227,73,72,0.65)' : 'rgba(42,120,214,0.65)')
    );

    const prevClose = fd.close.length > 1 ? fd.close[fd.close.length - 2] : null;
    const lastClose = fd.close.length > 0 ? fd.close[fd.close.length - 1] : null;
    const { lineData: annoLineData } = buildAnnotationExtras(fd);

    let maxHighIdx = -1;
    fd.high.forEach((v, i) => { if (v != null && (maxHighIdx === -1 || v > fd.high[maxHighIdx])) maxHighIdx = i; });
    const maxHighPoint = maxHighIdx === -1 ? [] : [{
        coord: [fd.dates[maxHighIdx], fd.high[maxHighIdx]],
        symbol: 'circle', symbolSize: 1, itemStyle: { color: 'transparent' },
        label: {
            show: true, formatter: fd.high[maxHighIdx].toLocaleString(), position: 'top', distance: 6,
            color: '#B4342A', fontWeight: 700, fontSize: 11,
            backgroundColor: 'rgba(255,255,255,0.85)', padding: [2, 5], borderRadius: 4,
        },
    }];

    const option = {
        animation: false,
        backgroundColor: '#ffffff',
        title: {
            text: currentName ? `${currentName} (${currentCode || ''})${adjustedMode ? ' - 수정주가' : ''}` : '',
            left: 'center', top: 4,
            textStyle: { fontSize: 15, fontWeight: 600, color: '#14213D' },
        },
        legend: {
            data: ['MA20', 'MA50', 'MA150'], top: 6, left: 4,
            itemWidth: 14, itemHeight: 3, textStyle: { color: '#666', fontSize: 12 }, icon: 'roundRect',
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', label: { backgroundColor: '#A9843F' } },
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderColor: '#D7E0EC', borderWidth: 1, borderRadius: 10, padding: 12,
            extraCssText: 'box-shadow: 0 4px 16px rgba(30,41,59,0.12);',
            formatter: (params) => {
                const c = params.find(p => p.seriesType === 'candlestick');
                const v = params.find(p => p.seriesName === '거래량');
                const r = params.find(p => p.seriesName === '고가-저가 변동폭');
                const s = params.find(p => p.seriesName === '수급(외국인+기관)');
                if (!c) return '';
                const idx = c.dataIndex;
                const o = fd.open[idx], cl = fd.close[idx], l = fd.low[idx], h = fd.high[idx];
                const chg = cl - (idx > 0 ? fd.close[idx - 1] : cl);
                const chgColor = chg >= 0 ? '#B4342A' : '#2E5FA3';
                const supplyVal = s && s.value != null ? s.value : null;
                const supplyColor = supplyVal == null ? '#888' : (supplyVal >= 0 ? '#B4342A' : '#2E5FA3');
                return `
                    <div style="font-size:12px;line-height:1.6;">
                        <b>${fd.dates[c.dataIndex]}</b><br/>
                        시가: ${o?.toLocaleString()}<br/>
                        고가: ${h?.toLocaleString()}<br/>
                        저가: ${l?.toLocaleString()}<br/>
                        종가: <span style="color:${chgColor};font-weight:bold">${cl?.toLocaleString()}</span><br/>
                        ${v ? '거래량: ' + v.value?.toLocaleString() + '<br/>' : ''}
                        고가-저가 변동폭: ${(h != null && l != null) ? (h - l).toLocaleString() + '원 (' + (r?.value ?? '-') + '%)' : '-'}<br/>
                        수급(외국인+기관): <span style="color:${supplyColor};">${supplyVal == null ? '-' : supplyVal.toLocaleString() + '억'}</span>
                    </div>
                `;
            }
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [
            { left: 60, right: 80, top: '6.4%',  bottom: '51.7%' },
            { left: 60, right: 80, top: '50.6%', bottom: '38.4%' },
            { left: 60, right: 80, top: '64.0%', bottom: '25.0%' },
            { left: 60, right: 80, top: '77.3%', bottom: '10.5%' },
        ],
        xAxis: [
            { type: 'category', data: fd.dates, gridIndex: 0, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#D7E0EC' } }, splitLine: { show: false }, boundaryGap: true },
            { type: 'category', data: fd.dates, gridIndex: 1, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#D7E0EC' } }, splitLine: { show: false }, boundaryGap: true },
            { type: 'category', data: fd.dates, gridIndex: 2, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#D7E0EC' } }, splitLine: { show: false }, boundaryGap: true },
            { type: 'category', data: fd.dates, gridIndex: 3, axisLabel: { color: '#888', fontSize: 11 }, axisLine: { lineStyle: { color: '#D7E0EC' } }, splitLine: { show: false }, boundaryGap: true }
        ],
        yAxis: [
            { scale: true, gridIndex: 0, position: 'right', axisLabel: { color: '#888', fontSize: 11, formatter: v => v.toLocaleString() }, splitLine: { lineStyle: { color: '#f5f7fa', type: 'dashed' } } },
            { scale: true, gridIndex: 1, position: 'right', axisLabel: { color: '#888', fontSize: 10, formatter: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v.toLocaleString() }, splitLine: { lineStyle: { color: '#f5f7fa', type: 'dashed' } } },
            { scale: true, gridIndex: 2, position: 'right', axisLabel: { color: '#888', fontSize: 10, formatter: v => v.toFixed(1) + '%' }, splitLine: { lineStyle: { color: '#f5f7fa', type: 'dashed' } } },
            { scale: true, gridIndex: 3, position: 'right', axisLabel: { color: '#888', fontSize: 10, formatter: v => v.toLocaleString() + '억' }, splitLine: { lineStyle: { color: '#f5f7fa', type: 'dashed' } } }
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1, 2, 3], start: 0, end: 100 },
            { type: 'slider', xAxisIndex: [0, 1, 2, 3], bottom: 10, height: 30,
              borderColor: '#D7E0EC', fillerColor: 'rgba(139,127,214,0.14)',
              handleStyle: { color: '#A9843F', borderColor: '#A9843F' },
              moveHandleStyle: { color: '#A9843F' } }
        ],
        series: [
            {
                name: '캔들', type: 'candlestick', xAxisIndex: 0, yAxisIndex: 0, data: candleData,
                itemStyle: { color: '#B4342A', color0: '#2E5FA3', borderColor: '#B4342A', borderColor0: '#2E5FA3' },
                emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(30,41,59,0.25)' } },
                markLine: (prevClose == null && lastClose == null) ? undefined : {
                    symbol: 'none', silent: true,
                    data: [
                        ...(prevClose == null ? [] : [{
                            yAxis: prevClose,
                            label: { formatter: '전일 ' + prevClose.toLocaleString(), color: '#fff', backgroundColor: '#C9B183', padding: [3, 8], borderRadius: 10, fontSize: 10, position: 'end' },
                            lineStyle: { color: '#C9B183', type: 'dashed', width: 1.2 },
                        }]),
                        ...(lastClose == null ? [] : [{
                            yAxis: lastClose,
                            label: { formatter: '현재 ' + lastClose.toLocaleString(), color: '#fff', backgroundColor: '#A9843F', padding: [3, 8], borderRadius: 10, fontSize: 10, fontWeight: 600, position: 'end' },
                            lineStyle: { color: '#A9843F', type: 'dashed', width: 1.4 },
                        }]),
                        ...annoLineData,
                    ],
                },
                markPoint: maxHighPoint.length ? { data: maxHighPoint } : undefined,
            },
            { name: 'MA20',  type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: fd.ma20,  smooth: true, symbol: 'none', lineStyle: { color: '#29B6F6', width: 1.5 }, itemStyle: { color: '#29B6F6' }, showSymbol: false },
            { name: 'MA50',  type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: fd.ma50,  smooth: true, symbol: 'none', lineStyle: { color: '#F5A623', width: 1.5 }, itemStyle: { color: '#F5A623' }, showSymbol: false },
            { name: 'MA150', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: fd.ma150, smooth: true, symbol: 'none', lineStyle: { color: '#1B5E20', width: 2 },   itemStyle: { color: '#1B5E20' }, showSymbol: false },
            { name: '거래량', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: fd.volume, itemStyle: { color: (params) => volColors[params.dataIndex], borderRadius: [2, 2, 0, 0] } },
            { name: '고가-저가 변동폭', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, data: rangePct, itemStyle: { color: '#A9843F', borderRadius: [2, 2, 0, 0] } },
            { name: '수급(외국인+기관)', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, data: fd.supply, itemStyle: { color: (params) => supplyColors[params.dataIndex], borderRadius: [2, 2, 0, 0] } }
        ]
    };

    myChart.setOption(option);
    window.addEventListener('resize', () => myChart && myChart.resize());

    myChart.getZr().on('click', (e) => {
        if (!drawMode) return;
        const pixel = [e.offsetX, e.offsetY];
        if (!myChart.containPixel({ gridIndex: 0 }, pixel)) return;
        const dataPoint = myChart.convertFromPixel({ gridIndex: 0 }, pixel);
        const idx = Math.round(dataPoint[0]);
        if (idx < 0 || idx >= fd.dates.length) return;
        const point = { x: fd.dates[idx], y: dataPoint[1] };

        if (!pendingLineStart) {
            pendingLineStart = point;
            updateModeButtons();
        } else {
            const start = pendingLineStart;
            pendingLineStart = null;
            updateModeButtons();
            finalizeLine(start, point);
        }
    });
}

// ── 초기화 ────────────────────────────────────────
(async function init() {
    await loadNameIndex();
    await loadList();

    const params    = new URLSearchParams(window.location.search);
    const nameParam = params.get('name');
    if (nameParam) {
        document.getElementById('stockNameInput').value = nameParam;
        searchChart();
    }
})();
