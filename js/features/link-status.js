/**
 * link-status.js - 链接状态
 * 聊天界面顶部栏下方一条「链接状态」明示：
 * · 5 颗爱心表示链接强度（实心数 0-5，随机）
 * · 0 颗实心 = 链接中断；1 淡若游丝；2 若即若离；3 藕断丝连；4 云水泱泱；5 魂牵梦萦
 * · 每次打开网站随机一次；此后 3 小时内保持不变，3 小时后才切换新状态
 */

(function () {
    const LEVELS = ['链接中断', '淡若游丝', '若即若离', '藕断丝连', '云水泱泱', '魂牵梦萦'];
    const LOCK_KEY = (window.APP_PREFIX || 'CHAT_APP_V3_') + 'linkStatusLock';
    const LOCK_MS = 3 * 60 * 60 * 1000; // 3 小时

    function resolveLevel() {
        // 打开网址后 3 小时内沿用当时的链接状态，到期后才随机切换
        try {
            const raw = localStorage.getItem(LOCK_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved && typeof saved.level === 'number' && saved.level >= 0 && saved.level <= 5) {
                    const until = Number(saved.until) || 0;
                    if (Date.now() < until) return saved.level;
                }
            }
        } catch (e) {}
        const level = Math.floor(Math.random() * 6);
        try {
            localStorage.setItem(LOCK_KEY, JSON.stringify({ level: level, until: Date.now() + LOCK_MS }));
        } catch (e) {}
        return level;
    }

    function renderLinkStatus(force) {
        const heartsEl = document.getElementById('ls-hearts');
        const labelEl = document.getElementById('ls-label');
        if (!heartsEl || !labelEl) return;

        const level = resolveLevel();

        let html = '';
        for (let i = 0; i < 5; i++) {
            html += `<i class="${i < level ? 'fas ls-on' : 'far ls-off'} fa-heart"></i>`;
        }
        heartsEl.innerHTML = html;
        labelEl.textContent = LEVELS[level];
        labelEl.classList.toggle('ls-broken', level === 0);
    }

    function initLinkStatus() {
        if (!document.getElementById('link-status-bar')) return;
        renderLinkStatus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLinkStatus);
    } else {
        initLinkStatus();
    }

    window.renderLinkStatus = renderLinkStatus;
})();
