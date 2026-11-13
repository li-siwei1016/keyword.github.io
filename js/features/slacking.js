/**
 * slacking.js - 摸鱼状态
 * · 字卡库「摸鱼管理」：维护摸鱼字卡（地点 / 活动两个分支），可批量导入
 * · 对方随机进入摸鱼状态，输出格式：「{对方} 在 {地点} {活动}」
 * · 主页「Ta 的手机」框实时显示摸鱼状态；「摸鱼小记」记录往日摸鱼
 */
/* 全局数据（供 reply-library.js 渲染 / 增删改） */
var slackingPlaces = [];
var slackingActs = [];
var slackingLog = [];        // [{ time, place, act, text, mins }]
var slackingState = { active: false, place: '', act: '', start: 0, end: 0 };

(function () {
    const SLACK_TICK = 60 * 1000;     // 每分钟判定一次
    const START_CHANCE = 0.16;        // 每分钟进入摸鱼的概率
    const DEFAULT_PLACES = ['图书馆', '自习室', '办公室', '教室', '咖啡厅'];
    const DEFAULT_ACTS = ['背单词', '写方案', '赶论文', '整理笔记', '看文献'];

    let loaded = false;

    function partnerName() {
        try { return (typeof settings !== 'undefined' && settings.partnerName) || 'Ta'; } catch (e) { return 'Ta'; }
    }

    /* ---------------- 持久化 ---------------- */
    async function loadAll() {
        if (loaded) return;
        if (typeof SESSION_ID === 'undefined' || !SESSION_ID) {
            if (typeof window.__waitSession === 'function') window.__waitSession(loadAll);
            return;
        }
        try {
            const [p, a, log, st] = await Promise.all([
                localforage.getItem(getStorageKey('slackingPlaces')),
                localforage.getItem(getStorageKey('slackingActs')),
                localforage.getItem(getStorageKey('slackingLog')),
                localforage.getItem(getStorageKey('slackingState'))
            ]);
            slackingPlaces = Array.isArray(p) ? p : [];
            slackingActs = Array.isArray(a) ? a : [];
            slackingLog = Array.isArray(log) ? log : [];
            slackingState = (st && typeof st === 'object') ? st : { active: false, place: '', act: '', start: 0, end: 0 };
            // 首次使用给一套默认字卡，用户可在摸鱼管理中增删
            if (!p && !a) {
                slackingPlaces = DEFAULT_PLACES.slice();
                slackingActs = DEFAULT_ACTS.slice();
                savePools();
            }
            loaded = true;
            // 恢复状态时已过期的直接结束
            if (slackingState.active && Date.now() > slackingState.end) endSlack(true);
        } catch (e) {}
    }
    function savePools() {
        try {
            if (typeof SESSION_ID === 'undefined' || !SESSION_ID) return;
            localforage.setItem(getStorageKey('slackingPlaces'), slackingPlaces);
            localforage.setItem(getStorageKey('slackingActs'), slackingActs);
        } catch (e) {}
    }
    function saveLog() {
        try {
            if (typeof SESSION_ID === 'undefined' || !SESSION_ID) return;
            localforage.setItem(getStorageKey('slackingLog'), slackingLog.slice(-100));
        } catch (e) {}
    }
    function saveState() {
        try {
            if (typeof SESSION_ID === 'undefined' || !SESSION_ID) return;
            localforage.setItem(getStorageKey('slackingState'), slackingState);
        } catch (e) {}
    }

    /* ---------------- 摸鱼状态机 ---------------- */
    function slackText() {
        if (!slackingState.active) return '';
        return `${partnerName()} 在 ${slackingState.place} ${slackingState.act}`;
    }

    function startSlack() {
        if (!slackingPlaces.length || !slackingActs.length) return;
        const place = slackingPlaces[Math.floor(Math.random() * slackingPlaces.length)];
        const act = slackingActs[Math.floor(Math.random() * slackingActs.length)];
        const mins = 15 + Math.floor(Math.random() * 31); // 15-45 分钟
        slackingState = { active: true, place, act, start: Date.now(), end: Date.now() + mins * 60000 };
        slackingLog.push({ time: Date.now(), place, act, mins, text: `${partnerName()} 在 ${place} ${act}` });
        if (slackingLog.length > 100) slackingLog = slackingLog.slice(-100);
        saveState(); saveLog();
        refreshHomePhoneCard();
    }

    function endSlack(silent) {
        if (!slackingState.active) return;
        slackingState.active = false;
        saveState();
        refreshHomePhoneCard();
    }

    function tick() {
        if (document.hidden || !loaded) return;
        if (slackingState.active) {
            if (Date.now() > slackingState.end) endSlack();
            return;
        }
        if (slackingPlaces.length && slackingActs.length && Math.random() < START_CHANCE) startSlack();
    }

    function refreshHomePhoneCard() {
        try { if (typeof window.renderHomePhoneCard === 'function') window.renderHomePhoneCard(); } catch (e) {}
    }

    /* ---------------- 批量导入字卡 ---------------- */
    function showSlackingBatchAdd(subTab) {
        const isPlace = subTab === 'slkPlaces';
        const label = isPlace ? '地点' : '活动';
        const old = document.getElementById('slk-batch-overlay');
        if (old) old.remove();
        const overlay = document.createElement('div');
        overlay.id = 'slk-batch-overlay';
        overlay.className = 'slk-batch-overlay';
        overlay.innerHTML = `
            <div class="slk-batch-panel">
                <div class="slk-batch-title"><i class="fas fa-file-import"></i> 导入摸鱼${label}字卡</div>
                <textarea class="slk-batch-text" placeholder="每行一条${label}，例如：\n${isPlace ? '图书馆\n自习室\n办公室' : '背单词\n赶论文\n整理笔记'}"></textarea>
                <div class="slk-batch-actions">
                    <button class="slk-batch-cancel">取消</button>
                    <button class="slk-batch-ok">导入</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const ta = overlay.querySelector('.slk-batch-text');
        overlay.querySelector('.slk-batch-cancel').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('.slk-batch-ok').onclick = () => {
            const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
            if (!lines.length) { overlay.remove(); return; }
            const pool = isPlace ? slackingPlaces : slackingActs;
            let added = 0;
            lines.forEach(t => { if (!pool.includes(t)) { pool.push(t); added++; } });
            savePools();
            overlay.remove();
            if (typeof renderReplyLibrary === 'function') renderReplyLibrary();
            if (typeof showNotification === 'function') showNotification(`✓ 导入 ${added} 条${label}字卡`, 'success');
        };
        setTimeout(() => ta.focus(), 60);
    }

    /* ---------------- 对外接口 ---------------- */
    window.getSlackingText = slackText;
    window.isSlacking = () => !!slackingState.active;
    window.getSlackingLog = () => slackingLog.slice().reverse();
    window.showSlackingBatchAdd = showSlackingBatchAdd;
    window.slackingSavePools = savePools;

    /* ---------------- 启动 ---------------- */
    function boot() {
        loadAll();
        setInterval(tick, SLACK_TICK);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
