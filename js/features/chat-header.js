/**
 * chat-header.js - 聊天页顶部栏：默认收起，双击聊天界面唤出
 * · 双击（或双击触控）聊天消息区切换顶部栏显隐
 * · 首次进入聊天时给出一次性新手引导提示
 */
(function () {
    const TIP_KEY = 'chatHeaderTipSeen';

    function isHomeOpen() {
        try { return typeof window.isHomeOpen === 'function' && window.isHomeOpen(); } catch (e) { return false; }
    }
    function isTourRunning() {
        try { return typeof isTourActive !== 'undefined' && isTourActive; } catch (e) { return false; }
    }

    function setHeaderCollapsed(collapsed) {
        // 新手引导期间保持顶栏可见，避免引导步骤找不到目标
        if (collapsed && isTourRunning()) collapsed = false;
        document.body.classList.toggle('chat-header-collapsed', collapsed);
    }
    function toggleHeader() {
        setHeaderCollapsed(!document.body.classList.contains('chat-header-collapsed'));
        markTipSeen();
    }

    /* ---------------- 首次使用引导提示 ---------------- */
    function markTipSeen() {
        try { localStorage.setItem(TIP_KEY, '1'); } catch (e) {}
        const tip = document.getElementById('chat-header-tip');
        if (tip) tip.remove();
    }

    function maybeShowTip() {
        try { if (localStorage.getItem(TIP_KEY) === '1') return; } catch (e) {}
        if (isHomeOpen() || isTourRunning()) return;
        if (document.getElementById('chat-header-tip')) return;
        const tip = document.createElement('div');
        tip.id = 'chat-header-tip';
        tip.innerHTML = '<i class="fas fa-hand-pointer"></i> 双击聊天界面，可以唤出顶部栏哦';
        tip.addEventListener('click', markTipSeen);
        document.body.appendChild(tip);
        // 8 秒后自动淡出（已读状态不记录，下次仍提示，直到真正双击过）
        setTimeout(() => { if (tip.parentNode) { tip.classList.add('fade'); setTimeout(() => tip.remove(), 600); } }, 8000);
    }

    /* ---------------- 双击 / 双触点切换 ---------------- */
    function bindDoubleTap() {
        const container = document.getElementById('chat-container');
        if (!container) return;

        container.addEventListener('dblclick', (e) => {
            if (e.target.closest('input, textarea, button, a, select, .modal')) return;
            toggleHeader();
        });

        // 移动端双击触控（部分浏览器不派发 dblclick）
        let lastTap = 0, lastX = 0, lastY = 0;
        container.addEventListener('touchend', (e) => {
            if (e.target.closest('input, textarea, button, a, select')) return;
            const t = e.changedTouches[0];
            const now = Date.now();
            if (now - lastTap < 320 && Math.abs(t.clientX - lastX) < 40 && Math.abs(t.clientY - lastY) < 40) {
                lastTap = 0;
                toggleHeader();
            } else {
                lastTap = now; lastX = t.clientX; lastY = t.clientY;
            }
        }, { passive: true });
    }

    /* ---------------- 启动：默认收起顶栏 ---------------- */
    function boot() {
        setHeaderCollapsed(true);
        bindDoubleTap();
        // 进入聊天页（主页关闭）后视情况给出一次性提示
        const tileChat = document.getElementById('home-tile-chat');
        if (tileChat) tileChat.addEventListener('click', () => setTimeout(maybeShowTip, 700));
        // 非首启（无主页流程）也兜底提示一次
        setTimeout(maybeShowTip, 9000);
    }

    window.toggleChatHeader = toggleHeader;
    window.setChatHeaderCollapsed = setHeaderCollapsed;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
