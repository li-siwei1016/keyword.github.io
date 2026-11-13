/**
 * link-status.js - 链接状态
 * 聊天界面顶部栏下方一条「链接状态」明示：
 * · 5 颗爱心表示链接强度（实心数 0-5，随机）
 * · 0 颗实心 = 链接中断；1 淡若游丝；2 若即若离；3 藕断丝连；4 云淡风轻；5 魂牵梦萦
 */

(function () {
    const LEVELS = ['链接中断', '淡若游丝', '若即若离', '藕断丝连', '云淡风轻', '魂牵梦萦'];

    function renderLinkStatus() {
        const heartsEl = document.getElementById('ls-hearts');
        const labelEl = document.getElementById('ls-label');
        if (!heartsEl || !labelEl) return;

        // 链接强度随机：0 - 5 颗实心
        const level = Math.floor(Math.random() * 6);

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
