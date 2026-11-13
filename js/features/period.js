/**
 * period.js - 经期记录
 * · 我方启用记录后，可标注「经期开始 / 结束」
 * · 根据历史周期推算：本次结束时间、下一次开始与结束时间
 * · 预测开始的前一天和当天：
 *     - 聊天界面 70% 概率触发对方「经期即将来临」提醒（每天最多一条）
 *     - 经期记录面板内 100% 显示提醒横幅
 * · 我方标注经期开始时，80% 概率触发对方的关心问候
 */

let periodData = { enabled: false, records: [] };   // records: [{ start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null }]
let periodLoaded = false;
let periodTicker = null;

const PERIOD_REMIND_TEXTS = [
    '快要到那几天了，记得提前备好红糖，这几天少吃凉的、注意保暖。',
    '姨妈快要来看你了，别熬夜，情绪不好的时候随时找我，我在的。',
    '这几天要多休息，别太累了，肚子不舒服一定要告诉我。',
    '快到那几天啦，提前把热水袋找出来，照顾好自己，好吗？'
];
const PERIOD_CARE_TEXTS = [
    '第一天要多休息，别碰凉水，多喝热水，想要什么吃的告诉我。',
    '肚子疼不疼？躺着休息一会儿，我陪着你。',
    '难受就说出来，别自己忍着，我在呢。',
    '这几天情绪可能不太好，随时来找我，我哪儿也不去。'
];

function pEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addDaysISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function diffDays(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function fmtMD(iso) {
    if (!iso) return '–';
    const p = iso.split('-');
    return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
}

/* ---------------- 存取 ---------------- */
async function loadPeriodData() {
    if (typeof SESSION_ID === 'undefined' || !SESSION_ID) {
        if (typeof window.__waitSession === 'function') window.__waitSession(loadPeriodData);
        return;
    }
    try {
        const saved = await localforage.getItem(getStorageKey('period'));
        if (saved && typeof saved === 'object') {
            periodData = {
                enabled: !!saved.enabled,
                records: Array.isArray(saved.records) ? saved.records.filter(r => r && r.start) : []
            };
        }
    } catch (e) {
        console.warn('[period] 读取失败', e);
    }
    periodLoaded = true;
}

function savePeriodData() {
    try {
        localforage.setItem(getStorageKey('period'), periodData);
    } catch (e) {
        console.warn('[period] 保存失败', e);
    }
}

/* ---------------- 推算 ---------------- */
function predictPeriod() {
    const starts = periodData.records.map(r => r.start).sort();
    if (!starts.length) return null;

    const lastStart = starts[starts.length - 1];

    // 平均周期长度（相邻两次开始的间隔）
    const gaps = [];
    for (let i = 1; i < starts.length; i++) {
        const g = diffDays(starts[i - 1], starts[i]);
        if (g >= 15 && g <= 60) gaps.push(g);
    }
    const cycle = gaps.length
        ? Math.min(45, Math.max(21, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)))
        : 28;

    // 平均经期天数（标注过结束的记录）
    const durs = periodData.records
        .filter(r => r.end)
        .map(r => diffDays(r.start, r.end) + 1)
        .filter(d => d >= 2 && d <= 12);
    const duration = durs.length
        ? Math.min(10, Math.max(3, Math.round(durs.reduce((a, b) => a + b, 0) / durs.length)))
        : 5;

    const lastRecord = periodData.records.find(r => r.start === lastStart);
    const thisEnd = (lastRecord && lastRecord.end) || addDaysISO(lastStart, duration - 1);
    const nextStart = addDaysISO(lastStart, cycle);
    const nextEnd = addDaysISO(nextStart, duration - 1);

    return { lastStart, cycle, duration, thisEnd, nextStart, nextEnd };
}

/* 距下一次经期开始的天数（负数 = 已过期） */
function daysUntilNextStart(pred) {
    if (!pred) return null;
    return diffDays(todayISO(), pred.nextStart);
}

/* ---------------- 对方发消息 ---------------- */
function periodPartnerSay(text, delay) {
    setTimeout(() => {
        addMessage({
            id: Date.now() + Math.random(),
            sender: (settings && settings.partnerName) || '对方',
            text,
            timestamp: new Date(),
            status: 'received',
            favorited: false,
            note: null,
            type: 'normal'
        });
        if (typeof playSound === 'function') playSound('message');
        if (typeof window._sendPartnerNotification === 'function') {
            window._sendPartnerNotification((settings && settings.partnerName) || '对方', text);
        }
    }, delay);
}

function pickText(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/* ---------------- 提醒判定 ---------------- */
function checkPeriodReminders() {
    if (!periodLoaded || !periodData.enabled || !periodData.records.length) return false;
    const pred = predictPeriod();
    if (!pred) return false;

    const days = daysUntilNextStart(pred);
    // 前一天（days=1）或当天（days=0）触发
    if (days !== 1 && days !== 0) return false;

    // 面板横幅：100% 提醒
    updatePeriodBanner(true);

    // 聊天提醒：70% 概率，每天最多一条
    const guardKey = 'period_remind_' + todayISO();
    if (localStorage.getItem(guardKey)) return false;
    if (Math.random() < 0.7) {
        localStorage.setItem(guardKey, '1');
        periodPartnerSay(pickText(PERIOD_REMIND_TEXTS), 3000 + Math.random() * 6000);
        return true;
    }
    return false;
}

function updatePeriodBanner(force) {
    const banner = document.getElementById('period-banner');
    const text = document.getElementById('period-banner-text');
    if (!banner || !text) return;
    const pred = predictPeriod();
    const days = pred ? daysUntilNextStart(pred) : null;
    const near = pred && periodData.enabled && (days === 1 || days === 0);
    if (near || force === true) {
        banner.style.display = 'flex';
        text.textContent = days === 0
            ? '经期今天到来了，记得休息好、注意保暖。'
            : '经期预计明天来临，提前做好准备，照顾好自己。';
    } else {
        banner.style.display = 'none';
    }
}

/* ---------------- 面板 ---------------- */
function renderPeriodPredict() {
    const box = document.getElementById('period-predict');
    if (!box) return;
    const pred = predictPeriod();
    if (!pred) {
        box.innerHTML = `
            <div class="pp-cell"><div class="pp-label">本次结束</div><div class="pp-value" style="color:var(--text-secondary);">待记录</div><div class="pp-sub">先标注一次开始</div></div>
            <div class="pp-cell"><div class="pp-label">下次开始</div><div class="pp-value" style="color:var(--text-secondary);">–</div><div class="pp-sub"></div></div>
            <div class="pp-cell"><div class="pp-label">下次结束</div><div class="pp-value" style="color:var(--text-secondary);">–</div><div class="pp-sub"></div></div>`;
        return;
    }
    const days = daysUntilNextStart(pred);
    const sub = days === null ? '' :
        (days > 1 ? `还有 ${days} 天` : days === 1 ? '就在明天' : days === 0 ? '今天' : `已过 ${-days} 天`);
    box.innerHTML = `
        <div class="pp-cell"><div class="pp-label">本次结束</div><div class="pp-value">${fmtMD(pred.thisEnd)}</div><div class="pp-sub">周期约 ${pred.cycle} 天</div></div>
        <div class="pp-cell"><div class="pp-label">下次开始</div><div class="pp-value">${fmtMD(pred.nextStart)}</div><div class="pp-sub">${sub}</div></div>
        <div class="pp-cell"><div class="pp-label">下次结束</div><div class="pp-value">${fmtMD(pred.nextEnd)}</div><div class="pp-sub">约 ${pred.duration} 天</div></div>`;
}

function renderPeriodList() {
    const list = document.getElementById('period-list');
    const count = document.getElementById('period-count');
    if (!list) return;
    if (count) count.textContent = periodData.records.length;
    if (!periodData.records.length) {
        list.innerHTML = `<div class="ad-empty">还没有记录</div>`;
        return;
    }
    list.innerHTML = [...periodData.records].sort((a, b) => b.start.localeCompare(a.start)).map(r => `
        <div class="period-item">
            <span class="pi-dot${r.end ? ' ended' : ''}"></span>
            <span class="pi-text">${fmtMD(r.start)} 开始${r.end ? ' · ' + fmtMD(r.end) + ' 结束' : ' · 进行中'}</span>
            <span class="pi-tag">${r.end ? (diffDays(r.start, r.end) + 1) + ' 天' : '记录中'}</span>
        </div>`).join('');
}

function renderPeriodPanel() {
    const toggle = document.getElementById('period-enabled');
    if (toggle) toggle.checked = !!periodData.enabled;
    renderPeriodPredict();
    renderPeriodList();
    renderPeriodCalendar();
    updatePeriodBanner(false);
}

/* ---------------- 日历视图 ---------------- */
let periodCalMonth = null; // 'YYYY-MM'

function periodRangeSet(pred) {
    // 汇总所有需要标注的日期段 {start,end,kind}
    const ranges = [];
    periodData.records.forEach(r => {
        if (r.end) ranges.push({ start: r.start, end: r.end, kind: 'recorded' });
        else ranges.push({ start: r.start, end: r.start, kind: 'recorded' });
    });
    const p = pred;
    if (p) {
        const lastRec = periodData.records.find(r => r.start === p.lastStart);
        if (lastRec && !lastRec.end && todayISO() <= p.thisEnd) {
            ranges.push({ start: p.lastStart, end: p.thisEnd, kind: 'predict-current' });
        }
        ranges.push({ start: p.nextStart, end: p.nextEnd, kind: 'predict-next' });
    }
    return ranges;
}

function renderPeriodCalendar() {
    const grid = document.getElementById('period-calendar-grid');
    const titleEl = document.getElementById('period-cal-title');
    if (!grid) return;

    const now = new Date();
    if (!periodCalMonth) periodCalMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const [yStr, mStr] = periodCalMonth.split('-');
    const y = Number(yStr), m = Number(mStr);
    if (titleEl) titleEl.textContent = `${y} 年 ${m} 月`;

    const pred = predictPeriod();
    const ranges = periodData.enabled ? periodRangeSet(pred) : [];
    const today = todayISO();

    const firstDay = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startWeek = firstDay.getDay();

    // 生成 date->kind 标注表
    const marks = {};
    ranges.forEach(r => {
        let cur = r.start;
        let guard = 0;
        while (cur <= r.end && guard++ < 120) {
            if (cur.startsWith(periodCalMonth)) {
                marks[cur] = marks[cur] || { recorded: false, predict: false, isStart: false };
                if (r.kind === 'recorded') marks[cur].recorded = true;
                else marks[cur].predict = true;
                if (cur === r.start) marks[cur].isStart = true;
            }
            const d = new Date(cur + 'T00:00:00');
            d.setDate(d.getDate() + 1);
            cur = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
    });

    let html = '';
    for (let i = 0; i < startWeek; i++) html += '<span class="pcal-cell empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${periodCalMonth}-${String(d).padStart(2, '0')}`;
        const mk = marks[iso];
        let cls = 'pcal-cell';
        if (mk) {
            if (mk.recorded) cls += ' pcal-recorded';
            else if (mk.predict) cls += ' pcal-predict';
            if (mk.isStart) cls += ' pcal-start';
        }
        if (iso === today) cls += ' pcal-today';
        html += `<span class="${cls}"><em>${d}</em></span>`;
    }
    grid.innerHTML = html;
}

function shiftPeriodMonth(delta) {
    const [yStr, mStr] = (periodCalMonth || todayISO().slice(0, 7)).split('-').map(Number);
    const d = new Date(yStr, mStr - 1 + delta, 1);
    periodCalMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    renderPeriodCalendar();
}

async function openPeriodPanel() {
    if (!periodLoaded) await loadPeriodData();
    renderPeriodPanel();
    hideModal(document.getElementById('advanced-modal'));
    showModal(document.getElementById('period-modal'));
    checkPeriodReminders();
}

/* ---------------- 操作 ---------------- */
function markPeriodStart() {
    if (!periodData.enabled) {
        showNotification('请先启用经期记录', 'warning');
        return;
    }
    const today = todayISO();
    const last = periodData.records[periodData.records.length - 1];
    if (last && last.start === today && !last.end) {
        showNotification('今天已经标注过开始了', 'info');
        return;
    }
    periodData.records.push({ start: today, end: null });
    if (periodData.records.length > 36) periodData.records = periodData.records.slice(-36);
    savePeriodData();
    renderPeriodPredict();
    renderPeriodCalendar();
    renderPeriodList();
    showNotification('已记录经期开始', 'success');

    // 80% 概率触发对方关心问候
    if (Math.random() < 0.8) {
        periodPartnerSay(pickText(PERIOD_CARE_TEXTS), 2500 + Math.random() * 5000);
    }
}

function markPeriodEnd() {
    if (!periodData.enabled) {
        showNotification('请先启用经期记录', 'warning');
        return;
    }
    const today = todayISO();
    // 找到最近一条未结束的记录
    for (let i = periodData.records.length - 1; i >= 0; i--) {
        const r = periodData.records[i];
        if (!r.end) {
            if (diffDays(r.start, today) < 0) {
                showNotification('结束日期不能早于开始日期', 'error');
                return;
            }
            r.end = today;
            savePeriodData();
            renderPeriodPredict();
            renderPeriodCalendar();
            renderPeriodList();
            showNotification('已记录经期结束', 'success');
            return;
        }
    }
    showNotification('没有进行中的经期记录', 'info');
}

/* ---------------- 初始化 ---------------- */
function initPeriodModule() {
    const entry = document.getElementById('period-function');
    if (entry && !entry.dataset.periodBound) {
        entry.dataset.periodBound = '1';
        entry.addEventListener('click', openPeriodPanel);
    }

    const closeBtn = document.getElementById('close-period');
    if (closeBtn && !closeBtn.dataset.periodBound) {
        closeBtn.dataset.periodBound = '1';
        closeBtn.addEventListener('click', () => hideModal(document.getElementById('period-modal')));
    }

    const toggle = document.getElementById('period-enabled');
    if (toggle && !toggle.dataset.periodBound) {
        toggle.dataset.periodBound = '1';
        toggle.addEventListener('change', () => {
            periodData.enabled = toggle.checked;
            savePeriodData();
            updatePeriodBanner(false);
            renderPeriodCalendar();
            renderPeriodPredict();
            if (toggle.checked) {
                showNotification('经期记录已启用', 'success');
                checkPeriodReminders();
            }
        });
    }

    const startBtn = document.getElementById('period-mark-start');
    if (startBtn && !startBtn.dataset.periodBound) {
        startBtn.dataset.periodBound = '1';
        startBtn.addEventListener('click', markPeriodStart);
    }

    const endBtn = document.getElementById('period-mark-end');
    if (endBtn && !endBtn.dataset.periodBound) {
        endBtn.dataset.periodBound = '1';
        endBtn.addEventListener('click', markPeriodEnd);
    }

    const prevBtn = document.getElementById('period-cal-prev');
    if (prevBtn && !prevBtn.dataset.periodBound) {
        prevBtn.dataset.periodBound = '1';
        prevBtn.addEventListener('click', () => shiftPeriodMonth(-1));
    }
    const nextBtn = document.getElementById('period-cal-next');
    if (nextBtn && !nextBtn.dataset.periodBound) {
        nextBtn.dataset.periodBound = '1';
        nextBtn.addEventListener('click', () => shiftPeriodMonth(1));
    }

    const clearBtn = document.getElementById('period-clear');
    if (clearBtn && !clearBtn.dataset.periodBound) {
        clearBtn.dataset.periodBound = '1';
        clearBtn.addEventListener('click', () => {
            if (!periodData.records.length) return;
            if (!confirm('清空全部经期记录？推算结果也会一并清除。')) return;
            periodData.records = [];
            savePeriodData();
            renderPeriodPanel();
        });
    }

    // 启动后加载数据并做一次提醒判定；之后每 30 分钟复核一次（跨天触发）
    loadPeriodData().then(() => {
        renderPeriodPanel();
        setTimeout(checkPeriodReminders, 6000);
    });
    if (!periodTicker) {
        periodTicker = setInterval(() => { if (!document.hidden) checkPeriodReminders(); }, 30 * 60 * 1000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPeriodModule);
} else {
    initPeriodModule();
}

window.initPeriodModule = initPeriodModule;
window.openPeriodPanel = openPeriodPanel;
